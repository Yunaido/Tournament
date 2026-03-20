from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("register/<uuid:token>/", views.register, name="register"),
    path("verify/<uuid:token>/", views.verify_email, name="verify_email"),
    path("login/", views.login_view, name="login"),
    path("login/email/", views.magic_link_request, name="magic_link_request"),
    path("login/email/verify/", views.magic_login, name="magic_login"),
    path("login/passkey/begin/", views.passkey_login_begin, name="passkey_login_begin"),
    path("login/passkey/complete/", views.passkey_login_complete, name="passkey_login_complete"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("profile/", views.profile, name="profile"),
    path("profile/edit/", views.profile_edit, name="profile_edit"),
    path("profile/security/", views.security, name="security"),
    path("avatar/<int:pk>/", views.serve_avatar, name="serve_avatar"),
    path("passkey/register/begin/", views.passkey_register_begin, name="passkey_register_begin"),
    path("passkey/register/complete/", views.passkey_register_complete, name="passkey_register_complete"),
    path("invites/", views.invite_list, name="invite_list"),
    path("invites/<uuid:token>/", views.invite_detail, name="invite_detail"),
    path("invites/<uuid:token>/toggle/", views.invite_toggle, name="invite_toggle"),
]
