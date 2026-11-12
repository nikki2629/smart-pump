/**
 * Smart Pump Control — ESP32 firmware (protocol v1)
 *
 * Flow:
 *   1) Wi-Fi connect
 *   2) POST /api/v1/devices/pair/  (serial_number + pairing_code)
 *   3) MQTT TLS connect as username=<device UUID>
 *   4) Subscribe to smart-pump/v1/devices/{id}/commands
 *   5) Publish ack / result / status / telemetry / events
 *
 * Libraries (Arduino Library Manager):
 *   - ArduinoJson by Benoit Blanchon  (v7+)
 *   - PubSubClient by Nick O'Leary
 *
 * Board: ESP32 Dev Module (Arduino-ESP32 core 2.x / 3.x)
 *
 * Copy secrets.h.example → secrets.h before building.
 *
 * Note: PubSubClient speaks MQTT 3.1.1. Mosquitto accepts it alongside MQTT 5
 * clients used by the Django worker. Prefer a managed MQTT 5 client for new
 * production designs; message JSON schemas remain identical.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>

#include "secrets.h"

static const char *TOPIC_ROOT = "smart-pump/v1/devices";
static const uint32_t STATUS_INTERVAL_MS = 15000;
static const uint32_t TELEMETRY_INTERVAL_MS = 30000;
static const size_t MAX_DEDUP = 32;

WiFiClientSecure wifiSecure;
WiFiClient wifiPlain;
PubSubClient mqtt(wifiSecure);
Preferences prefs;

String deviceId;
String topicCommands;
String topicAcks;
String topicResults;
String topicEvents;
String topicTelemetry;
String topicStatus;

uint64_t sequence = 0;
unsigned long bootMs = 0;
unsigned long lastStatusMs = 0;
unsigned long lastTelemetryMs = 0;
bool motorRequestedOn = false;
String lastCommandId;
String processedCommandIds[MAX_DEDUP];
size_t processedCount = 0;

String uuidV4() {
  uint8_t b[16];
  for (int i = 0; i < 16; i++) {
    b[i] = (uint8_t)esp_random();
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  char out[37];
  snprintf(
      out, sizeof(out),
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10],
      b[11], b[12], b[13], b[14], b[15]);
  return String(out);
}

String rfc3339Now() {
  time_t now = time(nullptr);
  if (now < 1700000000) {
    return "1970-01-01T00:00:00Z";
  }
  struct tm tmUtc;
  gmtime_r(&now, &tmUtc);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
  return String(buf);
}

bool alreadyProcessed(const String &commandId) {
  for (size_t i = 0; i < processedCount; i++) {
    if (processedCommandIds[i] == commandId) {
      return true;
    }
  }
  return false;
}

void rememberProcessed(const String &commandId) {
  if (alreadyProcessed(commandId)) {
    return;
  }
  if (processedCount < MAX_DEDUP) {
    processedCommandIds[processedCount++] = commandId;
  } else {
    for (size_t i = 1; i < MAX_DEDUP; i++) {
      processedCommandIds[i - 1] = processedCommandIds[i];
    }
    processedCommandIds[MAX_DEDUP - 1] = commandId;
  }
  prefs.putString("last_cmd", commandId);
}

void loadPersistedState() {
  prefs.begin("smartpump", false);
  sequence = prefs.getULong64("seq", 0);
  deviceId = prefs.getString("device_id", "");
  lastCommandId = prefs.getString("last_cmd", "");
  if (lastCommandId.length() > 0) {
    rememberProcessed(lastCommandId);
  }
}

void persistSequence() {
  prefs.putULong64("seq", sequence);
}

void persistDeviceId() {
  prefs.putString("device_id", deviceId);
}

void buildTopics() {
  String base = String(TOPIC_ROOT) + "/" + deviceId;
  topicCommands = base + "/commands";
  topicAcks = base + "/command-acks";
  topicResults = base + "/command-results";
  topicEvents = base + "/events";
  topicTelemetry = base + "/telemetry";
  topicStatus = base + "/status";
}

bool protectionAllowsStart() {
  // Replace with real electrical interlocks (E-stop, phase monitor, overload).
  // Never bypass local panel protection from software.
  return true;
}

String readMotorFeedback(bool *valid, String *source) {
  pinMode(PIN_AUX_FEEDBACK, INPUT_PULLUP);
  int raw = digitalRead(PIN_AUX_FEEDBACK);
  bool active = AUX_FEEDBACK_ACTIVE_HIGH ? (raw == HIGH) : (raw == LOW);
  // Treat floating/unwired feedback as invalid unknown.
  // Wire PIN_AUX_FEEDBACK to auxiliary contactor for valid feedback.
  if (PIN_AUX_FEEDBACK < 0) {
    *valid = false;
    *source = "unknown";
    return "unknown";
  }
  *valid = true;
  *source = "auxiliary_contact";
  if (active) {
    return "running";
  }
  return "stopped";
}

void applyMotorOutput(bool on) {
  motorRequestedOn = on;
  digitalWrite(PIN_MOTOR_RELAY, on ? HIGH : LOW);
}

bool publishJson(const String &topic, JsonDocument &doc) {
  sequence += 1;
  persistSequence();
  doc["protocol_version"] = 1;
  doc["message_id"] = uuidV4();
  doc["device_id"] = deviceId;
  doc["sequence"] = (long long)sequence;
  doc["occurred_at"] = rfc3339Now();

  String payload;
  serializeJson(doc, payload);
  bool ok = mqtt.publish(topic.c_str(), payload.c_str(), false);
  if (!ok) {
    Serial.printf("MQTT publish failed: %s\n", topic.c_str());
  }
  return ok;
}

void publishAck(const String &commandId, const char *outcome, const char *reason) {
  JsonDocument doc;
  doc["command_id"] = commandId;
  doc["outcome"] = outcome;
  if (reason && outcome[0] == 'r') {
    doc["reason_code"] = reason;
  }
  publishJson(topicAcks, doc);
}

void publishResult(const String &commandId, const char *outcome, const char *code) {
  JsonDocument doc;
  doc["command_id"] = commandId;
  doc["outcome"] = outcome;
  doc["result_code"] = code;
  publishJson(topicResults, doc);
}

void publishEvent(
    const char *eventType,
    const char *code,
    const char *severity,
    const char *message,
    const String &commandId) {
  JsonDocument doc;
  doc["event_type"] = eventType;
  doc["code"] = code;
  doc["severity"] = severity;
  doc["message"] = message;
  if (commandId.length() > 0) {
    doc["command_id"] = commandId;
  } else {
    doc["command_id"] = nullptr;
  }
  publishJson(topicEvents, doc);
}

void publishStatus() {
  bool valid = false;
  String source;
  String feedback = readMotorFeedback(&valid, &source);
  JsonDocument doc;
  doc["uptime_s"] = (int)((millis() - bootMs) / 1000UL);
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["motor_feedback"] = feedback;
  doc["motor_feedback_source"] = source;
  doc["motor_feedback_valid"] = valid;
  if (lastCommandId.length() > 0) {
    doc["last_command_id"] = lastCommandId;
  } else {
    doc["last_command_id"] = nullptr;
  }
  publishJson(topicStatus, doc);
}

void publishTelemetry() {
  JsonDocument doc;
  JsonObject metrics = doc["metrics"].to<JsonObject>();
  JsonArray voltage = metrics["voltage_v"].to<JsonArray>();
  voltage.add(230.0);
  voltage.add(229.5);
  voltage.add(231.0);
  JsonArray current = metrics["current_a"].to<JsonArray>();
  float amps = motorRequestedOn ? 4.2 : 0.0;
  current.add(amps);
  current.add(amps);
  current.add(amps);
  metrics["frequency_hz"] = 50.0;
  publishJson(topicTelemetry, doc);
}

bool parseExpiryPassed(const char *expiresAt) {
  // Parse YYYY-MM-DDTHH:MM:SS (UTC / Z / +00:00) without depending on timegm.
  int year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
  if (sscanf(
          expiresAt,
          "%d-%d-%dT%d:%d:%d",
          &year, &month, &day, &hour, &minute, &second) != 6) {
    return true;
  }
  struct tm tmExpiry = {};
  tmExpiry.tm_year = year - 1900;
  tmExpiry.tm_mon = month - 1;
  tmExpiry.tm_mday = day;
  tmExpiry.tm_hour = hour;
  tmExpiry.tm_min = minute;
  tmExpiry.tm_sec = second;
  // mktime interprets as local time; device timezone is UTC via configTime(0,0,...).
  time_t expiry = mktime(&tmExpiry);
  time_t now = time(nullptr);
  if (expiry == (time_t)-1 || now < 1700000000) {
    // If clock is unset, reject rather than risk a late START.
    return true;
  }
  return expiry <= now;
}

void handleCommandPayload(const char *payload) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.println("Ignoring malformed command JSON");
    return;
  }
  if (doc["protocol_version"] != 1) {
    return;
  }
  const char *cmdDevice = doc["device_id"] | "";
  if (deviceId != cmdDevice) {
    Serial.println("Ignoring command for another device");
    return;
  }
  String commandId = String(doc["command_id"] | "");
  const char *action = doc["action"] | "";
  const char *expiresAt = doc["expires_at"] | "";
  if (commandId.length() == 0 || action[0] == '\0') {
    return;
  }
  if (parseExpiryPassed(expiresAt)) {
    Serial.printf("Ignoring expired command %s\n", commandId.c_str());
    return;
  }
  if (alreadyProcessed(commandId)) {
    Serial.printf("Ignoring duplicate command %s\n", commandId.c_str());
    return;
  }

  // Persist dedup BEFORE actuating so reboot/redelivery cannot double-start.
  rememberProcessed(commandId);

  if (strcmp(action, "start") == 0) {
    if (!protectionAllowsStart()) {
      publishEvent(
          "protection_fault",
          "protection_interlock",
          "critical",
          "Local protection interlock rejected START.",
          commandId);
      publishAck(commandId, "rejected", "protection_interlock");
      publishResult(commandId, "rejected", "protection_interlock");
      return;
    }
    publishAck(commandId, "accepted", nullptr);
    applyMotorOutput(true);
    lastCommandId = commandId;
    prefs.putString("last_cmd", lastCommandId);
    publishResult(commandId, "completed", "execution_complete");
    publishStatus();
    return;
  }

  if (strcmp(action, "stop") == 0) {
    publishAck(commandId, "accepted", nullptr);
    applyMotorOutput(false);
    lastCommandId = commandId;
    prefs.putString("last_cmd", lastCommandId);
    publishResult(commandId, "completed", "execution_complete");
    publishStatus();
    return;
  }

  publishAck(commandId, "rejected", "unsupported_action");
  publishResult(commandId, "rejected", "unsupported_action");
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  if (topicCommands != topic) {
    return;
  }
  char *buf = (char *)malloc(length + 1);
  if (!buf) {
    return;
  }
  memcpy(buf, payload, length);
  buf[length] = '\0';
  handleCommandPayload(buf);
  free(buf);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nWi-Fi OK %s\n", WiFi.localIP().toString().c_str());

  // NTP for command expiry checks and RFC3339 timestamps
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  for (int i = 0; i < 40 && time(nullptr) < 1700000000; i++) {
    delay(250);
  }
}

bool pairWithBackend() {
  if (deviceId.length() > 0) {
    Serial.printf("Already paired as %s\n", deviceId.c_str());
    return true;
  }

  String url = String(API_BASE_URL) + "/devices/pair/";
  bool useTls = url.startsWith("https://");
  HTTPClient http;

  if (useTls) {
    wifiSecure.setInsecure();  // pairing only; prefer pinned CA in production
    http.begin(wifiSecure, url);
  } else {
    http.begin(wifiPlain, url);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");

  JsonDocument body;
  body["serial_number"] = DEVICE_SERIAL_NUMBER;
  body["pairing_code"] = DEVICE_PAIRING_CODE;
  String bodyStr;
  serializeJson(body, bodyStr);

  Serial.printf("Pairing via %s\n", url.c_str());
  int code = http.POST(bodyStr);
  String response = http.getString();
  http.end();
  Serial.printf("Pair HTTP %d: %s\n", code, response.c_str());
  if (code != 200) {
    return false;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response)) {
    return false;
  }
  deviceId = String(doc["id"] | "");
  if (deviceId.length() == 0) {
    return false;
  }
  persistDeviceId();
  buildTopics();
  Serial.printf("Paired device_id=%s mqtt_host=%s\n",
                deviceId.c_str(),
                doc["mqtt"]["host"] | MQTT_HOST);
  return true;
}

bool connectMqtt() {
  if (MQTT_INSECURE_SKIP_CERT_VERIFY) {
    wifiSecure.setInsecure();
    Serial.println("WARNING: MQTT TLS certificate verify disabled (lab only)");
  } else {
    wifiSecure.setCACert(MQTT_CA_CERT);
  }
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(2048);

  String clientId = "esp32-" + deviceId.substring(0, 8);
  Serial.printf("MQTT connect %s:%d as %s\n", MQTT_HOST, MQTT_PORT, deviceId.c_str());
  if (!mqtt.connect(clientId.c_str(), deviceId.c_str(), MQTT_PASSWORD)) {
    Serial.printf("MQTT failed state=%d\n", mqtt.state());
    return false;
  }
  if (!mqtt.subscribe(topicCommands.c_str(), 1)) {
    Serial.println("Command subscribe failed");
    return false;
  }
  Serial.println("MQTT connected and subscribed to commands");
  publishStatus();
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  bootMs = millis();
  pinMode(PIN_MOTOR_RELAY, OUTPUT);
  applyMotorOutput(false);
  loadPersistedState();
  if (deviceId.length() > 0) {
    buildTopics();
  }

  connectWifi();
  if (!pairWithBackend()) {
    Serial.println("Pairing failed. Check serial, pairing code expiry, and API_BASE_URL.");
    return;
  }
  while (!connectMqtt()) {
    delay(3000);
  }
  lastStatusMs = millis();
  lastTelemetryMs = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (deviceId.length() == 0) {
    delay(2000);
    pairWithBackend();
    return;
  }
  if (!mqtt.connected()) {
    connectMqtt();
    delay(1000);
    return;
  }
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    publishStatus();
  }
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    publishTelemetry();
  }
}
