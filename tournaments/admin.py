from django.contrib import admin

from .models import Match, Round, Tournament, TournamentPlayer


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


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = ("name", "date", "status", "num_players", "current_round")
    list_filter = ("status",)
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
