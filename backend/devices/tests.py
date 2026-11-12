from django.contrib.auth.hashers import check_password
from django.utils import timezone
from rest_framework.test import APITestCase

from devices.models import Device
from test_support import create_organization_member, create_verified_user


class DeviceApiTests(APITestCase):
    def setUp(self):
        self.user = create_verified_user("device-admin@example.com")
        self.organization, _ = create_organization_member(self.user)
        self.other_user = create_verified_user("device-other@example.com")
        self.other_organization, _ = create_organization_member(
            self.other_user, name="Other Device Org"
        )

    def test_device_registration_returns_one_time_pairing_code(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/devices/",
            {
                "organization": str(self.organization.pk),
                "serial_number": "PANEL-DEVICE-001",
                "name": "North well controller",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        pairing_code = response.data["pairing_code"]
        device = Device.objects.get(serial_number="PANEL-DEVICE-001")
        self.assertNotEqual(device.pairing_code_hash, pairing_code)
        self.assertTrue(check_password(pairing_code, device.pairing_code_hash))
        self.assertGreater(device.pairing_expires_at, timezone.now())

        response = self.client.get(f"/api/v1/devices/{device.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("pairing_code", response.data)
        self.assertNotIn("pairing_code_hash", response.data)

    def test_pairing_is_one_time_and_status_is_authorized(self):
        self.client.force_authenticate(user=self.user)
        created = self.client.post(
            "/api/v1/devices/",
            {
                "organization": str(self.organization.pk),
                "serial_number": "PANEL-DEVICE-002",
            },
            format="json",
        )
        code = created.data["pairing_code"]
        device = Device.objects.get(pk=created.data["id"])
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/v1/devices/pair/",
            {"serial_number": device.serial_number, "pairing_code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], str(device.pk))
        self.assertEqual(response.data["mqtt"]["username"], str(device.pk))
        self.assertEqual(response.data["mqtt"]["topic_root"], "smart-pump/v1/devices")
        self.assertTrue(response.data["mqtt"]["tls"])
        self.assertNotIn("password", response.data["mqtt"])
        device.refresh_from_db()
        self.assertEqual(device.provisioning_status, Device.ProvisioningStatus.PAIRED)
        self.assertEqual(device.pairing_code_hash, "")

        response = self.client.post(
            "/api/v1/devices/pair/",
            {"serial_number": device.serial_number, "pairing_code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/v1/devices/{device.pk}/status/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_online"])
        self.assertEqual(response.data["motor_feedback"], "unknown")

        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(f"/api/v1/devices/{device.pk}/status/")
        self.assertEqual(response.status_code, 404)

    def test_expired_pairing_code_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        created = self.client.post(
            "/api/v1/devices/",
            {
                "organization": str(self.organization.pk),
                "serial_number": "PANEL-DEVICE-003",
            },
            format="json",
        )
        device = Device.objects.get(pk=created.data["id"])
        device.pairing_expires_at = timezone.now()
        device.save(update_fields=("pairing_expires_at",))
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/v1/devices/pair/",
            {
                "serial_number": device.serial_number,
                "pairing_code": created.data["pairing_code"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
