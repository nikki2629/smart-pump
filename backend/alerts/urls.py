from rest_framework.routers import SimpleRouter

from alerts.views import AlertViewSet

router = SimpleRouter()
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = router.urls
