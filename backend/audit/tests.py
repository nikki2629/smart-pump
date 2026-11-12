from rest_framework.test import APITestCase

from audit.models import AuditEvent
from audit.services import record_event
from test_support import create_organization_member, create_verified_user


class AuditLogAuthorizationTests(APITestCase):
    def test_audit_history_is_read_only_and_organization_scoped(self):
        user = create_verified_user("audit-member@example.com")
        organization, _ = create_organization_member(user)
        other = create_verified_user("audit-other@example.com")
        other_org, _ = create_organization_member(other, name="Other Audit Org")
        first = record_event(
            actor=user,
            organization=organization,
            action="pump.created",
            object_type="pump",
            object_id="pump-1",
        )
        record_event(
            actor=other,
            organization=other_org,
            action="pump.created",
            object_type="pump",
            object_id="pump-2",
        )
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/v1/audit/events/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(first.pk))
        response = self.client.post(
            "/api/v1/audit/events/",
            {
                "action": "forged",
                "object_type": "pump",
                "object_id": "pump-2",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 405)
        self.assertEqual(AuditEvent.objects.count(), 2)
