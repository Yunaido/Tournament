from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("register/<uuid:token>/", views.register, name="register"),
    path("login/", auth_views.LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("profile/", views.profile, name="profile"),
    path("invites/", views.invite_list, name="invite_list"),
    path("invites/<uuid:token>/", views.invite_detail, name="invite_detail"),
    path("invites/<uuid:token>/toggle/", views.invite_toggle, name="invite_toggle"),
]
