# Migration: Replace ImageField logo with BinaryField logo_data

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0003_tournament_logo"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tournament",
            name="logo",
        ),
        migrations.AddField(
            model_name="tournament",
            name="logo_data",
            field=models.BinaryField(
                blank=True,
                null=True,
                editable=True,
                help_text="Tournament logo stored as WebP binary.",
            ),
        ),
    ]
