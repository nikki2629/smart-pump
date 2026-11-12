from django.urls import path

from organizations.views import (
    OrganizationDetailView,
    OrganizationListCreateView,
    OrganizationMembershipDetailView,
    OrganizationMembershipView,
)

urlpatterns = [
    path(
        "organizations/",
        OrganizationListCreateView.as_view(),
        name="organization-list",
    ),
    path(
        "organizations/<uuid:organization_id>/",
        OrganizationDetailView.as_view(),
        name="organization-detail",
    ),
    path(
        "organizations/<uuid:organization_id>/members/",
        OrganizationMembershipView.as_view(),
        name="organization-members",
    ),
    path(
        "organizations/<uuid:organization_id>/members/<uuid:membership_id>/",
        OrganizationMembershipDetailView.as_view(),
        name="organization-member-detail",
    ),
]
