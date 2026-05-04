"""Config-level views (non-app-specific)."""
from django.conf import settings
from django.http import HttpResponse


def service_worker(request):
    """Serve the push notification service worker from the root scope."""
    sw_path = settings.BASE_DIR / "static" / "js" / "sw.js"
    with open(sw_path, "r") as f:
        content = f.read()
    response = HttpResponse(content, content_type="application/javascript")
    response["Service-Worker-Allowed"] = "/"
    response["Cache-Control"] = "no-cache"
    return response
