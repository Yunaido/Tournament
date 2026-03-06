"""Production settings — PostgreSQL, DEBUG=False."""
import os

from .base import *  # noqa: F401,F403

DEBUG = False
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "*").split(",")

SECRET_KEY = os.environ.get("SECRET_KEY", SECRET_KEY)  # noqa: F405

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "optcg"),
        "USER": os.environ.get("POSTGRES_USER", "optcg"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "optcg"),
        "HOST": os.environ.get("POSTGRES_HOST", "postgres"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

CSRF_TRUSTED_ORIGINS = [
    f"http://localhost:8000",
    f"http://127.0.0.1:8000",
]
