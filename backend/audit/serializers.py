from rest_framework import serializers

from audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "organization",
            "actor_email",
            "action",
            "object_type",
            "object_id",
            "metadata",
            "created_at",
        )
        read_only_fields = fields
