from rest_framework.throttling import ScopedRateThrottle


class LoginThrottle(ScopedRateThrottle):
    scope = "login"


class RegistrationThrottle(ScopedRateThrottle):
    scope = "register"


class EmailAuthThrottle(ScopedRateThrottle):
    scope = "email_auth"


class PairingThrottle(ScopedRateThrottle):
    scope = "pairing"


class CommandThrottle(ScopedRateThrottle):
    scope = "commands"

