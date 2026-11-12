from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from alerts.models import Alert
from audit.services import record_event
from commands.models import Command
from devices.models import Device, DeviceEvent
from mqtt_integration.protocol import ProtocolError, decode_message
from telemetry.models import TelemetryRecord

TOPIC_ROOT = "smart-pump/v1/devices"
TOPIC_MESSAGE_TYPES = {
    "command-acks": "command-ack",
    "command-results": "command-result",
    "events": "event",
    "telemetry": "telemetry",
    "status": "device-status",
}


def parse_device_topic(topic):
    parts = topic.split("/")
    if (
        len(parts) != 5
        or "/".join(parts[:3]) != TOPIC_ROOT
        or parts[4] not in TOPIC_MESSAGE_TYPES
    ):
        raise ProtocolError("Message arrived on an unauthorized device topic.")
    try:
        device_id = UUID(parts[3])
    except ValueError as exc:
        raise ProtocolError("Topic contains an invalid device identity.") from exc
    if parts[3] != str(device_id):
        raise ProtocolError("Device topic identity must use canonical lowercase UUID.")
    return device_id, parts[4], TOPIC_MESSAGE_TYPES[parts[4]]


def _parse_timestamp(value):
    timestamp = parse_datetime(value)
    if timestamp is None or timezone.is_naive(timestamp):
        raise ProtocolError("Device timestamps must include an explicit timezone.")
    if timestamp > timezone.now() + timedelta(minutes=5):
        raise ProtocolError("Device timestamp is too far in the future.")
    return timestamp


def _expected_feedback(action):
    return (
        Device.MotorFeedback.RUNNING
        if action == Command.Action.START
        else Device.MotorFeedback.STOPPED
    )


def _process_ack(device, payload, received_at):
    command = (
        Command.objects.select_for_update()
        .filter(pk=payload["command_id"], pump__device=device)
        .first()
    )
    if command is None or command.status != Command.Status.PUBLISHED:
        return DeviceEvent.ProcessingStatus.UNMATCHED_COMMAND
    if command.expires_at <= received_at:
        command.status = Command.Status.EXPIRED
        command.save(update_fields=("status", "updated_at"))
        record_event(
            actor=None,
            organization=device.organization,
            action="command.expired",
            object_type="command",
            object_id=command.pk,
            metadata={"reason": "acknowledgement_received_after_expiry"},
        )
        return DeviceEvent.ProcessingStatus.UNMATCHED_COMMAND
    command.acknowledged_at = received_at
    if payload["outcome"] == "accepted":
        command.status = Command.Status.ACKNOWLEDGED
        action_name = "command.acknowledged"
    else:
        command.status = Command.Status.FAILED
        command.result_outcome = "rejected"
        command.result_code = payload.get("reason_code", "device_rejected")
        command.result_received_at = received_at
        action_name = "command.rejected"
    command.save(
        update_fields=(
            "status",
            "acknowledged_at",
            "result_outcome",
            "result_code",
            "result_received_at",
            "updated_at",
        )
    )
    record_event(
        actor=None,
        organization=device.organization,
        action=action_name,
        object_type="command",
        object_id=command.pk,
        metadata={"device_id": str(device.pk)},
    )
    return DeviceEvent.ProcessingStatus.PROCESSED


def _process_command_result(device, payload, received_at):
    command = (
        Command.objects.select_for_update()
        .filter(pk=payload["command_id"], pump__device=device)
        .first()
    )
    if command is None or command.status not in (
        Command.Status.PUBLISHED,
        Command.Status.ACKNOWLEDGED,
        Command.Status.RESULT_RECEIVED,
    ):
        return DeviceEvent.ProcessingStatus.UNMATCHED_COMMAND
    if command.expires_at <= received_at and command.acknowledged_at is None:
        command.status = Command.Status.EXPIRED
        command.save(update_fields=("status", "updated_at"))
        record_event(
            actor=None,
            organization=device.organization,
            action="command.expired",
            object_type="command",
            object_id=command.pk,
            metadata={"reason": "result_received_after_expiry"},
        )
        return DeviceEvent.ProcessingStatus.UNMATCHED_COMMAND

    command.result_outcome = payload["outcome"]
    command.result_code = payload["result_code"]
    command.result_received_at = received_at
    if payload["outcome"] == "completed":
        command.status = Command.Status.RESULT_RECEIVED
        if (
            device.motor_feedback_valid
            and device.last_feedback_command_id == command.pk
            and device.motor_feedback == _expected_feedback(command.action)
        ):
            command.status = Command.Status.SUCCEEDED
    else:
        command.status = Command.Status.FAILED
    command.save(
        update_fields=(
            "status",
            "result_outcome",
            "result_code",
            "result_received_at",
            "updated_at",
        )
    )
    record_event(
        actor=None,
        organization=device.organization,
        action=f"command.{payload['outcome']}",
        object_type="command",
        object_id=command.pk,
        metadata={"result_code": payload["result_code"]},
    )
    return DeviceEvent.ProcessingStatus.PROCESSED


def _process_status(device, payload, occurred_at):
    if (
        device.motor_feedback_at is not None
        and occurred_at < device.motor_feedback_at
    ):
        return DeviceEvent.ProcessingStatus.STALE_FEEDBACK

    command_id = payload["last_command_id"]
    device.motor_feedback_valid = payload["motor_feedback_valid"]
    device.motor_feedback = payload["motor_feedback"]
    device.motor_feedback_source = payload["motor_feedback_source"]
    device.motor_feedback_at = occurred_at
    device.last_feedback_command_id = UUID(command_id) if command_id else None
    device.save(
        update_fields=(
            "motor_feedback_valid",
            "motor_feedback",
            "motor_feedback_source",
            "motor_feedback_at",
            "last_feedback_command_id",
            "updated_at",
        )
    )
    if not command_id or not payload["motor_feedback_valid"]:
        return DeviceEvent.ProcessingStatus.PROCESSED

    command = (
        Command.objects.select_for_update()
        .filter(pk=command_id, pump__device=device)
        .first()
    )
    if command is None or command.result_outcome != "completed":
        return DeviceEvent.ProcessingStatus.PROCESSED
    if device.motor_feedback == _expected_feedback(command.action):
        command.status = Command.Status.SUCCEEDED
        command.save(update_fields=("status", "updated_at"))
        record_event(
            actor=None,
            organization=device.organization,
            action="command.physical_feedback_confirmed",
            object_type="command",
            object_id=command.pk,
            metadata={
                "motor_feedback": device.motor_feedback,
                "feedback_source": device.motor_feedback_source,
            },
        )
    return DeviceEvent.ProcessingStatus.PROCESSED


def _process_message(device_id, topic, message_type, payload):
    received_at = timezone.now()
    occurred_at = _parse_timestamp(payload["occurred_at"])

    with transaction.atomic():
        device = Device.objects.select_for_update().filter(pk=device_id).first()
        if (
            device is None
            or device.provisioning_status != Device.ProvisioningStatus.PAIRED
        ):
            raise ProtocolError("MQTT identity is not a paired device.")
        if payload["device_id"] != str(device.pk):
            raise ProtocolError("Payload device identity does not match its topic.")

        if DeviceEvent.objects.filter(
            device=device, message_id=payload["message_id"]
        ).exists():
            return "duplicate"
        if payload["sequence"] <= device.last_event_sequence:
            DeviceEvent.objects.create(
                device=device,
                message_id=payload["message_id"],
                sequence=payload["sequence"],
                topic=topic,
                event_type=message_type,
                payload=payload,
                processing_status=DeviceEvent.ProcessingStatus.OUT_OF_ORDER,
            )
            return "out_of_order"

        device.last_event_sequence = payload["sequence"]
        device.last_seen_at = received_at
        device.save(update_fields=("last_event_sequence", "last_seen_at", "updated_at"))

        if message_type == "command-ack":
            processing_status = _process_ack(device, payload, received_at)
        elif message_type == "command-result":
            processing_status = _process_command_result(
                device, payload, received_at
            )
        elif message_type == "device-status":
            processing_status = _process_status(device, payload, occurred_at)
        elif message_type == "telemetry":
            TelemetryRecord.objects.create(
                device=device,
                reported_at=occurred_at,
                values=payload["metrics"],
            )
            processing_status = DeviceEvent.ProcessingStatus.PROCESSED
        else:
            Alert.objects.create(
                device=device,
                severity=payload["severity"],
                code=payload["code"],
                message=payload["message"],
                occurred_at=occurred_at,
            )
            record_event(
                actor=None,
                organization=device.organization,
                action=f"device.{payload['event_type']}",
                object_type="device",
                object_id=device.pk,
                metadata={
                    "code": payload["code"],
                    "severity": payload["severity"],
                    "message": payload["message"],
                    "command_id": payload.get("command_id"),
                },
            )
            processing_status = DeviceEvent.ProcessingStatus.PROCESSED

        DeviceEvent.objects.create(
            device=device,
            message_id=payload["message_id"],
            sequence=payload["sequence"],
            topic=topic,
            event_type=message_type,
            payload=payload,
            processing_status=processing_status,
        )
        return processing_status


def handle_device_message(topic, payload_bytes):
    device_id, leaf_topic, message_type = parse_device_topic(topic)
    payload = decode_message(message_type, payload_bytes)
    if payload["device_id"] != str(device_id):
        raise ProtocolError("Payload device identity does not match its topic.")
    return _process_message(device_id, topic, message_type, payload)
