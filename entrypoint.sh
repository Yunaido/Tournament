#!/bin/sh
set -e

echo "Running migrations..."
python manage.py migrate --noinput

echo "Ensuring superuser exists..."
python manage.py shell <<'PYEOF'
import os
from django.contrib.auth.models import User
from accounts.models import PlayerProfile

username = os.environ.get("ADMIN_USER", "admin")
password = os.environ.get("ADMIN_PASSWORD", "adminadmin")
email = os.environ.get("ADMIN_EMAIL", "admin@local.dev")

if not User.objects.filter(username=username).exists():
    user = User.objects.create_superuser(username, email, password)
    PlayerProfile.objects.get_or_create(user=user, defaults={"display_name": "Admin"})
    print(f"Created superuser: {username}")
else:
    print(f"Superuser '{username}' already exists.")
PYEOF

# Seed test data if SEED_DATA=1
if [ "${SEED_DATA:-0}" = "1" ]; then
  echo "Seeding test data..."
  python manage.py seed
fi

echo "Starting gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --timeout 120
