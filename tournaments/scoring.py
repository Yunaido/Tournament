"""
One Piece TCG official scoring and tiebreakers.

Ranking order:
  1. Match Points (MP)  — Win=3, Draw=1, Loss=0
  2. Opponent Match Win % (OMW%) — Average of opponents' match-win%, floored at 33%
  3. Game Win % (GW%)   — player's game-wins / total-games-played
  4. Opponent Game Win % (OGW%) — average of opponents' GW%, floored at 33%
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .models import Match, Tournament, TournamentPlayer

WIN_POINTS = Decimal(3)
DRAW_POINTS = Decimal(1)
LOSS_POINTS = Decimal(0)
FLOOR = Decimal("0.33")
BYE_GAME_WINS = 2
BYE_GAME_LOSSES = 0


@dataclass
class PlayerStats:
    player: TournamentPlayer
    match_wins: int = 0
    match_draws: int = 0
    match_losses: int = 0
    game_wins: int = 0
    game_losses: int = 0
    opponents: list[int] = field(default_factory=list)  # list of TournamentPlayer PKs

    @property
    def match_points(self) -> Decimal:
        return (
            WIN_POINTS * self.match_wins
            + DRAW_POINTS * self.match_draws
            + LOSS_POINTS * self.match_losses
        )

    @property
    def matches_played(self) -> int:
        return self.match_wins + self.match_draws + self.match_losses

    @property
    def match_win_percentage(self) -> Decimal:
        played = self.matches_played
        if played == 0:
            return FLOOR
        return max(self.match_points / (played * WIN_POINTS), FLOOR)

    @property
    def game_win_percentage(self) -> Decimal:
        total = self.game_wins + self.game_losses
        if total == 0:
            return FLOOR
        return max(Decimal(self.game_wins) / Decimal(total), FLOOR)


@dataclass
class StandingRow:
    """Final computed standing for one player."""

    rank: int
    player: TournamentPlayer
    match_points: Decimal
    wins: int
    draws: int
    losses: int
    omw_pct: Decimal
    gw_pct: Decimal
    ogw_pct: Decimal

    @property
    def omw_display(self) -> str:
        return f"{self.omw_pct * 100:.1f}"

    @property
    def gw_display(self) -> str:
        return f"{self.gw_pct * 100:.1f}"

    @property
    def ogw_display(self) -> str:
        return f"{self.ogw_pct * 100:.1f}"


def _gather_stats(tournament: Tournament) -> dict[int, PlayerStats]:
    """Walk all confirmed matches and compute per-player stats."""
    players = {tp.pk: PlayerStats(player=tp) for tp in tournament.players.all()}

    matches = Match.objects.filter(
        round__tournament=tournament,
        confirmed=True,
    ).select_related("player1", "player2", "round")

    for match in matches:
        p1_pk = match.player1_id
        s1 = players.get(p1_pk)
        if s1 is None:
            continue

        if match.is_bye:
            s1.match_wins += 1
            s1.game_wins += BYE_GAME_WINS
            s1.game_losses += BYE_GAME_LOSSES
            continue

        p2_pk = match.player2_id
        s2 = players.get(p2_pk)
        if s2 is None:
            continue

        # Track opponents
        s1.opponents.append(p2_pk)
        s2.opponents.append(p1_pk)

        # Game scores
        s1.game_wins += match.player1_score
        s1.game_losses += match.player2_score
        s2.game_wins += match.player2_score
        s2.game_losses += match.player1_score

        # Match result
        if match.player1_score > match.player2_score:
            s1.match_wins += 1
            s2.match_losses += 1
        elif match.player2_score > match.player1_score:
            s2.match_wins += 1
            s1.match_losses += 1
        else:
            s1.match_draws += 1
            s2.match_draws += 1

    return players


def compute_standings(tournament: Tournament) -> list[StandingRow]:
    """Compute final standings sorted by MP → OMW% → GW% → OGW%."""
    stats = _gather_stats(tournament)

    # OMW% = average of opponents' match-win%, floored at 33%
    def calc_omw(ps: PlayerStats) -> Decimal:
        if not ps.opponents:
            return Decimal(0)
        opp_mwps = [
            max(stats[opp].match_win_percentage, FLOOR)
            for opp in ps.opponents
            if opp in stats
        ]
        return sum(opp_mwps) / Decimal(len(opp_mwps)) if opp_mwps else Decimal(0)

    # OGW% = average of opponents' game-win%, floored at 33%
    def calc_ogw(ps: PlayerStats) -> Decimal:
        if not ps.opponents:
            return Decimal(0)
        opp_gwps = [
            max(stats[opp].game_win_percentage, FLOOR)
            for opp in ps.opponents
            if opp in stats
        ]
        return sum(opp_gwps) / Decimal(len(opp_gwps)) if opp_gwps else Decimal(0)

    rows: list[StandingRow] = []
    for pk, ps in stats.items():
        rows.append(
            StandingRow(
                rank=0,
                player=ps.player,
                match_points=ps.match_points,
                wins=ps.match_wins,
                draws=ps.match_draws,
                losses=ps.match_losses,
                omw_pct=calc_omw(ps),
                gw_pct=ps.game_win_percentage,
                ogw_pct=calc_ogw(ps),
            )
        )

    # Sort: MP desc → OMW% desc → GW% desc → OGW% desc
    rows.sort(
        key=lambda r: (r.match_points, r.omw_pct, r.gw_pct, r.ogw_pct),
        reverse=True,
    )

    # Assign ranks
    for i, row in enumerate(rows):
        row.rank = i + 1

    return rows
