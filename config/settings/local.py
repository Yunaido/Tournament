"""Local development settings — SQLite, DEBUG=True."""
import os
from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = True
ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Email: use Mailpit if EMAIL_HOST is set (e.g. via Docker), otherwise print to console.
_email_host = os.environ.get("EMAIL_HOST", "")
if _email_host:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = _email_host
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "1025"))
    EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "0") == "1"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
