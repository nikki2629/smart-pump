import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if env_bool("DJANGO_DEBUG", True):
        SECRET_KEY = "insecure-dev-key-change-in-production-9xwst#p4^eys5cw"
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be configured in environment variables for production.")

DEBUG = env_bool("DJANGO_DEBUG", False)
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^https?://localhost(?::\d+)?$",
        r"^https?://127\.0\.0\.1(?::\d+)?$",
    ]
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "accounts.apps.AccountsConfig",
    "organizations.apps.OrganizationsConfig",
    "devices.apps.DevicesConfig",
    "pumps.apps.PumpsConfig",
    "commands.apps.CommandsConfig",
    "telemetry.apps.TelemetryConfig",
    "alerts.apps.AlertsConfig",
    "notifications.apps.NotificationsConfig",
    "audit.apps.AuditConfig",
    "mqtt_integration.apps.MqttIntegrationConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.config(default=DATABASE_URL, conn_max_age=60)
    }
else:
    DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()
    if DB_ENGINE == "sqlite":
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": os.getenv("DB_NAME", str(BASE_DIR / "db.sqlite3")),
            }
        }
    elif DB_ENGINE == "postgresql":
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": os.getenv("DB_NAME", "smart_pump"),
                "USER": os.getenv("DB_USER", "smart_pump_app"),
                "PASSWORD": os.getenv("DB_PASSWORD", ""),
                "HOST": os.getenv("DB_HOST", "127.0.0.1"),
                "PORT": os.getenv("DB_PORT", "5432"),
                "CONN_MAX_AGE": 60,
                "OPTIONS": {"connect_timeout": 5},
            }
        }
    else:
        raise ImproperlyConfigured("DB_ENGINE must be 'postgresql' or 'sqlite'.")

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 6},
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@smartpump.local")
EMAIL_VERIFICATION_TIMEOUT_SECONDS = 60 * 60 * 24
PASSWORD_RESET_TIMEOUT = 60 * 60
DEVICE_PAIRING_TIMEOUT_SECONDS = 60 * 15
DEVICE_ONLINE_TIMEOUT_SECONDS = 90
MQTT_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_TLS_CA_CERT = os.getenv("MQTT_TLS_CA_CERT", "")
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "smart-pump-backend")
MQTT_COMMAND_POLL_SECONDS = 1
MQTT_COMMAND_FEEDBACK_TIMEOUT_SECONDS = 30
MQTT_MAX_MESSAGE_BYTES = 65536
MQTT_SCHEMA_DIR = BASE_DIR.parent / "firmware-contract" / "schemas" / "v1"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        "login": "5/minute",
        "register": "5/hour",
        "email_auth": "10/hour",
        "pairing": "10/minute",
        "commands": "100/minute",
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Smart Pump Control API",
    "DESCRIPTION": (
        "Authenticated API for pump, device, command, telemetry, alert, "
        "notification, and audit records."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", True)
    X_FRAME_OPTIONS = "DENY"
