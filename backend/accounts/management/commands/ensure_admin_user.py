from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from accounts.models import UserProfile
from organizations.models import Organization, Membership

User = get_user_model()

class Command(BaseCommand):
    help = "Ensures the default user exists."

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(email="nikitagavhade@gmail.com")
        user.set_password("Password123!")
        user.first_name = "Nikita"
        user.last_name = "Gavhade"
        user.email_verified = True
        user.save()
        UserProfile.objects.get_or_create(user=user)
        org, _ = Organization.objects.get_or_create(name="Nikita s Organization")
        Membership.objects.get_or_create(organization=org, user=user, role=Membership.Role.OWNER)
        if created:
            self.stdout.write(self.style.SUCCESS("Default user created successfully!"))
        else:
            self.stdout.write(self.style.SUCCESS("Default user updated successfully!"))
