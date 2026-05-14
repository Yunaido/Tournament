import json
import logging

import sesame.utils
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.http import HttpResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import bytes_to_base64url, options_to_json
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .forms import (
    ChangeEmailForm,
    ChangePasswordForm,
    InviteForm,
    MagicLinkForm,
    NotificationPreferenceForm,
    PasswordLoginForm,
    ProfileEditForm,
    RegisterForm,
)
from .models import EmailVerification, Invite, NotificationPreference, PlayerProfile, PushSubscription, WebAuthnCredential
from .utils import get_image_content_type, make_qr_svg

logger = logging.getLogger(__name__)


@ratelimit(key="ip", rate="5/m", method="POST", block=False)
def login_view(request):
    """Login page — password (primary), email magic link, or passkey."""
    if request.user.is_authenticated:
        return redirect("/")
    form = PasswordLoginForm()
    if request.method == "POST":
        if getattr(request, "limited", False):
            form.add_error(None, "Too many login attempts. Please try again later.")
            return render(request, "accounts/login.html", {"form": form})
        form = PasswordLoginForm(request.POST)
        if form.is_valid():
            user = authenticate(
                request,
                username=form.cleaned_data["username"],
                password=form.cleaned_data["password"],
            )
            if user is not None:
                auth_login(request, user, backend="django.contrib.auth.backends.ModelBackend")
                return redirect("/")
            form.add_error(None, "Invalid username or password.")
    return render(request, "accounts/login.html", {"form": form})


@ratelimit(key="ip", rate="20/h", method="POST", block=False)
def register(request, token):
    """Registration only works with a valid invite token."""
    invite = get_object_or_404(Invite, token=token)

    if not invite.is_valid:
        return render(request, "accounts/invite_invalid.html", status=403)

    if request.method == "POST":
        if getattr(request, "limited", False):
            form = RegisterForm()
            form.add_error(None, "Too many attempts. Please try again later.")
            return render(request, "accounts/register.html", {"form": form, "invite": invite})
        form = RegisterForm(request.POST, request.FILES)
        if form.is_valid():
            user = form.save(commit=False)
            user.is_active = False
            user.save()
            profile_kwargs = {
                "user": user,
                "display_name": form.cleaned_data["display_name"],
                "invited_by": invite.created_by,
            }
            avatar_data = form.cleaned_data.get("avatar")
            if avatar_data:
                profile_kwargs["avatar_data"] = avatar_data
            PlayerProfile.objects.create(**profile_kwargs)
            invite.use()

            verification = EmailVerification.objects.create(
                user=user,
                email=user.email,
                purpose=EmailVerification.Purpose.REGISTRATION,
            )
            verify_url = request.build_absolute_uri(
                reverse("accounts:verify_email", args=[verification.token])
            )
            try:
                send_mail(
                    subject="Verify your email — OP TCG Tournament",
                    message=render_to_string(
                        "accounts/verify_email.txt",
                        {"user": user, "verify_url": verify_url},
                    ),
                    from_email=None,
                    recipient_list=[user.email],
                )
            except Exception:
                logger.exception("Failed to send registration verification email to %s", user.email)
                form.add_error(None, "Could not send verification email. Please try again or contact support.")
                user.delete()  # roll back the created user
                return render(request, "accounts/register.html", {"form": form, "invite": invite})
            return render(request, "accounts/verify_email_sent.html", {"email": user.email})
    else:
        form = RegisterForm()
    return render(request, "accounts/register.html", {"form": form, "invite": invite})


@login_required
def profile(request):
    return render(request, "accounts/profile.html")


@login_required
def profile_edit(request):
    """Edit display name and avatar."""
    profile_obj = request.user.profile
    if request.method == "POST":
        form = ProfileEditForm(request.POST, request.FILES)
        if form.is_valid():
            profile_obj.display_name = form.cleaned_data["display_name"]

            # Handle avatar clear
            if request.POST.get("avatar_clear"):
                profile_obj.avatar_data = None
            # Handle new upload
            avatar_data = form.cleaned_data.get("avatar")
            if avatar_data:
                profile_obj.avatar_data = avatar_data

            profile_obj.save()
            return redirect("accounts:profile")
    else:
        form = ProfileEditForm(initial={"display_name": profile_obj.display_name})
    return render(request, "accounts/profile_edit.html", {"form": form})


def serve_avatar(request, pk):
    """Serve a player's avatar image from the database."""
    from django.contrib.auth.models import User
    user = get_object_or_404(User, pk=pk)
    profile = user.profile
    if not profile.avatar_data:
        raise Http404
    data = bytes(profile.avatar_data)
    response = HttpResponse(data, content_type=get_image_content_type(data))
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-cache"
    return response


@login_required
def security(request):
    """Security settings: password, email, passkeys."""
    user = request.user
    offer_passkey = request.GET.get("offer_passkey") == "1"
    passkeys = user.webauthn_credentials.all()
    password_form = ChangePasswordForm(user=user)
    email_form = ChangeEmailForm(user=user, initial={"email": user.email})
    pending_email = EmailVerification.objects.filter(
        user=user,
        purpose=EmailVerification.Purpose.EMAIL_CHANGE,
        used=False,
    ).first()
    # Only show pending if it's still valid
    if pending_email and not pending_email.is_valid:
        pending_email = None

    if request.method == "POST":
        action = request.POST.get("action")

        if action == "change_password":
            password_form = ChangePasswordForm(request.POST, user=user)
            if password_form.is_valid():
                user.set_password(password_form.cleaned_data["new_password1"])
                user.save()
                # Re-authenticate so the session isn't invalidated
                auth_login(request, user, backend="django.contrib.auth.backends.ModelBackend")
                messages.success(request, "Password updated.")
                return redirect("accounts:security")

        elif action == "change_email":
            email_form = ChangeEmailForm(request.POST, user=user)
            if email_form.is_valid():
                new_email = email_form.cleaned_data["email"]
                # Invalidate any existing pending email change verifications
                EmailVerification.objects.filter(
                    user=user,
                    purpose=EmailVerification.Purpose.EMAIL_CHANGE,
                    used=False,
                ).update(used=True)

                verification = EmailVerification.objects.create(
                    user=user,
                    email=new_email,
                    purpose=EmailVerification.Purpose.EMAIL_CHANGE,
                )
                verify_url = request.build_absolute_uri(
                    reverse("accounts:verify_email", args=[verification.token])
                )
                try:
                    send_mail(
                        subject="Confirm your email change — OP TCG Tournament",
                        message=render_to_string(
                            "accounts/verify_email_change.txt",
                            {"user": user, "verify_url": verify_url, "new_email": new_email},
                        ),
                        from_email=None,
                        recipient_list=[new_email],
                    )
                except Exception:
                    logger.exception("Failed to send email change verification to %s", new_email)
                    verification.delete()
                    messages.error(request, "Could not send verification email. Please check the address and try again.")
                    return redirect("accounts:security")
                messages.success(request, f"A verification link has been sent to {new_email}.")
                return redirect("accounts:security")

    return render(request, "accounts/security.html", {
        "password_form": password_form,
        "email_form": email_form,
        "passkeys": passkeys,
        "offer_passkey": offer_passkey,
        "has_password": user.has_usable_password(),
        "pending_email": pending_email,
    })


@ratelimit(key="ip", rate="3/m", method="POST", block=False)
def magic_link_request(request):
    """Accept an email address and send a magic login link."""
    if request.method == "POST":
        form = MagicLinkForm(request.POST)
        if form.is_valid():
            # Always show success page — don't reveal rate limiting
            if getattr(request, "limited", False):
                return render(request, "accounts/magic_link_sent.html", {"email": form.cleaned_data["email"]})
            email = form.cleaned_data["email"]
            try:
                user = User.objects.get(email__iexact=email)
            except User.DoesNotExist:
                user = None

            if user:
                token = sesame.utils.get_token(user)
                login_path = reverse("accounts:magic_login") + "?sesame=" + token
                login_url = request.build_absolute_uri(login_path)
                try:
                    send_mail(
                        subject="Your login link — OP TCG Tournament",
                        message=render_to_string(
                            "accounts/magic_link_email.txt",
                            {"user": user, "login_url": login_url},
                        ),
                        from_email=None,  # uses DEFAULT_FROM_EMAIL
                        recipient_list=[user.email],
                    )
                except Exception:
                    logger.exception("Failed to send magic link email to %s", user.email)

            # Always show success — don't leak whether the email exists.
            return render(request, "accounts/magic_link_sent.html", {"email": email})
    else:
        return redirect("accounts:login")


def magic_login(request):
    """Validate a sesame token from the query string and log the user in."""
    user = sesame.utils.get_user(request)
    if user is None:
        return render(request, "accounts/magic_link_invalid.html", status=403)
    auth_login(request, user, backend="sesame.backends.ModelBackend")
    # If user has no passkey yet, redirect to security with offer prompt
    has_passkey = user.webauthn_credentials.exists()
    if not has_passkey:
        return redirect(reverse("accounts:security") + "?offer_passkey=1")
    return redirect("/")


@login_required
def invite_list(request):
    """Show the user's invites and create new ones."""
    if request.method == "POST":
        form = InviteForm(request.POST)
        if form.is_valid():
            invite = form.save(commit=False)
            invite.created_by = request.user
            invite.save()
            return redirect("accounts:invite_detail", token=invite.token)
    else:
        form = InviteForm()

    invites = request.user.invites.all()
    return render(
        request, "accounts/invite_list.html", {"form": form, "invites": invites}
    )


@login_required
def invite_detail(request, token):
    """Show a single invite with QR code, copy link, and share button."""
    invite = get_object_or_404(Invite, token=token, created_by=request.user)
    invite_url = request.build_absolute_uri(
        reverse("accounts:register", args=[invite.token])
    )
    qr_svg = make_qr_svg(invite_url)
    return render(request, "accounts/invite_detail.html", {"invite": invite, "qr_svg": qr_svg})


@login_required
@require_POST
def invite_toggle(request, token):
    """Activate or deactivate an invite."""
    invite = get_object_or_404(Invite, token=token, created_by=request.user)
    invite.is_active = not invite.is_active
    invite.save(update_fields=["is_active"])
    return redirect("accounts:invite_detail", token=invite.token)


# ── WebAuthn Passkey: Registration ──────────────────────────────────


@login_required
@require_POST
def passkey_register_begin(request):
    """Start the passkey registration ceremony (returns JSON options)."""
    user = request.user
    existing = user.webauthn_credentials.all()
    exclude_credentials = [
        PublicKeyCredentialDescriptor(id=c.credential_id)
        for c in existing
    ]
    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=str(user.pk).encode(),
        user_name=user.username,
        user_display_name=user.profile.display_name,
        exclude_credentials=exclude_credentials,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    # Store challenge in session for verification
    request.session["webauthn_reg_challenge"] = bytes_to_base64url(options.challenge)
    return JsonResponse(json.loads(options_to_json(options)))


@login_required
@require_POST
def passkey_register_complete(request):
    """Complete the passkey registration ceremony."""
    import base64

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid request."}, status=400)
    challenge_b64 = request.session.pop("webauthn_reg_challenge", None)
    if not challenge_b64:
        return JsonResponse({"error": "No registration in progress."}, status=400)

    challenge = base64.urlsafe_b64decode(challenge_b64 + "==")

    try:
        verification = verify_registration_response(
            credential=body,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
        )
    except Exception:
        return JsonResponse({"error": "Registration verification failed."}, status=400)

    # Sanitize the user-supplied passkey name
    raw_name = body.get("name", "My passkey")
    safe_name = str(raw_name)[:100].strip() or "My passkey"
    WebAuthnCredential.objects.create(
        user=request.user,
        name=safe_name,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
    )
    return JsonResponse({"ok": True})


# ── WebAuthn Passkey: Authentication ────────────────────────────────


@ratelimit(key="ip", rate="10/m", method="POST", block=False)
@require_POST
def passkey_login_begin(request):
    """Start the passkey authentication ceremony (returns JSON options)."""
    if getattr(request, "limited", False):
        return JsonResponse({"error": "Too many requests. Please try again later."}, status=429)
    credentials = WebAuthnCredential.objects.all()
    allow_credentials = [
        PublicKeyCredentialDescriptor(id=bytes(c.credential_id))
        for c in credentials
    ]
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    request.session["webauthn_auth_challenge"] = bytes_to_base64url(options.challenge)
    return JsonResponse(json.loads(options_to_json(options)))


@ratelimit(key="ip", rate="10/m", method="POST", block=False)
@require_POST
def passkey_login_complete(request):
    """Complete the passkey authentication ceremony and log the user in."""
    if getattr(request, "limited", False):
        return JsonResponse({"error": "Too many requests. Please try again later."}, status=429)
    import base64

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid request."}, status=400)
    challenge_b64 = request.session.pop("webauthn_auth_challenge", None)
    if not challenge_b64:
        return JsonResponse({"error": "No authentication in progress."}, status=400)

    challenge = base64.urlsafe_b64decode(challenge_b64 + "==")

    # Find the credential
    raw_id = body.get("rawId", "")
    try:
        cred_id_bytes = base64.urlsafe_b64decode(raw_id + "==")
    except Exception:
        return JsonResponse({"error": "Invalid credential."}, status=400)

    try:
        cred = WebAuthnCredential.objects.get(credential_id=cred_id_bytes)
    except WebAuthnCredential.DoesNotExist:
        return JsonResponse({"error": "Invalid credential."}, status=400)

    try:
        verification = verify_authentication_response(
            credential=body,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
            credential_public_key=bytes(cred.public_key),
            credential_current_sign_count=cred.sign_count,
        )
    except Exception:
        return JsonResponse({"error": "Authentication failed."}, status=400)

    cred.sign_count = verification.new_sign_count
    cred.save(update_fields=["sign_count"])

    auth_login(request, cred.user, backend="django.contrib.auth.backends.ModelBackend")
    return JsonResponse({"ok": True})


# ── Email Verification ──────────────────────────────────────────────


def verify_email(request, token):
    """Handle email verification for registration and email changes."""
    verification = get_object_or_404(EmailVerification, token=token)

    if not verification.is_valid:
        return render(request, "accounts/verify_email_invalid.html", status=403)

    user = verification.user
    verification.used = True
    verification.save(update_fields=["used"])

    if verification.purpose == EmailVerification.Purpose.REGISTRATION:
        user.is_active = True
        user.save(update_fields=["is_active"])
        auth_login(request, user, backend="sesame.backends.ModelBackend")
        return redirect("/")

    elif verification.purpose == EmailVerification.Purpose.EMAIL_CHANGE:
        # Re-check uniqueness before applying
        if User.objects.filter(email__iexact=verification.email).exclude(pk=user.pk).exists():
            messages.error(request, "That email address is now taken by another account.")
            return redirect("accounts:security")
        user.email = verification.email
        user.save(update_fields=["email"])
        if request.user.is_authenticated and request.user.pk == user.pk:
            messages.success(request, "Email updated.")
            return redirect("accounts:security")
        return redirect("accounts:login")


# ── Push Notification Endpoints ─────────────────────────────────────


def vapid_public_key(request):
    """Return the VAPID public key as JSON (needed by client JS to subscribe)."""
    return JsonResponse({"publicKey": settings.VAPID_PUBLIC_KEY})


@login_required
@require_POST
def push_subscribe(request):
    """Save a push subscription for the current user."""
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    endpoint = body.get("endpoint", "")
    keys = body.get("keys", {})
    p256dh = keys.get("p256dh", "")
    auth = keys.get("auth", "")

    if not endpoint or not p256dh or not auth:
        return JsonResponse({"error": "Missing subscription data."}, status=400)

    PushSubscription.objects.update_or_create(
        user=request.user,
        endpoint=endpoint,
        defaults={"p256dh": p256dh, "auth": auth},
    )
    # Ensure notification preferences exist
    NotificationPreference.objects.get_or_create(user=request.user)
    return JsonResponse({"ok": True})


@login_required
@require_POST
def push_unsubscribe(request):
    """Remove a push subscription for the current user."""
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    endpoint = body.get("endpoint", "")
    if not endpoint:
        return JsonResponse({"error": "Missing endpoint."}, status=400)

    deleted, _ = PushSubscription.objects.filter(
        user=request.user, endpoint=endpoint
    ).delete()
    return JsonResponse({"ok": True, "deleted": deleted > 0})


@login_required
def notification_preferences(request):
    """View/edit notification preferences."""
    pref, _ = NotificationPreference.objects.get_or_create(user=request.user)

    if request.method == "POST":
        form = NotificationPreferenceForm(request.POST)
        if form.is_valid():
            pref.round_started = form.cleaned_data["round_started"]
            pref.match_confirmed = form.cleaned_data["match_confirmed"]
            pref.result_reported = form.cleaned_data["result_reported"]
            pref.tournament_finished = form.cleaned_data["tournament_finished"]
            pref.save()
            messages.success(request, "Notification preferences updated.")
            return redirect("accounts:notification_preferences")
    else:
        form = NotificationPreferenceForm(initial={
            "round_started": pref.round_started,
            "match_confirmed": pref.match_confirmed,
            "result_reported": pref.result_reported,
            "tournament_finished": pref.tournament_finished,
        })

    has_subscription = PushSubscription.objects.filter(user=request.user).exists()
    return render(request, "accounts/notification_preferences.html", {
        "form": form,
        "has_subscription": has_subscription,
    })
