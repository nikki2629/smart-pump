from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("organizations.urls")),
    path("api/v1/", include("devices.urls")),
    path("api/v1/", include("pumps.urls")),
    path("api/v1/", include("commands.urls")),
    path("api/v1/", include("telemetry.urls")),
    path("api/v1/", include("alerts.urls")),
    path("api/v1/", include("notifications.urls")),
    path("api/v1/", include("audit.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
]
