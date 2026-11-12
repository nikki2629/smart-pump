from audit.models import AuditEvent


def record_event(
    *,
    actor,
    organization,
    action,
    object_type,
    object_id="",
    metadata=None,
):
    return AuditEvent.objects.create(
        actor=actor,
        organization=organization,
        action=action,
        object_type=object_type,
        object_id=str(object_id) if object_id else "",
        metadata=metadata or {},
    )
