from rest_framework.test import APITestCase

from organizations.models import Membership
from test_support import create_organization_member, create_verified_user


class OrganizationMembershipTests(APITestCase):
    def setUp(self):
        self.owner = create_verified_user("org-owner@example.com")
        self.organization, self.owner_membership = create_organization_member(
            self.owner
        )
        self.other_user = create_verified_user("org-outsider@example.com")
        self.other_organization, _ = create_organization_member(
            self.other_user, name="Outsider Org"
        )

    def test_membership_management_is_scoped_and_preserves_last_owner(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(
            f"/api/v1/organizations/{self.organization.pk}/members/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

        response = self.client.get(
            f"/api/v1/organizations/{self.other_organization.pk}/members/"
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.delete(
            f"/api/v1/organizations/{self.organization.pk}/members/"
            f"{self.owner_membership.pk}/"
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(
            Membership.objects.filter(pk=self.owner_membership.pk).exists()
        )

    def test_admin_cannot_grant_owner_or_admin_role(self):
        admin = create_verified_user("org-admin@example.com")
        Membership.objects.create(
            organization=self.organization, user=admin, role=Membership.Role.ADMIN
        )
        new_user = create_verified_user("org-new@example.com")
        self.client.force_authenticate(user=admin)
        response = self.client.post(
            f"/api/v1/organizations/{self.organization.pk}/members/",
            {"email": new_user.email, "role": Membership.Role.OWNER},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            Membership.objects.filter(
                organization=self.organization, user=new_user
            ).exists()
        )

    def test_organization_creation_assigns_owner_atomically(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/v1/organizations/", {"name": "Second Org"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Membership.objects.filter(
                organization_id=response.data["id"],
                user=self.owner,
                role=Membership.Role.OWNER,
            ).exists()
        )
