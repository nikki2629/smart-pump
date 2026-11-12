from rest_framework.test import APITestCase

from test_support import create_organization_member, create_verified_user


class NotificationTokenTests(APITestCase):
    def setUp(self):
        self.user = create_verified_user("push-user@example.com")
        self.other_user = create_verified_user("push-other@example.com")
        self.organization, _ = create_organization_member(self.user)

    def test_token_registration_is_owned_by_authenticated_user(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            "token": "firebase-device-token-value",
            "installation_id": "android-installation-001",
            "platform": "android",
        }
        response = self.client.post(
            "/api/v1/notifications/tokens/", payload, format="json"
        )
        self.assertEqual(response.status_code, 201)
        token_id = response.data["id"]

        response = self.client.post(
            "/api/v1/notifications/tokens/", payload, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], token_id)

        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(
            "/api/v1/notifications/tokens/", payload, format="json"
        )
        self.assertEqual(response.status_code, 409)
        response = self.client.delete(
            f"/api/v1/notifications/tokens/{token_id}/"
        )
        self.assertEqual(response.status_code, 404)

        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f"/api/v1/notifications/tokens/{token_id}/"
        )
        self.assertEqual(response.status_code, 204)
