#ifndef TELEMETRY_H
#define TELEMETRY_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "motor_controller.h"

class TelemetryManager {
public:
    TelemetryManager();
    void begin();
    String buildTelemetryPayload(MotorController& controller);
    String buildStatusPayload(MotorController& controller, const char* lastCommandId);
    String buildAckPayload(const char* commandId, const char* outcome, const char* reasonCode);

private:
    unsigned long sequenceNumber;
};

#endif // TELEMETRY_H
