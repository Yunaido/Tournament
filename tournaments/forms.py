from django import forms

from accounts.utils import process_image
from .models import Tournament

_ACCEPT = "image/jpeg,image/png,image/gif,image/webp"


class TournamentForm(forms.ModelForm):
    logo = forms.FileField(
        required=False,
        help_text="Optional tournament logo (JPEG, PNG, GIF, or WebP, max 5 MB).",
        widget=forms.FileInput(attrs={"accept": _ACCEPT}),
    )

    def clean_logo(self):
        f = self.cleaned_data.get("logo")
        if not f:
            return None
        try:
            return process_image(f)
        except ValueError as exc:
            raise forms.ValidationError(str(exc))

    class Meta:
        model = Tournament
        fields = ("name", "description", "date", "max_rounds")
        widgets = {
            "date": forms.DateInput(attrs={"type": "date"}),
            "description": forms.Textarea(attrs={"rows": 3}),
        }
        help_texts = {
            "max_rounds": "Leave at 0 to auto-calculate from player count.",
        }


class ReportResultForm(forms.Form):
    """Form for a player to report their match result."""

    RESULT_CHOICES = [
        ("WIN", "Win"),
        ("LOSS", "Loss"),
        ("DRAW", "Draw"),
    ]
    result = forms.ChoiceField(choices=RESULT_CHOICES, widget=forms.RadioSelect)
