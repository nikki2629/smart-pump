#include "telemetry.h"
#include "config.h"

TelemetryManager::TelemetryManager() {
    sequenceNumber = 1;
}

void TelemetryManager::begin() {
    Serial.println("[TELEMETRY] Telemetry Service Ready.");
}

String TelemetryManager::buildTelemetryPayload(MotorController& controller) {
    StaticJsonDocument<512> doc;
    doc["protocol_version"] = 1;
    doc["message_id"] = String(ESP.getEfuseMac(), HEX) + "-" + String(millis());
    doc["sequence"] = sequenceNumber++;
    doc["device_id"] = DEVICE_ID;
    doc["occurred_at"] = "2026-11-01T12:00:00Z";

    JsonObject metrics = doc.createNestedObject("metrics");
    metrics["motor_state"] = (controller.getActualState() == MOTOR_RUNNING) ? "running" : "stopped";
    metrics["current_r"] = (controller.getActualState() == MOTOR_RUNNING) ? 14.5 : 0.0;
    metrics["current_y"] = (controller.getActualState() == MOTOR_RUNNING) ? 14.2 : 0.0;
    metrics["current_b"] = (controller.getActualState() == MOTOR_RUNNING) ? 14.4 : 0.0;
    metrics["voltage_ry"] = 415.0;
    metrics["voltage_yb"] = 412.0;
    metrics["voltage_br"] = 416.0;
    metrics["dry_run_mode"] = controller.isDryRunMode();

    String output;
    serializeJson(doc, output);
    return output;
}

String TelemetryManager::buildStatusPayload(MotorController& controller, const char* lastCommandId) {
    StaticJsonDocument<512> doc;
    doc["protocol_version"] = 1;
    doc["message_id"] = String(ESP.getEfuseMac(), HEX) + "-st-" + String(millis());
    doc["sequence"] = sequenceNumber++;
    doc["device_id"] = DEVICE_ID;
    doc["occurred_at"] = "2026-11-01T12:00:00Z";

    MotorState state = controller.getActualState();
    doc["motor_feedback"] = (state == MOTOR_RUNNING) ? "running" : (state == MOTOR_FAULT) ? "fault" : "stopped";
    doc["motor_feedback_source"] = "auxiliary_contact";
    doc["motor_feedback_valid"] = true;
    doc["last_command_id"] = (lastCommandId != NULL) ? lastCommandId : "";

    String output;
    serializeJson(doc, output);
    return output;
}

String TelemetryManager::buildAckPayload(const char* commandId, const char* outcome, const char* reasonCode) {
    StaticJsonDocument<384> doc;
    doc["protocol_version"] = 1;
    doc["message_id"] = String(ESP.getEfuseMac(), HEX) + "-ack-" + String(millis());
    doc["sequence"] = sequenceNumber++;
    doc["device_id"] = DEVICE_ID;
    doc["command_id"] = commandId;
    doc["outcome"] = outcome;
    doc["reason_code"] = (reasonCode != NULL) ? reasonCode : "none";
    doc["occurred_at"] = "2026-11-01T12:00:00Z";

    String output;
    serializeJson(doc, output);
    return output;
}
