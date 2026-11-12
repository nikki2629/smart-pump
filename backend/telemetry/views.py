from rest_framework import mixins, permissions, viewsets
from rest_framework import serializers

from devices.models import Device
from organizations.permissions import accessible_organizations, require_verified_user
from telemetry.models import TelemetryRecord
from telemetry.serializers import TelemetryRecordSerializer


from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response

from pumps.models import Pump
from commands.models import Command
from commands.serializers import CommandSerializer


class TelemetryViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = TelemetryRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TelemetryRecord.objects.none()
        require_verified_user(self.request.user)
        queryset = TelemetryRecord.objects.filter(
            device__organization__in=accessible_organizations(self.request.user)
        ).select_related("device")
        device_id = self.request.query_params.get("device")
        if device_id:
            device_uuid = serializers.UUIDField().run_validation(device_id)
            queryset = queryset.filter(device_id=device_uuid)
        return queryset


class PumpHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CommandSerializer

    def get(self, request, pump_id):
        require_verified_user(request.user)
        pump = get_object_or_404(
            Pump.objects.filter(organization__in=accessible_organizations(request.user)),
            pk=pump_id,
        )
        commands = Command.objects.filter(pump=pump).order_by("-created_at")[:50]
        return Response(
            {
                "pump_id": str(pump.pk),
                "history": CommandSerializer(commands, many=True).data,
            }
        )


class PumpTelemetryView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TelemetryRecordSerializer

    def get(self, request, pump_id):
        require_verified_user(request.user)
        pump = get_object_or_404(
            Pump.objects.filter(organization__in=accessible_organizations(request.user)),
            pk=pump_id,
        )
        records = []
        if hasattr(pump, "device") and pump.device:
            records = TelemetryRecord.objects.filter(device=pump.device).order_by("-reported_at")[:100]
        return Response(TelemetryRecordSerializer(records, many=True).data)
