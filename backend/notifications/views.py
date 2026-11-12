from django.db import transaction
from rest_framework import permissions, status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import record_event
from notifications.models import PushDeviceToken, Notification
from notifications.serializers import PushDeviceTokenSerializer, NotificationSerializer
from organizations.permissions import require_verified_user
from drf_spectacular.utils import extend_schema


class TokenOwnershipConflict(APIException):
    status_code = 409
    default_detail = "This notification token is already registered to another user."
    default_code = "token_owner_conflict"


class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def get(self, request):
        require_verified_user(request.user)
        notifications = Notification.objects.filter(user=request.user).order_by("-created_at")[:100]
        return Response(NotificationSerializer(notifications, many=True).data)


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def post(self, request, id):
        require_verified_user(request.user)
        notification = Notification.objects.filter(pk=id, user=request.user).first()
        if notification is None:
            raise NotFound()
        notification.is_read = True
        notification.save(update_fields=("is_read",))
        return Response(NotificationSerializer(notification).data)


class NotificationTokenListCreateView(APIView):
    serializer_class = PushDeviceTokenSerializer

    @extend_schema(responses=PushDeviceTokenSerializer(many=True))
    def get(self, request):
        require_verified_user(request.user)
        tokens = PushDeviceToken.objects.filter(user=request.user).order_by(
            "created_at"
        )
        return Response(PushDeviceTokenSerializer(tokens, many=True).data)

    @extend_schema(
        request=PushDeviceTokenSerializer,
        responses={200: PushDeviceTokenSerializer, 201: PushDeviceTokenSerializer},
    )
    def post(self, request):
        require_verified_user(request.user)
        serializer = PushDeviceTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            token_record = (
                PushDeviceToken.objects.select_for_update()
                .filter(token=data["token"])
                .first()
            )
            installation_record = (
                PushDeviceToken.objects.select_for_update()
                .filter(user=request.user, installation_id=data["installation_id"])
                .first()
            )
            if token_record is not None and token_record.user_id != request.user.pk:
                raise TokenOwnershipConflict()
            if (
                token_record is not None
                and installation_record is not None
                and token_record.pk != installation_record.pk
            ):
                raise TokenOwnershipConflict(
                    "This token is already assigned to another installation."
                )
            was_existing = (
                token_record is not None or installation_record is not None
            )
            if installation_record is not None:
                installation_record.token = data["token"]
                installation_record.platform = data["platform"]
                installation_record.active = True
                installation_record.save(
                    update_fields=("token", "platform", "active", "updated_at")
                )
                token_record = installation_record
            elif token_record is not None:
                token_record.installation_id = data["installation_id"]
                token_record.platform = data["platform"]
                token_record.active = True
                token_record.save(
                    update_fields=(
                        "installation_id",
                        "platform",
                        "active",
                        "updated_at",
                    )
                )
            else:
                token_record = PushDeviceToken.objects.create(
                    user=request.user,
                    token=data["token"],
                    installation_id=data["installation_id"],
                    platform=data["platform"],
                )
            record_event(
                actor=request.user,
                organization=None,
                action="notification_token.registered",
                object_type="push_device_token",
                object_id=token_record.pk,
                metadata={"platform": token_record.platform},
            )
        return Response(
            PushDeviceTokenSerializer(token_record).data,
            status=status.HTTP_200_OK if was_existing else status.HTTP_201_CREATED,
        )


class NotificationTokenDetailView(APIView):
    @extend_schema(responses={204: None})
    def delete(self, request, token_id):
        require_verified_user(request.user)
        with transaction.atomic():
            token = PushDeviceToken.objects.filter(
                pk=token_id, user=request.user
            ).first()
            if token is None:
                raise NotFound()
            record_event(
                actor=request.user,
                organization=None,
                action="notification_token.removed",
                object_type="push_device_token",
                object_id=token.pk,
                metadata={"platform": token.platform},
            )
            token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
