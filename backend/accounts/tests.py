from unittest.mock import patch
from django.core import signing
from django.core import mail
from django.test import override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from accounts.models import User
from accounts.services import EMAIL_VERIFICATION_SALT
from organizations.models import Organization, Membership


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DJANGO_SECRET_KEY="test-only-secret",
)
class AccountApiTests(APITestCase):
    def test_openapi_schema_is_available(self):
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 200)

    def test_registration_verification_login_and_refresh(self):
        response = self.client.post(
            "/api/v1/accounts/register/",
            {
                "email": "Person@Example.com",
                "password": "M0tor-control!Strong-Password-8821",
                "first_name": "Pump",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="person@example.com")
        self.assertFalse(user.email_verified)
        self.assertNotEqual(user.password, "M0tor-control!Strong-Password-8821")
        self.assertTrue(user.check_password("M0tor-control!Strong-Password-8821"))
        self.assertTrue(hasattr(user, "profile"))
        self.assertEqual(len(mail.outbox), 1)

        # Login fails before email OTP verification
        unverified_login = self.client.post(
            "/api/v1/accounts/login/",
            {
                "email": user.email,
                "password": "M0tor-control!Strong-Password-8821",
            },
            format="json",
        )
        self.assertEqual(unverified_login.status_code, 401)

        # OTP Verification
        token = user.profile.verification_otp
        verify = self.client.post(
            "/api/v1/accounts/email/verify/", {"token": token}, format="json"
        )
        self.assertEqual(verify.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)

        # Login succeeds after verification
        login = self.client.post(
            "/api/v1/accounts/login/",
            {
                "email": user.email,
                "password": "M0tor-control!Strong-Password-8821",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        refresh = self.client.post(
            "/api/v1/accounts/token/refresh/",
            {"refresh": login.data["refresh"]},
            format="json",
        )
        self.assertEqual(refresh.status_code, 200)
        self.assertIn("access", refresh.data)
        self.assertIn("refresh", refresh.data)

    def test_registration_organization_created(self):
        response = self.client.post(
            "/api/v1/accounts/register/",
            {
                "email": "orguser@example.com",
                "password": "M0tor-control!Strong-Password-8821",
                "first_name": "OrgOwner",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="orguser@example.com")
        membership = Membership.objects.filter(user=user).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, Membership.Role.OWNER)
        self.assertIn("OrgOwner", membership.organization.name)

    def test_registration_email_delivery_failure_rolls_back_transaction(self):
        with patch(
            "accounts.services.send_transactional_email",
            side_effect=ValidationError({"email": ["Failed to send email due to network timeout."]}),
        ):
            response = self.client.post(
                "/api/v1/accounts/register/",
                {
                    "email": "faildelivery@example.com",
                    "password": "M0tor-control!Strong-Password-8821",
                    "first_name": "FailTest",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("email", response.data)
            self.assertFalse(User.objects.filter(email="faildelivery@example.com").exists())
            self.assertFalse(Organization.objects.filter(name="FailTest's Organization").exists())

    def test_registration_duplicate_email(self):
        User.objects.create_user(
            email="existing@example.com",
            password="M0tor-control!Strong-Password-8821",
        )
        response = self.client.post(
            "/api/v1/accounts/register/",
            {
                "email": "existing@example.com",
                "password": "M0tor-control!Strong-Password-8821",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_email_verification_token_is_expiring_and_single_account_scoped(self):
        response = self.client.post(
            "/api/v1/accounts/email/verify/",
            {"token": signing.dumps("999999", salt=EMAIL_VERIFICATION_SALT)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            "/api/v1/accounts/email/verify/", {"token": "invalid"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_does_not_disclose_unknown_email_and_changes_password(self):
        user = User.objects.create_user(
            email="reset@example.com",
            password="M0tor-control!Strong-Password-8821",
            email_verified=True,
        )
        response = self.client.post(
            "/api/v1/accounts/password/reset/",
            {"email": "missing@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

        login = self.client.post(
            "/api/v1/accounts/login/",
            {
                "email": user.email,
                "password": "M0tor-control!Strong-Password-8821",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        response = self.client.post(
            "/api/v1/accounts/password/reset/",
            {"email": user.email},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        body = mail.outbox[0].body
        uid = body.split("uid=", 1)[1].split(",", 1)[0]
        token = body.split("token=", 1)[1].strip()
        response = self.client.post(
            "/api/v1/accounts/password/reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "password": "An0ther!New-Password-4821",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("An0ther!New-Password-4821"))
        refresh = self.client.post(
            "/api/v1/accounts/token/refresh/",
            {"refresh": login.data["refresh"]},
            format="json",
        )
        self.assertEqual(refresh.status_code, 401)

    def test_profile_is_limited_to_authenticated_user_and_safe_fields(self):
        user = User.objects.create_user(
            email="profile@example.com",
            password="M0tor-control!Strong-Password-8821",
        )
        self.client.force_authenticate(user=user)
        response = self.client.patch(
            "/api/v1/accounts/me/",
            {"first_name": "Updated", "email": "attacker@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.first_name, "Updated")
        self.assertEqual(user.email, "profile@example.com")

    def test_logout_cannot_blacklist_another_users_refresh_token(self):
        first = User.objects.create_user(
            email="logout-first@example.com",
            password="M0tor-control!Strong-Password-8821",
            email_verified=True,
        )
        second = User.objects.create_user(
            email="logout-second@example.com",
            password="M0tor-control!Strong-Password-8821",
            email_verified=True,
        )
        first_tokens = self.client.post(
            "/api/v1/accounts/login/",
            {"email": first.email, "password": "M0tor-control!Strong-Password-8821"},
            format="json",
        ).data
        second_tokens = self.client.post(
            "/api/v1/accounts/login/",
            {
                "email": second.email,
                "password": "M0tor-control!Strong-Password-8821",
            },
            format="json",
        ).data

        self.client.force_authenticate(user=first)
        response = self.client.post(
            "/api/v1/accounts/logout/",
            {"refresh": second_tokens["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.client.force_authenticate(user=second)
        response = self.client.post(
            "/api/v1/accounts/logout/",
            {"refresh": second_tokens["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        response = self.client.post(
            "/api/v1/accounts/token/refresh/",
            {"refresh": second_tokens["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
