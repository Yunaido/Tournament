from django import forms

from .models import Tournament


class TournamentForm(forms.ModelForm):
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
