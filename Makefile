.PHONY: help up down build restart logs \
        migrate makemigrations seed flush shell check \
        install e2e e2e-ui e2e-debug \
        test

# ── colours ─────────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m
CYAN  := \033[36m

# ── default target ───────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(BOLD)OP TCG Tournament Manager$(RESET)"
	@echo ""
	@echo "$(CYAN)Docker$(RESET)"
	@echo "  make up          Start containers (detached)"
	@echo "  make down        Stop and remove containers"
	@echo "  make build       Rebuild image and start containers"
	@echo "  make restart     Restart the web container"
	@echo "  make logs        Tail web container logs"
	@echo ""
	@echo "$(CYAN)Django$(RESET)"
	@echo "  make migrate     Apply database migrations"
	@echo "  make migrations  Create new migration files"
	@echo "  make seed        Seed development data (keeps existing data)"
	@echo "  make flush       Wipe database and re-seed from scratch"
	@echo "  make shell       Open Django shell"
	@echo "  make check       Run Django system checks"
	@echo ""
	@echo "$(CYAN)Testing$(RESET)"
	@echo "  make install     Install Playwright + browser"
	@echo "  make e2e         Run Playwright tests against current DB"
	@echo "  make e2e-ui      Open Playwright UI mode"
	@echo "  make e2e-debug   Run Playwright in headed + debug mode"
	@echo "  make test        $(BOLD)Flush DB → seed → run all E2E tests$(RESET)"
	@echo ""

# ── docker ───────────────────────────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose up -d --build

restart:
	docker compose restart web

logs:
	docker compose logs -f web

# ── django management ────────────────────────────────────────────────────────
RUN := docker compose run --rm --entrypoint "" -v "$$PWD:/app" web python manage.py

migrate:
	$(RUN) migrate

migrations:
	$(RUN) makemigrations

seed:
	$(RUN) seed

flush:
	$(RUN) seed --flush

shell:
	$(RUN) shell

check:
	$(RUN) check

# ── playwright ───────────────────────────────────────────────────────────────
install:
	cd e2e && npm install && npx playwright install chromium

e2e:
	cd e2e && npx playwright test

e2e-ui:
	cd e2e && npx playwright test --ui

e2e-debug:
	cd e2e && npx playwright test --headed --debug

# ── full test run ─────────────────────────────────────────────────────────────
# Wipe the DB, seed fresh data, then run the entire Playwright suite.
# This guarantees a known database state for every CI / local test run.
test: flush e2e
	@echo ""
	@echo "$(GREEN)$(BOLD)✓ All E2E tests complete$(RESET)"
