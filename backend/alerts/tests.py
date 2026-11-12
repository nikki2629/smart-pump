from django.utils import timezone
from rest_framework.test import APITestCase

from alerts.models import Alert
from audit.models import AuditEvent
from test_support import (
    create_organization_member,
    create_paired_device,
    create_verified_user,
)


class AlertAcknowledgmentTests(APITestCase):
    def setUp(self):
        self.user = create_verified_user("alert-member@example.com")
        self.organization, _ = create_organization_member(self.user)
        self.device = create_paired_device(self.organization)
        self.alert = Alert.objects.create(
            device=self.device,
            severity=Alert.Severity.CRITICAL,
            code="overcurrent",
            message="Motor overcurrent detected",
            occurred_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.user)

    def test_acknowledgment_is_idempotent_and_does_not_resolve_alert(self):
        url = f"/api/v1/alerts/{self.alert.pk}/acknowledge/"
        first_response = self.client.post(url, format="json")
        self.assertEqual(first_response.status_code, 200)
        self.assertIsNotNone(first_response.data["acknowledged_at"])
        self.assertEqual(first_response.data["acknowledged_by"], self.user.pk)
        self.assertIsNone(first_response.data["resolved_at"])

        acknowledged_at = first_response.data["acknowledged_at"]
        second_response = self.client.post(url, format="json")
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.data["acknowledged_at"], acknowledged_at)
        self.assertEqual(AuditEvent.objects.filter(action="alert.acknowledged").count(), 1)

        detail = self.client.get(f"/api/v1/alerts/{self.alert.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["acknowledged_by"], self.user.pk)
        self.assertIsNone(detail.data["resolved_at"])

    def test_alert_acknowledgment_is_scoped_to_organization_members(self):
        other_user = create_verified_user("alert-outsider@example.com")
        create_organization_member(other_user, name="Other Alert Org")
        self.client.force_authenticate(user=other_user)

        response = self.client.post(
            f"/api/v1/alerts/{self.alert.pk}/acknowledge/", format="json"
        )

        self.assertEqual(response.status_code, 404)
        self.assertIsNone(Alert.objects.get(pk=self.alert.pk).acknowledged_at)
