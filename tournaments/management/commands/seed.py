"""
Seed the database with realistic test data for development.

Creates:
- 8 player accounts (password: "testpass123" for all)
- 1 active invite link
- 1 finished tournament with full results (6 players, 3 rounds)
- 1 active tournament mid-round-1 (8 players, some results reported)
- 1 setup tournament (open for registration, 3 players joined)

Usage:
    python manage.py seed           # seed fresh data
    python manage.py seed --flush   # wipe DB first, then seed
"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Invite, PlayerProfile
from tournaments.models import EventType, Match, Round, Tournament, TournamentPlayer


# ── Player definitions ───────────────────────────────────────────
PLAYERS = [
    {"username": "luffy",   "display_name": "Luffy",   "email": "luffy@crew.dev",   "color": "#e63946"},
    {"username": "zoro",    "display_name": "Zoro",    "email": "zoro@crew.dev",    "color": "#2d6a2d"},
    {"username": "nami",    "display_name": "Nami",    "email": "nami@crew.dev",    "color": "#f4a261"},
    {"username": "sanji",   "display_name": "Sanji",   "email": "sanji@crew.dev",   "color": "#ffd166"},
    {"username": "chopper", "display_name": "Chopper", "email": "chopper@crew.dev", "color": "#ef476f"},
    {"username": "robin",   "display_name": "Robin",   "email": "robin@crew.dev",   "color": "#6a0572"},
    {"username": "franky",  "display_name": "Franky",  "email": "franky@crew.dev",  "color": "#118ab2"},
    {"username": "brook",   "display_name": "Brook",   "email": "brook@crew.dev",   "color": "#073b4c"},
]

TOURNAMENT_COLORS = {
    "East Blue Showdown":    "#e63946",
    "Grand Line Cup":        "#118ab2",
    "New World Invitational": "#ffd166",
}

PASSWORD = "testpass123"


def _make_avatar_svg(initial: str, color: str) -> bytes:
    """Generate a simple circular SVG avatar with a letter initial."""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">'
        f'<circle cx="50" cy="50" r="50" fill="{color}"/>'
        f'<text x="50" y="50" dominant-baseline="central" text-anchor="middle" '
        f'font-family="sans-serif" font-size="48" font-weight="bold" fill="#ffffff">{initial}</text>'
        f'</svg>'
    )
    return svg.encode()


def _make_logo_svg(label: str, color: str) -> bytes:
    """Generate a simple rounded-rectangle SVG tournament logo."""
    # Shorten label to first word for display
    short = label.split()[0]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
        f'<rect width="200" height="200" rx="24" fill="{color}"/>'
        f'<text x="100" y="100" dominant-baseline="central" text-anchor="middle" '
        f'font-family="sans-serif" font-size="32" font-weight="bold" fill="#ffffff">{short}</text>'
        f'</svg>'
    )
    return svg.encode()


class Command(BaseCommand):
    help = "Seed the database with test data for development."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all existing data before seeding.",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self.stdout.write("Flushing existing data...")
            Match.objects.all().delete()
            Round.objects.all().delete()
            TournamentPlayer.objects.all().delete()
            Tournament.objects.all().delete()
            Invite.objects.all().delete()
            PlayerProfile.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            EventType.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Flushed."))

        admin = self._ensure_admin()
        players = self._create_players(admin)
        self._create_invite(admin)
        self._create_event_types()
        self._create_finished_tournament(admin, players[:6])
        self._create_active_tournament(admin, players)
        self._create_setup_tournament(admin, players[:3])

        self.stdout.write(self.style.SUCCESS("\n✅ Seed complete!"))
        self.stdout.write(f"   Login as any player with password: {PASSWORD}")
        self.stdout.write(f"   Players: {', '.join(p['username'] for p in PLAYERS)}")
        self.stdout.write(f"   Admin: admin / adminadmin")

    # ── Helpers ───────────────────────────────────────────────────

    def _ensure_admin(self) -> User:
        """Make sure the admin superuser exists."""
        user, created = User.objects.get_or_create(
            username="admin",
            defaults={"email": "admin@local.dev", "is_staff": True, "is_superuser": True},
        )
        if created:
            user.set_password("adminadmin")
            user.save()
        PlayerProfile.objects.get_or_create(
            user=user, defaults={"display_name": "Admin"}
        )
        return user

    def _create_players(self, admin: User) -> list[User]:
        """Create all test player accounts."""
        users = []
        for p in PLAYERS:
            user, created = User.objects.get_or_create(
                username=p["username"],
                defaults={"email": p["email"]},
            )
            if created:
                user.set_password(PASSWORD)
                user.save()
                PlayerProfile.objects.create(
                    user=user,
                    display_name=p["display_name"],
                    invited_by=admin,
                    avatar_data=_make_avatar_svg(p["display_name"][0], p["color"]),
                )
                self.stdout.write(f"  Created player: {p['username']}")
            else:
                self.stdout.write(f"  Player exists:  {p['username']}")
            users.append(user)
        return users

    def _create_event_types(self):
        """Create default event types."""
        defaults = [
            {"name": "Casual", "accent_color": "", "sort_order": 0},
            {"name": "Competitive", "accent_color": "#118ab2", "sort_order": 1},
            {"name": "Championship", "accent_color": "#e63946", "sort_order": 2},
            {"name": "Draft", "accent_color": "#6a0572", "sort_order": 3},
            {"name": "Other", "accent_color": "#6c757d", "sort_order": 4},
        ]
        for d in defaults:
            obj, created = EventType.objects.get_or_create(
                name=d["name"],
                defaults={
                    "accent_color": d["accent_color"],
                    "sort_order": d["sort_order"],
                },
            )
            if created:
                self.stdout.write(f"  Created event type: {d['name']}")

    def _create_invite(self, admin: User) -> Invite:
        """Create an active invite link from admin."""
        invite, created = Invite.objects.get_or_create(
            created_by=admin,
            label="Dev Invite",
            defaults={
                "max_uses": 0,  # unlimited
                "is_active": True,
            },
        )
        if created:
            self.stdout.write(f"  Created invite: {invite.token}")
        else:
            self.stdout.write(f"  Invite exists:  {invite.token}")
        return invite

    def _confirm_match(self, match: Match, p1_result: str, p2_result: str):
        """Simulate both players reporting and auto-confirm."""
        match.player1_result = p1_result
        match.player1_confirmed = True
        match.player2_result = p2_result
        match.player2_confirmed = True

        score_map = {"WIN": (2, 0), "LOSS": (0, 2), "DRAW": (1, 1)}
        match.player1_score, match.player2_score = score_map[p1_result]
        match.confirmed = True
        match.save()

    def _create_finished_tournament(self, admin: User, players: list[User]):
        """Create a fully completed tournament with 3 rounds."""
        name = "East Blue Showdown"
        if Tournament.objects.filter(name=name).exists():
            self.stdout.write(f"  Tournament exists: {name}")
            return

        tournament = Tournament.objects.create(
            name=name,
            description="A completed tournament with full results.",
            created_by=admin,
            date=timezone.now().date() - timedelta(days=7),
            status=Tournament.Status.FINISHED,
            event_type=EventType.objects.get(name="Championship"),
            max_rounds=3,
            current_round=3,
            logo_data=_make_logo_svg(name, TOURNAMENT_COLORS[name]),
        )

        # Register players
        tps = []
        for i, user in enumerate(players):
            tp = TournamentPlayer.objects.create(
                tournament=tournament, user=user, seed=i + 1
            )
            tps.append(tp)

        # ── Round 1 ──────────────────────────────────────────────
        r1 = Round.objects.create(
            tournament=tournament, number=1, status=Round.Status.COMPLETED
        )
        pairings_r1 = [(0, 1), (2, 3), (4, 5)]
        results_r1 = [("WIN", "LOSS"), ("LOSS", "WIN"), ("WIN", "LOSS")]
        for (i, j), (res1, res2) in zip(pairings_r1, results_r1):
            m = Match.objects.create(round=r1, player1=tps[i], player2=tps[j])
            self._confirm_match(m, res1, res2)

        # ── Round 2 ──────────────────────────────────────────────
        r2 = Round.objects.create(
            tournament=tournament, number=2, status=Round.Status.COMPLETED
        )
        # Winners vs winners, losers vs losers
        pairings_r2 = [(0, 3), (4, 1), (2, 5)]
        results_r2 = [("WIN", "LOSS"), ("LOSS", "WIN"), ("DRAW", "DRAW")]
        for (i, j), (res1, res2) in zip(pairings_r2, results_r2):
            m = Match.objects.create(round=r2, player1=tps[i], player2=tps[j])
            self._confirm_match(m, res1, res2)

        # ── Round 3 ──────────────────────────────────────────────
        r3 = Round.objects.create(
            tournament=tournament, number=3, status=Round.Status.COMPLETED
        )
        pairings_r3 = [(0, 1), (3, 4), (2, 5)]
        results_r3 = [("WIN", "LOSS"), ("WIN", "LOSS"), ("WIN", "LOSS")]
        for (i, j), (res1, res2) in zip(pairings_r3, results_r3):
            m = Match.objects.create(round=r3, player1=tps[i], player2=tps[j])
            self._confirm_match(m, res1, res2)

        # Update player profiles with lifetime stats from this tournament
        from tournaments.scoring import compute_standings as cs
        standings = cs(tournament)
        for row in standings:
            profile = row.player.user.profile
            profile.total_match_wins += row.wins
            profile.total_match_losses += row.losses
            profile.total_match_draws += row.draws
            profile.tournaments_played += 1
            if row.rank == 1:
                profile.tournaments_won += 1
            profile.save()

        self.stdout.write(f"  Created tournament: {name} (FINISHED, 3 rounds)")

    def _create_active_tournament(self, admin: User, players: list[User]):
        """
        Create a tournament mid-round-1.
        Some matches have results, some are pending — ready for manual testing.
        """
        name = "Grand Line Cup"
        if Tournament.objects.filter(name=name).exists():
            self.stdout.write(f"  Tournament exists: {name}")
            return

        tournament = Tournament.objects.create(
            name=name,
            description="An active tournament — Round 1 in progress, some results missing.",
            created_by=admin,
            date=timezone.now().date(),
            status=Tournament.Status.ACTIVE,
            location_name="Grand Line Card Shop, Sabaody",
            location_url="https://maps.google.com/?q=Grand+Line+Card+Shop",
            event_type=EventType.objects.get(name="Competitive"),
            max_rounds=3,
            current_round=1,
            logo_data=_make_logo_svg(name, TOURNAMENT_COLORS[name]),
        )

        tps = []
        for i, user in enumerate(players):
            tp = TournamentPlayer.objects.create(
                tournament=tournament, user=user, seed=i + 1
            )
            tps.append(tp)

        r1 = Round.objects.create(
            tournament=tournament, number=1, status=Round.Status.ACTIVE
        )

        # 8 players → 4 matches
        # Match 1: fully confirmed
        m1 = Match.objects.create(round=r1, player1=tps[0], player2=tps[1])
        self._confirm_match(m1, "WIN", "LOSS")

        # Match 2: player1 reported, waiting for player2
        m2 = Match.objects.create(round=r1, player1=tps[2], player2=tps[3])
        m2.player1_result = "WIN"
        m2.player1_confirmed = True
        m2.save()

        # Match 3: no reports yet (fresh)
        Match.objects.create(round=r1, player1=tps[4], player2=tps[5])

        # Match 4: no reports yet (fresh)
        Match.objects.create(round=r1, player1=tps[6], player2=tps[7])

        self.stdout.write(
            f"  Created tournament: {name} (ACTIVE, R1 — 1 confirmed, 1 partial, 2 pending)"
        )

    def _create_setup_tournament(self, admin: User, players: list[User]):
        """Create a tournament in SETUP (registration open)."""
        name = "New World Invitational"
        if Tournament.objects.filter(name=name).exists():
            self.stdout.write(f"  Tournament exists: {name}")
            return

        tournament = Tournament.objects.create(
            name=name,
            description="Open for registration — join and start when ready!",
            created_by=admin,
            date=timezone.now().date() + timedelta(days=3),
            status=Tournament.Status.SETUP,
            event_type=EventType.objects.get(name="Casual"),
            location_name="Baratie Restaurant, East Blue",
            logo_data=_make_logo_svg(name, TOURNAMENT_COLORS[name]),
        )

        for i, user in enumerate(players):
            TournamentPlayer.objects.create(
                tournament=tournament, user=user, seed=i + 1
            )

        self.stdout.write(
            f"  Created tournament: {name} (SETUP, {len(players)} players registered)"
        )
