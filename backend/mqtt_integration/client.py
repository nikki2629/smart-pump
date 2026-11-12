import logging
import threading
from pathlib import Path
from uuid import uuid4

import paho.mqtt.client as mqtt
from django.conf import settings
from django.db import DatabaseError, transaction
from django.utils import timezone
from paho.mqtt.packettypes import PacketTypes
from paho.mqtt.properties import Properties

from audit.services import record_event
from commands.models import Command
from commands.services import expire_command_timeouts
from devices.models import Device
from mqtt_integration.handlers import (
    TOPIC_MESSAGE_TYPES,
    TOPIC_ROOT,
    handle_device_message,
)
from mqtt_integration.protocol import ProtocolError, encode_command

logger = logging.getLogger(__name__)
MQTT_PUBLISH_TIMEOUT_SECONDS = 5


class MqttConfigurationError(RuntimeError):
    pass


class MqttBridge:
    def __init__(self):
        if not settings.MQTT_USERNAME or not settings.MQTT_PASSWORD:
            raise MqttConfigurationError(
                "MQTT_USERNAME and MQTT_PASSWORD must be configured."
            )
        if not settings.MQTT_TLS_CA_CERT:
            raise MqttConfigurationError("MQTT_TLS_CA_CERT must be configured.")
        ca_path = Path(settings.MQTT_TLS_CA_CERT)
        if not ca_path.is_absolute():
            ca_path = (settings.BASE_DIR / ca_path).resolve()
        if not ca_path.is_file():
            raise MqttConfigurationError(
                f"MQTT CA certificate does not exist: {ca_path}"
            )

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=settings.MQTT_CLIENT_ID,
            protocol=mqtt.MQTTv5,
            manual_ack=True,
        )
        self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
        self.client.tls_set(ca_certs=str(ca_path))
        self.client.reconnect_delay_set(min_delay=1, max_delay=60)
        self.client.on_connect = self._on_connect
        self.client.on_subscribe = self._on_subscribe
        self.client.on_disconnect = self._on_disconnect
        self.client.on_connect_fail = self._on_connect_fail
        self.client.on_message = self._on_message
        self.connected = False

    def start(self):
        logger.info(
            "Connecting MQTT backend identity %s to %s:%s using TLS.",
            settings.MQTT_USERNAME,
            settings.MQTT_HOST,
            settings.MQTT_PORT,
        )
        self.client.connect_async(
            settings.MQTT_HOST,
            settings.MQTT_PORT,
            keepalive=30,
            clean_start=True,
        )
        result = self.client.loop_start()
        if result != mqtt.MQTT_ERR_SUCCESS:
            raise ConnectionError(f"MQTT network loop failed to start: {result}.")

    def stop(self):
        self.connected = False
        self.client.disconnect()
        self.client.loop_stop()

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            self.connected = False
            logger.error("MQTT broker rejected the backend connection: %s", reason_code)
            return
        self.connected = False
        subscriptions = [
            (f"{TOPIC_ROOT}/+/{leaf}", 1) for leaf in TOPIC_MESSAGE_TYPES
        ]
        result, _ = client.subscribe(subscriptions)
        if result != mqtt.MQTT_ERR_SUCCESS:
            logger.error("MQTT response-topic subscription failed: %s", result)
            self.connected = False
            return
        logger.info("MQTT connection accepted; waiting for response-topic SUBACK.")

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties):
        if any(reason_code.is_failure for reason_code in reason_codes):
            self.connected = False
            logger.error("MQTT broker denied one or more device response subscriptions.")
            return
        self.connected = True
        logger.info("Authenticated MQTT backend subscriptions are active.")

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self.connected = False
        if reason_code.is_failure:
            logger.warning("MQTT connection dropped; client will reconnect: %s", reason_code)
        else:
            logger.info("MQTT backend connection closed.")

    def _on_connect_fail(self, client, userdata):
        self.connected = False
        logger.warning("MQTT connection attempt failed; retry will be scheduled.")

    def _on_message(self, client, userdata, message):
        if message.retain:
            logger.warning("Rejected retained MQTT message on %s.", message.topic)
            self._ack_incoming_message(client, message)
            return
        try:
            result = handle_device_message(message.topic, message.payload)
        except (ProtocolError, ValueError) as exc:
            logger.warning("Rejected MQTT message on %s: %s", message.topic, exc)
            self._ack_incoming_message(client, message)
            return
        except DatabaseError:
            logger.exception("Database failure processing MQTT message on %s.", message.topic)
            return
        self._ack_incoming_message(client, message)
        if result != "processed":
            logger.info(
                "MQTT message on %s was safely ignored or constrained: %s",
                message.topic,
                result,
            )

    @staticmethod
    def _ack_incoming_message(client, message):
        if client is None or message.qos == 0:
            return
        result = client.ack(message.mid, message.qos)
        if result != mqtt.MQTT_ERR_SUCCESS:
            logger.error(
                "MQTT acknowledgement failed for message %s (rc=%s).",
                message.mid,
                result,
            )

    def publish_pending_commands(self):
        if not self.connected:
            return
        expire_command_timeouts(Command.objects.all())
        pending_ids = list(
            Command.objects.filter(status=Command.Status.AUTHORIZED)
            .order_by("created_at")
            .values_list("pk", flat=True)[:100]
        )
        for command_id in pending_ids:
            self._publish_command(command_id)

    def _publish_command(self, command_id):
        with transaction.atomic():
            command = (
                Command.objects.select_for_update()
                .select_related("pump__device", "pump__organization")
                .filter(pk=command_id, status=Command.Status.AUTHORIZED)
                .first()
            )
            if command is None:
                return
            now = timezone.now()
            if command.expires_at <= now:
                command.status = Command.Status.EXPIRED
                command.save(update_fields=("status", "updated_at"))
                record_event(
                    actor=None,
                    organization=command.pump.organization,
                    action="command.expired",
                    object_type="command",
                    object_id=command.pk,
                    metadata={"reason": "expired_before_publish"},
                )
                return
            device = getattr(command.pump, "device", None)
            if (
                device is None
                or device.provisioning_status != Device.ProvisioningStatus.PAIRED
            ):
                return

            payload = encode_command(command=command, device_id=device.pk)
            expires_seconds = max(1, int((command.expires_at - now).total_seconds()))
            properties = Properties(PacketTypes.PUBLISH)
            properties.MessageExpiryInterval = expires_seconds
            if not self._publish_once(
                f"{TOPIC_ROOT}/{device.pk}/commands",
                payload,
                properties,
                timeout=min(MQTT_PUBLISH_TIMEOUT_SECONDS, expires_seconds),
            ):
                logger.warning(
                    "MQTT publish did not receive broker confirmation for command %s; "
                    "it remains pending for retry before expiry.",
                    command.pk,
                )
                return
            command.status = Command.Status.PUBLISHED
            command.published_at = now
            command.save(update_fields=("status", "published_at", "updated_at"))
            record_event(
                actor=None,
                organization=command.pump.organization,
                action="command.published",
                object_type="command",
                object_id=command.pk,
                metadata={"device_id": str(device.pk), "qos": 1},
            )

    def _publish_once(self, topic, payload, properties, *, timeout):
        publisher = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{settings.MQTT_CLIENT_ID}-cmd-{uuid4().hex[:12]}",
            protocol=mqtt.MQTTv5,
            reconnect_on_failure=False,
        )
        publisher.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
        ca_path = Path(settings.MQTT_TLS_CA_CERT)
        if not ca_path.is_absolute():
            ca_path = (settings.BASE_DIR / ca_path).resolve()
        publisher.tls_set(ca_certs=str(ca_path))

        connected = threading.Event()
        connect_failed = []

        def on_connect(client, userdata, flags, reason_code, connect_properties):
            if reason_code.is_failure:
                connect_failed.append(str(reason_code))
            connected.set()

        def on_connect_fail(client, userdata):
            connect_failed.append("connection attempt failed")
            connected.set()

        publisher.on_connect = on_connect
        publisher.on_connect_fail = on_connect_fail
        loop_started = False
        try:
            result = publisher.connect(
                settings.MQTT_HOST,
                settings.MQTT_PORT,
                keepalive=10,
                clean_start=True,
            )
            if result != mqtt.MQTT_ERR_SUCCESS:
                logger.warning("MQTT command publisher could not connect (rc=%s).", result)
                return False
            result = publisher.loop_start()
            if result != mqtt.MQTT_ERR_SUCCESS:
                logger.warning("MQTT command publisher loop failed to start (rc=%s).", result)
                return False
            loop_started = True
            if not connected.wait(timeout):
                logger.warning("MQTT command publisher connection timed out.")
                return False
            if connect_failed:
                logger.warning(
                    "MQTT command publisher connection was rejected: %s",
                    connect_failed[0],
                )
                return False
            info = publisher.publish(
                topic,
                payload=payload,
                qos=1,
                retain=False,
                properties=properties,
            )
            if info.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.warning("MQTT command publish failed (rc=%s).", info.rc)
                return False
            try:
                info.wait_for_publish(timeout=timeout)
            except RuntimeError:
                logger.exception("MQTT command publisher failed while awaiting PUBACK.")
                return False
            if not info.is_published():
                logger.warning("MQTT command publisher did not receive PUBACK in time.")
                return False
            return True
        except (OSError, ValueError, TimeoutError):
            logger.exception("MQTT command publish attempt failed.")
            return False
        finally:
            if loop_started:
                publisher.disconnect()
                publisher.loop_stop()

    def maintain_lifecycle(self):
        expire_command_timeouts(Command.objects.all())
