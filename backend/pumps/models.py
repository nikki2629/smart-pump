import uuid

from django.conf import settings
from django.db import models


class Pump(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="pumps",
    )
    name = models.CharField(max_length=120)
    location = models.CharField(max_length=200, blank=True)
    rated_power_kw = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    motor_capacity_hp = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    motor_type = models.CharField(max_length=64, blank=True, default="Submersible")
    phase_configuration = models.CharField(max_length=32, blank=True, default="3-Phase")
    controller_id = models.CharField(max_length=128, blank=True, default="")
    installation_description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_pumps",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name", "id")

    def __str__(self):
        return self.name
