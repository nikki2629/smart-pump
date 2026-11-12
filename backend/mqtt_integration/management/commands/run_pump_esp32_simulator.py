import logging
import time
from datetime import datetime, timezone
from django.core.management.base import BaseCommand

from pumps.models import Pump
from devices.models import Device
from organizations.models import Organization
from accounts.models import User
from commands.models import Command as PumpCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Runs live simulated ESP32 controllers for 3 Pumps that handle START, STOP, and FAULT state updates over WiFi."

    def add_arguments(self, parser):
        parser.add_argument("--pump-id", type=str, help="UUID of a specific single pump to simulate.")
        parser.add_argument("--count", type=int, default=3, help="Number of pumps to simulate (default: 3).")

    def handle(self, *args, **options):
        pump_id = options.get("pump_id")
        count = options.get("count", 3)

        org, _ = Organization.objects.get_or_create(name="Default Organization")
        user = User.objects.first()
        if not user:
            user = User.objects.create_user(email="operator@example.com", password="Password123!", is_email_verified=True)

        pumps_to_simulate = []

        if pump_id:
            pump = Pump.objects.filter(pk=pump_id).first()
            if not pump:
                self.stderr.write(self.style.ERROR(f"Pump with ID {pump_id} not found."))
                return
            pumps_to_simulate.append(pump)
        else:
            default_pumps_data = [
                {
                    "name": "Pump 1 - Borewell Main",
                    "location": "Sector 1 Field A",
                    "hp": 7.5,
                    "type": "Submersible",
                    "phase": "3-Phase",
                    "serial": "ESP32-PUMP-001",
                },
                {
                    "name": "Pump 2 - Irrigation Supply",
                    "location": "Sector 2 Field B",
                    "hp": 5.0,
                    "type": "Centrifugal",
                    "phase": "3-Phase",
                    "serial": "ESP32-PUMP-002",
                },
                {
                    "name": "Pump 3 - Booster Station",
                    "location": "Processing Station C",
                    "hp": 10.0,
                    "type": "Multistage",
                    "phase": "3-Phase",
                    "serial": "ESP32-PUMP-003",
                },
            ]

            for i in range(min(count, len(default_pumps_data))):
                data = default_pumps_data[i]
                pump, _ = Pump.objects.get_or_create(
                    name=data["name"],
                    defaults={
                        "location": data["location"],
                        "motor_capacity_hp": data["hp"],
                        "motor_type": data["type"],
                        "phase_configuration": data["phase"],
                        "organization": org,
                        "created_by": user,
                    },
                )
                pumps_to_simulate.append(pump)

        self.stdout.write(self.style.SUCCESS("=" * 65))
        self.stdout.write(self.style.SUCCESS("  ESP32 3-PUMP CONTROLLER SIMULATOR READY (WiFi + MQTT Connected)"))
        self.stdout.write(self.style.SUCCESS("=" * 65))

        sim_states = {}

        for pump in pumps_to_simulate:
            device, _ = Device.objects.get_or_create(
                pump=pump,
                defaults={
                    "organization": pump.organization,
                    "serial_number": f"ESP32-PUMP-{str(pump.pk)[:8].upper()}",
                    "name": f"ESP32 Controller for {pump.name}",
                    "provisioning_status": Device.ProvisioningStatus.PAIRED,
                },
            )
            if device.provisioning_status != Device.ProvisioningStatus.PAIRED:
                device.provisioning_status = Device.ProvisioningStatus.PAIRED
                device.save(update_fields=("provisioning_status",))

            sim_states[pump.pk] = {
                "pump": pump,
                "device": device,
                "motor_feedback": "stopped",
            }

            self.stdout.write(self.style.SUCCESS(f"  PUMP       : {pump.name} ({pump.pk})"))
            self.stdout.write(self.style.SUCCESS(f"  ESP32 DEV  : {device.name} ({device.serial_number})"))
            self.stdout.write("-" * 65)

        self.stdout.write("Listening for START / STOP commands for all pumps...")

        try:
            while True:
                for pump_pk, sim in sim_states.items():
                    pump = sim["pump"]
                    device = sim["device"]

                    # Update device online status & physical motor feedback
                    device.motor_feedback = sim["motor_feedback"]
                    device.motor_feedback_source = "auxiliary_contact"
                    device.motor_feedback_valid = True
                    device.last_seen_at = datetime.now(timezone.utc)
                    device.save(update_fields=("motor_feedback", "motor_feedback_source", "motor_feedback_valid", "last_seen_at", "updated_at"))

                    # Check for pending authorized or published commands
                    pending = PumpCommand.objects.filter(
                        pump=pump,
                        status__in=[PumpCommand.Status.AUTHORIZED, PumpCommand.Status.PUBLISHED],
                    ).order_by("created_at").first()

                    if pending:
                        self.stdout.write(
                            self.style.WARNING(
                                f"\n[ESP32-{pump.name}] RECEIVED COMMAND: {pending.action.upper()} (Command ID: {pending.pk})"
                            )
                        )
                        time.sleep(1)  # Simulate contactor actuation delay

                        if pending.action == "start":
                            sim["motor_feedback"] = "running"
                            pending.status = PumpCommand.Status.SUCCEEDED
                            pending.result_outcome = "completed"
                            pending.result_code = "execution_complete"
                            pending.save()
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"[ESP32-{pump.name}] MOTOR STARTED! Physical auxiliary contact closed. Status: RUNNING"
                                )
                            )
                        elif pending.action == "stop":
                            sim["motor_feedback"] = "stopped"
                            pending.status = PumpCommand.Status.SUCCEEDED
                            pending.result_outcome = "completed"
                            pending.result_code = "execution_complete"
                            pending.save()
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"[ESP32-{pump.name}] MOTOR STOPPED! Contactor opened. Status: STOPPED"
                                )
                            )

                time.sleep(2)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("\nESP32 Controller Simulator stopped."))
