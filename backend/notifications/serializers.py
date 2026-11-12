from rest_framework import serializers

from notifications.models import PushDeviceToken, Notification


class PushDeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushDeviceToken
        fields = (
            "id",
            "token",
            "installation_id",
            "platform",
            "active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "active", "created_at", "updated_at")
        extra_kwargs = {"token": {"validators": []}}
        validators = []

    def validate_token(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A non-empty push token is required.")
        return value

    def validate_installation_id(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("An installation ID is required.")
        return value


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "user",
            "pump",
            "notification_type",
            "message",
            "is_read",
            "created_at",
        )
        read_only_fields = ("id", "user", "created_at")
