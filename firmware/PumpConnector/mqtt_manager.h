#ifndef MQTT_MANAGER_H
#define MQTT_MANAGER_H

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

#include "config.h"
#include "device_auth.h"
#include "motor_controller.h"
#include "telemetry.h"

class MQTTManager {
public:
    MQTTManager(DeviceAuth& auth, MotorController& motor, TelemetryManager& telemetry);
    void begin();
    void update();
    bool isConnected();
    void publishHeartbeat();

private:
    DeviceAuth& auth;
    MotorController& motor;
    TelemetryManager& telemetry;

    WiFiClientSecure wifiClient;
    PubSubClient mqttClient;

    unsigned long lastHeartbeatMs;
    char currentCommandId[64];

    void connectMQTT();
    void onMessageReceived(char* topic, byte* payload, unsigned int length);
    static void globalCallback(char* topic, byte* payload, unsigned int length);
};

#endif // MQTT_MANAGER_H
