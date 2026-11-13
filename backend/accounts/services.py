from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import ValidationError

from accounts.models import UserProfile
from audit.services import record_event
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

User = get_user_model()
EMAIL_VERIFICATION_SALT = "accounts.email-verification.v1"


import secrets
from django.utils import timezone

def generate_6digit_otp(user):
    otp = f"{secrets.randbelow(1000000):06d}"
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.verification_otp = otp
    profile.otp_created_at = timezone.now()
    profile.save(update_fields=("verification_otp", "otp_created_at"))
    return otp


@transaction.atomic
def register_user(*, email, password, first_name="", last_name="", phone_number="", email_verified=True):
    user = User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    user.email_verified = email_verified
    if email_verified:
        user.email_verified_at = timezone.now()
    user.save(update_fields=("email_verified", "email_verified_at"))
    UserProfile.objects.get_or_create(user=user, defaults={"phone_number": phone_number})

    from organizations.models import Organization, Membership
    org_name = f"{first_name or 'Default'}'s Organization"
    org = Organization.objects.create(name=org_name)
    Membership.objects.create(organization=org, user=user, role=Membership.Role.OWNER)

    try:
        record_event(
            actor=user,
            organization=org,
            action="account.registered",
            object_type="user",
            object_id=user.pk,
        )
    except Exception:
        pass

    otp = generate_6digit_otp(user)
    try:
        send_mail(
            f"Your Pump Connector Verification Code: {otp}",
            f"Hello {user.first_name or 'User'},\n\nYour 6-digit Pump Connector verification code is: {otp}\n\nEnter this 6-digit code in the app to complete verification.\n\nRegards,\nPump Connector Automation Team",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=True,
        )
    except Exception:
        pass
    return user


def verify_email(*, token):
    token_str = str(token).strip()
    user = None
    if len(token_str) == 6 and token_str.isdigit():
        user = User.objects.filter(profile__verification_otp=token_str, is_active=True).first()

    if user is None:
        try:
            user_id = signing.loads(
                token_str,
                salt=EMAIL_VERIFICATION_SALT,
                max_age=settings.EMAIL_VERIFICATION_TIMEOUT_SECONDS,
            )
            user = User.objects.get(pk=user_id)
        except (signing.BadSignature, signing.SignatureExpired, User.DoesNotExist):
            raise ValidationError({"token": "The verification code is invalid or expired."})

    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.save(update_fields=("email_verified", "email_verified_at"))
        record_event(
            actor=user,
            organization=None,
            action="account.email_verified",
            object_type="user",
            object_id=user.pk,
        )
    return user


def send_password_reset(*, email):
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        return
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    try:
        send_mail(
            "Reset your Smart Pump Control password",
            (
                "Use this uid and token with POST "
                f"/api/v1/accounts/password/reset/confirm/: uid={uid}, token={token}"
            ),
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=True,
        )
    except Exception:
        pass


def send_sign_in_token_email(*, email):
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        return None
    otp = generate_6digit_otp(user)

    subject = f"Your Pump Connector Verification Code: {otp}"
    body = (
        f"Hello {user.first_name or 'User'},\n\n"
        f"Your 6-digit Pump Connector verification OTP code for account {user.email} is:\n\n"
        f"   >>> {otp} <<<\n\n"
        f"Enter this 6-digit code in the app to verify your sign-in.\n\n"
        f"Regards,\nPump Connector Automation Team"
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=True,
        )
    except Exception:
        pass
    return user


@transaction.atomic
def reset_password(*, uid, token, password):
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.select_for_update().get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, User.DoesNotExist):
        raise ValidationError({"token": "The password reset token is invalid or expired."})

    if not default_token_generator.check_token(user, token):
        raise ValidationError({"token": "The password reset token is invalid or expired."})

    try:
        password_validation.validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": list(exc.messages)}) from exc

    user.set_password(password)
    user.save(update_fields=("password",))
    for outstanding in OutstandingToken.objects.select_for_update().filter(
        user=user, blacklistedtoken__isnull=True
    ):
        BlacklistedToken.objects.get_or_create(token=outstanding)
    record_event(
        actor=user,
        organization=None,
        action="account.password_reset",
        object_type="user",
        object_id=user.pk,
    )
    return user
