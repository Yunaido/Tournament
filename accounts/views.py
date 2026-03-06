from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render

from .forms import InviteForm, ProfileEditForm, RegisterForm
from .models import Invite, PlayerProfile
from .utils import get_image_content_type


def register(request, token):
    """Registration only works with a valid invite token."""
    invite = get_object_or_404(Invite, token=token)

    if not invite.is_valid:
        return render(request, "accounts/invite_invalid.html", status=403)

    if request.method == "POST":
        form = RegisterForm(request.POST, request.FILES)
        if form.is_valid():
            user = form.save()
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
            login(request, user)
            return redirect("/")
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
    return response


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
    return render(request, "accounts/invite_detail.html", {"invite": invite})


@login_required
def invite_toggle(request, token):
    """Activate or deactivate an invite."""
    invite = get_object_or_404(Invite, token=token, created_by=request.user)
    invite.is_active = not invite.is_active
    invite.save(update_fields=["is_active"])
    return redirect("accounts:invite_detail", token=invite.token)
