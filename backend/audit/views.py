from django.db.models import Q
from rest_framework import generics, permissions

from audit.models import AuditEvent
from audit.serializers import AuditEventSerializer
from organizations.permissions import require_verified_user


class AuditEventListView(generics.ListAPIView):
    serializer_class = AuditEventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        require_verified_user(self.request.user)
        return (
            AuditEvent.objects.filter(
                Q(organization__memberships__user=self.request.user)
                | Q(organization__isnull=True, actor=self.request.user)
            )
            .select_related("organization", "actor")
            .distinct()
        )
