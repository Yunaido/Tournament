from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0005_add_location_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="start_time",
            field=models.TimeField(
                blank=True,
                null=True,
                help_text="Optional start time of the tournament.",
            ),
        ),
    ]
