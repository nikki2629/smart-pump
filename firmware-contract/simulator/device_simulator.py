import argparse
import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from jsonschema import Draft202012Validator, FormatChecker

TOPIC_ROOT = "smart-pump/v1/devices"
SCENARIOS = (
    "success",
    "start-timeout",
    "protection-fault",
    "phase-fault",
    "delayed-feedback",
    "duplicate",
    "disconnect",
)
logger = logging.getLogger("pump-simulator")


def timestamp():
    return datetime.now(timezone.utc).isoformat()


class DeviceSimulator:
    def __init__(
        self,
        *,
        device_id,
        password,
        host,
        port,
        ca_cert,
        scenario="success",
        feedback_delay=5,
    ):
        self.device_id = str(uuid.UUID(device_id))
        self.password = password
        self.host = host
        self.port = port
        self.ca_cert = Path(ca_cert)
        self.scenario = scenario
        self.feedback_delay = feedback_delay
        self.sequence = 0
        self.started_at = time.monotonic()
        self.motor_feedback = "stopped"
        self.last_command_id = None
        self.connected = False
        self._stop = threading.Event()
        self._processed_commands = {}
        self._validators = self._load_validators()
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"sim-device-{self.device_id}",
            protocol=mqtt.MQTTv5,
        )
        self.client.username_pw_set(self.device_id, self.password)
        self.client.tls_set(ca_certs=str(self.ca_cert))
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.on_connect_fail = self._on_connect_fail

    @staticmethod
    def _load_validators():
        schema_dir = Path(__file__).resolve().parent.parent / "schemas" / "v1"
        schema = json.loads(
            (schema_dir / "command.schema.json").read_text(encoding="utf-8")
        )
        Draft202012Validator.check_schema(schema)
        return {
            "command": Draft202012Validator(
                schema, format_checker=FormatChecker()
            )
        }

    def start(self):
        logger.info("Connecting device %s to local TLS broker %s:%s.", self.device_id, self.host, self.port)
        self.client.connect_async(
            self.host,
            self.port,
            keepalive=30,
            clean_start=True,
        )
        result = self.client.loop_start()
        if result != mqtt.MQTT_ERR_SUCCESS:
            raise ConnectionError(f"Simulator MQTT loop failed to start: {result}.")

    def stop(self):
        self._stop.set()
        self.connected = False
        self.client.disconnect()
        self.client.loop_stop()

    def run(self, heartbeat_seconds=15):
        self.start()
        try:
            while not self._stop.wait(heartbeat_seconds):
                if self.connected:
                    self._publish_status()
        except KeyboardInterrupt:
            logger.info("Stopping simulated device.")
        finally:
            self.stop()

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            self.connected = False
            logger.error("Broker rejected simulator identity: %s", reason_code)
            return
        self.connected = True
        result, _ = client.subscribe(
            f"{TOPIC_ROOT}/{self.device_id}/commands", qos=1
        )
        if result != mqtt.MQTT_ERR_SUCCESS:
            self.connected = False
            logger.error("Simulator command subscription failed: %s", result)
            return
        logger.info("Authenticated device connection and command subscription active.")

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self.connected = False
        logger.warning("Device disconnected from the broker: %s", reason_code)

    def _on_connect_fail(self, client, userdata):
        self.connected = False
        logger.warning("Device could not connect; reconnect will be retried.")

    def _publish(self, leaf_topic, payload, *, duplicate=False):
        self.sequence += 1
        message = {
            "protocol_version": 1,
            "message_id": str(uuid.uuid4()),
            "device_id": self.device_id,
            "sequence": self.sequence,
            "occurred_at": timestamp(),
            **payload,
        }
        topic = f"{TOPIC_ROOT}/{self.device_id}/{leaf_topic}"
        serialized = json.dumps(message, separators=(",", ":"), sort_keys=True)
        info = self.client.publish(topic, serialized, qos=1, retain=False)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.warning("Publish to %s was rejected by the client: %s", topic, info.rc)
            return None
        if duplicate:
            duplicate_info = self.client.publish(
                topic, serialized, qos=1, retain=False
            )
            if duplicate_info.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.warning(
                    "Duplicate publish to %s was rejected: %s",
                    topic,
                    duplicate_info.rc,
                )
        return message

    def _publish_status(self, *, feedback_valid=True):
        source = "auxiliary_contact" if feedback_valid else "unknown"
        feedback = self.motor_feedback if feedback_valid else "unknown"
        return self._publish(
            "status",
            {
                "uptime_s": max(0, int(time.monotonic() - self.started_at)),
                "firmware_version": "simulator-1.0.0",
                "motor_feedback": feedback,
                "motor_feedback_source": source,
                "motor_feedback_valid": feedback_valid,
                "last_command_id": self.last_command_id,
            },
            duplicate=self.scenario == "duplicate",
        )

    def _publish_event(self, event_type, code, severity, message, command_id):
        return self._publish(
            "events",
            {
                "event_type": event_type,
                "code": code,
                "severity": severity,
                "message": message,
                "command_id": command_id,
            },
            duplicate=self.scenario == "duplicate",
        )

    def _publish_ack(self, command_id, outcome, reason_code=None):
        body = {"command_id": command_id, "outcome": outcome}
        if reason_code:
            body["reason_code"] = reason_code
        message = self._publish(
            "command-acks",
            body,
            duplicate=self.scenario == "duplicate",
        )
        if message is not None:
            self._processed_commands[command_id] = {"ack": message}
        return message

    def _publish_result(self, command_id, outcome, result_code):
        message = self._publish(
            "command-results",
            {
                "command_id": command_id,
                "outcome": outcome,
                "result_code": result_code,
            },
            duplicate=self.scenario == "duplicate",
        )
        if message is not None:
            self._processed_commands.setdefault(command_id, {})["result"] = message
        return message

    def _confirm_feedback(self, command_id, feedback, *, delay=0):
        def publish_feedback():
            if self._stop.wait(delay):
                return
            self.motor_feedback = feedback
            self.last_command_id = command_id
            if self.connected:
                self._publish_status(feedback_valid=True)

        if delay:
            threading.Thread(
                target=publish_feedback,
                name="simulated-feedback",
                daemon=True,
            ).start()
        else:
            publish_feedback()

    def _reject(self, command_id, reason, *, fault_type=None):
        if fault_type == "protection":
            self._publish_event(
                "protection_fault",
                reason,
                "critical",
                "Local electrical protection interlock prevents this start request.",
                command_id,
            )
        elif fault_type == "phase":
            self._publish_event(
                "phase_fault",
                reason,
                "critical",
                "Simulated phase monitor detected an unsafe phase condition.",
                command_id,
            )
        self._publish_ack(command_id, "rejected", reason)
        self._publish_result(command_id, "rejected", reason)

    def process_command(self, command):
        errors = list(self._validators["command"].iter_errors(command))
        if errors:
            logger.warning("Ignoring invalid command payload: %s", errors[0].message)
            return
        if command["device_id"] != self.device_id:
            logger.warning("Ignoring command addressed to another device.")
            return
        now = datetime.now(timezone.utc)
        expires_at = datetime.fromisoformat(command["expires_at"].replace("Z", "+00:00"))
        if expires_at <= now:
            logger.info("Ignoring expired command %s.", command["command_id"])
            return

        command_id = command["command_id"]
        if command_id in self._processed_commands:
            logger.info("Ignoring duplicate command %s without re-executing.", command_id)
            return

        action = command["action"]
        if action == "start" and self.scenario == "protection-fault":
            self._reject(
                command_id, "protection_interlock", fault_type="protection"
            )
            return
        if action == "start" and self.scenario == "phase-fault":
            self._reject(command_id, "phase_fault", fault_type="phase")
            return

        if self.scenario == "disconnect":
            self.client.disconnect()
            self.connected = False
            threading.Thread(
                target=self._reconnect_after_disconnect,
                name="simulated-disconnect",
                daemon=True,
            ).start()
            return

        self._publish_ack(command_id, "accepted")
        if action == "start" and self.scenario == "start-timeout":
            self._publish_event(
                "diagnostic",
                "start_timeout",
                "warning",
                "Simulated start timed out; physical running feedback was not observed.",
                command_id,
            )
            self._publish_result(command_id, "failed", "start_timeout")
            return

        self._publish_result(command_id, "completed", "execution_complete")
        desired_feedback = "running" if action == "start" else "stopped"
        delay = (
            self.feedback_delay
            if self.scenario == "delayed-feedback"
            else 0
        )
        self._confirm_feedback(command_id, desired_feedback, delay=delay)

    def _reconnect_after_disconnect(self):
        time.sleep(2)
        result = self.client.reconnect()
        if result != mqtt.MQTT_ERR_SUCCESS:
            logger.warning("Simulator reconnect returned %s.", result)

    def _on_message(self, client, userdata, message):
        if message.topic != f"{TOPIC_ROOT}/{self.device_id}/commands":
            logger.warning("Ignoring a command delivered on an unexpected topic.")
            return
        try:
            command = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            logger.warning("Ignoring a malformed command payload.")
            return
        if not isinstance(command, dict):
            logger.warning("Ignoring a command payload that is not a JSON object.")
            return
        self.process_command(command)


def main():
    parser = argparse.ArgumentParser(description="Isolated Smart Pump MQTT simulator.")
    parser.add_argument("--scenario", choices=SCENARIOS, default=None)
    parser.add_argument("--feedback-delay", type=float, default=None)
    args = parser.parse_args()
    device_id = os.environ.get("MQTT_DEVICE_ID", "")
    password = os.environ.get("MQTT_DEVICE_PASSWORD", "")
    ca_cert = os.environ.get(
        "MQTT_TLS_CA_CERT",
        str(Path(__file__).resolve().parent / "broker" / ".local" / "certs" / "ca.crt"),
    )
    if not device_id or not password:
        parser.error("MQTT_DEVICE_ID and MQTT_DEVICE_PASSWORD must be configured.")
    if not Path(ca_cert).is_file():
        parser.error(f"MQTT CA certificate does not exist: {ca_cert}")
    scenario = args.scenario or os.environ.get("SIMULATOR_SCENARIO", "success")
    if scenario not in SCENARIOS:
        parser.error(f"Unsupported simulator scenario: {scenario}")
    simulator = DeviceSimulator(
        device_id=device_id,
        password=password,
        host=os.environ.get("MQTT_HOST", "127.0.0.1"),
        port=int(os.environ.get("MQTT_PORT", "8883")),
        ca_cert=ca_cert,
        scenario=scenario,
        feedback_delay=args.feedback_delay
        if args.feedback_delay is not None
        else float(os.environ.get("SIMULATOR_FEEDBACK_DELAY_SECONDS", "5")),
    )
    simulator.run()


if __name__ == "__main__":
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    main()
