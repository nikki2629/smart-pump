#include "device_auth.h"
#include "config.h"

DeviceAuth::DeviceAuth() {
    memset(lastProcessedCommandId, 0, sizeof(lastProcessedCommandId));
}

void DeviceAuth::begin() {
    Serial.println("[AUTH] Device Security Credentials Initialized.");
    Serial.print("[AUTH] Serial UUID: ");
    Serial.println(DEVICE_ID);
}

const char* DeviceAuth::getDeviceId() {
    return DEVICE_ID;
}

const char* DeviceAuth::getUsername() {
    return DEVICE_USERNAME;
}

const char* DeviceAuth::getPassword() {
    return DEVICE_PASSWORD;
}

bool DeviceAuth::isDuplicateCommand(const char* commandId) {
    if (commandId == NULL || strlen(commandId) == 0) return true;
    if (strcmp(lastProcessedCommandId, commandId) == 0) {
        return true;
    }
    return false;
}

bool DeviceAuth::validateCommand(const char* targetDeviceId, const char* commandId, unsigned long expiresAtTimestamp) {
    if (targetDeviceId == NULL || strcmp(targetDeviceId, DEVICE_ID) != 0) {
        Serial.println("[AUTH] Rejection: Command targeted to different device ID.");
        return false;
    }
    if (isDuplicateCommand(commandId)) {
        Serial.println("[AUTH] Rejection: Duplicate command ID detected.");
        return false;
    }
    strncpy(lastProcessedCommandId, commandId, sizeof(lastProcessedCommandId) - 1);
    return true;
}
