import logging
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, close_old_connections

from mqtt_integration.client import MqttBridge, MqttConfigurationError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run the authenticated TLS MQTT bridge and command outbox worker."

    def handle(self, *args, **options):
        try:
            bridge = MqttBridge()
        except MqttConfigurationError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write("Starting MQTT bridge worker. Press Ctrl+C to stop.")
        bridge.start()
        try:
            while True:
                close_old_connections()
                try:
                    bridge.maintain_lifecycle()
                    bridge.publish_pending_commands()
                except DatabaseError:
                    logger.exception("Database failure in MQTT worker cycle.")
                time.sleep(settings.MQTT_COMMAND_POLL_SECONDS)
        except KeyboardInterrupt:
            self.stdout.write("Stopping MQTT bridge worker.")
        finally:
            bridge.stop()
