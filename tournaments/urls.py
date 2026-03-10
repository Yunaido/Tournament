from django.urls import path

from . import views

urlpatterns = [
    path("", views.tournament_list, name="tournament_list"),
    path("tournaments/create/", views.tournament_create, name="tournament_create"),
    path("tournaments/<int:pk>/", views.tournament_detail, name="tournament_detail"),
    path("tournaments/<int:pk>/logo/", views.serve_logo, name="tournament_logo"),
    path("tournaments/<int:pk>/join/", views.tournament_join, name="tournament_join"),
    path("tournaments/<int:pk>/leave/", views.tournament_leave, name="tournament_leave"),
    path("tournaments/<int:pk>/kick/<int:user_pk>/", views.tournament_kick, name="tournament_kick"),
    path("tournaments/<int:pk>/start/", views.tournament_start, name="tournament_start"),
    path("tournaments/<int:pk>/edit/", views.tournament_edit, name="tournament_edit"),
    path("tournaments/<int:pk>/delete/", views.tournament_delete, name="tournament_delete"),
    path("tournaments/<int:pk>/next-round/", views.next_round, name="next_round"),
    path("tournaments/<int:pk>/standings/", views.standings, name="standings"),
    path("tournaments/<int:pk>/standings-partial/", views.htmx_standings, name="htmx_standings"),
    path("matches/<int:match_pk>/report/", views.report_result, name="report_result"),
    path("players/<int:pk>/history/", views.match_history, name="match_history"),
]
