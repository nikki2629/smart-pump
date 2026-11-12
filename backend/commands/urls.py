from django.urls import path

from commands.views import CommandDetailView, CommandListCreateView

urlpatterns = [
    path("commands/", CommandListCreateView.as_view(), name="command-list"),
    path(
        "commands/<uuid:command_id>/",
        CommandDetailView.as_view(),
        name="command-detail",
    ),
]
