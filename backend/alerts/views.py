from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.services import record_event
from alerts.models import Alert
from alerts.serializers import AlertSerializer
from organizations.permissions import accessible_organizations, require_verified_user


class AlertViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = AlertSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Alert.objects.none()
        require_verified_user(self.request.user)
        return Alert.objects.filter(
            device__organization__in=accessible_organizations(self.request.user)
        ).select_related("device", "acknowledged_by")

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        with transaction.atomic():
            alert = Alert.objects.select_for_update().select_related(
                "device__organization"
            ).get(pk=alert.pk)
            if alert.acknowledged_at is None:
                alert.acknowledged_at = timezone.now()
                alert.acknowledged_by = request.user
                alert.save(update_fields=("acknowledged_at", "acknowledged_by"))
                record_event(
                    actor=request.user,
                    organization=alert.device.organization,
                    action="alert.acknowledged",
                    object_type="alert",
                    object_id=alert.pk,
                )
        return Response(self.get_serializer(alert).data)
