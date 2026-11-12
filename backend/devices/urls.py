from django.urls import include, path
from rest_framework.routers import SimpleRouter

from devices.views import DevicePairingView, DeviceStatusView, DeviceViewSet

router = SimpleRouter()
router.register("devices", DeviceViewSet, basename="device")

urlpatterns = [
    path("devices/pair/", DevicePairingView.as_view(), name="device-pair"),
    path(
        "devices/<uuid:device_id>/status/",
        DeviceStatusView.as_view(),
        name="device-status",
    ),
    path("", include(router.urls)),
]
