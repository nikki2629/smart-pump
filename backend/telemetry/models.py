import uuid

from django.db import models


class TelemetryRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(
        "devices.Device", on_delete=models.CASCADE, related_name="telemetry"
    )
    reported_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)
    values = models.JSONField(default=dict)

    class Meta:
        ordering = ("-reported_at", "-id")
        indexes = [
            models.Index(fields=("device", "-reported_at"), name="telemetry_device_time_idx")
        ]
