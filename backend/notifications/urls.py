from django.urls import path

from notifications.views import (
    NotificationListView,
    NotificationMarkReadView,
    NotificationTokenDetailView,
    NotificationTokenListCreateView,
)

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path(
        "notifications/<uuid:id>/read/",
        NotificationMarkReadView.as_view(),
        name="notification-read",
    ),
    path(
        "notifications/tokens/",
        NotificationTokenListCreateView.as_view(),
        name="notification-token-list",
    ),
    path(
        "notifications/tokens/<uuid:token_id>/",
        NotificationTokenDetailView.as_view(),
        name="notification-token-detail",
    ),
]
