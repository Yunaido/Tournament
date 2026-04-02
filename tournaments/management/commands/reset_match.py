"""
Reset a match between two players in a tournament to PENDING state.

Usage:
    python manage.py reset_match "Grand Line Cup" chopper robin
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from tournaments.models import Match, Tournament


class Command(BaseCommand):
    help = "Reset a match between two players to pending (no reports)."

    def add_arguments(self, parser):
        parser.add_argument("tournament", type=str, help="Tournament name")
        parser.add_argument("player1", type=str, help="Username of player 1")
        parser.add_argument("player2", type=str, help="Username of player 2")

    def handle(self, *args, **options):
        try:
            tournament = Tournament.objects.get(name=options["tournament"])
        except Tournament.DoesNotExist:
            raise CommandError(f"Tournament not found: {options['tournament']}")

        try:
            p1 = User.objects.get(username=options["player1"])
            p2 = User.objects.get(username=options["player2"])
        except User.DoesNotExist as e:
            raise CommandError(f"User not found: {e}")

        match = Match.objects.filter(
            round__tournament=tournament,
            player1__user__in=[p1, p2],
            player2__user__in=[p1, p2],
        ).first()

        if not match:
            raise CommandError(
                f"No match found between {options['player1']} and {options['player2']} "
                f"in {options['tournament']}"
            )

        match.player1_result = ""
        match.player2_result = ""
        match.player1_score = 0
        match.player2_score = 0
        match.player1_confirmed = False
        match.player2_confirmed = False
        match.confirmed = False
        match.save()

        self.stdout.write(f"Reset match {match.pk} to pending.")
