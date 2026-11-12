import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework import serializers

from devices.models import Device
from organizations.models import Membership, Organization
from organizations.permissions import MANAGER_ROLES
from pumps.models import Pump


class DeviceReadSerializer(serializers.ModelSerializer):
    is_online = serializers.BooleanField(read_only=True)

    class Meta:
        model = Device
        fields = (
            "id",
            "organization",
            "pump",
            "serial_number",
            "name",
            "provisioning_status",
            "paired_at",
            "last_seen_at",
            "is_online",
            "motor_feedback",
            "motor_feedback_source",
            "motor_feedback_valid",
            "motor_feedback_at",
            "created_at",
        )
        read_only_fields = fields


class DeviceCreateSerializer(serializers.ModelSerializer):
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.none()
    )
    pump = serializers.PrimaryKeyRelatedField(
        queryset=Pump.objects.none(), required=False, allow_null=True
    )

    class Meta:
        model = Device
        fields = ("organization", "pump", "serial_number", "name")

    def get_fields(self):
        fields = super().get_fields()
        view = self.context.get("view")
        request = self.context.get("request")
        if (
            not getattr(view, "swagger_fake_view", False)
            and request is not None
            and request.user.is_authenticated
        ):
            user = request.user
            organizations = Organization.objects.filter(
                memberships__user=user,
                memberships__role__in=MANAGER_ROLES,
            ).distinct()
            fields["organization"].queryset = organizations
            fields["pump"].queryset = Pump.objects.filter(
                organization__in=organizations
            )
        return fields

    def validate_serial_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Serial number cannot be blank.")
        return value

    def validate(self, attrs):
        organization = attrs["organization"]
        membership = Membership.objects.filter(
            organization=organization, user=self.context["request"].user
        ).first()
        if membership is None or membership.role not in MANAGER_ROLES:
            raise serializers.ValidationError(
                {"organization": "Your role cannot register devices."}
            )
        pump = attrs.get("pump")
        if pump is not None and pump.organization_id != organization.pk:
            raise serializers.ValidationError(
                {"pump": "The pump must belong to the selected organization."}
            )
        return attrs

    def create(self, validated_data):
        pairing_code = secrets.token_urlsafe(32)
        device = Device.objects.create(
            **validated_data,
            pairing_code_hash=make_password(pairing_code),
            pairing_expires_at=timezone.now()
            + timedelta(seconds=settings.DEVICE_PAIRING_TIMEOUT_SECONDS),
        )
        device._pairing_code = pairing_code
        return device


class DeviceCreatedSerializer(DeviceReadSerializer):
    pairing_code = serializers.SerializerMethodField()

    class Meta(DeviceReadSerializer.Meta):
        fields = DeviceReadSerializer.Meta.fields + ("pairing_code",)

    def get_pairing_code(self, obj):
        return getattr(obj, "_pairing_code", None)


class PairingSerializer(serializers.Serializer):
    serial_number = serializers.CharField(max_length=64)
    pairing_code = serializers.CharField(max_length=128, trim_whitespace=False)


class MqttConnectionInfoSerializer(serializers.Serializer):
    host = serializers.CharField()
    port = serializers.IntegerField()
    username = serializers.UUIDField()
    topic_root = serializers.CharField()
    protocol_version = serializers.IntegerField()
    tls = serializers.BooleanField()


class PairingResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    serial_number = serializers.CharField()
    provisioning_status = serializers.ChoiceField(
        choices=Device.ProvisioningStatus.choices
    )
    mqtt = MqttConnectionInfoSerializer()


class DeviceStatusSerializer(serializers.ModelSerializer):
    is_online = serializers.BooleanField(read_only=True)

    class Meta:
        model = Device
        fields = (
            "id",
            "serial_number",
            "provisioning_status",
            "is_online",
            "last_seen_at",
            "motor_feedback",
            "motor_feedback_source",
            "motor_feedback_valid",
            "motor_feedback_at",
        )
        read_only_fields = fields
