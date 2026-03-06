# Generated migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0002_match_player1_result_match_player2_result"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="logo",
            field=models.ImageField(
                blank=True,
                help_text="Tournament logo. A default will be used if left blank.",
                upload_to="tournament_logos/",
            ),
        ),
    ]
