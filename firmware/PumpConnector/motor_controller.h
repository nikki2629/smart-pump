#ifndef MOTOR_CONTROLLER_H
#define MOTOR_CONTROLLER_H

#include <Arduino.h>

enum MotorState {
    MOTOR_STOPPED,
    MOTOR_RUNNING,
    MOTOR_FAULT,
    MOTOR_UNKNOWN
};

enum FaultCode {
    FAULT_NONE = 0,
    FAULT_OVERLOAD_TRIP = 1,
    FAULT_PHASE_LOSS = 2,
    FAULT_CONTACTOR_MISMATCH = 3,
    FAULT_SAFETY_INTERLOCK = 4
};

class MotorController {
public:
    MotorController();
    void begin();
    void update();

    bool startMotor();
    bool stopMotor();

    MotorState getActualState();
    FaultCode getLatestFault();
    bool isDryRunMode();
    bool verifyPhysicalFeedback();

private:
    MotorState actualState;
    FaultCode currentFault;
    unsigned long lastStateChangeMs;

    void readPhysicalInputs();
    void triggerSafeState();
};

#endif // MOTOR_CONTROLLER_H
