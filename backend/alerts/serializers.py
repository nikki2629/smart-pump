from rest_framework import serializers

from alerts.models import Alert


class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alert
        fields = (
            "id",
            "device",
            "severity",
            "code",
            "message",
            "occurred_at",
            "resolved_at",
            "acknowledged_at",
            "acknowledged_by",
            "created_at",
        )
        read_only_fields = fields
