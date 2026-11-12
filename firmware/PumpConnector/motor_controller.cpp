#include "motor_controller.h"
#include "config.h"

MotorController::MotorController() {
    actualState = MOTOR_STOPPED;
    currentFault = FAULT_NONE;
    lastStateChangeMs = 0;
}

void MotorController::begin() {
    pinMode(PIN_MOTOR_START_RELAY, OUTPUT);
    pinMode(PIN_MOTOR_STOP_RELAY, OUTPUT);

    // Always initialize outputs in SAFE DE-ENERGIZED state
    digitalWrite(PIN_MOTOR_START_RELAY, LOW);
    digitalWrite(PIN_MOTOR_STOP_RELAY, HIGH); // NC contact de-energized

    pinMode(PIN_AUX_CONTACT_FB, INPUT);
    pinMode(PIN_OVERLOAD_TRIP_FB, INPUT);
    pinMode(PIN_PHASE_MONITOR_FB, INPUT);

    Serial.print("[MOTOR] Motor Controller Initialized. Dry Run Mode: ");
    Serial.println(DRY_RUN_MODE ? "ENABLED (Physical Actuation Disabled)" : "DISABLED (LIVE ACTUATION)");
}

void MotorController::readPhysicalInputs() {
    // Read hardware input contacts
    bool auxContactClosed = (digitalRead(PIN_AUX_CONTACT_FB) == HIGH);
    bool overloadTripped = (digitalRead(PIN_OVERLOAD_TRIP_FB) == HIGH);
    bool phaseFailure = (digitalRead(PIN_PHASE_MONITOR_FB) == LOW);

    if (overloadTripped) {
        currentFault = FAULT_OVERLOAD_TRIP;
        actualState = MOTOR_FAULT;
        triggerSafeState();
        return;
    }

    if (phaseFailure) {
        currentFault = FAULT_PHASE_LOSS;
        actualState = MOTOR_FAULT;
        triggerSafeState();
        return;
    }

    if (actualState != MOTOR_FAULT) {
        if (auxContactClosed) {
            actualState = MOTOR_RUNNING;
        } else {
            actualState = MOTOR_STOPPED;
        }
    }
}

void MotorController::update() {
    readPhysicalInputs();
}

void MotorController::triggerSafeState() {
    // Instantly de-energize actuation outputs
    digitalWrite(PIN_MOTOR_START_RELAY, LOW);
    digitalWrite(PIN_MOTOR_STOP_RELAY, HIGH);
    Serial.println("[SAFETY] Emergency Safe State Engaged.");
}

bool MotorController::startMotor() {
    if (actualState == MOTOR_FAULT) {
        Serial.println("[MOTOR] Cannot start: Hardware fault active.");
        return false;
    }

    Serial.println("[MOTOR] Executing START Command Sequence...");

    if (!DRY_RUN_MODE) {
        digitalWrite(PIN_MOTOR_START_RELAY, HIGH);
        delay(500); // 500ms pulse for starter contactor coil
        digitalWrite(PIN_MOTOR_START_RELAY, LOW);
    } else {
        Serial.println("[DRY_RUN] Start relay pulse simulated.");
    }

    delay(MOTOR_ACTUATION_DELAY_MS);
    return verifyPhysicalFeedback();
}

bool MotorController::stopMotor() {
    Serial.println("[MOTOR] Executing STOP Command Sequence...");

    if (!DRY_RUN_MODE) {
        digitalWrite(PIN_MOTOR_STOP_RELAY, LOW); // Cut hold-in coil supply
        delay(1000);
        digitalWrite(PIN_MOTOR_STOP_RELAY, HIGH);
    } else {
        Serial.println("[DRY_RUN] Stop relay actuation simulated.");
    }

    delay(MOTOR_ACTUATION_DELAY_MS);
    readPhysicalInputs();
    return (actualState == MOTOR_STOPPED);
}

MotorState MotorController::getActualState() {
    return actualState;
}

FaultCode MotorController::getLatestFault() {
    return currentFault;
}

bool MotorController::isDryRunMode() {
    return DRY_RUN_MODE;
}

bool MotorController::verifyPhysicalFeedback() {
    readPhysicalInputs();
    return (actualState == MOTOR_RUNNING);
}
