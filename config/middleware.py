"""Custom middleware for the OP TCG Tournament application."""


class ContentSecurityPolicyMiddleware:
    """
    Adds a Content-Security-Policy header to every response.

    Two tiers:
      - Public routes: strict script-src (no 'unsafe-inline' for scripts).
        Injected scripts from unexpected origins are blocked.
      - /admin/: broadened script-src with 'unsafe-inline' because Django's
        own admin templates embed inline <script> blocks.

    style-src uses 'unsafe-inline' everywhere because:
      - Bootstrap's JS modifies inline styles for transitions/animations.
      - There are many inline style= attributes in templates.
      CSS injection is much lower risk than script injection.
    """

    # Directives shared by all routes.
    _COMMON = (
        "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' https://cdn.jsdelivr.net",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
        "default-src 'self'",
    )

    # script-src for regular pages — no 'unsafe-inline'.
    _SCRIPT_PUBLIC = (
        "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com"
    )

    # script-src for Django admin — needs 'unsafe-inline' for its own templates.
    _SCRIPT_ADMIN = (
        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'"
    )

    def __init__(self, get_response):
        self.get_response = get_response
        # Pre-build both header values so there's no per-request string work.
        self._csp_public = "; ".join([self._SCRIPT_PUBLIC, *self._COMMON])
        self._csp_admin = "; ".join([self._SCRIPT_ADMIN, *self._COMMON])

    def __call__(self, request):
        response = self.get_response(request)
        csp = self._csp_admin if request.path.startswith("/admin/") else self._csp_public
        response["Content-Security-Policy"] = csp
        return response
