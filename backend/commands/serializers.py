from rest_framework import serializers

from commands.models import Command


class CommandCreateSerializer(serializers.Serializer):
    pump_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=Command.Action.choices)


class CommandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Command
        fields = (
            "id",
            "pump",
            "requested_by",
            "action",
            "status",
            "expires_at",
            "published_at",
            "acknowledged_at",
            "result_received_at",
            "result_outcome",
            "result_code",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CommandPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = CommandSerializer(many=True)
