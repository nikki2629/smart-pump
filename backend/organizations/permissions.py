from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from organizations.models import Membership, Organization

MANAGER_ROLES = (Membership.Role.OWNER, Membership.Role.ADMIN)
COMMAND_ROLES = (*MANAGER_ROLES, Membership.Role.OPERATOR)


def require_verified_user(user):
    if not user.is_authenticated:
        raise PermissionDenied("Authentication is required.")
    if not user.email_verified:
        raise PermissionDenied("Verify your email address to access this resource.")


def accessible_organizations(user):
    return Organization.objects.filter(memberships__user=user).distinct()


def get_accessible_organization(user, organization_id):
    require_verified_user(user)
    return get_object_or_404(
        accessible_organizations(user), pk=organization_id
    )


def get_membership(user, organization):
    return get_object_or_404(
        Membership.objects.select_related("organization", "user"),
        organization=organization,
        user=user,
    )


def require_role(user, organization, roles):
    membership = get_membership(user, organization)
    if membership.role not in roles:
        raise PermissionDenied("Your organization role does not allow this action.")
    return membership
