from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render

from .forms import InviteForm, RegisterForm
from .models import Invite, PlayerProfile


def register(request, token):
    """Registration only works with a valid invite token."""
    invite = get_object_or_404(Invite, token=token)

    if not invite.is_valid:
        return render(request, "accounts/invite_invalid.html", status=403)

    if request.method == "POST":
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            PlayerProfile.objects.create(
                user=user,
                display_name=form.cleaned_data["display_name"],
                invited_by=invite.created_by,
            )
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
