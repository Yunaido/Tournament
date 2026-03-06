# Generated migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_playerprofile_invited_by"),
    ]

    operations = [
        migrations.AddField(
            model_name="playerprofile",
            name="avatar",
            field=models.ImageField(
                blank=True,
                help_text="Profile picture. A default will be assigned if left blank.",
                upload_to="avatars/",
            ),
        ),
    ]
