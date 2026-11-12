from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from alerts.models import Alert
from telemetry.models import TelemetryRecord
from test_support import (
    create_organization_member,
    create_paired_device,
    create_pump,
    create_verified_user,
)


class HistoricalDataAuthorizationTests(APITestCase):
    def setUp(self):
        self.user = create_verified_user("history-user@example.com")
        self.organization, _ = create_organization_member(self.user)
        self.pump = create_pump(self.user, self.organization)
        self.device = create_paired_device(self.organization, self.pump)
        other_user = create_verified_user("history-other@example.com")
        other_org, _ = create_organization_member(other_user, name="Private History")
        other_pump = create_pump(other_user, other_org, name="Private Pump")
        self.other_device = create_paired_device(other_org, other_pump)
        self.record = TelemetryRecord.objects.create(
            device=self.device,
            reported_at=timezone.now(),
            values={"voltage_v": [230, 231, 229]},
        )
        self.other_record = TelemetryRecord.objects.create(
            device=self.other_device,
            reported_at=timezone.now(),
            values={"voltage_v": [400, 400, 400]},
        )
        self.alert = Alert.objects.create(
            device=self.device,
            severity=Alert.Severity.WARNING,
            code="over_temperature",
            message="Motor temperature exceeded the configured warning threshold.",
            occurred_at=timezone.now() - timedelta(minutes=1),
        )

    def test_telemetry_and_alert_history_are_read_only_and_scoped(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/telemetry/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        response = self.client.get("/api/v1/telemetry/?device=not-a-uuid")
        self.assertEqual(response.status_code, 400)
        response = self.client.get(
            f"/api/v1/telemetry/{self.other_record.pk}/"
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            "/api/v1/telemetry/",
            {"device": str(self.device.pk), "values": {"motor_state": "running"}},
            format="json",
        )
        self.assertEqual(response.status_code, 405)

        response = self.client.get("/api/v1/alerts/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        response = self.client.get(f"/api/v1/alerts/{self.alert.pk}/")
        self.assertEqual(response.status_code, 200)
        response = self.client.get(f"/api/v1/alerts/{self.other_record.pk}/")
        self.assertEqual(response.status_code, 404)
