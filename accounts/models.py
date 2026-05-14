import uuid

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.db.models import F
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
        Invite.objects.filter(pk=self.pk).update(times_used=F("times_used") + 1)
        self.refresh_from_db(fields=["times_used"])


class EmailVerification(models.Model):
    """
    Token-based email verification for registration and email changes.
    Stored tokens expire after EMAIL_VERIFICATION_MAX_AGE seconds.
    """

    class Purpose(models.TextChoices):
        REGISTRATION = "REGISTRATION", "Registration"
        EMAIL_CHANGE = "EMAIL_CHANGE", "Email Change"

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_verifications",
    )
    email = models.EmailField(help_text="The email address to verify.")
    purpose = models.CharField(max_length=15, choices=Purpose.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.purpose} verification for {self.email}"

    @property
    def is_valid(self) -> bool:
        if self.used:
            return False
        max_age = getattr(settings, "EMAIL_VERIFICATION_MAX_AGE", 86400)
        return (timezone.now() - self.created_at).total_seconds() < max_age


class PlayerProfile(models.Model):
    """
    Extends the Django User with tournament-specific fields.
    One profile per user, tracks lifetime stats across all tournaments.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=100)
    avatar_data = models.BinaryField(
        blank=True,
        null=True,
        editable=True,
        help_text="Profile picture stored as WebP binary.",
    )
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
    def avatar_url(self):
        """Return the avatar URL or a default based on user pk."""
        if self.avatar_data:
            from django.urls import reverse
            return reverse("accounts:serve_avatar", args=[self.user.pk])
        # Cycle through 5 default avatars
        idx = (self.user.pk % 5) + 1
        from django.templatetags.static import static
        return static(f"img/defaults/avatar_{idx}.svg")

    @property
    def win_rate(self):
        total = self.total_matches
        if total == 0:
            return 0.0
        return self.total_match_wins / total


class WebAuthnCredential(models.Model):
    """A registered WebAuthn passkey for passwordless login."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="webauthn_credentials"
    )
    name = models.CharField(max_length=100, default="My passkey")
    credential_id = models.BinaryField(unique=True)
    public_key = models.BinaryField()
    sign_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.user})"


class PushSubscription(models.Model):
    """A Web Push subscription for browser notifications."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.TextField()
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "endpoint")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Push subscription for {self.user}"


class NotificationPreference(models.Model):
    """Per-user notification preferences — controls which push events are sent."""

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="notification_preference"
    )
    round_started = models.BooleanField(default=True, help_text="New round started in a tournament you're in.")
    match_confirmed = models.BooleanField(default=True, help_text="Your match result was confirmed.")
    result_reported = models.BooleanField(default=True, help_text="Your opponent reported a result.")
    tournament_finished = models.BooleanField(default=True, help_text="A tournament you're in has finished.")

    def __str__(self):
        return f"Notification prefs for {self.user}"
