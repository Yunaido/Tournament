import django.core.validators
import django.db.models.deletion
from django.db import migrations, models

DEFAULT_EVENT_TYPES = [
    {"name": "Casual", "accent_color": "", "sort_order": 0},
    {"name": "Competitive", "accent_color": "#118ab2", "sort_order": 1},
    {"name": "Championship", "accent_color": "#e63946", "sort_order": 2},
    {"name": "Draft", "accent_color": "#6a0572", "sort_order": 3},
    {"name": "Other", "accent_color": "#6c757d", "sort_order": 4},
]


def seed_event_types(apps, schema_editor):
    EventType = apps.get_model("tournaments", "EventType")
    for et in DEFAULT_EVENT_TYPES:
        EventType.objects.get_or_create(
            name=et["name"],
            defaults={
                "accent_color": et["accent_color"],
                "sort_order": et["sort_order"],
            },
        )


def assign_default_event_type(apps, schema_editor):
    EventType = apps.get_model("tournaments", "EventType")
    Tournament = apps.get_model("tournaments", "Tournament")
    casual = EventType.objects.get(name="Casual")
    Tournament.objects.filter(event_type__isnull=True).update(event_type=casual)


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0005_add_location_fields"),
    ]

    operations = [
        # 1. Create EventType model
        migrations.CreateModel(
            name="EventType",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=50, unique=True)),
                (
                    "accent_color",
                    models.CharField(
                        blank=True,
                        max_length=7,
                        help_text="Hex color code (e.g. #e63946). Leave blank for no accent.",
                        validators=[
                            django.core.validators.RegexValidator(
                                regex="^#[0-9a-fA-F]{6}$",
                                message="Enter a valid hex color code (e.g. #e63946).",
                            )
                        ],
                    ),
                ),
                (
                    "sort_order",
                    models.PositiveIntegerField(
                        default=0,
                        help_text="Lower numbers appear first in dropdowns.",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "name"],
            },
        ),
        # 2. Seed default event types
        migrations.RunPython(seed_event_types, migrations.RunPython.noop),
        # 3. Add event_type FK (nullable initially)
        migrations.AddField(
            model_name="tournament",
            name="event_type",
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="tournaments",
                to="tournaments.eventtype",
                help_text="The type of event.",
            ),
        ),
        # 4. Point existing tournaments to "Casual"
        migrations.RunPython(assign_default_event_type, migrations.RunPython.noop),
        # 5. Make FK non-nullable
        migrations.AlterField(
            model_name="tournament",
            name="event_type",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="tournaments",
                to="tournaments.eventtype",
                help_text="The type of event.",
            ),
        ),
        # 6. Update Tournament ordering to sort by date, event type, then created_at
        migrations.AlterModelOptions(
            name="tournament",
            options={"ordering": ["-date", "-event_type__sort_order", "-created_at"]},
        ),
    ]
