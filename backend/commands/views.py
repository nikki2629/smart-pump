from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from commands.models import Command
from commands.serializers import (
    CommandCreateSerializer,
    CommandPageSerializer,
    CommandSerializer,
)
from commands.services import (
    create_authorized_command,
    expire_pending_commands,
)
from organizations.permissions import (
    accessible_organizations,
    require_verified_user,
)
from config.throttles import CommandThrottle
from drf_spectacular.utils import OpenApiParameter, extend_schema


class CommandListCreateView(APIView):
    serializer_class = CommandSerializer
    throttle_classes = [CommandThrottle]

    def get_queryset(self, user):
        require_verified_user(user)
        return Command.objects.filter(
            pump__organization__in=accessible_organizations(user)
        ).select_related("pump", "requested_by")

    @extend_schema(
        operation_id="commands_list",
        responses=CommandPageSerializer,
    )
    def get(self, request):
        queryset = self.get_queryset(request.user)
        expire_pending_commands(queryset)
        queryset = self.get_queryset(request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(CommandSerializer(page, many=True).data)
        return Response(CommandSerializer(queryset, many=True).data)

    @extend_schema(
        request=CommandCreateSerializer,
        responses={200: CommandSerializer, 201: CommandSerializer},
        parameters=[
            OpenApiParameter(
                name="Idempotency-Key",
                type=str,
                location=OpenApiParameter.HEADER,
                required=True,
                description="Unique key to safely retry this command request.",
            )
        ],
    )
    def post(self, request):
        serializer = CommandCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        command, created = create_authorized_command(
            user=request.user,
            pump_id=serializer.validated_data["pump_id"],
            action=serializer.validated_data["action"],
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )
        return Response(
            CommandSerializer(command).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def paginate_queryset(self, queryset):
        from rest_framework.pagination import PageNumberPagination

        self._paginator = PageNumberPagination()
        self._paginator.page_size = 50
        return self._paginator.paginate_queryset(queryset, self.request, view=self)

    def get_paginated_response(self, data):
        return self._paginator.get_paginated_response(data)


class CommandDetailView(APIView):
    serializer_class = CommandSerializer

    @extend_schema(
        operation_id="command_retrieve",
        responses=CommandSerializer,
    )
    def get(self, request, command_id):
        require_verified_user(request.user)
        visible_commands = Command.objects.filter(
            pump__organization__in=accessible_organizations(request.user)
        )
        expire_pending_commands(visible_commands)
        command = get_object_or_404(
            visible_commands.select_related("pump", "requested_by"),
            pk=command_id,
        )
        return Response(CommandSerializer(command).data)
