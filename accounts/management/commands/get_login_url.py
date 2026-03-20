"""Generate a sesame magic login URL for a user (for E2E testing)."""

import sesame.utils
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Print a magic login URL for the given username."

    def add_arguments(self, parser):
        parser.add_argument("username", type=str)

    def handle(self, *args, **options):
        user = User.objects.get(username=options["username"])
        token = sesame.utils.get_token(user)
        self.stdout.write(f"/accounts/login/email/verify/?sesame={token}")
