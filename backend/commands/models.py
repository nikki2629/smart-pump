import uuid

from django.conf import settings
from django.db import models


class Command(models.Model):
    class Action(models.TextChoices):
        START = "start", "Start"
        STOP = "stop", "Stop"

    class Status(models.TextChoices):
        AUTHORIZED = "authorized", "Authorized"
        PUBLISHED = "published", "Published"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESULT_RECEIVED = "result_received", "Execution result received"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"
        TIMED_OUT = "timed_out", "Timed out"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pump = models.ForeignKey(
        "pumps.Pump", on_delete=models.PROTECT, related_name="commands"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pump_commands",
    )
    action = models.CharField(max_length=8, choices=Action.choices)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.AUTHORIZED
    )
    idempotency_key = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    published_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    result_received_at = models.DateTimeField(null=True, blank=True)
    result_outcome = models.CharField(max_length=16, blank=True)
    result_code = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("requested_by", "idempotency_key"),
                name="commands_user_idempotency_unique",
            )
        ]
