from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password

from .models import Invite
from .utils import process_image

_ACCEPT = "image/jpeg,image/png,image/gif,image/webp"


class RegisterForm(forms.ModelForm):
    """Registration form — password is optional; users can also log in via email link or passkey."""

    display_name = forms.CharField(
        max_length=100,
        help_text="Your in-game / tournament name.",
    )
    avatar = forms.FileField(
        required=False,
        help_text="Optional profile picture (JPEG, PNG, GIF, or WebP, max 5 MB).",
        widget=forms.FileInput(attrs={"accept": _ACCEPT}),
    )
    password1 = forms.CharField(
        label="Password",
        required=False,
        widget=forms.PasswordInput,
        help_text="Optional — leave blank to log in only via email link or passkey.",
    )
    password2 = forms.CharField(
        label="Confirm password",
        required=False,
        widget=forms.PasswordInput,
    )

    class Meta:
        model = User
        fields = ("username", "email", "display_name", "avatar", "password1", "password2")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"].required = True
        self.fields["email"].help_text = "Required — we'll send login links to this address."

    def clean(self):
        cleaned_data = super().clean()
        p1 = cleaned_data.get("password1", "")
        p2 = cleaned_data.get("password2", "")
        if p1 and p1 != p2:
            self.add_error("password2", "Passwords do not match.")
        if p1:
            # Build a temporary user to enable similarity checks
            temp_user = User(
                username=cleaned_data.get("username", ""),
                email=cleaned_data.get("email", ""),
            )
            try:
                validate_password(p1, user=temp_user)
            except forms.ValidationError as err:
                self.add_error("password1", err)
        return cleaned_data

    def save(self, commit=True):
        user = super().save(commit=False)
        password = self.cleaned_data.get("password1")
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        if commit:
            user.save()
        return user

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


class MagicLinkForm(forms.Form):
    """Request a passwordless login link via email."""

    email = forms.EmailField(
        widget=forms.EmailInput(attrs={"placeholder": "your@email.com", "autofocus": True}),
    )


class PasswordLoginForm(forms.Form):
    """Login with username and password."""

    username = forms.CharField(
        max_length=150,
        widget=forms.TextInput(attrs={"autocomplete": "username"}),
    )
    password = forms.CharField(widget=forms.PasswordInput(attrs={"autocomplete": "current-password"}))


class ChangePasswordForm(forms.Form):
    """Set or change a user's password from the security page."""

    current_password = forms.CharField(
        required=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "current-password"}),
        help_text="Leave blank if you don't have a password yet.",
    )
    new_password1 = forms.CharField(
        label="New password",
        widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}),
    )
    new_password2 = forms.CharField(
        label="Confirm new password",
        widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}),
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        if user and not user.has_usable_password():
            self.fields["current_password"].widget = forms.HiddenInput()

    def clean_current_password(self):
        current = self.cleaned_data.get("current_password", "")
        if self.user and self.user.has_usable_password():
            if not current:
                raise forms.ValidationError("Please enter your current password.")
            if not self.user.check_password(current):
                raise forms.ValidationError("Current password is incorrect.")
        return current

    def clean(self):
        cleaned_data = super().clean()
        p1 = cleaned_data.get("new_password1", "")
        p2 = cleaned_data.get("new_password2", "")
        if p1 and p1 != p2:
            self.add_error("new_password2", "Passwords do not match.")
        if p1 and self.user:
            try:
                validate_password(p1, user=self.user)
            except forms.ValidationError as err:
                self.add_error("new_password1", err)
        return cleaned_data


class ChangeEmailForm(forms.Form):
    """Change the user's email address."""

    email = forms.EmailField(
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
        help_text="Magic login links will be sent to this address.",
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user

    def clean_email(self):
        email = self.cleaned_data["email"]
        if User.objects.filter(email__iexact=email).exclude(pk=self.user.pk).exists():
            raise forms.ValidationError("This email is already in use.")
        return email
