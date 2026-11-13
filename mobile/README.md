# Smart Pump Control mobile app

The Android-first Expo app talks to the Django REST API. Production builds
require HTTPS; local device testing may use HTTP over a trusted Wi-Fi network.
The app never connects to MQTT. Pump state is shown as **UNKNOWN** unless the
backend reports an online device with valid, recent physical feedback from an approved source.
A command receipt or acknowledgement is never presented as proof that a motor
started or stopped.

## Requirements

- Node.js 20 or newer and npm
- Android Studio / Android emulator for local Android builds, or an Expo account
  for EAS cloud builds
- The backend configured as described in
  [backend/README.md](../backend/README.md)

## Install and configure

From the repository root:

```powershell
Set-Location mobile
npm ci
Copy-Item .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `.env`:

- Web in a local browser: `http://127.0.0.1:8000/api/v1`
- Android emulator: `http://10.0.2.2:8000/api/v1`
- Physical phone: `http://<development-computer-LAN-IP>:8000/api/v1`; bind the
  backend to a reachable interface and allow the port through the local
  firewall.
- Production: the backend's public `https://.../api/v1` URL.

These are public app configuration values, not secrets. Never put passwords,
JWT signing keys, FCM service-account files, or MQTT credentials in this app or
an `EXPO_PUBLIC_*` variable.

Start the backend using the testing setup in [backend/README.md](../backend/README.md).
For Android emulator development:

```powershell
npm run start
```

Press `a` to open an installed Android emulator. A physical phone must be able
to reach the development computer's LAN address. Remote push notifications
require an installed development build and configured FCM/APNs credentials;
they are not fully available in Expo Go on Android.

For web development, run `npm run web -- --port 8083`. The local backend allows
loopback web origins in debug mode and uses SQLite for testing. Web sessions and
command idempotency keys use browser `sessionStorage` and are cleared when the
tab session ends; native apps continue to use secure device storage. Push
notifications are available only in the Android and iOS apps.

## Test and quality checks

```powershell
npm test
npm run typecheck
npm run lint
```

The tests cover secure-session refresh and expiry, backend/network errors,
confirmed versus unknown dashboard motor state, and command acknowledgement,
timeout, and success presentation.

## Android builds

For local native development, with Android Studio and an emulator/device
configured:

```powershell
npx expo run:android
npx expo start
```

The EAS development profile includes `expo-dev-client` and is used when testing
native push notifications. Configure the Expo project and its environment
variables once:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Set `EXPO_PUBLIC_API_URL` in the EAS `development`, `preview`, and `production`
environments. The production URL must use HTTPS. Configure Android FCM
credentials in EAS for push notifications;
do not commit service-account credentials.

The development and preview profiles produce APKs for testing. A
production-connected APK/AAB requires a deployed HTTPS backend URL configured
in the production EAS environment; the repository does not contain a deployed
backend URL. The production profile is configured to create a Play Store App
Bundle rather than an installable APK.

Build an internal Android development APK:

```powershell
npx eas-cli@latest build --platform android --profile development
```

The development APK includes a development client and expects Metro to be
running. Start Metro with the local backend running:

```powershell
npm run start
```

Install the EAS build on an Android emulator or device, then open the app and
connect it to the development server. On an Android emulator the app's local
API fallback is `http://10.0.2.2:8000/api/v1`. A physical phone needs
`EXPO_PUBLIC_API_URL` set to a reachable development-computer LAN address for
the development build. Do not use the development endpoint for a release.

Build an internal preview APK:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Build the Android App Bundle for Google Play:

```powershell
npx eas-cli@latest build --platform android --profile production
```

The preview profile is configured for the local API at
`http://10.84.133.144:8000/api/v1` and is for testing while the phone and
development computer share a Wi-Fi network. Change that address in `.env` and
`eas.json` when the computer's LAN address changes. The backend must be running
and reachable on port 8000. This HTTP APK is not suitable for production.

The production build uses EAS-managed Android signing unless the EAS project is
configured otherwise. Confirm the application ID (`com.smartpump.control`) and
Play Console ownership before the first release; Android package IDs cannot be
changed after publishing.

## Backend-supported behavior and limitations

- Registration, email verification, login, refresh/logout, password reset,
  profile, organization/pump/device reads and writes, command creation/history,
  telemetry, alert acknowledgment, and notification-token registration use the
  backend's `/api/v1/` endpoints. Alert acknowledgment is audited and does not
  resolve the underlying fault.
- Device onboarding creates a backend device record and displays its
  time-limited pairing code once. The embedded device, not the app, must
  complete device pairing. The manager should transfer the code only through
  the approved commissioning process.
- The backend currently has no account-deletion or password-change endpoint.
  The app clearly directs account-deletion requests to support and uses the
  existing password-reset flow; it does not simulate either operation.
- Timed-out or failed commands may have an uncertain physical outcome. Verify
  the panel and pump before retrying.
