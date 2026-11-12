from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import record_event
from organizations.models import Membership, Organization
from organizations.permissions import (
    MANAGER_ROLES,
    accessible_organizations,
    get_accessible_organization,
    require_role,
    require_verified_user,
)
from organizations.serializers import (
    MembershipCreateSerializer,
    MembershipRoleSerializer,
    MembershipSerializer,
    OrganizationSerializer,
)
from drf_spectacular.utils import extend_schema

User = get_user_model()


class OrganizationListCreateView(APIView):
    @extend_schema(responses=OrganizationSerializer(many=True))
    def get(self, request):
        require_verified_user(request.user)
        queryset = accessible_organizations(request.user).order_by("name", "id")
        return Response(OrganizationSerializer(queryset, many=True).data)

    @extend_schema(
        request=OrganizationSerializer,
        responses={201: OrganizationSerializer},
    )
    def post(self, request):
        require_verified_user(request.user)
        serializer = OrganizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            organization = serializer.save()
            Membership.objects.create(
                organization=organization,
                user=request.user,
                role=Membership.Role.OWNER,
            )
            record_event(
                actor=request.user,
                organization=organization,
                action="organization.created",
                object_type="organization",
                object_id=organization.pk,
            )
        return Response(
            OrganizationSerializer(organization).data,
            status=status.HTTP_201_CREATED,
        )


class OrganizationDetailView(APIView):
    def get_object(self, request, organization_id):
        return get_accessible_organization(request.user, organization_id)

    @extend_schema(responses=OrganizationSerializer)
    def get(self, request, organization_id):
        organization = self.get_object(request, organization_id)
        return Response(OrganizationSerializer(organization).data)

    @extend_schema(
        request=OrganizationSerializer,
        responses=OrganizationSerializer,
    )
    def patch(self, request, organization_id):
        organization = self.get_object(request, organization_id)
        require_role(request.user, organization, MANAGER_ROLES)
        serializer = OrganizationSerializer(
            organization, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            organization = serializer.save()
            record_event(
                actor=request.user,
                organization=organization,
                action="organization.updated",
                object_type="organization",
                object_id=organization.pk,
            )
        return Response(OrganizationSerializer(organization).data)


class OrganizationMembershipView(APIView):
    def get_organization(self, request, organization_id):
        return get_accessible_organization(request.user, organization_id)

    @extend_schema(responses=MembershipSerializer(many=True))
    def get(self, request, organization_id):
        organization = self.get_organization(request, organization_id)
        memberships = Membership.objects.filter(
            organization=organization
        ).select_related("user").order_by("created_at")
        return Response(MembershipSerializer(memberships, many=True).data)

    @extend_schema(
        request=MembershipCreateSerializer,
        responses={201: MembershipSerializer},
    )
    def post(self, request, organization_id):
        organization = self.get_organization(request, organization_id)
        serializer = MembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data["role"]
        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"]
        ).first()
        if user is None:
            raise serializers.ValidationError(
                {"email": "An account with this email address was not found."}
            )
        with transaction.atomic():
            organization = Organization.objects.select_for_update().get(
                pk=organization.pk
            )
            actor_membership = require_role(
                request.user, organization, MANAGER_ROLES
            )
            if actor_membership.role == Membership.Role.ADMIN and role in {
                Membership.Role.OWNER,
                Membership.Role.ADMIN,
            }:
                raise serializers.ValidationError(
                    {
                        "role": "Administrators cannot grant owner or administrator roles."
                    }
                )
            membership, created = Membership.objects.get_or_create(
                organization=organization,
                user=user,
                defaults={"role": role},
            )
            if not created:
                raise serializers.ValidationError(
                    {"email": "This user is already a member of the organization."}
                )
            record_event(
                actor=request.user,
                organization=organization,
                action="organization.member_added",
                object_type="membership",
                object_id=membership.pk,
                metadata={"role": role},
            )
        return Response(
            MembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )


class OrganizationMembershipDetailView(APIView):
    def get_membership(self, request, organization_id, membership_id):
        accessible = get_accessible_organization(request.user, organization_id)
        organization = Organization.objects.select_for_update().get(pk=accessible.pk)
        require_role(request.user, organization, MANAGER_ROLES)
        membership = get_object_or_404(
            Membership.objects.select_for_update(),
            organization=organization,
            pk=membership_id,
        )
        return organization, membership

    @extend_schema(
        request=MembershipRoleSerializer,
        responses=MembershipSerializer,
    )
    def patch(self, request, organization_id, membership_id):
        with transaction.atomic():
            organization, membership = self.get_membership(
                request, organization_id, membership_id
            )
            actor_membership = require_role(request.user, organization, MANAGER_ROLES)
            serializer = MembershipRoleSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            new_role = serializer.validated_data["role"]
            if actor_membership.role == Membership.Role.ADMIN and new_role in {
                Membership.Role.OWNER,
                Membership.Role.ADMIN,
            }:
                raise serializers.ValidationError(
                    {"role": "Administrators cannot grant owner or administrator roles."}
                )
            if (
                membership.role == Membership.Role.OWNER
                and new_role != Membership.Role.OWNER
                and not Membership.objects.filter(
                    organization=organization, role=Membership.Role.OWNER
                ).exclude(pk=membership.pk).exists()
            ):
                raise serializers.ValidationError(
                    {"role": "An organization must retain at least one owner."}
                )
            membership.role = new_role
            membership.save(update_fields=("role",))
            record_event(
                actor=request.user,
                organization=organization,
                action="organization.member_role_changed",
                object_type="membership",
                object_id=membership.pk,
                metadata={"role": new_role},
            )
        return Response(MembershipSerializer(membership).data)

    @extend_schema(responses={204: None})
    def delete(self, request, organization_id, membership_id):
        with transaction.atomic():
            organization, membership = self.get_membership(
                request, organization_id, membership_id
            )
            if (
                membership.role == Membership.Role.OWNER
                and not Membership.objects.filter(
                    organization=organization, role=Membership.Role.OWNER
                ).exclude(pk=membership.pk).exists()
            ):
                raise serializers.ValidationError(
                    {"detail": "The last organization owner cannot be removed."}
                )
            record_event(
                actor=request.user,
                organization=organization,
                action="organization.member_removed",
                object_type="membership",
                object_id=membership.pk,
            )
            membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
