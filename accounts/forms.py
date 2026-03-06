from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import Invite
from .utils import process_image

_ACCEPT = "image/jpeg,image/png,image/gif,image/webp"


class RegisterForm(UserCreationForm):
    display_name = forms.CharField(
        max_length=100,
        help_text="Your in-game / tournament name.",
    )
    avatar = forms.FileField(
        required=False,
        help_text="Optional profile picture (JPEG, PNG, GIF, or WebP, max 5 MB).",
        widget=forms.FileInput(attrs={"accept": _ACCEPT}),
    )

    class Meta:
        model = User
        fields = ("username", "display_name", "avatar", "password1", "password2")

    def clean_avatar(self):
        f = self.cleaned_data.get("avatar")
        if not f:
            return None
        try:
            return process_image(f)
        except ValueError as exc:
            raise forms.ValidationError(str(exc))


class InviteForm(forms.ModelForm):
    class Meta:
        model = Invite
        fields = ("label", "max_uses", "expires_at")
        widgets = {
            "expires_at": forms.DateTimeInput(
                attrs={"type": "datetime-local"},
                format="%Y-%m-%dT%H:%M",
            ),
        }


class ProfileEditForm(forms.Form):
    """Simple form for editing display name and avatar."""
    display_name = forms.CharField(max_length=100)
    avatar = forms.FileField(
        required=False,
        help_text="JPEG, PNG, GIF, or WebP — max 5 MB.",
        widget=forms.FileInput(attrs={"accept": _ACCEPT}),
    )

    def clean_avatar(self):
        f = self.cleaned_data.get("avatar")
        if not f:
            return None
        try:
            return process_image(f)
        except ValueError as exc:
            raise forms.ValidationError(str(exc))
