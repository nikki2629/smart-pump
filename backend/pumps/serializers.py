from rest_framework import serializers

from organizations.models import Membership, Organization
from organizations.permissions import MANAGER_ROLES
from pumps.models import Pump


class PumpSerializer(serializers.ModelSerializer):
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.none(), required=False
    )
    device_id = serializers.SerializerMethodField()
    connection_status = serializers.SerializerMethodField()
    actual_motor_status = serializers.SerializerMethodField()
    last_seen_at = serializers.SerializerMethodField()
    latest_fault = serializers.SerializerMethodField()

    class Meta:
        model = Pump
        fields = (
            "id",
            "organization",
            "name",
            "location",
            "rated_power_kw",
            "motor_capacity_hp",
            "motor_type",
            "phase_configuration",
            "controller_id",
            "installation_description",
            "is_active",
            "created_by",
            "created_at",
            "updated_at",
            "device_id",
            "connection_status",
            "actual_motor_status",
            "last_seen_at",
            "latest_fault",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            fields["organization"].read_only = True
        else:
            view = self.context.get("view")
            request = self.context.get("request")
            if (
                not getattr(view, "swagger_fake_view", False)
                and request is not None
                and request.user.is_authenticated
            ):
                user = request.user
                fields["organization"].queryset = Organization.objects.filter(
                    memberships__user=user,
                    memberships__role__in=MANAGER_ROLES,
                ).distinct()
        return fields

    def get_device_id(self, obj):
        device = getattr(obj, "device", None)
        if device:
            return device.serial_number
        return obj.controller_id or ""

    def get_connection_status(self, obj):
        device = getattr(obj, "device", None)
        if not device:
            return "Not Paired"
        if device.provisioning_status != "paired":
            return "Pairing Pending"
        if device.motor_feedback == "fault":
            return "Fault"
        return "Online" if device.is_online else "Offline"

    def get_actual_motor_status(self, obj):
        device = getattr(obj, "device", None)
        if not device:
            return "Unknown"
        return device.motor_feedback.capitalize()

    def get_last_seen_at(self, obj):
        device = getattr(obj, "device", None)
        if device and device.last_seen_at:
            return device.last_seen_at.isoformat()
        return None

    def get_latest_fault(self, obj):
        device = getattr(obj, "device", None)
        if device and hasattr(device, "alerts"):
            latest_alert = device.alerts.order_by("-occurred_at").first()
            if latest_alert:
                return latest_alert.message
        return None

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Pump name cannot be blank.")
        return value

    def to_internal_value(self, data):
        protected_fields = {
            "motor_state",
            "motor_feedback",
            "state",
            "operating_state",
        }
        attempted = protected_fields.intersection(data)
        if attempted:
            raise serializers.ValidationError(
                {
                    field: "Motor state can only be changed by confirmed device feedback."
                    for field in sorted(attempted)
                }
            )
        return super().to_internal_value(data)

    def validate_rated_power_kw(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Rated power must be greater than zero.")
        return value

    def validate_motor_capacity_hp(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Motor capacity must be greater than zero.")
        return value

    def validate(self, attrs):
        if self.instance is None:
            request = self.context.get("request")
            if "organization" not in attrs or attrs["organization"] is None:
                if request and request.user.is_authenticated:
                    # Find or create user's default organization
                    org = Organization.objects.filter(
                        memberships__user=request.user,
                        memberships__role__in=MANAGER_ROLES,
                    ).first()
                    if not org:
                        org = Organization.objects.create(name=f"{request.user.first_name or 'My'} Organization")
                        Membership.objects.create(
                            organization=org, user=request.user, role=Membership.Role.OWNER
                        )
                    attrs["organization"] = org
            if "organization" in attrs and attrs["organization"]:
                membership = Membership.objects.filter(
                    organization=attrs["organization"], user=request.user
                ).first()
                if membership is None or membership.role not in MANAGER_ROLES:
                    raise serializers.ValidationError(
                        {"organization": "Your role cannot create pumps."}
                    )
        return attrs
