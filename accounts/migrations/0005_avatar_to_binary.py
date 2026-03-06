# Migration: Replace ImageField avatar with BinaryField avatar_data

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_playerprofile_avatar"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="playerprofile",
            name="avatar",
        ),
        migrations.AddField(
            model_name="playerprofile",
            name="avatar_data",
            field=models.BinaryField(
                blank=True,
                null=True,
                editable=True,
                help_text="Profile picture stored as WebP binary.",
            ),
        ),
    ]
