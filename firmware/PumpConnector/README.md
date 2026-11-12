# PUMP CONNECTOR - ESP32 FIRMWARE & COMMISSIONING GUIDE

This repository contains the complete production-grade ESP32 Arduino Core firmware for the **PUMP CONNECTOR** remote water pump automation platform.

---

## 1. HARDWARE ARCHITECTURE & ELECTRICAL SAFETY

> [!CAUTION]
> **CRITICAL ELECTRICAL SAFETY REQUIREMENT**
> An ESP32 GPIO output MUST NEVER directly switch a high-voltage AC three-phase induction motor load or high-current contactor coil.
> The ESP32 must interface exclusively through an appropriately rated, electrically isolated industrial control panel with interlocked relay drivers, optocouplers, and a dedicated motor starter.

### Required External Control Components
1. **Isolated Output Interface**: 24V DC auxiliary relays or 230V AC interlocked contactors driven via optoisolated relay channels.
2. **Auxiliary Contact Feedback**: A NO (Normally Open) auxiliary contact attached to the main motor contactor wired to `PIN_AUX_CONTACT_FB` (GPIO 34) through a 3.3V optocoupler input module.
3. **Thermal Overload Relay Trip Contact**: NC trip contact wired to `PIN_OVERLOAD_TRIP_FB` (GPIO 35) to instantly report and lock out on motor overload.
4. **Phase Monitor Relay**: 3-Phase Voltage/Phase Loss monitor relay connected to `PIN_PHASE_MONITOR_FB` (GPIO 32) to prevent single-phasing damage.

---

## 2. FIRMWARE DIRECTORY STRUCTURE

```
firmware/PumpConnector/
├── PumpConnector.ino      # Main Arduino setup() and loop() entry point
├── config.h               # Wi-Fi, MQTT broker, pins, and TLS CA certificate
├── device_auth.h          # Security validation & duplicate command prevention header
├── device_auth.cpp        # Security validation implementation
├── motor_controller.h     # Relay actuation abstraction & physical feedback header
├── motor_controller.cpp   # Relay actuation abstraction & safety interlocks
├── telemetry.h            # JSON payload encoder for telemetry & acknowledgments
├── telemetry.cpp          # JSON payload encoder implementation
├── mqtt_manager.h         # TLS MQTT client manager header
├── mqtt_manager.cpp       # TLS MQTT client manager implementation
└── README.md              # Installation & Commissioning Manual
```

---

## 3. REQUIRED LIBRARIES & ENVIRONMENT SETUP

### Software Requirements
- **Arduino IDE** (v2.x or later) or **PlatformIO**
- **ESP32 Arduino Core**: Version 2.0.11 or later

### Required Arduino Libraries
Install the following libraries via Arduino Library Manager (`Ctrl + Shift + I`):

1. **PubSubClient** (by Nick O'Leary) - MQTT client library
2. **ArduinoJson** (by Benoit Blanchon, v6.x) - JSON parser and generator

---

## 4. BOARD SELECTION & FLASH SETTINGS

In Arduino IDE:
1. Go to **Tools > Board > ESP32 Arduino > ESP32 Dev Module**
2. **Upload Speed**: 921600
3. **CPU Frequency**: 240MHz (WiFi)
4. **Flash Frequency**: 80MHz
5. **Flash Mode**: QIO
6. **Partition Scheme**: Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)

---

## 5. STEP-BY-STEP CONFIGURATION & PROVISIONING GUIDE

### Step 1: Pair Controller in Pump Connector App
1. Log in to the **Pump Connector** mobile app.
2. Open **Account Settings > Pair ESP32 Controller**.
3. Register the device serial number.
4. Copy the generated `DEVICE_ID` and pairing token.

### Step 2: Configure `config.h`
Open `config.h` in Arduino IDE and update:

```cpp
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define MQTT_BROKER "mqtt.pumpconnector.com"
#define MQTT_PORT 8883

#define DEVICE_ID "YOUR_PAIRING_DEVICE_UUID"
#define DEVICE_USERNAME "YOUR_PAIRING_DEVICE_UUID"
#define DEVICE_PASSWORD "YOUR_SECURE_DEVICE_SECRET"
```

### Step 3: Commissioning Checklist (Dry Run Mode)
By default, `DRY_RUN_MODE` is set to `true` in `config.h`:
```cpp
#define DRY_RUN_MODE true
```
This enables full Wi-Fi, TLS MQTT, command reception, and status telemetry reporting while keeping physical relay actuation outputs disabled.

---

## 6. FLASHING & TESTING

1. Connect ESP32 to PC via Micro-USB / USB-C.
2. Select the serial port under **Tools > Port**.
3. Click **Upload** (`Ctrl + U`).
4. Open **Serial Monitor** at **115200 baud**.
5. Observe the boot sequence:
   ```
   ===============================================
     PUMP CONNECTOR - ESP32 FIRMWARE STARTUP
   ===============================================
   [AUTH] Device Security Credentials Initialized.
   [MOTOR] Motor Controller Initialized. Dry Run Mode: ENABLED
   [WIFI] Connecting to Wi-Fi...
   [WIFI] Wi-Fi Connected Successfully! IP: 192.168.1.105
   [MQTT] Connecting to TLS Broker...
   [MQTT] Connected & Authenticated Successfully!
   ```
6. Send a START command from the Pump Connector mobile dashboard.
7. Verify that the ESP32 receives the command, publishes `accepted` ACK, and reports updated feedback status over MQTT!
8. After verifying physical wiring in the control panel, change `DRY_RUN_MODE` to `false` in `config.h` for live motor operation.
