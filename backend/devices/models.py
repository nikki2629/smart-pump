import uuid

from django.db import models
from django.utils import timezone


class Device(models.Model):
    class ProvisioningStatus(models.TextChoices):
        PENDING_PAIRING = "pending_pairing", "Pending pairing"
        PAIRED = "paired", "Paired"
        REVOKED = "revoked", "Revoked"

    class MotorFeedback(models.TextChoices):
        UNKNOWN = "unknown", "Unknown"
        RUNNING = "running", "Running"
        STOPPED = "stopped", "Stopped"
        FAULT = "fault", "Fault"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="devices",
    )
    pump = models.OneToOneField(
        "pumps.Pump",
        on_delete=models.SET_NULL,
        related_name="device",
        null=True,
        blank=True,
    )
    serial_number = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=120, blank=True)
    provisioning_status = models.CharField(
        max_length=24,
        choices=ProvisioningStatus.choices,
        default=ProvisioningStatus.PENDING_PAIRING,
    )
    pairing_code_hash = models.CharField(max_length=256, blank=True)
    pairing_expires_at = models.DateTimeField(null=True, blank=True)
    paired_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    last_event_sequence = models.PositiveBigIntegerField(default=0)
    motor_feedback = models.CharField(
        max_length=16,
        choices=MotorFeedback.choices,
        default=MotorFeedback.UNKNOWN,
    )
    motor_feedback_source = models.CharField(max_length=32, blank=True)
    motor_feedback_valid = models.BooleanField(default=False)
    motor_feedback_at = models.DateTimeField(null=True, blank=True)
    last_feedback_command_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_online(self):
        if self.last_seen_at is None:
            return False
        from django.conf import settings

        timeout = getattr(settings, "DEVICE_ONLINE_TIMEOUT_SECONDS", 90)
        age_seconds = (timezone.now() - self.last_seen_at).total_seconds()
        return 0 <= age_seconds <= timeout

    def __str__(self):
        return self.serial_number


class DeviceEvent(models.Model):
    class ProcessingStatus(models.TextChoices):
        PROCESSED = "processed", "Processed"
        OUT_OF_ORDER = "out_of_order", "Out of order"
        UNMATCHED_COMMAND = "unmatched_command", "Unmatched command"
        STALE_FEEDBACK = "stale_feedback", "Stale physical feedback"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name="events"
    )
    message_id = models.UUIDField()
    sequence = models.PositiveBigIntegerField()
    topic = models.CharField(max_length=256)
    event_type = models.CharField(max_length=32)
    payload = models.JSONField()
    processing_status = models.CharField(
        max_length=24,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PROCESSED,
    )
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-received_at", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=("device", "message_id"),
                name="devices_event_message_unique",
            )
        ]
        indexes = [
            models.Index(
                fields=("device", "-received_at"), name="devices_event_time_idx"
            )
        ]
