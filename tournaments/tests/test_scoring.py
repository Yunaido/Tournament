"""
Tests for OP TCG scoring & tiebreakers.

These tests focus on the official-rule requirement that a BYE counts
toward Match Points but is excluded from the Match-Win % and Game-Win %
used for tiebreakers (both for the BYE recipient and for their opponents).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import PlayerProfile
from tournaments.models import EventType, Match, Round, Tournament, TournamentPlayer
from tournaments.scoring import FLOOR, compute_standings

User = get_user_model()


def _make_user(idx: int) -> User:
    user = User.objects.create_user(username=f"p{idx}", password="x")
    PlayerProfile.objects.create(user=user, display_name=f"Player {idx}")
    return user


class ByeTiebreakerTests(TestCase):
    def setUp(self):
        self.event_type = EventType.objects.create(name="Standard")
        self.admin = _make_user(0)
        self.tournament = Tournament.objects.create(
            name="T",
            event_type=self.event_type,
            created_by=self.admin,
            max_rounds=3,
            current_round=0,
        )
        self.players = []
        for i in range(1, 5):
            user = _make_user(i)
            self.players.append(
                TournamentPlayer.objects.create(
                    tournament=self.tournament, user=user, seed=i
                )
            )

    def _round(self, number: int) -> Round:
        return Round.objects.create(
            tournament=self.tournament,
            number=number,
            status=Round.Status.COMPLETED,
        )

    def _played(self, rnd, p1, p2, s1, s2):
        Match.objects.create(
            round=rnd,
            player1=p1,
            player2=p2,
            player1_score=s1,
            player2_score=s2,
            player1_confirmed=True,
            player2_confirmed=True,
            confirmed=True,
            is_bye=False,
        )

    def _bye(self, rnd, player):
        Match.objects.create(
            round=rnd,
            player1=player,
            player2=None,
            player1_score=2,
            player2_score=0,
            player1_confirmed=True,
            player2_confirmed=True,
            confirmed=True,
            is_bye=True,
        )

    def test_bye_counts_as_3_match_points(self):
        """A BYE must award full match points (3)."""
        r1 = self._round(1)
        self._bye(r1, self.players[0])

        rows = compute_standings(self.tournament)
        row = next(r for r in rows if r.player.pk == self.players[0].pk)
        self.assertEqual(row.match_points, Decimal(3))
        self.assertEqual(row.wins, 1)  # display still shows 1 win

    def test_bye_does_not_inflate_recipient_mwp_or_gwp(self):
        """
        Per official rules, a BYE is excluded from MWP and GWP.

        Recipient: 1 BYE + 1 played loss (0-2). MWP must be the floor (33%),
        not 50% (which would be the case if the BYE was counted as a win).
        """
        r1 = self._round(1)
        r2 = self._round(2)
        # P1 gets a bye in round 1, then loses 0-2 to P2 in round 2
        self._bye(r1, self.players[0])
        self._played(r2, self.players[0], self.players[1], 0, 2)

        rows = compute_standings(self.tournament)
        p1_row = next(r for r in rows if r.player.pk == self.players[0].pk)

        # GWP from played matches only: 0 wins / 2 games -> 0% -> floored to 33%
        self.assertEqual(p1_row.gw_pct, FLOOR)

        # MWP from played matches only: 0 / 1 -> 0% -> floored to 33%.
        # If the BYE was wrongly included it would be (3+0)/(2*3)=50%.
        # We assert via the public OMW% pathway: P2's only opponent is P1,
        # so P2's OMW% should equal P1's MWP (= floor 33%).
        p2_row = next(r for r in rows if r.player.pk == self.players[1].pk)
        self.assertEqual(p2_row.omw_pct, FLOOR)

    def test_opponents_omw_excludes_byes(self):
        """
        Regression for the user-reported bug: opponents of a BYE recipient
        used to see an inflated OMW% (because the BYE win was counted toward
        the recipient's MWP). With the fix, the BYE round is invisible to
        the OMW% calculation.

        Setup:
          R1: P1 BYE,  P2 beats P3 (2-0)
          R2: P2 beats P1 (2-0)

        P1's played record: 0-1 -> MWP floored to 33%.
        Old (buggy) code would give P1 MWP = (3+0)/(2*3) = 50%, which would
        leak into P2's OMW%. The fix keeps P2's OMW% at the floor.
        """
        p1, p2, p3, _p4 = self.players
        r1 = self._round(1)
        r2 = self._round(2)
        self._bye(r1, p1)
        self._played(r1, p2, p3, 2, 0)
        self._played(r2, p2, p1, 2, 0)

        rows = compute_standings(self.tournament)
        p2_row = next(r for r in rows if r.player.pk == p2.pk)

        # P2's opponents are P3 (0 played wins) and P1 (0 played wins).
        # Both have MWP floored to 33%, so OMW% must also be 33%, not the
        # ~41% the old code would have produced from P1's inflated MWP.
        self.assertEqual(p2_row.omw_pct, FLOOR)
