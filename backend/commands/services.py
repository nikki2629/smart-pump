from datetime import timedelta
import re

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, ValidationError

from audit.services import record_event
from commands.models import Command
from devices.models import Device
from organizations.models import Membership
from organizations.permissions import COMMAND_ROLES, require_verified_user
from pumps.models import Pump


class IdempotencyConflict(APIException):
    status_code = 409
    default_detail = "The idempotency key was already used for a different request."
    default_code = "idempotency_conflict"


def create_authorized_command(*, user, pump_id, action, idempotency_key):
    if not idempotency_key or len(idempotency_key) > 128:
        raise ValidationError(
            {"Idempotency-Key": "A key of 1 to 128 characters is required."}
        )
    if re.fullmatch(r"[A-Za-z0-9._:-]+", idempotency_key) is None:
        raise ValidationError(
            {"Idempotency-Key": "Use only letters, numbers, '.', '_', ':' or '-'."}
        )
    require_verified_user(user)

    with transaction.atomic():
        pump = (
            Pump.objects.select_for_update()
            .filter(
                pk=pump_id,
                organization__memberships__user=user,
                organization__memberships__role__in=COMMAND_ROLES,
            )
            .distinct()
            .first()
        )
        if pump is None:
            raise NotFound("Pump not found.")
        if not pump.is_active:
            raise ValidationError({"pump": "This pump is inactive."})

        device = Device.objects.select_for_update().filter(pump=pump).first()
        if (
            device is None
            or device.provisioning_status != Device.ProvisioningStatus.PAIRED
        ):
            raise ValidationError({"pump": "The pump has no paired device."})

        prior = Command.objects.filter(
            requested_by=user, idempotency_key=idempotency_key
        ).first()
        if prior is not None:
            if prior.pump_id != pump.pk or prior.action != action:
                raise IdempotencyConflict()
            return prior, False

        try:
            with transaction.atomic():
                command = Command.objects.create(
                    pump=pump,
                    requested_by=user,
                    action=action,
                    idempotency_key=idempotency_key,
                    status=Command.Status.AUTHORIZED,
                    expires_at=timezone.now() + timedelta(seconds=30),
                )
        except IntegrityError:
            prior = Command.objects.filter(
                requested_by=user, idempotency_key=idempotency_key
            ).first()
            if prior is None:
                raise
            if prior.pump_id != pump.pk or prior.action != action:
                raise IdempotencyConflict()
            return prior, False

        record_event(
            actor=user,
            organization=pump.organization,
            action="command.authorized",
            object_type="command",
            object_id=command.pk,
            metadata={"action": action, "pump_id": str(pump.pk)},
        )
        return command, True


def expire_pending_commands(queryset):
    return expire_command_timeouts(queryset)


def expire_command_timeouts(queryset):
    from django.conf import settings

    now = timezone.now()
    ack_cutoff = now - timedelta(
        seconds=settings.MQTT_COMMAND_FEEDBACK_TIMEOUT_SECONDS
    )
    transitions = queryset.filter(
        Q(
            status__in=(Command.Status.AUTHORIZED, Command.Status.PUBLISHED),
            expires_at__lte=now,
        )
        | Q(
            status__in=(
                Command.Status.ACKNOWLEDGED,
                Command.Status.RESULT_RECEIVED,
            ),
            expires_at__lte=ack_cutoff,
        )
    )
    count = 0
    with transaction.atomic():
        for command in transitions.select_for_update().iterator():
            if command.status in (
                Command.Status.AUTHORIZED,
                Command.Status.PUBLISHED,
            ):
                command.status = Command.Status.EXPIRED
                action = "command.expired"
            else:
                command.status = Command.Status.TIMED_OUT
                action = "command.timed_out"
            command.save(update_fields=("status", "updated_at"))
            record_event(
                actor=None,
                organization=command.pump.organization,
                action=action,
                object_type="command",
                object_id=command.pk,
            )
            count += 1
    return count
