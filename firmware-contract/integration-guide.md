# ESP32 firmware integration guide

## Contract and topic contract

Implement MQTT 5.0 over TLS, JSON protocol version 1, and the exact message
schemas in `schemas/v1/`. Read [mqtt-topics.md](./mqtt-topics.md) first. Use
`firmware-contract/simulator/device_simulator.py` as a local interoperability
reference only; it is not a safety controller or production firmware.

The unit of identity is the UUID assigned to a paired backend `Device`. Use
that UUID as the MQTT username, the `{device_id}` topic segment, and every
message's `device_id`. A UUID is not a secret. The broker ACL binds the
authenticated username to that UUID's topic subtree. A device must not publish
to another device's subtree, and the backend rejects topic/payload identity
mismatches and unpaired/revoked IDs.

Each device needs a unique broker password delivered through the future
device-provisioning process (or a unique client certificate if production
broker policy later adopts mTLS). Never reuse the backend service credentials.
Do not put broker admin credentials in firmware, the mobile app, or device
logs. Development passwords generated for the local simulator are not
production credentials.

## Required firmware behavior

1. Validate command schema/version, device identity, command UUID, action,
   issued/expiry timestamps, and a persisted deduplication record before acting.
2. Reject a command whose expiry has passed. Persist deduplication before
   executing, so reconnects, QoS redelivery, or a reboot cannot execute START
   twice. Return the command acknowledgement on the device's `command-acks`
   topic. An acknowledgement is receipt/acceptance only.
3. Before any requested START, enforce every local electrical and process
   protection interlock. Never provide software, MQTT, simulator, or firmware
   bypasses. A failed interlock publishes a rejected acknowledgement plus a
   protection/phase event and an appropriate failed/rejected result. STOP
   behavior must likewise preserve protective trips.
4. Publish one `command-results` message when execution is complete or fails.
   `completed` alone does not claim that the motor is running.
5. Publish `device-status` after actual feedback changes and every 15 seconds.
   Increment and persist one strictly increasing sequence across acknowledgements,
   results, events, telemetry, and status. Reuse an identical `message_id`,
   sequence, timestamp, and payload when retransmitting the same logical event.
6. Only set `motor_feedback_valid=true` with a configured, working physical
   feedback source (auxiliary contactor feedback or phase-current measurement).
   Report `unknown` and `false` when feedback is absent/invalid. Include the
   relevant `last_command_id` with feedback associated with a command.
7. Publish timestamped telemetry and all protection/phase events. Use UTC
   RFC 3339 timestamps with an explicit timezone. Do not publish credentials,
   pairing codes, or sensitive user data.
8. Use a clean MQTT session, non-retained commands, TLS certificate validation,
   authenticated credentials unique to this device, keepalive, and bounded
   reconnect backoff. On reconnect, subscribe only to the device's command
   topic and do not replay stale commands.

## Topic-level ACL

The local Mosquitto ACL is in `simulator/broker/acl`. It allows the backend
service to publish commands and subscribe to device reports. A device username
may subscribe only to its own command topic and publish only to its own
acknowledgement/result/event/telemetry/status topics. Unmatched topics are
denied. Replicate these exact least-privilege boundaries in the managed
production broker; do not grant devices wildcard or cross-device permissions.

## Local simulator and broker

The broker and simulator have an independent Compose project under
`firmware-contract/simulator/`; they are not included in production
infrastructure. Requires Docker Compose, Python 3.12+, and the backend virtual
environment (for the certificate-generation helper's `cryptography` package).

From PowerShell:

```powershell
Set-Location .\backend
.\.venv\Scripts\Activate.ps1
Set-Location ..\firmware-contract\simulator
Copy-Item .env.example .env
```

Set `MQTT_DEVICE_ID` in `.env` to the UUID of an already paired backend device.
Copy that same UUID into the PowerShell variable for broker user creation:

```powershell
$env:MQTT_DEVICE_ID = "paste-the-device-uuid-from-.env"
```

Generate local-only certificates:

```powershell
python .\broker\generate_local_certs.py
```

The generated CA certificate and broker private key live under ignored
`broker/.local/`. They are self-signed local-development material, expire after
30 days, and must never be used in production.

Create local-only broker users interactively (Mosquitto prompts for each
password; do not put passwords in shell history):

```powershell
docker compose -f compose.yml run --rm --no-deps --entrypoint mosquitto_passwd broker -c /mosquitto/local/password_file backend-service
docker compose -f compose.yml run --rm --no-deps --entrypoint mosquitto_passwd broker /mosquitto/local/password_file $env:MQTT_DEVICE_ID
```

Set `MQTT_DEVICE_PASSWORD` in the local `.env` to the device password you just
entered. In `backend/.env`, set the separate `MQTT_USERNAME=backend-service`,
the backend user's separately generated password, and
`MQTT_TLS_CA_CERT=../firmware-contract/simulator/broker/.local/certs/ca.crt`.
Set `MQTT_HOST=127.0.0.1`. Start the isolated broker and the standalone Django
worker in separate terminals:

```powershell
docker compose -f compose.yml up -d broker
Set-Location ..\..\backend
.\.venv\Scripts\Activate.ps1
python manage.py run_mqtt_worker
```

In another terminal, run the simulator profile:

```powershell
Set-Location .\firmware-contract\simulator
docker compose -f compose.yml --profile simulator up --build simulator
```

Select scenarios by setting `SIMULATOR_SCENARIO` in the ignored local `.env`:
`success`, `start-timeout`, `protection-fault`, `phase-fault`,
`delayed-feedback`, `duplicate`, or `disconnect`. `SIMULATOR_FEEDBACK_DELAY_SECONDS`
controls delayed physical feedback. Restart the simulator container after
changing scenario settings. Remove only local generated simulator state with
`docker compose -f compose.yml down`; ignored passwords and certificates can
be explicitly removed separately when no longer needed.

The simulator subscribes only as the device identity; it cannot publish
commands or see another device's topic. The backend runs as a separate user.
To provision another simulated device, create/pair its backend record, update
`MQTT_DEVICE_ID`, and add a broker password for that UUID.

## Physical device commissioning checklist

Before issuing production credentials or enabling command publication, collect
and configure:

- The paired backend device UUID and immutable ESP32/panel serial number.
- Managed broker hostname, TLS port, trusted CA chain, MQTT 5 support, and
  production ACL configuration.
- A unique device credential/provisioning channel, credential rotation and
  revocation process; no shared fleet password.
- Firmware protocol version and firmware release identifier.
- Which physical sensor/contact proves motor running/stopped, signal polarity,
  failure modes, and the approved `motor_feedback_source` mapping.
- Rated electrical/sensor ranges, telemetry calibration/units, heartbeat
  interval, timeout expectations, and site time synchronization.
- Panel-approved protection/interlock requirements, phase-monitor behavior,
  and safe response to communication loss. These are determined and validated
  by the electrical engineer; MQTT must not alter them.
- Acceptance tests for command expiry during outages, replay after reboot,
  duplicate delivery, out-of-order telemetry, protection trip, loss of feedback,
  and actual start/stop feedback before production control is enabled.

The backend settings `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`,
`MQTT_PASSWORD`, and `MQTT_TLS_CA_CERT` must reference production secret
management and trusted broker certificates. Replace the illustrative local
ACL, CA, credentials, simulator and Docker broker with managed production
broker identities and topic policies. The Android app receives no MQTT
credentials and communicates with Django over HTTPS only.
