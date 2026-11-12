#include "mqtt_manager.h"

static MQTTManager* instance = NULL;

MQTTManager::MQTTManager(DeviceAuth& a, MotorController& m, TelemetryManager& t)
    : auth(a), motor(m), telemetry(t), mqttClient(wifiClient) {
    instance = this;
    lastHeartbeatMs = 0;
    memset(currentCommandId, 0, sizeof(currentCommandId));
}

void MQTTManager::globalCallback(char* topic, byte* payload, unsigned int length) {
    if (instance != NULL) {
        instance->onMessageReceived(topic, payload, length);
    }
}

void MQTTManager::begin() {
    wifiClient.setCACert(CA_CERTIFICATE);
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(MQTTManager::globalCallback);

    Serial.println("[MQTT] TLS MQTT Service Initialized.");
}

void MQTTManager::connectMQTT() {
    while (!mqttClient.connected()) {
        Serial.print("[MQTT] Connecting to TLS Broker: ");
        Serial.println(MQTT_BROKER);

        String clientId = "ESP32-PumpConn-";
        clientId += String(random(0xffff), HEX);

        if (mqttClient.connect(clientId.c_str(), auth.getUsername(), auth.getPassword())) {
            Serial.println("[MQTT] Connected & Authenticated Successfully!");

            // Subscribe to device command topic
            mqttClient.subscribe(COMMAND_TOPIC, 1);
            Serial.print("[MQTT] Subscribed to topic: ");
            Serial.println(COMMAND_TOPIC);

            publishHeartbeat();
        } else {
            Serial.print("[MQTT] Connection Failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(". Retrying in 5 seconds...");
            delay(5000);
        }
    }
}

void MQTTManager::update() {
    if (!mqttClient.connected()) {
        connectMQTT();
    }
    mqttClient.loop();

    if (millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatMs = millis();
        publishHeartbeat();
    }
}

void MQTTManager::publishHeartbeat() {
    if (!mqttClient.connected()) return;

    String statusJson = telemetry.buildStatusPayload(motor, currentCommandId);
    mqttClient.publish(STATUS_TOPIC, statusJson.c_str(), false);

    String telemetryJson = telemetry.buildTelemetryPayload(motor);
    mqttClient.publish(TELEMETRY_TOPIC, telemetryJson.c_str(), false);

    Serial.println("[MQTT] Published Periodic Status & Telemetry Heartbeat.");
}

void MQTTManager::onMessageReceived(char* topic, byte* payload, unsigned int length) {
    char jsonBuf[512];
    if (length >= sizeof(jsonBuf)) return;
    memcpy(jsonBuf, payload, length);
    jsonBuf[length] = '\0';

    Serial.print("[MQTT] Incoming Message on [");
    Serial.print(topic);
    Serial.println("]:");
    Serial.println(jsonBuf);

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, jsonBuf);
    if (err) {
        Serial.println("[MQTT] Error: Invalid JSON Payload.");
        return;
    }

    const char* targetDeviceId = doc["device_id"];
    const char* commandId = doc["command_id"];
    const char* action = doc["action"];

    if (!auth.validateCommand(targetDeviceId, commandId, 0)) {
        String ackErr = telemetry.buildAckPayload(commandId, "rejected", "invalid_command_or_duplicate");
        mqttClient.publish(ACK_TOPIC, ackErr.c_str(), false);
        return;
    }

    strncpy(currentCommandId, commandId, sizeof(currentCommandId) - 1);

    // Send ACK ACCEPTED immediately
    String ackOk = telemetry.buildAckPayload(commandId, "accepted", "none");
    mqttClient.publish(ACK_TOPIC, ackOk.c_str(), false);

    // Execute physical command
    bool success = false;
    if (strcmp(action, "start") == 0) {
        success = motor.startMotor();
    } else if (strcmp(action, "stop") == 0) {
        success = motor.stopMotor();
    }

    // Publish actual updated status after physical execution & contact feedback
    publishHeartbeat();
}

bool MQTTManager::isConnected() {
    return mqttClient.connected();
}
