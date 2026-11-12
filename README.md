# PUMP CONNECTOR - REMOTE WATER PUMP AUTOMATION PLATFORM

**Pump Connector** is a production-grade, end-to-end IoT platform for remote water pump automation, real-time feedback monitoring, and hardware interlock control.

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

```
  ┌───────────────────────────┐
  │ Pump Connector Mobile App │ (React Native / Expo Android)
  └─────────────┬─────────────┘
                │ HTTPS REST API (JWT)
                ▼
  ┌───────────────────────────┐
  │       Django Backend      │ (Django REST Framework / PostgreSQL)
  └─────────────┬─────────────┘
                │ MQTT over TLS (Port 8883)
                ▼
  ┌───────────────────────────┐
  │     TLS MQTT Broker       │ (Mosquitto / EMQX)
  └─────────────┬─────────────┘
                │ MQTT over TLS
                ▼
  ┌───────────────────────────┐
  │   ESP32 Pump Controller   │ (Industrial Relay & Auxiliary Contact Interlocks)
  └───────────────────────────┘
```

---

## 2. REPOSITORY COMPONENTS

- **`mobile/`**: React Native Expo single-page mobile app for Android and web.
- **`backend/`**: Django REST Framework API with PostgreSQL storage, JWT authentication, and MQTT integration worker.
- **`firmware/PumpConnector/`**: ESP32 Arduino Core firmware with TLS MQTT, command idempotency, auxiliary contact feedback, and DRY_RUN safety interlocks.
- **`firmware-contract/`**: JSON Schema definitions for MQTT protocol contract v1.

---

## 3. QUICK START - DEVELOPMENT ENVIRONMENT

### Prerequisites
- Python 3.12+
- Node.js 20+ & npm
- Arduino IDE 2.x or PlatformIO
- PostgreSQL 16+ or local SQLite for development

### Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py test
python manage.py runserver
```

### Mobile App Setup
```powershell
cd mobile
npm ci
npx tsc --noEmit
npm test
npm run start
```

### ESP32 Firmware Setup
1. Open `firmware/PumpConnector/PumpConnector.ino` in Arduino IDE.
2. Update `config.h` with Wi-Fi SSID, Password, MQTT Broker TLS host, and paired Device ID.
3. Flash to ESP32 Dev Module at 115200 baud.

---

## 4. PRODUCTION DEPLOYMENT GUIDE

### A. Django Backend & Managed PostgreSQL (Render / Railway / AWS)
1. Deploy Django backend to Render or compatible PaaS hosting.
2. Provision a Managed PostgreSQL instance.
3. Configure environment variables in PaaS environment:
   ```env
   DJANGO_SECRET_KEY=production-crypto-key
   DJANGO_DEBUG=False
   DJANGO_ALLOWED_HOSTS=api.pumpconnector.com
   DB_ENGINE=postgresql
   DB_NAME=smart_pump
   DB_USER=smart_pump_app
   DB_PASSWORD=production_secure_db_password
   DB_HOST=pg.pumpconnector.com
   DB_PORT=5432
   MQTT_HOST=mqtt.pumpconnector.com
   MQTT_PORT=8883
   MQTT_USERNAME=backend_service_user
   MQTT_PASSWORD=backend_secure_mqtt_password
   MQTT_TLS_CA_CERT=/etc/ssl/certs/ca-certificates.crt
   ```
4. Run migrations: `python manage.py migrate`

### B. MQTT Broker over TLS (Mosquitto / EMQX)
1. Provision a Mosquitto or EMQX broker with TLS listener on port 8883.
2. Install Let's Encrypt or Custom CA TLS certificate.
3. Enable ACL authorization restricting device UUIDs to their own topic paths (`fieldlink/devices/{DEVICE_ID}/#`).

### C. Android APK & Production EAS Build
1. Update `EXPO_PUBLIC_API_URL=https://api.pumpconnector.com/api/v1` in `mobile/.env`.
2. Generate Android Development / Preview APK:
   ```powershell
   cd mobile
   npx eas-cli@latest build --platform android --profile preview
   ```
3. Generate Production Google Play Android App Bundle (AAB):
   ```powershell
   npx eas-cli@latest build --platform android --profile production
   ```

---

## 5. HARDWARE COMMISSIONING & ELECTRICAL SAFETY CHECKLIST

> [!IMPORTANT]
> **SAFETY FIRST**: Always test in `DRY_RUN_MODE = true` before connecting live motor contactors.

1. **Verify Isolation**: Ensure ESP32 GPIOs switch 24V DC / 230V AC starter contactors via optoisolated relay drivers.
2. **Verify Feedback Contacts**: Confirm that auxiliary contacts are wired to `PIN_AUX_CONTACT_FB` (GPIO 34).
3. **Verify Thermal Overload**: Connect thermal overload NC contacts to `PIN_OVERLOAD_TRIP_FB` (GPIO 35).
4. **Commissioning Test**: Send START command from Pump Connector mobile dashboard and observe physical feedback confirmation!
