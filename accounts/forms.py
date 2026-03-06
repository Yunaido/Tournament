from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import Invite


class RegisterForm(UserCreationForm):
    display_name = forms.CharField(
        max_length=100,
        help_text="Your in-game / tournament name.",
    )

    class Meta:
        model = User
        fields = ("username", "display_name", "password1", "password2")


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
