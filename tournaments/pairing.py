"""
Swiss-system pairing with BYE handling.

Rules:
- Players with similar match-points are paired together.
- No rematches (same opponents don't play twice).
- If odd number of active players, the lowest-ranked without a prior BYE gets one.
- BYE = automatic 2-0 win, auto-confirmed.
"""
from __future__ import annotations

import random
from itertools import combinations

from .models import Match, Round, Tournament, TournamentPlayer
from .scoring import compute_standings

BYE_WIN_SCORE = 2
BYE_LOSS_SCORE = 0


def get_previous_opponents(tournament: Tournament) -> dict[int, set[int]]:
    """Build a map of player_pk → set of opponent_pks they've already faced."""
    opponents: dict[int, set[int]] = {}
    matches = Match.objects.filter(
        round__tournament=tournament,
    ).select_related("player1", "player2")

    for match in matches:
        if match.is_bye:
            continue
        p1, p2 = match.player1_id, match.player2_id
        opponents.setdefault(p1, set()).add(p2)
        opponents.setdefault(p2, set()).add(p1)

    return opponents


def get_players_with_bye(tournament: Tournament) -> set[int]:
    """Return PKs of players who already received a BYE."""
    return set(
        Match.objects.filter(
            round__tournament=tournament,
            is_bye=True,
        ).values_list("player1_id", flat=True)
    )


def _select_bye_candidate(
    active_players: list[TournamentPlayer],
    players_with_bye: set[int],
    standings_order: list[int],
) -> TournamentPlayer | None:
    """
    Pick the lowest-ranked active player who hasn't had a BYE yet.
    standings_order is a list of player PKs from best to worst.
    """
    if len(active_players) % 2 == 0:
        return None  # No BYE needed

    # Candidates: active players without a prior BYE, sorted worst-first
    candidates = [
        p for p in active_players if p.pk not in players_with_bye
    ]
    if not candidates:
        candidates = active_players  # All have had a BYE; pick anyone

    # Sort by standings position (worst = highest rank number)
    pk_to_rank = {pk: i for i, pk in enumerate(standings_order)}
    candidates.sort(key=lambda p: pk_to_rank.get(p.pk, 9999), reverse=True)

    return candidates[0]


def _pair_players(
    active_players: list[TournamentPlayer],
    previous_opponents: dict[int, set[int]],
    standings_order: list[int],
) -> list[tuple[TournamentPlayer, TournamentPlayer]]:
    """
    Pair players with similar rankings, avoiding rematches.
    Uses a greedy approach: sort by standings, pair adjacent players.
    Falls back to random pairing if no valid pair found.
    """
    pk_to_rank = {pk: i for i, pk in enumerate(standings_order)}
    sorted_players = sorted(active_players, key=lambda p: pk_to_rank.get(p.pk, 9999))

    paired: set[int] = set()
    pairs: list[tuple[TournamentPlayer, TournamentPlayer]] = []

    for i, p1 in enumerate(sorted_players):
        if p1.pk in paired:
            continue
        # Find nearest opponent they haven't played
        for p2 in sorted_players[i + 1 :]:
            if p2.pk in paired:
                continue
            prev = previous_opponents.get(p1.pk, set())
            if p2.pk not in prev:
                pairs.append((p1, p2))
                paired.add(p1.pk)
                paired.add(p2.pk)
                break

    # Handle leftover (shouldn't happen if BYE was assigned first)
    unpaired = [p for p in sorted_players if p.pk not in paired]
    # Force-pair remaining (allows rematches as last resort)
    while len(unpaired) >= 2:
        p1 = unpaired.pop(0)
        p2 = unpaired.pop(0)
        pairs.append((p1, p2))

    return pairs


def generate_round(tournament: Tournament) -> Round:
    """
    Generate the next round for a tournament.

    For round 1: random pairing.
    For subsequent rounds: Swiss pairing based on current standings.
    Returns the created Round with all Matches.
    """
    round_number = tournament.current_round + 1

    active_players = list(
        tournament.players.filter(dropped=False).select_related("user__profile")
    )

    if len(active_players) < 2:
        raise ValueError("Need at least 2 active players to generate a round.")

    # Get standings order (list of PKs, best first)
    if round_number == 1:
        random.shuffle(active_players)
        standings_order = [p.pk for p in active_players]
    else:
        standings = compute_standings(tournament)
        standings_order = [row.player.pk for row in standings]

    previous_opponents = get_previous_opponents(tournament)
    players_with_bye = get_players_with_bye(tournament)

    # Create the round
    round_obj = Round.objects.create(
        tournament=tournament,
        number=round_number,
        status=Round.Status.ACTIVE,
    )

    # Handle BYE
    bye_candidate = _select_bye_candidate(
        active_players, players_with_bye, standings_order
    )
    if bye_candidate:
        Match.objects.create(
            round=round_obj,
            player1=bye_candidate,
            player2=None,
            player1_score=BYE_WIN_SCORE,
            player2_score=BYE_LOSS_SCORE,
            player1_confirmed=True,
            player2_confirmed=True,
            confirmed=True,
            is_bye=True,
        )
        active_players = [p for p in active_players if p.pk != bye_candidate.pk]

    # Pair remaining players
    pairs = _pair_players(active_players, previous_opponents, standings_order)
    for p1, p2 in pairs:
        Match.objects.create(
            round=round_obj,
            player1=p1,
            player2=p2,
        )

    # Update tournament state
    tournament.current_round = round_number
    if tournament.status == Tournament.Status.SETUP:
        tournament.status = Tournament.Status.ACTIVE
    tournament.save(update_fields=["current_round", "status"])

    return round_obj


def check_round_complete(round_obj: Round) -> bool:
    """
    Check if all matches in a round are confirmed.
    If so, mark the round as completed and potentially finish the tournament.
    """
    if not round_obj.all_confirmed:
        return False

    round_obj.status = Round.Status.COMPLETED
    round_obj.save(update_fields=["status"])

    tournament = round_obj.tournament
    if tournament.is_last_round:
        _finalize_tournament(tournament)

    return True


def _finalize_tournament(tournament: Tournament):
    """Mark tournament as finished and update player profiles."""
    tournament.status = Tournament.Status.FINISHED
    tournament.save(update_fields=["status"])

    standings = compute_standings(tournament)

    # Update lifetime stats on PlayerProfile
    for row in standings:
        profile = row.player.user.profile
        profile.total_match_wins += row.wins
        profile.total_match_losses += row.losses
        profile.total_match_draws += row.draws
        profile.tournaments_played += 1
        if row.rank == 1:
            profile.tournaments_won += 1
        profile.save()
