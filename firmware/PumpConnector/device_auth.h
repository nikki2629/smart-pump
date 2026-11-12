#ifndef DEVICE_AUTH_H
#define DEVICE_AUTH_H

#include <Arduino.h>

class DeviceAuth {
public:
    DeviceAuth();
    void begin();
    const char* getDeviceId();
    const char* getUsername();
    const char* getPassword();
    bool validateCommand(const char* targetDeviceId, const char* commandId, unsigned long expiresAtTimestamp);
    bool isDuplicateCommand(const char* commandId);

private:
    char lastProcessedCommandId[64];
};

#endif // DEVICE_AUTH_H
