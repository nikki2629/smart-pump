import json
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


class ProtocolError(ValueError):
    pass


@lru_cache(maxsize=1)
def _validators():
    schema_dir = Path(settings.MQTT_SCHEMA_DIR)
    schemas = {
        "command": "command.schema.json",
        "command-ack": "command-ack.schema.json",
        "command-result": "command-result.schema.json",
        "event": "event.schema.json",
        "telemetry": "telemetry.schema.json",
        "device-status": "device-status.schema.json",
    }
    loaded = {
        name: json.loads((schema_dir / filename).read_text(encoding="utf-8"))
        for name, filename in schemas.items()
    }
    common = json.loads(
        (schema_dir / "common-device-message.schema.json").read_text(
            encoding="utf-8"
        )
    )
    registry = Registry().with_resource(
        common["$id"], Resource.from_contents(common)
    )
    validators = {}
    for name, schema in loaded.items():
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(
            schema,
            registry=registry,
            format_checker=FormatChecker(),
        )
    return validators


def validate_payload(message_type, payload):
    try:
        validator = _validators()[message_type]
    except KeyError as exc:
        raise ProtocolError(f"Unsupported MQTT message type: {message_type}.") from exc
    errors = sorted(
        validator.iter_errors(payload),
        key=lambda error: (list(error.absolute_path), error.message),
    )
    if errors:
        error = errors[0]
        location = ".".join(str(item) for item in error.absolute_path) or "$"
        raise ProtocolError(f"Invalid {message_type} at {location}: {error.message}")
    return payload


def decode_message(message_type, payload_bytes):
    if len(payload_bytes) > settings.MQTT_MAX_MESSAGE_BYTES:
        raise ProtocolError("MQTT message exceeds the configured maximum size.")
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError("MQTT payload must be valid UTF-8 encoded JSON.") from exc
    if not isinstance(payload, dict):
        raise ProtocolError("MQTT payload must be a JSON object.")
    return validate_payload(message_type, payload)


def encode_command(*, command, device_id):
    payload = {
        "protocol_version": 1,
        "command_id": str(command.pk),
        "device_id": str(device_id),
        "action": command.action,
        "issued_at": command.created_at.isoformat(),
        "expires_at": command.expires_at.isoformat(),
    }
    validate_payload("command", payload)
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)
