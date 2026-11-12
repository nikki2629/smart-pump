from django.urls import path, include
from rest_framework.routers import SimpleRouter

from telemetry.views import TelemetryViewSet, PumpHistoryView, PumpTelemetryView

router = SimpleRouter()
router.register("telemetry", TelemetryViewSet, basename="telemetry")

urlpatterns = [
    path("monitoring/<uuid:pump_id>/history/", PumpHistoryView.as_view(), name="monitoring-history"),
    path("monitoring/<uuid:pump_id>/telemetry/", PumpTelemetryView.as_view(), name="monitoring-telemetry"),
    path("", include(router.urls)),
]
