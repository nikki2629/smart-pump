from rest_framework.test import APITestCase

from organizations.models import Membership
from pumps.models import Pump
from test_support import (
    create_organization_member,
    create_pump,
    create_verified_user,
)


class PumpAuthorizationTests(APITestCase):
    def setUp(self):
        self.owner = create_verified_user("pump-owner@example.com")
        self.organization, _ = create_organization_member(self.owner)
        self.pump = create_pump(self.owner, self.organization)
        self.other_user = create_verified_user("other@example.com")
        self.other_organization, _ = create_organization_member(
            self.other_user, name="Other Org"
        )
        self.other_pump = create_pump(
            self.other_user, self.other_organization, name="Private Pump"
        )

    def test_pump_crud_is_scoped_to_organization_and_managers(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get("/api/v1/pumps/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

        response = self.client.get(f"/api/v1/pumps/{self.other_pump.pk}/")
        self.assertEqual(response.status_code, 404)

        response = self.client.post(
            "/api/v1/pumps/",
            {"organization": str(self.organization.pk), "name": "New Pump"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["created_by"], self.owner.pk)

        viewer = create_verified_user("viewer@example.com")
        Membership.objects.create(
            organization=self.organization,
            user=viewer,
            role=Membership.Role.VIEWER,
        )
        self.client.force_authenticate(user=viewer)
        response = self.client.get(f"/api/v1/pumps/{self.pump.pk}/")
        self.assertEqual(response.status_code, 200)
        response = self.client.patch(
            f"/api/v1/pumps/{self.pump.pk}/",
            {"name": "Unauthorized edit"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.pump.refresh_from_db()
        self.assertEqual(self.pump.name, "Test Pump")

    def test_pump_state_cannot_be_changed_by_generic_update(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/v1/pumps/{self.pump.pk}/",
            {"name": "Renamed", "motor_state": "running"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.pump.refresh_from_db()
        self.assertEqual(self.pump.name, "Test Pump")
        self.assertFalse(hasattr(self.pump, "motor_state"))

    def test_unverified_manager_cannot_create_pump(self):
        unverified = create_verified_user("unverified-pump@example.com")
        unverified.email_verified = False
        unverified.save(update_fields=("email_verified",))
        Membership.objects.create(
            organization=self.organization,
            user=unverified,
            role=Membership.Role.ADMIN,
        )
        self.client.force_authenticate(user=unverified)
        response = self.client.post(
            "/api/v1/pumps/",
            {"organization": str(self.organization.pk), "name": "Blocked Pump"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Pump.objects.filter(name="Blocked Pump").exists())
