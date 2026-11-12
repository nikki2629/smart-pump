import uuid

from django.conf import settings
from django.db import models


class PushDeviceToken(models.Model):
    class Platform(models.TextChoices):
        ANDROID = "android", "Android"
        IOS = "ios", "iOS"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_tokens"
    )
    token = models.CharField(max_length=4096, unique=True)
    installation_id = models.CharField(max_length=128)
    platform = models.CharField(max_length=8, choices=Platform.choices)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "installation_id"),
                name="notifications_user_installation_unique",
            )
        ]


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    pump = models.ForeignKey(
        "pumps.Pump", on_delete=models.CASCADE, related_name="notifications", null=True, blank=True
    )
    notification_type = models.CharField(max_length=64, default="general")
    message = models.CharField(max_length=500)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
