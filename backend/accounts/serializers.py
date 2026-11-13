from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import User, UserProfile
from accounts.services import register_user


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, required=False, allow_blank=True)
    full_name = serializers.CharField(max_length=300, required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=32, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value

    def validate_phone(self, value):
        if value and re.fullmatch(r"[+()\-\d .]+", value.strip()) is None:
            raise serializers.ValidationError("Enter a valid phone number.")
        return value.strip() if value else ""

    def validate_phone_number(self, value):
        if value and re.fullmatch(r"[+()\-\d .]+", value.strip()) is None:
            raise serializers.ValidationError("Enter a valid phone number.")
        return value.strip() if value else ""

    def create(self, validated_data):
        phone = validated_data.pop("phone", "")
        phone_number = validated_data.pop("phone_number", "")
        validated_data.pop("phone", None)
        validated_data.pop("phone_number", None)
        resolved_phone = phone or phone_number
        return register_user(phone_number=resolved_phone, **validated_data)

    def validate(self, attrs):
        confirm_pw = attrs.pop("confirm_password", None)
        if confirm_pw and confirm_pw != attrs.get("password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        full_name = attrs.pop("full_name", "").strip()
        if full_name and not attrs.get("first_name"):
            parts = full_name.split(" ", 1)
            attrs["first_name"] = parts[0]
            if len(parts) > 1:
                attrs["last_name"] = parts[1]
        return attrs

    def create(self, validated_data):
        return register_user(**validated_data)


class EmailVerificationSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=4096, trim_whitespace=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=128)
    token = serializers.CharField(max_length=256)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)


class DetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


class VerifiedTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.email_verified:
            raise AuthenticationFailed("Invalid email or password.")
        return data


class ProfileSerializer(serializers.ModelSerializer):
    phone_number = serializers.CharField(
        source="profile.phone_number", max_length=32, required=False, allow_blank=True
    )
    timezone = serializers.CharField(
        source="profile.timezone", max_length=64, required=False
    )

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "phone_number", "timezone")
        read_only_fields = ("id", "email")

    def validate_phone_number(self, value):
        if value and re.fullmatch(r"[+()\-\d .]+", value.strip()) is None:
            raise serializers.ValidationError("Enter a valid phone number.")
        return value.strip()

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise serializers.ValidationError("Enter a valid IANA timezone.") from exc
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", {})
        for field in ("first_name", "last_name"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save(update_fields=("first_name", "last_name"))
        profile, _ = UserProfile.objects.get_or_create(user=instance)
        for field, value in profile_data.items():
            setattr(profile, field, value)
        if profile_data:
            profile.save(update_fields=tuple(profile_data) + ("updated_at",))
        return instance
