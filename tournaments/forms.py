from urllib.parse import urlparse

from django import forms

from accounts.utils import process_image
from .models import EventType, Tournament

_ACCEPT = "image/jpeg,image/png,image/gif,image/webp"


class TournamentForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["event_type"].empty_label = None
        self.fields["event_type"].queryset = EventType.objects.all()

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

    def clean_location_url(self):
        url = self.cleaned_data.get("location_url")
        if not url:
            return url
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise forms.ValidationError("Only http and https URLs are allowed.")
        return url

    class Meta:
        model = Tournament
        fields = ("name", "description", "location_name", "location_url", "event_type", "date", "start_time", "max_rounds")
        widgets = {
            "date": forms.DateInput(attrs={"type": "date"}),
            "start_time": forms.TimeInput(attrs={"type": "time"}),
            "description": forms.Textarea(attrs={"rows": 3}),
            "location_name": forms.TextInput(attrs={"placeholder": "e.g. Card Shop Berlin"}),
            "location_url": forms.URLInput(attrs={"placeholder": "https://maps.google.com/..."}),
        }
        help_texts = {
            "max_rounds": "Leave at 0 to auto-calculate from player count.",
            "location_name": "Venue name or address (only visible to logged-in users).",
            "location_url": "Optional link to map or venue page.",
        }


class ReportResultForm(forms.Form):
    """Form for a player to report their match result."""

    RESULT_CHOICES = [
        ("WIN", "Win"),
        ("LOSS", "Loss"),
        ("DRAW", "Draw"),
    ]
    result = forms.ChoiceField(choices=RESULT_CHOICES, widget=forms.RadioSelect)
