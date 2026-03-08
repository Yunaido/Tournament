import math

from django.conf import settings
from django.db import models
from django.utils import timezone


class Tournament(models.Model):
    """A One Piece TCG tournament using Swiss-system pairing."""

    class Status(models.TextChoices):
        SETUP = "SETUP", "Setup"          # Accepting registrations
        ACTIVE = "ACTIVE", "Active"       # Rounds in progress
        FINISHED = "FINISHED", "Finished" # All rounds done, winner declared

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location_name = models.CharField(
        max_length=300,
        blank=True,
        help_text="Venue name or address (visible only to logged-in users).",
    )
    location_url = models.URLField(
        blank=True,
        help_text="Link to a map or venue page (e.g. Google Maps URL).",
    )
    logo_data = models.BinaryField(
        blank=True,
        null=True,
        editable=True,
        help_text="Tournament logo stored as WebP binary.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_tournaments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    date = models.DateField(default=timezone.now)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.SETUP,
    )
    max_rounds = models.PositiveIntegerField(
        default=0,
        help_text="0 = auto-calculate from player count (ceil(log2(n))).",
    )
    current_round = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.name

    @property
    def num_players(self):
        return self.players.count()

    @property
    def computed_max_rounds(self) -> int:
        """Return explicit max_rounds or auto-calculate from player count."""
        if self.max_rounds > 0:
            return self.max_rounds
        n = self.num_players
        if n < 2:
            return 1
        return math.ceil(math.log2(n))

    @property
    def is_last_round(self) -> bool:
        return self.current_round >= self.computed_max_rounds

    def get_winner(self):
        """Return the TournamentPlayer ranked #1, or None."""
        standings = self.compute_standings()
        return standings[0] if standings else None

    @property
    def logo_url(self):
        """Return the logo URL or a default based on pk."""
        if self.logo_data:
            from django.urls import reverse
            return reverse("tournament_logo", args=[self.pk])
        idx = (self.pk % 5) + 1
        from django.templatetags.static import static
        return static(f"img/defaults/tournament_{idx}.svg")

    def compute_standings(self):
        """Compute full standings with OP TCG tiebreakers."""
        from .scoring import compute_standings

        return compute_standings(self)


class TournamentPlayer(models.Model):
    """A player's registration in a specific tournament."""

    tournament = models.ForeignKey(
        Tournament, on_delete=models.CASCADE, related_name="players"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tournament_entries",
    )
    seed = models.PositiveIntegerField(default=0)
    dropped = models.BooleanField(default=False)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("tournament", "user")
        ordering = ["seed"]

    def __str__(self):
        return f"{self.user.profile.display_name} @ {self.tournament.name}"


class Round(models.Model):
    """A single round in a tournament."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"      # Matches created, not yet started
        ACTIVE = "ACTIVE", "Active"         # Players entering results
        COMPLETED = "COMPLETED", "Completed" # All results confirmed

    tournament = models.ForeignKey(
        Tournament, on_delete=models.CASCADE, related_name="rounds"
    )
    number = models.PositiveIntegerField()
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("tournament", "number")
        ordering = ["number"]

    def __str__(self):
        return f"Round {self.number} – {self.tournament.name}"

    @property
    def all_confirmed(self) -> bool:
        """True when every match in this round has a confirmed result."""
        return not self.matches.filter(confirmed=False).exists()


class Match(models.Model):
    """A single match between two players (or a BYE)."""

    round = models.ForeignKey(Round, on_delete=models.CASCADE, related_name="matches")
    player1 = models.ForeignKey(
        TournamentPlayer,
        on_delete=models.CASCADE,
        related_name="matches_as_p1",
    )
    # player2 is NULL for a BYE
    player2 = models.ForeignKey(
        TournamentPlayer,
        on_delete=models.CASCADE,
        related_name="matches_as_p2",
        null=True,
        blank=True,
    )
    class Result(models.TextChoices):
        WIN = "WIN", "Win"
        LOSS = "LOSS", "Loss"
        DRAW = "DRAW", "Draw"

    player1_score = models.PositiveIntegerField(default=0)
    player2_score = models.PositiveIntegerField(default=0)

    # Each player's self-reported outcome (from THEIR perspective)
    player1_result = models.CharField(max_length=4, choices=Result.choices, blank=True)
    player2_result = models.CharField(max_length=4, choices=Result.choices, blank=True)

    # Self-reporting: each player confirms the result
    player1_confirmed = models.BooleanField(default=False)
    player2_confirmed = models.BooleanField(default=False)

    # Overall confirmation (both players agree or admin override)
    confirmed = models.BooleanField(default=False)

    is_bye = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["round__number", "id"]

    def __str__(self):
        p2 = self.player2 or "BYE"
        return f"{self.player1} vs {p2} (R{self.round.number})"

    @property
    def winner(self):
        """Return the winning TournamentPlayer, or None for a draw."""
        if self.is_bye:
            return self.player1
        if not self.confirmed:
            return None
        if self.player1_score > self.player2_score:
            return self.player1
        if self.player2_score > self.player1_score:
            return self.player2
        return None  # draw

    OPPOSITE = {"WIN": "LOSS", "LOSS": "WIN", "DRAW": "DRAW"}

    def check_confirmation(self):
        """Auto-confirm when both players reported and results are consistent."""
        if self.is_bye:
            self.confirmed = True
            self.save(update_fields=["confirmed"])
            return

        if not (self.player1_confirmed and self.player2_confirmed):
            return

        # Results are consistent if p1's claim is the opposite of p2's claim
        # e.g. p1=WIN + p2=LOSS, or p1=DRAW + p2=DRAW
        if self.OPPOSITE.get(self.player1_result) == self.player2_result:
            # Consistent — set scores and confirm
            score_map = {"WIN": (2, 0), "LOSS": (0, 2), "DRAW": (1, 1)}
            p1_score, p2_score = score_map[self.player1_result]
            self.player1_score = p1_score
            self.player2_score = p2_score
            self.confirmed = True
            self.save(update_fields=[
                "player1_score", "player2_score", "confirmed"
            ])
        else:
            # Conflict — reset both, players must re-report
            self.player1_confirmed = False
            self.player2_confirmed = False
            self.player1_result = ""
            self.player2_result = ""
            self.save(update_fields=[
                "player1_confirmed", "player2_confirmed",
                "player1_result", "player2_result",
            ])
