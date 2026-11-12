# Smart Pump Control backend

Phase 2 provides Django REST APIs, PostgreSQL-backed records, account security,
organization roles, asset authorization, and history/status surfaces.
MQTT publishing/ingestion, FCM delivery, and the mobile application are later
phases; the authenticated MQTT bridge and local device simulator are in the
`firmware-contract/` directory. This backend does not claim that a motor is
operating based on a command.

## Requirements

- Python 3.12 or newer (the pinned Django 6.1 release supports Python 3.12-3.14)
- SQLite for local web testing; PostgreSQL 16 or newer for shared/production use

## Local setup (PowerShell)

From the repository root:

```powershell
Set-Location .\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

The example `.env` uses a local SQLite database, so PostgreSQL is not required
for web testing. Generate a development Django key with:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Paste that output into `DJANGO_SECRET_KEY` in `.env`. Keep `DJANGO_DEBUG=true`
for local testing. Do not commit `.env` or use this development key in
production.

### PostgreSQL database (optional)

Create a dedicated database role and database from `psql` as a PostgreSQL
administrator. Choose a local password interactively or through your local
secret manager; do not copy a production credential into this file or source
control.

```sql
CREATE ROLE smart_pump_app LOGIN PASSWORD '<choose-a-local-password>';
CREATE DATABASE smart_pump OWNER smart_pump_app;
```

Set `DB_ENGINE=postgresql` and `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`,
and `DB_PORT` in `.env` to match that local database. The example uses
`127.0.0.1:5432`. SQLite is intended for local testing only.

### Migrations and server

```powershell
python manage.py check
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The development email backend prints verification and password-reset tokens in
the server console. Registration does not return verification tokens in its
HTTP response. In production, configure a delivery backend and HTTPS callback
flow before enabling account registration.

### Connect a local app or phone for testing

The backend's debug-only CORS settings allow HTTP requests from `localhost` and
`127.0.0.1` on any port. Keep the web app's `EXPO_PUBLIC_API_URL` set to
`http://127.0.0.1:8000/api/v1`. From separate terminals, run the backend and
web app:

```powershell
Set-Location .\backend
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

For phone testing, add the development computer's LAN IP to
`DJANGO_ALLOWED_HOSTS` in `backend/.env`, allow inbound TCP port 8000 on the
private network in Windows Firewall, and set that same address in
`mobile/.env`. The development server and HTTP configuration are for a trusted
local network only; do not expose them to the internet.

```powershell
Set-Location .\mobile
npm run web -- --port 8083
```

Register from the web app. With the console email backend, copy the verification
token printed in the backend terminal, verify the address, then sign in. The
SQLite database is local test data; do not use this configuration for
production.

## Tests

For a quick, isolated test run that does not require a local PostgreSQL service:

```powershell
$env:DJANGO_SECRET_KEY = "test-only-not-for-production"
$env:DJANGO_DEBUG = "true"
$env:DB_ENGINE = "sqlite"
$env:DB_NAME = ":memory:"
python manage.py test
```

To run tests against PostgreSQL, first configure the `.env` values above and
leave `DB_ENGINE=postgresql`:

```powershell
python manage.py test
```

## API and security

- OpenAPI JSON: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`
- ReDoc: `GET /api/redoc/`
- Authentication uses short-lived JWT access tokens and rotating, blacklisted
  refresh tokens. Send access tokens as `Authorization: Bearer <token>`.
- Registration requires email verification before login. Password reset
  responses do not disclose whether an email address is registered.
- Login, registration, verification/reset, and device pairing endpoints have
  separate DRF rate limits.
- Organization membership roles are `owner`, `admin`, `operator`, and `viewer`.
  Pump/device management requires an owner or admin. Command authorization
  requires an owner, admin, or operator. Querysets are scoped to active
  organization membership; inaccessible IDs return 404.
- Device pairing codes are generated with a cryptographically secure random
  source, stored only as password hashes, expire after 15 minutes, and are
  returned only once to the registering organization manager. The pairing
  endpoint consumes the code once; provisioning MQTT/device credentials is
  intentionally deferred to Phase 3.
- Commands are created only through `create_authorized_command`, require an
  `Idempotency-Key`, expire after 30 seconds, and initially have the
  `authorized` status. An expired authorized command is marked `expired` when
  command history/status is read. Phase 2 does not publish to MQTT; this status
  is not a device acknowledgement or proof of motor operation.
- MQTT commands are published only by the standalone
  `python manage.py run_mqtt_worker` process. Configure its distinct service
  identity, TLS CA, broker, and device ACLs in `.env`; the worker rejects
  expired outbox entries before publishing and expires QoS messages. Device
  acknowledgements/results/status are validated against the versioned schemas
  under `firmware-contract/schemas/v1/`.
- The bridge waits for broker PUBACK using a short-lived, clean-session TLS
  publisher per command, so unacknowledged client-library QoS packets are not
  replayed after reconnect. A retried outbox command is rechecked against its
  database expiry before a fresh publish attempt. Firmware independently
  enforces the absolute expiry and command-ID deduplication.
- Generic pump updates reject motor-state fields. Motor feedback is read-only
  and starts as `unknown`; only a future trusted device-ingestion path may
  update it. Telemetry history is read-only. Verified organization members can
  acknowledge alerts; acknowledgment is audited and remains separate from
  fault resolution.
- Notification tokens are user-owned; FCM delivery is deferred to Phase 4.
  Audit history is append-only through the API and scoped to the user's
  organizations (plus their own organization-less events).

## Implemented API surfaces

| Area | Routes |
| --- | --- |
| Accounts | `POST /api/v1/accounts/register/`, `POST /api/v1/accounts/email/verify/`, `POST /api/v1/accounts/login/`, `POST /api/v1/accounts/token/refresh/`, `POST /api/v1/accounts/logout/`, `POST /api/v1/accounts/password/reset/`, `POST /api/v1/accounts/password/reset/confirm/`, `GET/PATCH /api/v1/accounts/me/` |
| Organizations | `GET/POST /api/v1/organizations/`, `GET/PATCH /api/v1/organizations/{id}/`, organization member list/add/update/remove routes |
| Pumps | `GET/POST /api/v1/pumps/`, `GET/PUT/PATCH/DELETE /api/v1/pumps/{id}/` |
| Devices | `GET/POST /api/v1/devices/`, `GET /api/v1/devices/{id}/`, `GET /api/v1/devices/{id}/status/`, `POST /api/v1/devices/pair/` |
| Commands | `GET/POST /api/v1/commands/`, `GET /api/v1/commands/{id}/` |
| History | `GET /api/v1/telemetry/`, alert list/detail routes, `POST /api/v1/alerts/{id}/acknowledge/` |
| Notifications | `GET/POST /api/v1/notifications/tokens/`, `DELETE /api/v1/notifications/tokens/{id}/` |
| Audit | Read-only `GET /api/v1/audit/events/` |

See [the MQTT firmware integration guide](../firmware-contract/integration-guide.md)
for local broker startup, protocol requirements, and hardware commissioning.

After configuring a broker and backend MQTT credentials, run the web API and
the MQTT worker in separate terminals:

```powershell
python manage.py runserver
python manage.py run_mqtt_worker
```
