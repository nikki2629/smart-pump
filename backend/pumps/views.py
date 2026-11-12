from django.db import transaction
from rest_framework import permissions, viewsets
from rest_framework.exceptions import APIException

from audit.services import record_event
from organizations.permissions import (
    MANAGER_ROLES,
    accessible_organizations,
    require_verified_user,
    require_role,
)
from pumps.models import Pump
from pumps.serializers import PumpSerializer


from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status

from commands.models import Command
from commands.serializers import CommandSerializer, CommandCreateSerializer
from commands.services import create_authorized_command, expire_pending_commands


class PumpHasHistory(APIException):
    status_code = 409
    default_detail = "A pump with command history cannot be deleted; deactivate it instead."
    default_code = "pump_has_history"


class PumpViewSet(viewsets.ModelViewSet):
    serializer_class = PumpSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Pump.objects.none()
        require_verified_user(self.request.user)
        return Pump.objects.filter(
            organization__in=accessible_organizations(self.request.user)
        ).select_related("organization", "created_by")

    def perform_create(self, serializer):
        require_verified_user(self.request.user)
        with transaction.atomic():
            pump = serializer.save(created_by=self.request.user)
            record_event(
                actor=self.request.user,
                organization=pump.organization,
                action="pump.created",
                object_type="pump",
                object_id=pump.pk,
            )

    def perform_update(self, serializer):
        pump = self.get_object()
        require_role(self.request.user, pump.organization, MANAGER_ROLES)
        with transaction.atomic():
            pump = serializer.save()
            record_event(
                actor=self.request.user,
                organization=pump.organization,
                action="pump.updated",
                object_type="pump",
                object_id=pump.pk,
            )

    def perform_destroy(self, instance):
        require_role(self.request.user, instance.organization, MANAGER_ROLES)
        if instance.commands.exists():
            raise PumpHasHistory()
        with transaction.atomic():
            record_event(
                actor=self.request.user,
                organization=instance.organization,
                action="pump.deleted",
                object_type="pump",
                object_id=instance.pk,
            )
            instance.delete()


class PumpCommandsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CommandSerializer

    def get(self, request, id):
        require_verified_user(request.user)
        pump = get_object_or_404(
            Pump.objects.filter(organization__in=accessible_organizations(request.user)),
            pk=id,
        )
        queryset = Command.objects.filter(pump=pump).select_related("requested_by")
        expire_pending_commands(queryset)
        return Response(CommandSerializer(queryset, many=True).data)

    def post(self, request, id):
        require_verified_user(request.user)
        action_val = request.data.get("action")
        idempotency_key = request.headers.get("Idempotency-Key", request.data.get("idempotency_key", ""))
        if not idempotency_key:
            import uuid
            idempotency_key = f"cmd-{uuid.uuid4().hex}"
        command, created = create_authorized_command(
            user=request.user,
            pump_id=id,
            action=action_val,
            idempotency_key=idempotency_key,
        )
        return Response(
            CommandSerializer(command).data,
            status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK,
        )


class PumpStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PumpSerializer

    def get(self, request, id):
        require_verified_user(request.user)
        pump = get_object_or_404(
            Pump.objects.filter(organization__in=accessible_organizations(request.user)),
            pk=id,
        )
        return Response(PumpSerializer(pump, context={"request": request}).data)


class PumpEsp32ConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, id):
        require_verified_user(request.user)
        pump = get_object_or_404(
            Pump.objects.filter(organization__in=accessible_organizations(request.user)),
            pk=id,
        )
        from devices.models import Device
        from django.conf import settings
        import secrets
        import uuid

        device = Device.objects.filter(pump=pump).first()
        if not device:
            base_sn = pump.controller_id or f"ESP32-PUMP-{str(pump.pk)[:8].upper()}"
            serial_sn = base_sn
            if Device.objects.filter(serial_number=serial_sn).exists():
                serial_sn = f"ESP32-PUMP-{str(uuid.uuid4())[:8].upper()}"

            device = Device.objects.create(
                pump=pump,
                organization=pump.organization,
                serial_number=serial_sn,
                name=f"Controller for {pump.name}",
                provisioning_status=Device.ProvisioningStatus.PAIRED,
            )
        elif device.provisioning_status != Device.ProvisioningStatus.PAIRED:
            device.provisioning_status = Device.ProvisioningStatus.PAIRED
            device.save(update_fields=("provisioning_status",))

        device_id = str(device.pk)
        device_secret = secrets.token_hex(16)
        mqtt_host = getattr(settings, "MQTT_HOST", "127.0.0.1")
        mqtt_port = getattr(settings, "MQTT_PORT", 8883)

        config_h_code = f"""#ifndef PUMP_CONNECTOR_CONFIG_H
#define PUMP_CONNECTOR_CONFIG_H

#include <Arduino.h>

// 1. Wi-Fi Credentials
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// 2. MQTT Broker Credentials
#define MQTT_BROKER "{mqtt_host}"
#define MQTT_PORT {mqtt_port}

// 3. Unique Pump Controller Credentials
#define DEVICE_ID "{device_id}"
#define DEVICE_USERNAME "{device_id}"
#define DEVICE_PASSWORD "{device_secret}"

// 4. Topics
#define COMMAND_TOPIC "fieldlink/devices/{device_id}/command"
#define ACK_TOPIC "fieldlink/devices/{device_id}/ack"
#define STATUS_TOPIC "fieldlink/devices/{device_id}/status"
#define TELEMETRY_TOPIC "fieldlink/devices/{device_id}/telemetry"

// 5. Hardware Safety Mode
#define DRY_RUN_MODE false

#define PIN_MOTOR_START_RELAY 22
#define PIN_MOTOR_STOP_RELAY  23
#define PIN_AUX_CONTACT_FB   34
#define PIN_OVERLOAD_TRIP_FB 35
#define PIN_PHASE_MONITOR_FB 32

#endif
"""

        return Response(
            {
                "pump_id": str(pump.pk),
                "pump_name": pump.name,
                "device_id": device_id,
                "serial_number": device.serial_number,
                "device_secret": device_secret,
                "mqtt_host": mqtt_host,
                "mqtt_port": mqtt_port,
                "config_h_code": config_h_code,
                "instructions": (
                    "Copy config_h_code into config.h in firmware/PumpConnector directory, "
                    "flash to your ESP32, and power on. The ESP32 will connect to this pump, "
                    "start/stop on command, and report fault status if an error occurs!"
                ),
            }
        )
