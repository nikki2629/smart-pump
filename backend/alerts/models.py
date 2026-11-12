import uuid

from django.conf import settings
from django.db import models


class Alert(models.Model):
    class Severity(models.TextChoices):
        INFO = "info", "Information"
        WARNING = "warning", "Warning"
        CRITICAL = "critical", "Critical"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(
        "devices.Device", on_delete=models.CASCADE, related_name="alerts"
    )
    severity = models.CharField(max_length=16, choices=Severity.choices)
    code = models.CharField(max_length=64)
    message = models.CharField(max_length=500)
    occurred_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="acknowledged_alerts",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-occurred_at", "-id")
