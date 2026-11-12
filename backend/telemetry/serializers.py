from rest_framework import serializers

from telemetry.models import TelemetryRecord


class TelemetryRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelemetryRecord
        fields = ("id", "device", "reported_at", "received_at", "values")
        read_only_fields = fields
