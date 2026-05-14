"""
Generate VAPID key pair for Web Push notifications.

Usage:
    python manage.py generate_vapid_keys

Outputs the keys as environment variable assignments you can add to your
.env or Docker Compose configuration.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a VAPID key pair for Web Push notifications."

    def handle(self, *args, **options):
        try:
            from py_vapid import Vapid
        except ImportError:
            self.stderr.write(
                self.style.ERROR(
                    "py_vapid is not installed. Install it with: pip install py_vapid"
                )
            )
            return

        vapid = Vapid()
        vapid.generate_keys()

        raw_pub = vapid.public_key.public_bytes(
            encoding=__import__("cryptography").hazmat.primitives.serialization.Encoding.X962,
            format=__import__("cryptography").hazmat.primitives.serialization.PublicFormat.UncompressedPoint,
        )
        import base64
        application_server_key = base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode()

        raw_priv = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
        private_key_b64 = base64.urlsafe_b64encode(raw_priv).rstrip(b"=").decode()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("VAPID keys generated successfully!"))
        self.stdout.write("")
        self.stdout.write("Add these to your environment variables:")
        self.stdout.write("")
        self.stdout.write(f'VAPID_PUBLIC_KEY="{application_server_key}"')
        self.stdout.write(f'VAPID_PRIVATE_KEY="{private_key_b64}"')
        self.stdout.write('VAPID_CLAIM_EMAIL="mailto:your-email@example.com"')
        self.stdout.write("")
