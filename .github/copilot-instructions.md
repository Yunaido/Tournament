# Copilot Instructions – OP TCG Tournament Manager

## Project Overview

A **One Piece Trading Card Game** tournament management web app built with **Django 5.1**, styled with Bootstrap 5 (dark theme), and enhanced with **htmx** for partial page updates. Runs in Docker (PostgreSQL in production, SQLite for local dev).

## Tech Stack

| Layer        | Technology                            |
| ------------ | ------------------------------------- |
| Backend      | Django 5.1, Python 3.12               |
| Frontend     | Django templates, Bootstrap 5.3, htmx |
| Database     | PostgreSQL 16 (prod) / SQLite (dev)   |
| Static files | Whitenoise                            |
| Images       | Pillow (BinaryField in DB)            |
| Server       | Gunicorn                              |
| Container    | Docker, docker-compose                |
| E2E tests    | Playwright (TypeScript)               |

## Project Structure

```
config/              # Django project config (settings split: base / local / production)
accounts/            # User auth, registration (invite-only), player profiles, invite management
tournaments/         # Tournament CRUD, Swiss-system pairing, match reporting, scoring/standings
templates/           # Django templates (base.html + app-specific + components/)
static/              # CSS, JS, default images (img/defaults/)
e2e/                 # Playwright end-to-end tests
```

## Key Architectural Decisions

- **Invite-only registration**: Users must have a valid invite link (UUID token) to register.
- **Swiss-system pairing**: Tournaments use Swiss pairing with configurable or auto-calculated rounds (ceil(log2(n))).
- **Dual-confirm match reporting**: Both players report results independently; the match auto-confirms when reports are consistent, resets both on conflict.
- **OP TCG tiebreakers**: Standings use Match Points → Opponent Match Win % → Game Win % → Opponent Game Win %.
- **Image handling**: `PlayerProfile.avatar_data` and `Tournament.logo_data` use `BinaryField` to store image bytes directly in the database (no file storage needed). Uploads are processed via `accounts/utils.py` (`process_image`): SVGs are stored as-is, all raster formats are converted to WebP (animated GIFs/WebPs are preserved). `get_image_content_type()` sniffs stored bytes to serve the correct `Content-Type`. Serving views (`serve_avatar`, `serve_logo`) return `HttpResponse` with the appropriate content type. Default SVG images are served from static files when no upload exists.
- **Settings split**: `config/settings/base.py` (shared), `local.py` (SQLite, DEBUG), `production.py` (PostgreSQL, DEBUG=False). Docker defaults to production settings.

## Models

### accounts app

- **Invite** — UUID token, created_by, max_uses, expires_at, is_active
- **PlayerProfile** — OneToOne with User, display_name, avatar_data (BinaryField, WebP bytes), invited_by, lifetime stats (wins/losses/draws/tournaments)

### tournaments app

- **Tournament** — name, description, logo_data (BinaryField, WebP bytes), created_by, date, status (SETUP → ACTIVE → FINISHED), max_rounds, current_round
- **TournamentPlayer** — ForeignKey(Tournament + User), seed, dropped
- **Round** — tournament, number, status (PENDING → ACTIVE → COMPLETED)
- **Match** — round, player1, player2 (nullable for BYE), scores, per-player result/confirmed fields, overall confirmed flag, is_bye

## Development Commands

All common tasks are wrapped in the `Makefile`. Run `make` or `make help` to see the full list.

### Docker

```bash
make up          # Start containers (detached)
make down        # Stop and remove containers
make build       # Rebuild image and start containers
make restart     # Restart only the web container
make logs        # Tail web container logs
```

### Django

```bash
make migrate     # Apply database migrations
make migrations  # Create new migration files (makemigrations)
make seed        # Seed development data (additive – keeps existing rows)
make flush       # Wipe DB and re-seed from scratch
make shell       # Open Django shell inside the container
make check       # Run Django system checks
```

### E2E Testing

```bash
make install     # Install Playwright deps + Chromium browser
make e2e         # Run Playwright tests against current DB state
make e2e-ui      # Open Playwright interactive UI
make e2e-debug   # Run headed + debug mode
make test        # Full pipeline: flush DB → seed → run all E2E tests
```

`make test` is the canonical way to run the test suite locally. It guarantees a clean, deterministic database state (via `seed --flush`) before the Playwright run.

The underlying Docker invocation for one-off management commands is:
```bash
docker compose run --rm --entrypoint "" web python manage.py <command>
```

## Testing Policy

Every change — new feature, bug fix, or refactor — **must** be accompanied by Playwright E2E tests.

- **New views / endpoints**: add tests covering the happy path, edge cases, and access control (auth required, wrong user, etc.).
- **New forms**: test valid submission, invalid/missing data, and any server-side validation errors.
- **Bug fixes**: add a regression test that would have caught the bug.
- **UI changes**: update any existing tests that break, and add new ones if new interactions are introduced.

Tests live in `e2e/tests/`. Use the shared helpers from `e2e/tests/helpers.ts` (`login`, `logout`, `expectAlert`, etc.) and add new helpers there if a pattern is reused across files.

Run `make test` to verify the full suite passes against a clean database before considering any change complete.

## Coding Conventions

- **Views**: Function-based views with `@login_required` where needed.
- **Forms**: ModelForm for data models, standard Form for actions (e.g. `ReportResultForm`).
- **Templates**: Extend `base.html`, use `{% block content %}`. Reusable partials in `templates/components/`.
- **htmx**: Used for partial updates (standings refresh, match card updates). Partials rendered by dedicated views.
- **URLs**: `accounts` app uses namespace `accounts:`. Tournament URLs are at root level.
- **File uploads**: Always use `enctype="multipart/form-data"` on forms and pass `request.FILES` to form constructors.
- **Image defaults**: Use model property (`avatar_url`, `logo_url`) that returns the serving view URL or a static default SVG.
- **Test users**: Seed command creates 8 One Piece characters (password: `testpass123`) + admin (`adminadmin`).

## Important Notes

- The entrypoint.sh auto-runs migrations and creates the superuser on container start. Bypass with `--entrypoint ""` when running one-off commands.
- Images are stored as binary data in the database — no media volume or file storage is needed.
- Port 8000 is the default; check for conflicts if the container won't start.
