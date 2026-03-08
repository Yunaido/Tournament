from django import forms
from django.contrib import admin

from .models import EventType, Match, Round, Tournament, TournamentPlayer


class ColorInput(forms.TextInput):
    """Color picker widget for hex colors."""
    input_type = "color"

    def format_value(self, value):
        if not value:
            return "#000000"
        return value


class EventTypeAdminForm(forms.ModelForm):
    use_accent_color = forms.BooleanField(
        required=False,
        initial=True,
        label="Use accent color",
        help_text="Uncheck to remove the accent color (no badge will be shown).",
    )

    class Meta:
        model = EventType
        fields = "__all__"
        widgets = {
            "accent_color": ColorInput(
                attrs={"style": "width:60px;height:34px;padding:2px;cursor:pointer;"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and not self.instance.accent_color:
            self.fields["use_accent_color"].initial = False

    def clean(self):
        cleaned = super().clean()
        if not cleaned.get("use_accent_color"):
            cleaned["accent_color"] = ""
        return cleaned


class TournamentPlayerInline(admin.TabularInline):
    model = TournamentPlayer
    extra = 0


class RoundInline(admin.TabularInline):
    model = Round
    extra = 0
    show_change_link = True


class MatchInline(admin.TabularInline):
    model = Match
    extra = 0


@admin.register(EventType)
class EventTypeAdmin(admin.ModelAdmin):
    form = EventTypeAdminForm
    list_display = ("name", "color_preview", "sort_order")
    list_editable = ("sort_order",)

    @admin.display(description="Color")
    def color_preview(self, obj):
        if not obj.accent_color:
            return "—"
        from django.utils.html import format_html
        return format_html(
            '<span style="display:inline-block;width:20px;height:20px;'
            'border-radius:4px;background:{};vertical-align:middle;"></span> {}',
            obj.accent_color, obj.accent_color,
        )


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = ("name", "event_type", "date", "status", "num_players", "current_round")
    list_filter = ("status", "event_type")
    inlines = [TournamentPlayerInline, RoundInline]


@admin.register(Round)
class RoundAdmin(admin.ModelAdmin):
    list_display = ("tournament", "number", "status")
    list_filter = ("status",)
    inlines = [MatchInline]


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = (
        "round",
        "player1",
        "player2",
        "player1_score",
        "player2_score",
        "confirmed",
        "is_bye",
    )
    list_filter = ("confirmed", "is_bye")
