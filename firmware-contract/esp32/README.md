# ESP32 firmware for Smart Pump Control

The phone never talks to the ESP. Architecture:

```
Mobile app  --HTTPS REST-->  Django API  --MQTT TLS-->  Broker  --MQTT-->  ESP32
```

## What to flash

1. Install Arduino IDE (or PlatformIO) with **ESP32** board support.
2. Install libraries: **ArduinoJson** (v7+), **PubSubClient**.
3. Copy `secrets.h.example` → `secrets.h` and fill in Wi-Fi, API URL, serial, pairing code, MQTT host/password/CA.
4. Open `smart_pump_esp32.ino`, select your ESP32 board, flash.

## Pairing API (called by the ESP)

`POST {API_BASE_URL}/devices/pair/`

```json
{
  "serial_number": "PANEL-DEVICE-001",
  "pairing_code": "<one-time code from the mobile Pair device screen>"
}
```

Success `200`:

```json
{
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "serial_number": "PANEL-DEVICE-001",
  "provisioning_status": "paired",
  "mqtt": {
    "host": "broker.example.com",
    "port": 8883,
    "username": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "topic_root": "smart-pump/v1/devices",
    "protocol_version": 1,
    "tls": true
  }
}
```

The MQTT **password is never returned**. Create a broker user whose username is the `id` UUID and whose password matches `MQTT_PASSWORD` in `secrets.h`.

## MQTT topics (protocol v1)

| Direction | Topic |
| --- | --- |
| Subscribe | `smart-pump/v1/devices/{device_id}/commands` |
| Publish | `.../command-acks`, `.../command-results`, `.../events`, `.../telemetry`, `.../status` |

Command JSON example from the backend:

```json
{
  "protocol_version": 1,
  "command_id": "...",
  "device_id": "...",
  "action": "start",
  "issued_at": "2026-11-02T12:00:00Z",
  "expires_at": "2026-11-02T12:00:30Z"
}
```

Schemas live in `../schemas/v1/`. Full rules: `../integration-guide.md`.

## Commissioning checklist

1. In the app: create organization → create pump → pair device → copy pairing code (15 min).
2. Put serial + pairing code into `secrets.h`, flash ESP, watch Serial at 115200.
3. On the broker, add user `device_id` / `MQTT_PASSWORD` with the device ACL pattern from `../simulator/broker/acl`.
4. Run Django `runserver` and `run_mqtt_worker`.
5. In the app, send Start/Stop; confirm motor relay + status feedback.
