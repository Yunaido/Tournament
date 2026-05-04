"""
Web Push notification helpers.

Each public function checks the user's NotificationPreference before sending.
Stale subscriptions (410 Gone) are automatically cleaned up.
"""
from __future__ import annotations

import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _get_vapid_claims() -> dict:
    return {"sub": settings.VAPID_CLAIM_EMAIL}


def _send_push(subscription_info: dict, payload: str) -> bool | None:
    """
    Send a single push message.
    Returns True on success, False on failure, None if subscription is stale (410).
    """
    private_key = settings.VAPID_PRIVATE_KEY
    if not private_key:
        logger.debug("VAPID_PRIVATE_KEY not set — skipping push notification.")
        return False

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — skipping push notification.")
        return False

    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=private_key,
            vapid_claims=_get_vapid_claims(),
        )
        return True
    except WebPushException as e:
        if hasattr(e, "response") and e.response is not None and e.response.status_code == 410:
            return None  # Subscription gone — caller should clean up
        logger.warning("Push notification failed: %s", e)
        return False
    except Exception:
        logger.exception("Unexpected error sending push notification")
        return False


def send_push_to_user(user, title: str, body: str, url: str = "/") -> int:
    """
    Send a push notification to all of a user's subscriptions.
    Returns the number of successfully delivered notifications.
    """
    if not settings.VAPID_PRIVATE_KEY:
        return 0

    from .models import PushSubscription

    subscriptions = list(PushSubscription.objects.filter(user=user))
    if not subscriptions:
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    stale_ids = []

    for sub in subscriptions:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        result = _send_push(sub_info, payload)
        if result is True:
            sent += 1
        elif result is None:
            stale_ids.append(sub.pk)

    if stale_ids:
        PushSubscription.objects.filter(pk__in=stale_ids).delete()
        logger.info("Cleaned up %d stale push subscriptions for user %s", len(stale_ids), user)

    return sent


def _get_user_pref(user):
    """Get or create notification preferences for user."""
    from .models import NotificationPreference
    pref, _ = NotificationPreference.objects.get_or_create(user=user)
    return pref


def notify_round_started(round_obj) -> None:
    """Notify all tournament participants that a new round has started."""
    tournament = round_obj.tournament
    participants = tournament.players.filter(dropped=False).select_related("user")

    for tp in participants:
        pref = _get_user_pref(tp.user)
        if not pref.round_started:
            continue

        # Find this player's match in the new round
        from tournaments.models import Match
        match = Match.objects.filter(
            round=round_obj,
        ).filter(
            models_q_player(tp)
        ).select_related("player1__user__profile", "player2__user__profile").first()

        if match and match.is_bye:
            body = f"Round {round_obj.number} — You have a BYE this round."
        elif match:
            opponent = match.player2 if match.player1 == tp else match.player1
            opponent_name = opponent.user.profile.display_name if opponent else "Unknown"
            body = f"Round {round_obj.number} — You're matched against {opponent_name}!"
        else:
            body = f"Round {round_obj.number} has started!"

        send_push_to_user(
            tp.user,
            title=f"🎮 {tournament.name}",
            body=body,
            url=f"/tournaments/{tournament.pk}/",
        )


def notify_result_reported(match, reporting_tp) -> None:
    """Notify the opponent that a result has been reported."""
    if match.is_bye or match.confirmed:
        return

    opponent_tp = match.player2 if match.player1 == reporting_tp else match.player1
    if not opponent_tp:
        return

    pref = _get_user_pref(opponent_tp.user)
    if not pref.result_reported:
        return

    reporter_name = reporting_tp.user.profile.display_name
    tournament = match.round.tournament
    send_push_to_user(
        opponent_tp.user,
        title=f"📝 {tournament.name}",
        body=f"{reporter_name} reported their result. Please report yours!",
        url=f"/matches/{match.pk}/report/",
    )


def notify_match_confirmed(match) -> None:
    """Notify both players that their match result was confirmed."""
    if match.is_bye:
        return

    tournament = match.round.tournament
    for tp in [match.player1, match.player2]:
        if not tp:
            continue
        pref = _get_user_pref(tp.user)
        if not pref.match_confirmed:
            continue

        send_push_to_user(
            tp.user,
            title=f"✅ {tournament.name}",
            body=f"Round {match.round.number} — Your match result has been confirmed!",
            url=f"/tournaments/{tournament.pk}/",
        )


def notify_tournament_finished(tournament) -> None:
    """Notify all participants that the tournament has finished."""
    from tournaments.scoring import compute_standings
    standings = compute_standings(tournament)
    winner_name = standings[0].player.user.profile.display_name if standings else "Unknown"

    participants = tournament.players.select_related("user")
    for tp in participants:
        pref = _get_user_pref(tp.user)
        if not pref.tournament_finished:
            continue

        send_push_to_user(
            tp.user,
            title=f"🏆 {tournament.name}",
            body=f"Tournament is over! Winner: {winner_name}",
            url=f"/tournaments/{tournament.pk}/",
        )


def models_q_player(tp):
    """Return Q filter for matches where tp is player1 or player2."""
    from django.db.models import Q
    return Q(player1=tp) | Q(player2=tp)
