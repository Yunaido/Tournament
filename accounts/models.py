import uuid

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class Invite(models.Model):
    """An invite link required to register."""

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invites",
    )
    label = models.CharField(
        max_length=100,
        blank=True,
        help_text="Optional note, e.g. 'Discord group' or 'Store event'.",
    )
    max_uses = models.PositiveIntegerField(
        default=0,
        help_text="0 = unlimited uses.",
    )
    times_used = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Leave blank for no expiration.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invite {self.token.hex[:8]} by {self.created_by}"

    @property
    def is_valid(self) -> bool:
        if not self.is_active:
            return False
        if self.max_uses > 0 and self.times_used >= self.max_uses:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True

    def use(self):
        self.times_used += 1
        self.save(update_fields=["times_used"])


class PlayerProfile(models.Model):
    """
    Extends the Django User with tournament-specific fields.
    One profile per user, tracks lifetime stats across all tournaments.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=100)
    invited_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recruited",
        help_text="The user who invited this player.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # Lifetime aggregates (updated after each tournament finalizes)
    total_match_wins = models.PositiveIntegerField(default=0)
    total_match_losses = models.PositiveIntegerField(default=0)
    total_match_draws = models.PositiveIntegerField(default=0)
    tournaments_played = models.PositiveIntegerField(default=0)
    tournaments_won = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-tournaments_won", "-total_match_wins"]

    def __str__(self):
        return self.display_name

    @property
    def total_matches(self):
        return self.total_match_wins + self.total_match_losses + self.total_match_draws

    @property
    def win_rate(self):
        total = self.total_matches
        if total == 0:
            return 0.0
        return self.total_match_wins / total
