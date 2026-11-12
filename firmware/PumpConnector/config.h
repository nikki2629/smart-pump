#ifndef PUMP_CONNECTOR_CONFIG_H
#define PUMP_CONNECTOR_CONFIG_H

#include <Arduino.h>

// ============================================================================
// PUMP CONNECTOR FIRMWARE CONFIGURATION
// ============================================================================

// 1. Wi-Fi Settings
#define WIFI_SSID "Nikita"
#define WIFI_PASSWORD "nikki1234"

// 2. MQTT Broker Settings (TLS Enabled)
#define MQTT_BROKER "10.34.95.211"
#define MQTT_PORT 8883
#define MQTT_KEEPALIVE 30

// 3. Unique Device Credentials (Assigned during backend pairing)
#define DEVICE_ID "4b1f618a-9892-4f32-83b4-e4d0b1348101"
#define DEVICE_USERNAME "4b1f618a-9892-4f32-83b4-e4d0b1348101"
#define DEVICE_PASSWORD "SECURE_DEVICE_SECRET_TOKEN"

// 4. MQTT Topic Definitions
#define COMMAND_TOPIC "fieldlink/devices/" DEVICE_ID "/command"
#define ACK_TOPIC "fieldlink/devices/" DEVICE_ID "/ack"
#define RESULT_TOPIC "fieldlink/devices/" DEVICE_ID "/command-results"
#define STATUS_TOPIC "fieldlink/devices/" DEVICE_ID "/status"
#define TELEMETRY_TOPIC "fieldlink/devices/" DEVICE_ID "/telemetry"
#define EVENT_TOPIC "fieldlink/devices/" DEVICE_ID "/events"

// 5. Hardware Safety & Commissioning Mode
// Set DRY_RUN_MODE to true during initial installation to disable physical relay outputs.
#define DRY_RUN_MODE true

// Pin Assignments (Isolated Industrial Interface)
#define PIN_MOTOR_START_RELAY 22   // Active HIGH pulse or continuous drive to Starter Contactor
#define PIN_MOTOR_STOP_RELAY  23   // Active LOW NC Stop Relay
#define PIN_AUX_CONTACT_FB   34   // Auxiliary Contact Motor Feedback Input (3.3V Optocoupled)
#define PIN_OVERLOAD_TRIP_FB 35   // Thermal Overload Trip Feedback Input (3.3V Optocoupled)
#define PIN_PHASE_MONITOR_FB 32   // Phase Sequence/Loss Relay Feedback Input

// Intervals & Timeouts
#define HEARTBEAT_INTERVAL_MS 15000   // Telemetry/Status heartbeat interval
#define COMMAND_TIMEOUT_SEC   30      // Maximum command validity window
#define MOTOR_ACTUATION_DELAY_MS 2000 // Delay before verifying auxiliary contact feedback

// Root CA Certificate for TLS Server Validation
static const char CA_CERTIFICATE[] PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTVDA2M4MDAwMFoX
DTM1MDQwODE0MDAwMFowTzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0
IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEw
ggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQCtA3vvCz312/vL
-----END CERTIFICATE-----
)PEM";

#endif // PUMP_CONNECTOR_CONFIG_H
