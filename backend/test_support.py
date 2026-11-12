import uuid

from accounts.models import User
from devices.models import Device
from organizations.models import Membership, Organization
from pumps.models import Pump


def create_verified_user(email):
    user = User.objects.create_user(
        email=email,
        password="M0tor-control!Strong-Password-8821",
        email_verified=True,
    )
    return user


def create_organization_member(user, role=Membership.Role.OWNER, name="Test Org"):
    organization = Organization.objects.create(name=name)
    membership = Membership.objects.create(
        organization=organization, user=user, role=role
    )
    return organization, membership


def create_pump(user, organization, name="Test Pump", active=True):
    return Pump.objects.create(
        organization=organization,
        name=name,
        is_active=active,
        created_by=user,
    )


def create_paired_device(organization, pump=None, serial_number=None):
    return Device.objects.create(
        organization=organization,
        pump=pump,
        serial_number=serial_number or f"TEST-{uuid.uuid4().hex[:12]}",
        provisioning_status=Device.ProvisioningStatus.PAIRED,
    )
