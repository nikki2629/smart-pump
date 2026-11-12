from django.urls import path, include
from rest_framework.routers import SimpleRouter

from pumps.views import PumpViewSet, PumpCommandsView, PumpStatusView, PumpEsp32ConfigView

router = SimpleRouter()
router.register("pumps", PumpViewSet, basename="pump")

urlpatterns = [
    path("pumps/<uuid:id>/commands/", PumpCommandsView.as_view(), name="pump-commands"),
    path("pumps/<uuid:id>/status/", PumpStatusView.as_view(), name="pump-status"),
    path("pumps/<uuid:id>/esp32-config/", PumpEsp32ConfigView.as_view(), name="pump-esp32-config"),
    path("", include(router.urls)),
]
