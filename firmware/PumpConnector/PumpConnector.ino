
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "config.h"

// MQTT TLS connection
WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);

unsigned long lastStatusTime = 0;

// Receive commands from App / Django
void mqttCallback(char* topic, byte* payload, unsigned int length) {

    String message = "";

    for (unsigned int i = 0; i < length; i++) {
        message += (char)payload[i];
    }

    Serial.println("\n-------------------------");
    Serial.print("Topic: ");
    Serial.println(topic);

    Serial.print("Received Command: ");
    Serial.println(message);
    Serial.println("-------------------------");

    // Communication test only.
    // No relay or motor will be operated.
    if (message.indexOf("START") >= 0 ||
        message.indexOf("start") >= 0) {
        Serial.println("START COMMAND RECEIVED");
    }

    if (message.indexOf("STOP") >= 0 ||
        message.indexOf("stop") >= 0) {
        Serial.println("STOP COMMAND RECEIVED");
    }
}

void connectWiFi() {

    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println("\nWIFI CONNECTED!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
}

void connectMQTT() {

    while (!mqtt.connected()) {

        Serial.println("Connecting to MQTT...");

        String clientId = "PumpController-";
        clientId += DEVICE_ID;

        if (mqtt.connect(
                clientId.c_str(),
                DEVICE_USERNAME,
                DEVICE_PASSWORD,
                STATUS_TOPIC,
                1,
                true,
                "offline"
        )) {

            Serial.println("MQTT CONNECTED!");

            mqtt.publish(STATUS_TOPIC, "online", true);

            if (mqtt.subscribe(COMMAND_TOPIC, 1)) {
                Serial.println("Subscribed to command topic!");
                Serial.println(COMMAND_TOPIC);
            } else {
                Serial.println("Subscription Failed!");
            }

        } else {

            Serial.print("MQTT FAILED, state: ");
            Serial.println(mqtt.state());

            delay(3000);
        }
    }
}

void setup() {

    Serial.begin(115200);
    delay(1000);

    Serial.println("\n============================");
    Serial.println("FIELDLINK PUMP CONNECTOR");
    Serial.println("============================");

    // Temporary TLS certificate verification bypass.
    // For testing only. Replace with the real CA certificate
    // before production deployment.
    secureClient.setInsecure();

    connectWiFi();

    mqtt.setServer(MQTT_BROKER, MQTT_PORT);
    mqtt.setCallback(mqttCallback);
    mqtt.setBufferSize(512);
    mqtt.setKeepAlive(30);

    connectMQTT();
}

void loop() {

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected!");
        connectWiFi();
    }

    if (!mqtt.connected()) {
        connectMQTT();
    }

    mqtt.loop();

    // Publish connection status periodically
    if (millis() - lastStatusTime >= 10000) {
        lastStatusTime = millis();

        if (mqtt.connected()) {
            mqtt.publish(STATUS_TOPIC, "online", true);
            Serial.println("MQTT connection alive");
        }
    }
}
