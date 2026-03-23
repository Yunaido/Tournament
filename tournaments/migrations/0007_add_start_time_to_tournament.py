from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0006_eventtype"),
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
