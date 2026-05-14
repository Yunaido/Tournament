"""Add PushSubscription and NotificationPreference models for Web Push notifications."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounts", "0007_email_verification"),
    ]

    operations = [
        migrations.CreateModel(
            name="PushSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("endpoint", models.TextField()),
                ("p256dh", models.CharField(max_length=200)),
                ("auth", models.CharField(max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="push_subscriptions", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("user", "endpoint")},
            },
        ),
        migrations.CreateModel(
            name="NotificationPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("round_started", models.BooleanField(default=True, help_text="New round started in a tournament you're in.")),
                ("match_confirmed", models.BooleanField(default=True, help_text="Your match result was confirmed.")),
                ("result_reported", models.BooleanField(default=True, help_text="Your opponent reported a result.")),
                ("tournament_finished", models.BooleanField(default=True, help_text="A tournament you're in has finished.")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="notification_preference", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
