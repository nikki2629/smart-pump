# MQTT topics and access control

Protocol version 1 uses MQTT 5.0 over TLS on port 8883. Every message is UTF-8
JSON and must validate against the matching schema in `schemas/v1/`. Commands
are non-retained, QoS 1 messages. Device publications are QoS 1. Both sides
must tolerate duplicate delivery. The broker is the authentication and topic
authorization boundary; it is not exposed to the Android application.

The topic prefix is `smart-pump/v1/devices/{device_id}`. `device_id` is the
canonical lowercase UUID stored in the backend. The backend derives the
destination from the authorized pump's paired device record. It never uses a
device identifier supplied in a client command request.

| Topic | Publisher | Subscriber | Schema | Purpose |
| --- | --- | --- | --- | --- |
| `smart-pump/v1/devices/{device_id}/commands` | Backend service | That device only | `command.schema.json` | Authorized, expiring start/stop requests |
| `smart-pump/v1/devices/{device_id}/command-acks` | That device only | Backend service | `command-ack.schema.json` | Command receipt/rejection, not motor-state confirmation |
| `smart-pump/v1/devices/{device_id}/command-results` | That device only | Backend service | `command-result.schema.json` | Execution result; not by itself physical feedback |
| `smart-pump/v1/devices/{device_id}/events` | That device only | Backend service | `event.schema.json` | Protection, phase, and diagnostic events |
| `smart-pump/v1/devices/{device_id}/telemetry` | That device only | Backend service | `telemetry.schema.json` | Timestamped three-phase readings |
| `smart-pump/v1/devices/{device_id}/status` | That device only | Backend service | `device-status.schema.json` | Heartbeat and measured physical feedback |

Commands are never retained. The backend attaches an MQTT 5 message-expiry
interval and an absolute UTC `expires_at`. On receiving a command, firmware
must independently reject it when its absolute expiry has passed, when the
device ID does not match the provisioned device, or when the command ID has
already been handled. A device must never replay a stale START after reconnect.
Broker sessions are clean-start/zero-persistence and are not an offline command
queue. Pending backend outbox records are checked against expiry before every
publish after a connection/reconnection.

For each device identity, `sequence` is a strictly increasing positive integer
across **all** device-to-backend topics and must persist across device restarts.
`message_id` is a fresh UUID for each logical publication and must be reused
unchanged when retransmitting that publication. The backend stores event IDs,
ignores duplicate IDs, and records (but does not apply) events whose sequence
is not newer than the last accepted sequence. Do not reset the sequence when a
device reboots; use non-volatile storage or provision a new identity.

Messages identify the device in both the topic and payload. The broker ACL
binds a device's username to its own UUID topic subtree; the backend also
requires exact topic/payload identity equality and a paired database record.
Never publish on behalf of another device. An ID in JSON is not an
authentication credential.

On `command-acks`, `accepted` means the request was received and passed device
validation/interlock checks. `rejected` includes a safe `reason_code`. It is
not proof that a motor started or stopped. On `command-results`, `completed`
describes command execution only; `failed` and `rejected` are terminal failures.
The backend marks a command `succeeded` only after a `completed` result and a
later/current `status` message reports valid, appropriately sourced physical
feedback matching the requested action and referencing that command ID.

The device status schema requires `motor_feedback`, `motor_feedback_source`,
`motor_feedback_valid`, and `last_command_id`. Valid feedback must come from
the configured `auxiliary_contact` or `phase_current` physical measurement;
when there is no suitable measurement, report `unknown`, `unknown`, and
`false`. A relay coil/output request alone is not physical motor feedback.
Never assert a running state from a command, software variable, or output pin.

Heartbeat cadence is 15 seconds. The API considers a device offline when no
valid newer device message has been received for 90 seconds. Broker
connectivity alone does not mean the pump is online.

The backend uses QoS 1 manual acknowledgements for incoming device reports. It
acknowledges a valid publication only after its database transaction commits.
Malformed or unauthorized messages are logged and acknowledged (to avoid
poison-message loops); database failures are left unacknowledged for broker
redelivery. Duplicate reports are safely acknowledged after deduplication.

All protection remains local to the motor-control panel. Remote commands are
requests, never interlock overrides. Firmware must reject unsafe START requests
and report faults; a STOP must not disable or bypass protection.
