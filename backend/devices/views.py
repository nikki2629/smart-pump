from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import record_event
from config.throttles import PairingThrottle
from drf_spectacular.utils import extend_schema
from devices.models import Device
from devices.serializers import (
    DeviceCreateSerializer,
    DeviceCreatedSerializer,
    DeviceReadSerializer,
    DeviceStatusSerializer,
    PairingResponseSerializer,
    PairingSerializer,
)
from organizations.permissions import (
    accessible_organizations,
    require_verified_user,
)


from rest_framework.decorators import action

class DeviceViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Device.objects.none()
        require_verified_user(self.request.user)
        return Device.objects.filter(
            organization__in=accessible_organizations(self.request.user)
        ).select_related("organization", "pump")

    def get_serializer_class(self):
        if self.action == "create":
            return DeviceCreateSerializer
        return DeviceReadSerializer

    def create(self, request, *args, **kwargs):
        require_verified_user(request.user)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            device = serializer.save()
            record_event(
                actor=request.user,
                organization=device.organization,
                action="device.registered",
                object_type="device",
                object_id=device.pk,
                metadata={"serial_number": device.serial_number},
            )
        return Response(
            DeviceCreatedSerializer(device).data,
            status=status.HTTP_201_CREATED,
        )

    def retrieve(self, request, *args, **kwargs):
        device = self.get_object()
        return Response(DeviceReadSerializer(device).data)

    @action(detail=True, methods=["post"], url_path="unpair")
    def unpair(self, request, pk=None):
        device = self.get_object()
        with transaction.atomic():
            device.provisioning_status = Device.ProvisioningStatus.REVOKED
            device.pump = None
            device.save(update_fields=("provisioning_status", "pump", "updated_at"))
            record_event(
                actor=request.user,
                organization=device.organization,
                action="device.unpaired",
                object_type="device",
                object_id=device.pk,
            )
        return Response({"detail": "Device unpaired successfully."})


class DevicePairingView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PairingThrottle]

    @extend_schema(
        request=PairingSerializer,
        responses=PairingResponseSerializer,
    )
    def post(self, request):
        serializer = PairingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            device = (
                Device.objects.select_for_update()
                .filter(serial_number=serializer.validated_data["serial_number"])
                .first()
            )
            pairing_code = serializer.validated_data["pairing_code"]
            if (
                device is None
                or device.provisioning_status != Device.ProvisioningStatus.PENDING_PAIRING
                or device.pairing_expires_at is None
                or device.pairing_expires_at <= timezone.now()
                or not check_password(pairing_code, device.pairing_code_hash)
            ):
                raise ValidationError(
                    {"detail": "The device pairing request is invalid or expired."}
                )
            device.provisioning_status = Device.ProvisioningStatus.PAIRED
            device.paired_at = timezone.now()
            device.pairing_code_hash = ""
            device.pairing_expires_at = None
            device.save(
                update_fields=(
                    "provisioning_status",
                    "paired_at",
                    "pairing_code_hash",
                    "pairing_expires_at",
                    "updated_at",
                )
            )
            record_event(
                actor=None,
                organization=device.organization,
                action="device.paired",
                object_type="device",
                object_id=device.pk,
                metadata={"serial_number": device.serial_number},
            )
        # MQTT password is never returned here. Provision a unique broker
        # password for this device UUID out-of-band (see firmware README).
        return Response(
            {
                "id": str(device.pk),
                "serial_number": device.serial_number,
                "provisioning_status": device.provisioning_status,
                "mqtt": {
                    "host": settings.MQTT_HOST,
                    "port": settings.MQTT_PORT,
                    "username": str(device.pk),
                    "topic_root": "smart-pump/v1/devices",
                    "protocol_version": 1,
                    "tls": True,
                },
            }
        )


class DeviceStatusView(APIView):
    @extend_schema(responses=DeviceStatusSerializer)
    def get(self, request, device_id):
        require_verified_user(request.user)
        device = Device.objects.filter(
            organization__in=accessible_organizations(request.user)
        ).select_related("organization").filter(pk=device_id).first()
        if device is None:
            raise NotFound()
        return Response(DeviceStatusSerializer(device).data)
