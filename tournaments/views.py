from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST

from accounts.utils import get_image_content_type, make_qr_svg

from .forms import ReportResultForm, TournamentForm
from .models import EventType, Match, Round, Tournament, TournamentPlayer
from accounts.notifications import (
    notify_match_confirmed,
    notify_result_reported,
    notify_round_started,
)
from .pairing import check_round_complete, generate_round


def tournament_list(request):
    _sort_map = {
        "date_desc": "-date",
        "date_asc": "date",
        "name_asc": "name",
        "name_desc": "-name",
    }
    sort = request.GET.get("sort", "date_asc")
    order_by = _sort_map.get(sort, "date")
    event_type_id = request.GET.get("type", "")

    qs = Tournament.objects.select_related("event_type", "created_by__profile")
    if event_type_id.isdigit():
        try:
            qs = qs.filter(event_type_id=int(event_type_id))
        except (ValueError, OverflowError):
            event_type_id = ""

    active = qs.exclude(status=Tournament.Status.FINISHED).order_by(order_by)
    finished = qs.filter(status=Tournament.Status.FINISHED).order_by(order_by)
    event_types = EventType.objects.all()

    return render(
        request,
        "tournaments/list.html",
        {
            "active_tournaments": active,
            "finished_tournaments": finished,
            "event_types": event_types,
            "current_sort": sort,
            "current_type": event_type_id,
        },
    )


def tournament_detail(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    standings = tournament.compute_standings()

    # All rounds for navigation
    all_rounds = list(tournament.rounds.all().order_by("number"))

    # Determine which round to display (default: latest)
    view_round_num = request.GET.get("round")
    if view_round_num and view_round_num.isdigit():
        view_round_num = int(view_round_num)
    else:
        view_round_num = tournament.current_round

    viewed_round = (
        tournament.rounds.filter(number=view_round_num).first()
        if view_round_num > 0
        else None
    )
    matches = viewed_round.matches.all() if viewed_round else []

    # Check if current user has an active match to report (only in the live round)
    user_match = None
    live_round = (
        tournament.rounds.filter(number=tournament.current_round).first()
        if tournament.current_round > 0
        else None
    )
    if request.user.is_authenticated and live_round:
        tp = TournamentPlayer.objects.filter(
            tournament=tournament, user=request.user
        ).first()
        if tp:
            user_match = (
                Match.objects.filter(round=live_round, confirmed=False)
                .filter(
                    models_q_player1_or_2(tp)
                )
                .first()
            )

    # Generate QR code for share modal (SETUP tournaments, authenticated users)
    qr_svg = None
    if tournament.status == Tournament.Status.SETUP and request.user.is_authenticated:
        share_url = request.build_absolute_uri(
            reverse("tournament_detail", args=[tournament.pk])
        )
        qr_svg = make_qr_svg(share_url)

    return render(
        request,
        "tournaments/detail.html",
        {
            "tournament": tournament,
            "standings": standings,
            "all_rounds": all_rounds,
            "viewed_round": viewed_round,
            "current_round": viewed_round,  # kept for template compat
            "matches": matches,
            "user_match": user_match,
            "qr_svg": qr_svg,
        },
    )


def models_q_player1_or_2(tp):
    """Return Q filter for matches where tp is player1 or player2."""
    from django.db.models import Q

    return Q(player1=tp) | Q(player2=tp)


@login_required
def tournament_create(request):
    if request.method == "POST":
        form = TournamentForm(request.POST, request.FILES)
        if form.is_valid():
            tournament = form.save(commit=False)
            tournament.created_by = request.user
            logo_data = form.cleaned_data.get("logo")
            if logo_data:
                tournament.logo_data = logo_data
            tournament.save()
            # Auto-join the creator
            TournamentPlayer.objects.create(tournament=tournament, user=request.user)
            messages.success(request, f"Tournament '{tournament.name}' created!")
            return redirect("tournament_detail", pk=tournament.pk)
    else:
        form = TournamentForm()
    return render(request, "tournaments/create.html", {"form": form})


def serve_logo(request, pk):
    """Serve a tournament's logo image from the database."""
    tournament = get_object_or_404(Tournament, pk=pk)
    if not tournament.logo_data:
        raise Http404
    data = bytes(tournament.logo_data)
    response = HttpResponse(data, content_type=get_image_content_type(data))
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-cache"
    return response


@login_required
@require_POST
def tournament_join(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk, status=Tournament.Status.SETUP)
    _, created = TournamentPlayer.objects.get_or_create(
        tournament=tournament, user=request.user
    )
    if created:
        messages.success(request, "You joined the tournament!")
    else:
        messages.info(request, "You're already registered.")
    return redirect("tournament_detail", pk=pk)


@login_required
@require_POST
def tournament_leave(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk, status=Tournament.Status.SETUP)
    TournamentPlayer.objects.filter(
        tournament=tournament, user=request.user
    ).delete()
    messages.info(request, "You left the tournament.")
    return redirect("tournament_detail", pk=pk)


@login_required
@require_POST
def tournament_kick(request, pk, user_pk):
    """Organizer or staff removes a player (including the organizer) from a tournament still in SETUP."""
    tournament = get_object_or_404(Tournament, pk=pk, status=Tournament.Status.SETUP)

    if tournament.created_by != request.user and not request.user.is_staff:
        messages.error(request, "Only the organizer can remove players.")
        return redirect("tournament_detail", pk=pk)

    if user_pk == request.user.pk:
        messages.error(request, "You can't kick yourself. Use 'Leave' instead.")
        return redirect("tournament_detail", pk=pk)

    tp = TournamentPlayer.objects.filter(
        tournament=tournament, user_id=user_pk
    ).first()
    if tp:
        name = tp.user.profile.display_name
        tp.delete()
        messages.success(request, f"{name} has been removed from the tournament.")
    else:
        messages.error(request, "Player not found in this tournament.")
    return redirect("tournament_detail", pk=pk)


@login_required
@require_POST
def tournament_start(request, pk):
    """Start the tournament: generate round 1."""
    tournament = get_object_or_404(Tournament, pk=pk, status=Tournament.Status.SETUP)
    if tournament.created_by != request.user and not request.user.is_staff:
        messages.error(request, "Only the organizer can start the tournament.")
        return redirect("tournament_detail", pk=pk)

    if tournament.num_players < 2:
        messages.error(request, "Need at least 2 players to start.")
        return redirect("tournament_detail", pk=pk)

    try:
        round_obj = generate_round(tournament)
        messages.success(request, "Round 1 generated! Players can now report results.")
        notify_round_started(round_obj)
    except ValueError as e:
        messages.error(request, str(e))
    return redirect("tournament_detail", pk=pk)


@login_required
@require_POST
def next_round(request, pk):
    """Generate the next round (only if current round is complete)."""
    tournament = get_object_or_404(Tournament, pk=pk, status=Tournament.Status.ACTIVE)
    if tournament.created_by != request.user and not request.user.is_staff:
        messages.error(request, "Only the organizer can advance rounds.")
        return redirect("tournament_detail", pk=pk)

    current = tournament.rounds.filter(number=tournament.current_round).first()
    if current and not current.all_confirmed:
        messages.error(request, "Current round still has unconfirmed matches.")
        return redirect("tournament_detail", pk=pk)

    if tournament.is_last_round:
        messages.info(request, "All rounds are complete. The tournament is finished!")
        return redirect("tournament_detail", pk=pk)

    try:
        round_obj = generate_round(tournament)
        messages.success(
            request, f"Round {tournament.current_round} generated!"
        )
        notify_round_started(round_obj)
    except ValueError as e:
        messages.error(request, str(e))
    return redirect("tournament_detail", pk=pk)


@login_required
def tournament_edit(request, pk):
    """Organizer/staff edits tournament details while it is still in SETUP."""
    tournament = get_object_or_404(Tournament, pk=pk, status=Tournament.Status.SETUP)

    if tournament.created_by != request.user and not request.user.is_staff:
        messages.error(request, "Only the organizer can edit this tournament.")
        return redirect("tournament_detail", pk=pk)

    if request.method == "POST":
        form = TournamentForm(request.POST, request.FILES, instance=tournament)
        if form.is_valid():
            updated = form.save(commit=False)
            logo_data = form.cleaned_data.get("logo")
            if logo_data:
                updated.logo_data = logo_data
            updated.save()
            messages.success(request, "Tournament updated.")
            return redirect("tournament_detail", pk=pk)
    else:
        form = TournamentForm(instance=tournament)
    return render(request, "tournaments/edit.html", {"form": form, "tournament": tournament})


@login_required
def tournament_delete(request, pk):
    """Delete a tournament. Organizer only. Harder confirmation when ACTIVE."""
    tournament = get_object_or_404(Tournament, pk=pk)

    if tournament.created_by != request.user and not request.user.is_staff:
        messages.error(request, "Only the organizer can delete this tournament.")
        return redirect("tournament_detail", pk=pk)

    if tournament.status == Tournament.Status.FINISHED:
        messages.error(request, "Finished tournaments cannot be deleted.")
        return redirect("tournament_detail", pk=pk)

    if request.method == "POST":
        if tournament.status == Tournament.Status.ACTIVE:
            confirm_name = request.POST.get("confirm_name", "").strip()
            if confirm_name != tournament.name:
                messages.error(request, "Tournament name did not match. Deletion cancelled.")
                return redirect("tournament_delete", pk=pk)
        name = tournament.name
        tournament.delete()
        messages.success(request, f"Tournament '{name}' has been deleted.")
        return redirect("tournament_list")

    return render(request, "tournaments/delete.html", {"tournament": tournament})


@login_required
def report_result(request, match_pk):
    """Player reports their match result."""
    match = get_object_or_404(Match, pk=match_pk, confirmed=False, is_bye=False)
    tournament = match.round.tournament

    tp = TournamentPlayer.objects.filter(
        tournament=tournament, user=request.user
    ).first()
    if not tp or (match.player1 != tp and match.player2 != tp):
        messages.error(request, "This is not your match.")
        return redirect("tournament_detail", pk=tournament.pk)

    is_player1 = match.player1 == tp

    if request.method == "POST":
        form = ReportResultForm(request.POST)
        if form.is_valid():
            result = form.cleaned_data["result"]

            if is_player1:
                match.player1_result = result
                match.player1_confirmed = True
                match.save(update_fields=["player1_result", "player1_confirmed"])
            else:
                match.player2_result = result
                match.player2_confirmed = True
                match.save(update_fields=["player2_result", "player2_confirmed"])

            # Both reported before check_confirmation?
            both_reported = match.player1_confirmed and match.player2_confirmed
            match.check_confirmation()

            if match.confirmed:
                messages.success(request, "Result confirmed by both players!")
                notify_match_confirmed(match)
                check_round_complete(match.round)
            elif both_reported and not match.confirmed:
                # Both reported but results conflicted — got reset
                messages.warning(
                    request,
                    "Results don't match! Both players need to report again.",
                )
            else:
                messages.info(
                    request,
                    "Result recorded. Waiting for your opponent to confirm.",
                )
                notify_result_reported(match, tp)

            # HTMX: return partial if it's an HTMX request
            if hasattr(request, "htmx") and request.htmx:
                return render(
                    request,
                    "components/match_card.html",
                    {"match": match, "tournament": tournament, "user_tp": tp},
                )

            return redirect("tournament_detail", pk=tournament.pk)
    else:
        form = ReportResultForm()

    return render(
        request,
        "tournaments/report_result.html",
        {"form": form, "match": match, "is_player1": is_player1},
    )


def standings(request, pk):
    """Full standings page."""
    tournament = get_object_or_404(Tournament, pk=pk)
    standings = tournament.compute_standings()
    return render(
        request,
        "tournaments/standings.html",
        {"tournament": tournament, "standings": standings},
    )



def match_history(request, pk):
    """Match history for a player across all tournaments."""
    from django.contrib.auth.models import User

    user = get_object_or_404(User, pk=pk)
    entries = TournamentPlayer.objects.filter(user=user).select_related("tournament")

    history = []
    for entry in entries:
        matches = Match.objects.filter(
            round__tournament=entry.tournament, confirmed=True
        ).filter(
            models_q_player1_or_2(entry)
        ).select_related("player1__user__profile", "player2__user__profile", "round")

        for match in matches:
            is_p1 = match.player1 == entry
            history.append(
                {
                    "tournament": entry.tournament,
                    "round_number": match.round.number,
                    "opponent": (
                        "BYE"
                        if match.is_bye
                        else (
                            match.player2.user.profile.display_name
                            if is_p1
                            else match.player1.user.profile.display_name
                        )
                    ),
                    "my_score": match.player1_score if is_p1 else match.player2_score,
                    "opp_score": match.player2_score if is_p1 else match.player1_score,
                    "result": (
                        "BYE WIN"
                        if match.is_bye
                        else (
                            "Win"
                            if (match.player1_score if is_p1 else match.player2_score)
                            > (match.player2_score if is_p1 else match.player1_score)
                            else (
                                "Loss"
                                if (match.player1_score if is_p1 else match.player2_score)
                                < (match.player2_score if is_p1 else match.player1_score)
                                else "Draw"
                            )
                        )
                    ),
                }
            )

    return render(
        request,
        "tournaments/match_history.html",
        {"target_user": user, "history": history},
    )


def htmx_standings(request, pk):
    """HTMX partial: just the standings table."""
    tournament = get_object_or_404(Tournament, pk=pk)
    standings = tournament.compute_standings()
    return render(
        request,
        "components/standings_table.html",
        {"tournament": tournament, "standings": standings},
    )
