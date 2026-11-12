from django.urls import path

from audit.views import AuditEventListView

urlpatterns = [
    path("audit/events/", AuditEventListView.as_view(), name="audit-event-list"),
]
