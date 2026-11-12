import importlib.util
import json
import sys
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.conf import settings
from django.db import OperationalError
from django.test import TestCase, override_settings
from django.utils import timezone
from paho.mqtt.packettypes import PacketTypes
from paho.mqtt.properties import Properties

from alerts.models import Alert
from audit.models import AuditEvent
from commands.models import Command
from commands.services import expire_command_timeouts
from devices.models import Device, DeviceEvent
from mqtt_integration.client import MqttBridge
from mqtt_integration.handlers import (
    TOPIC_ROOT,
    handle_device_message,
    parse_device_topic,
)
from mqtt_integration.protocol import ProtocolError, decode_message, validate_payload
from telemetry.models import TelemetryRecord
from test_support import (
    create_organization_member,
    create_paired_device,
    create_pump,
    create_verified_user,
)


@override_settings(
    MQTT_USERNAME="backend-service",
    MQTT_PASSWORD="test-backend-password",
    MQTT_TLS_CA_CERT=str(Path(__file__).resolve()),
    MQTT_HOST="127.0.0.1",
    MQTT_PORT=8883,
    MQTT_CLIENT_ID="mqtt-bridge-test",
)
class MqttBridgeIntegrationTests(TestCase):
    def setUp(self):
        self.user = create_verified_user("mqtt-integration@example.com")
        self.organization, _ = create_organization_member(self.user)
        self.pump = create_pump(self.user, self.organization)
        self.device = create_paired_device(self.organization, self.pump)

    def create_command(self, *, status=Command.Status.PUBLISHED, action="start"):
        return Command.objects.create(
            pump=self.pump,
            requested_by=self.user,
            action=action,
            status=status,
            idempotency_key=f"mqtt-{uuid4()}",
            expires_at=timezone.now() + timedelta(seconds=30),
            published_at=timezone.now() if status != Command.Status.AUTHORIZED else None,
        )

    def device_message(self, message_type, sequence, **fields):
        payload = {
            "protocol_version": 1,
            "message_id": str(uuid4()),
            "device_id": str(self.device.pk),
            "sequence": sequence,
            "occurred_at": timezone.now().isoformat(),
            **fields,
        }
        return (
            f"{TOPIC_ROOT}/{self.device.pk}/{message_type}",
            json.dumps(payload).encode(),
            payload,
        )

    def handle(self, message_type, sequence, **fields):
        topic, raw, payload = self.device_message(message_type, sequence, **fields)
        return handle_device_message(topic, raw), payload

    def test_device_status_requires_valid_physical_feedback(self):
        with self.assertRaises(ProtocolError):
            self.handle(
                "status",
                1,
                uptime_s=12,
                firmware_version="test-1",
                motor_feedback="running",
                motor_feedback_source="unknown",
                motor_feedback_valid=True,
                last_command_id=None,
            )
        self.device.refresh_from_db()
        self.assertEqual(self.device.motor_feedback, Device.MotorFeedback.UNKNOWN)
        self.assertEqual(DeviceEvent.objects.count(), 0)

    def test_ack_is_not_motor_success_and_duplicate_and_out_of_order_are_safe(self):
        command = self.create_command()
        ack_fields = {
            "command_id": str(command.pk),
            "outcome": "accepted",
        }
        topic, raw, _ = self.device_message("command-acks", 2, **ack_fields)
        result = handle_device_message(topic, raw)
        self.assertEqual(result, DeviceEvent.ProcessingStatus.PROCESSED)
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.ACKNOWLEDGED)
        self.device.refresh_from_db()
        self.assertEqual(self.device.motor_feedback, Device.MotorFeedback.UNKNOWN)

        self.assertEqual(handle_device_message(topic, raw), "duplicate")
        self.assertEqual(DeviceEvent.objects.filter(device=self.device).count(), 1)

        out_of_order_topic, out_of_order_raw, _ = self.device_message(
            "status",
            1,
            uptime_s=10,
            firmware_version="test-1",
            motor_feedback="running",
            motor_feedback_source="auxiliary_contact",
            motor_feedback_valid=True,
            last_command_id=str(command.pk),
        )
        self.assertEqual(
            handle_device_message(out_of_order_topic, out_of_order_raw),
            "out_of_order",
        )
        command.refresh_from_db()
        self.device.refresh_from_db()
        self.assertEqual(command.status, Command.Status.ACKNOWLEDGED)
        self.assertEqual(self.device.motor_feedback, Device.MotorFeedback.UNKNOWN)
        self.assertEqual(self.device.last_event_sequence, 2)
        self.assertEqual(
            DeviceEvent.objects.get(sequence=1).processing_status,
            DeviceEvent.ProcessingStatus.OUT_OF_ORDER,
        )

    def test_completed_result_requires_matching_confirmed_physical_feedback(self):
        command = self.create_command()
        self.handle(
            "command-acks",
            1,
            command_id=str(command.pk),
            outcome="accepted",
        )
        self.handle(
            "command-results",
            2,
            command_id=str(command.pk),
            outcome="completed",
            result_code="execution_complete",
        )
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.RESULT_RECEIVED)

        self.handle(
            "status",
            3,
            uptime_s=20,
            firmware_version="test-1",
            motor_feedback="running",
            motor_feedback_source="phase_current",
            motor_feedback_valid=True,
            last_command_id=str(command.pk),
        )
        command.refresh_from_db()
        self.device.refresh_from_db()
        self.assertEqual(command.status, Command.Status.SUCCEEDED)
        self.assertEqual(self.device.motor_feedback, Device.MotorFeedback.RUNNING)
        self.assertTrue(self.device.motor_feedback_valid)
        self.assertIsNotNone(self.device.last_seen_at)
        self.assertTrue(self.device.is_online)
        with override_settings(DEVICE_ONLINE_TIMEOUT_SECONDS=0):
            self.assertFalse(self.device.is_online)
        self.assertEqual(
            AuditEvent.objects.filter(
                action="command.physical_feedback_confirmed"
            ).count(),
            1,
        )

    def test_feedback_before_execution_result_is_correlated_safely(self):
        command = self.create_command()
        self.handle(
            "command-acks",
            1,
            command_id=str(command.pk),
            outcome="accepted",
        )
        self.handle(
            "status",
            2,
            uptime_s=20,
            firmware_version="test-1",
            motor_feedback="running",
            motor_feedback_source="auxiliary_contact",
            motor_feedback_valid=True,
            last_command_id=str(command.pk),
        )
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.ACKNOWLEDGED)
        self.handle(
            "command-results",
            3,
            command_id=str(command.pk),
            outcome="completed",
            result_code="execution_complete",
        )
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.SUCCEEDED)

    def test_device_identity_is_bound_to_topic_and_database_pairing(self):
        topic, raw, _ = self.device_message(
            "telemetry", 1, metrics={"frequency_hz": 50}
        )
        payload = json.loads(raw)
        payload["device_id"] = str(uuid4())
        with self.assertRaises(ProtocolError):
            handle_device_message(topic, json.dumps(payload).encode())
        with self.assertRaises(ProtocolError):
            parse_device_topic(
                f"{TOPIC_ROOT}/{str(self.device.pk).upper()}/telemetry"
            )
        self.device.provisioning_status = Device.ProvisioningStatus.REVOKED
        self.device.save(update_fields=("provisioning_status",))
        with self.assertRaises(ProtocolError):
            handle_device_message(topic, raw)
        self.assertEqual(TelemetryRecord.objects.count(), 0)

    def test_telemetry_and_faults_are_validated_and_persisted(self):
        result, _ = self.handle(
            "telemetry",
            1,
            metrics={
                "voltage_v": [230.0, 231.0, 229.0],
                "current_a": [8.1, 8.0, 8.2],
            },
        )
        self.assertEqual(result, DeviceEvent.ProcessingStatus.PROCESSED)
        record = TelemetryRecord.objects.get(device=self.device)
        self.assertEqual(record.values["voltage_v"], [230.0, 231.0, 229.0])

        self.handle(
            "events",
            2,
            event_type="phase_fault",
            code="phase_loss",
            severity="critical",
            message="Phase monitor detected phase loss.",
            command_id=None,
        )
        self.assertEqual(Alert.objects.get(device=self.device).code, "phase_loss")
        self.assertTrue(
            AuditEvent.objects.filter(action="device.phase_fault").exists()
        )

        with self.assertRaises(ProtocolError):
            decode_message("telemetry", b'{"protocol_version": 1}')

    @patch("mqtt_integration.client.mqtt.Client")
    def test_bridge_uses_tls_distinct_credentials_and_reconnect_safe_expiry(
        self, client_factory
    ):
        fake_client = MagicMock()
        publisher = MagicMock()
        fake_client.loop_start.return_value = 0
        fake_client.subscribe.return_value = (0, 1)
        publisher.loop_start.return_value = 0
        publish_info = MagicMock()
        publish_info.rc = 0
        publish_info.is_published.return_value = True
        publisher.publish.return_value = publish_info

        def connect_publisher(*args, **kwargs):
            publisher.on_connect(
                publisher, None, None, SimpleNamespace(is_failure=False), None
            )
            return 0

        publisher.connect.side_effect = connect_publisher
        client_factory.side_effect = [fake_client, publisher]
        bridge = MqttBridge()
        fake_client.tls_set.assert_called_once()
        fake_client.username_pw_set.assert_called_once_with(
            "backend-service", "test-backend-password"
        )
        self.assertEqual(
            client_factory.call_args.kwargs["protocol"],
            sys.modules["paho.mqtt.client"].MQTTv5,
        )
        self.assertTrue(client_factory.call_args.kwargs["manual_ack"])
        self.assertTrue(fake_client.tls_set.call_args.kwargs["ca_certs"].endswith("tests.py"))

        command = self.create_command(status=Command.Status.AUTHORIZED)
        fake_client.loop_start.return_value = 0
        bridge.start()
        self.assertTrue(fake_client.connect_async.call_args.kwargs["clean_start"])
        bridge.connected = True
        bridge.publish_pending_commands()
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.PUBLISHED)
        call = publisher.publish.call_args
        self.assertEqual(call.args[0], f"{TOPIC_ROOT}/{self.device.pk}/commands")
        payload = json.loads(call.kwargs["payload"])
        self.assertEqual(payload["command_id"], str(command.pk))
        self.assertEqual(payload["device_id"], str(self.device.pk))
        self.assertFalse(call.kwargs["retain"])
        self.assertEqual(call.kwargs["qos"], 1)
        self.assertIsInstance(call.kwargs["properties"], Properties)
        self.assertEqual(call.kwargs["properties"].packetType, PacketTypes.PUBLISH)

        expiring = self.create_command(status=Command.Status.AUTHORIZED)
        expiring.expires_at = timezone.now() - timedelta(seconds=1)
        expiring.save(update_fields=("expires_at",))
        bridge._on_connect(
            fake_client,
            None,
            None,
            SimpleNamespace(is_failure=False),
            None,
        )
        bridge._on_subscribe(
            fake_client,
            None,
            1,
            [SimpleNamespace(is_failure=False)],
            None,
        )
        publisher.publish.reset_mock()
        bridge.publish_pending_commands()
        expiring.refresh_from_db()
        self.assertEqual(expiring.status, Command.Status.EXPIRED)
        publisher.publish.assert_not_called()
        self.assertEqual(client_factory.call_count, 2)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="command.expired", object_id=str(expiring.pk)
            ).exists()
        )

    @patch("mqtt_integration.client.mqtt.Client")
    def test_bridge_fails_closed_when_credentials_or_ca_are_missing(
        self, client_factory
    ):
        from mqtt_integration.client import MqttConfigurationError

        with override_settings(MQTT_PASSWORD=""):
            with self.assertRaises(MqttConfigurationError):
                MqttBridge()
        with override_settings(MQTT_TLS_CA_CERT="missing-ca.pem"):
            with self.assertRaises(MqttConfigurationError):
                MqttBridge()
        client_factory.assert_not_called()

    def test_command_ack_without_execution_feedback_times_out_and_is_audited(self):
        command = self.create_command(status=Command.Status.ACKNOWLEDGED)
        command.expires_at = timezone.now() - timedelta(seconds=31)
        command.save(update_fields=("expires_at",))
        transitions = expire_command_timeouts(Command.objects.all())
        self.assertEqual(transitions, 1)
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.TIMED_OUT)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="command.timed_out",
                object_id=str(command.pk),
            ).exists()
        )

    def test_broker_acl_restricts_device_to_its_own_topics(self):
        acl_path = (
            Path(settings.BASE_DIR).parent
            / "firmware-contract"
            / "simulator"
            / "broker"
            / "acl"
        )
        acl = acl_path.read_text(encoding="utf-8")
        self.assertIn("user backend-service", acl)
        self.assertIn(
            "topic write smart-pump/v1/devices/+/commands",
            acl,
        )
        self.assertIn(
            "pattern read smart-pump/v1/devices/%u/commands",
            acl,
        )
        self.assertIn(
            "pattern write smart-pump/v1/devices/%u/status",
            acl,
        )
        self.assertNotIn("pattern readwrite smart-pump/v1/devices/%u/#", acl)

    @patch("mqtt_integration.client.mqtt.Client")
    def test_bridge_rejects_retained_messages(self, client_factory):
        bridge = MqttBridge()
        message = SimpleNamespace(
            topic=f"{TOPIC_ROOT}/{self.device.pk}/status",
            payload=b"{}",
            retain=True,
            qos=1,
            mid=1,
        )
        client_factory.return_value.ack.return_value = 0
        bridge._on_message(bridge.client, None, message)
        self.assertEqual(DeviceEvent.objects.count(), 0)
        client_factory.return_value.ack.assert_called_once_with(1, 1)

    @patch("mqtt_integration.client.mqtt.Client")
    def test_database_failure_leaves_qos_message_unacknowledged(self, client_factory):
        bridge = MqttBridge()
        message = SimpleNamespace(
            topic=f"{TOPIC_ROOT}/{self.device.pk}/telemetry",
            payload=b"{}",
            retain=False,
            qos=1,
            mid=7,
        )
        with patch(
            "mqtt_integration.client.handle_device_message",
            side_effect=OperationalError("database down"),
        ):
            bridge._on_message(client_factory.return_value, None, message)
        client_factory.return_value.ack.assert_not_called()


SIMULATOR_PATH = (
    Path(settings.BASE_DIR).parent
    / "firmware-contract"
    / "simulator"
    / "device_simulator.py"
)
SIMULATOR_SPEC = importlib.util.spec_from_file_location(
    "smart_pump_local_device_simulator", SIMULATOR_PATH
)
SIMULATOR_MODULE = importlib.util.module_from_spec(SIMULATOR_SPEC)
sys.modules[SIMULATOR_SPEC.name] = SIMULATOR_MODULE
SIMULATOR_SPEC.loader.exec_module(SIMULATOR_MODULE)


class DeviceSimulatorScenarioTests(TestCase):
    device_id = "00000000-0000-4000-8000-000000000001"

    def create_simulator(self, scenario, *, feedback_delay=5):
        factory_patch = patch("paho.mqtt.client.Client")
        client_factory = factory_patch.start()
        self.addCleanup(factory_patch.stop)
        fake_client = client_factory.return_value
        fake_client.publish.return_value = SimpleNamespace(rc=0)
        simulator = SIMULATOR_MODULE.DeviceSimulator(
            device_id=self.device_id,
            password="local-only-simulator-password",
            host="localhost",
            port=8883,
            ca_cert=Path(__file__).resolve(),
            scenario=scenario,
            feedback_delay=feedback_delay,
        )
        simulator.connected = True
        return simulator, fake_client

    def command(self, action="start", *, device_id=None, expires=None):
        return {
            "protocol_version": 1,
            "command_id": str(uuid4()),
            "device_id": device_id or self.device_id,
            "action": action,
            "issued_at": timezone.now().isoformat(),
            "expires_at": (expires or timezone.now() + timedelta(minutes=1)).isoformat(),
        }

    @staticmethod
    def publications(fake_client):
        return [
            (call.args[0], json.loads(call.args[1]))
            for call in fake_client.publish.call_args_list
        ]

    def test_simulator_successful_start_and_stop_publish_feedback_after_result(self):
        simulator, client = self.create_simulator("success")
        start = self.command("start")
        simulator.process_command(start)
        command_messages = self.publications(client)
        self.assertEqual(
            [message["outcome"] for topic, message in command_messages if topic.endswith("command-acks")],
            ["accepted"],
        )
        self.assertEqual(
            [
                message["outcome"]
                for topic, message in command_messages
                if topic.endswith("command-results")
            ],
            ["completed"],
        )
        start_status = next(
            message for topic, message in command_messages if topic.endswith("/status")
        )
        self.assertEqual(start_status["motor_feedback"], "running")
        self.assertTrue(start_status["motor_feedback_valid"])
        self.assertEqual(start_status["last_command_id"], start["command_id"])

        client.publish.reset_mock()
        stop = self.command("stop")
        simulator.process_command(stop)
        stop_status = next(
            message
            for topic, message in self.publications(client)
            if topic.endswith("/status")
        )
        self.assertEqual(stop_status["motor_feedback"], "stopped")

    def test_simulator_start_timeout_protection_fault_and_phase_fault(self):
        for scenario, expected_event, expected_ack in (
            ("start-timeout", "diagnostic", "accepted"),
            ("protection-fault", "protection_fault", "rejected"),
            ("phase-fault", "phase_fault", "rejected"),
        ):
            with self.subTest(scenario=scenario):
                simulator, client = self.create_simulator(scenario)
                simulator.process_command(self.command("start"))
                messages = self.publications(client)
                self.assertTrue(
                    any(
                        topic.endswith("/events")
                        and message["event_type"] == expected_event
                        for topic, message in messages
                    )
                )
                self.assertTrue(
                    any(
                        topic.endswith("command-acks")
                        and message["outcome"] == expected_ack
                        for topic, message in messages
                    )
                )
                self.assertFalse(
                    any(topic.endswith("/status") for topic, _ in messages)
                )

    def test_simulator_delayed_feedback_waits_after_command_result(self):
        simulator, client = self.create_simulator(
            "delayed-feedback", feedback_delay=30
        )
        with patch.object(SIMULATOR_MODULE.threading, "Thread") as thread_factory:
            simulator.process_command(self.command("start"))
        messages = self.publications(client)
        self.assertTrue(any(topic.endswith("command-results") for topic, _ in messages))
        self.assertFalse(any(topic.endswith("/status") for topic, _ in messages))
        thread_factory.return_value.start.assert_called_once()

    def test_simulator_duplicate_messages_reuse_identity_and_expired_commands_do_not_act(self):
        simulator, client = self.create_simulator("duplicate")
        command = self.command("start")
        simulator.process_command(command)
        messages = self.publications(client)
        ack_messages = [
            message for topic, message in messages if topic.endswith("command-acks")
        ]
        self.assertEqual(ack_messages[0], ack_messages[1])
        self.assertEqual(
            len({(message["message_id"], message["sequence"]) for message in ack_messages}),
            1,
        )

        client.publish.reset_mock()
        other, other_client = self.create_simulator("success")
        expired = self.command(expires=timezone.now() - timedelta(seconds=1))
        other.process_command(expired)
        other_client.publish.assert_not_called()
        wrong_device = self.command(device_id=str(uuid4()))
        other.process_command(wrong_device)
        other_client.publish.assert_not_called()

    def test_simulator_disconnect_scenario_disconnects_without_ack(self):
        simulator, client = self.create_simulator("disconnect")
        with patch.object(SIMULATOR_MODULE.threading, "Thread") as thread_factory:
            simulator.process_command(self.command("start"))
        client.disconnect.assert_called_once()
        client.publish.assert_not_called()
        thread_factory.return_value.start.assert_called_once()
