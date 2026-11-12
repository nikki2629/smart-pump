from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from commands.models import Command
from organizations.models import Membership
from test_support import (
    create_organization_member,
    create_paired_device,
    create_pump,
    create_verified_user,
)


class CommandAuthorizationTests(APITestCase):
    def setUp(self):
        self.owner = create_verified_user("command-owner@example.com")
        self.organization, _ = create_organization_member(self.owner)
        self.pump = create_pump(self.owner, self.organization)
        create_paired_device(self.organization, self.pump)
        self.other_user = create_verified_user("command-other@example.com")
        self.other_organization, _ = create_organization_member(
            self.other_user, name="Other Command Org"
        )
        self.other_pump = create_pump(
            self.other_user, self.other_organization, name="Other Pump"
        )
        create_paired_device(self.other_organization, self.other_pump)

    def test_command_creation_is_authorized_idempotent_and_does_not_claim_state(self):
        self.client.force_authenticate(user=self.owner)
        headers = {"HTTP_IDEMPOTENCY_KEY": "start-001"}
        response = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.pump.pk), "action": "start"},
            format="json",
            **headers,
        )
        self.assertEqual(response.status_code, 201)
        command_id = response.data["id"]
        self.assertEqual(response.data["status"], Command.Status.AUTHORIZED)

        duplicate = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.pump.pk), "action": "start"},
            format="json",
            **headers,
        )
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.data["id"], command_id)

        conflict = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.pump.pk), "action": "stop"},
            format="json",
            **headers,
        )
        self.assertEqual(conflict.status_code, 409)

        detail = self.client.get(f"/api/v1/commands/{command_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["status"], Command.Status.AUTHORIZED)
        self.assertEqual(self.pump.device.motor_feedback, "unknown")
        delete_response = self.client.delete(f"/api/v1/pumps/{self.pump.pk}/")
        self.assertEqual(delete_response.status_code, 409)

    def test_command_requests_require_idempotency_and_hide_other_organizations(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.pump.pk), "action": "start"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.other_pump.pk), "action": "start"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="unauthorized-001",
        )
        self.assertEqual(response.status_code, 404)

    def test_viewers_cannot_request_commands(self):
        viewer = create_verified_user("command-viewer@example.com")
        Membership.objects.create(
            organization=self.organization,
            user=viewer,
            role=Membership.Role.VIEWER,
        )
        self.client.force_authenticate(user=viewer)
        response = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.pump.pk), "action": "start"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="viewer-command-001",
        )
        self.assertEqual(response.status_code, 404)

    def test_command_requires_a_paired_device(self):
        pump = create_pump(self.owner, self.organization, name="Not Paired")
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(pump.pk), "action": "start"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="unpaired-command-001",
        )
        self.assertEqual(response.status_code, 400)

    def test_expired_authorized_command_is_reported_as_expired(self):
        self.client.force_authenticate(user=self.owner)
        created = self.client.post(
            "/api/v1/commands/",
            {"pump_id": str(self.pump.pk), "action": "stop"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="expiry-command-001",
        )
        self.assertEqual(created.status_code, 201)
        command = Command.objects.get(pk=created.data["id"])
        command.expires_at = timezone.now() - timedelta(seconds=1)
        command.save(update_fields=("expires_at",))
        response = self.client.get(f"/api/v1/commands/{command.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], Command.Status.EXPIRED)
        command.refresh_from_db()
        self.assertEqual(command.status, Command.Status.EXPIRED)

    def test_command_rate_limit_is_100_per_minute(self):
        from config.throttles import CommandThrottle
        throttle = CommandThrottle()
        self.assertEqual(throttle.get_rate(), "100/minute")

