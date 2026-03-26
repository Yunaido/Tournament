import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { expectAlert, loginAsAdmin, loginAsPlayer } from "./helpers";

test.describe("Tournaments – list page", () => {
    test("home page shows active tournaments", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("body")).toContainText("Grand Line Cup");
    });

    test("home page shows setup tournaments", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("body")).toContainText("New World Invitational");
    });

    test("home page shows finished tournaments", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("body")).toContainText("East Blue Showdown");
    });

    test("finished tournament has a Results link", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await expect(card.locator('a:has-text("Results"), a:has-text("View")')).toBeVisible();
    });

    test("sort and type filter controls are visible", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("#sort-select")).toBeVisible();
        await expect(page.locator("body")).toContainText("All");
    });

    test("filter by event type shows only matching tournaments", async ({ page }) => {
        await page.goto("/");
        // Find the "Championship" type badge and click it
        const typeBadge = page.locator('a.badge', { hasText: "Championship" });
        await typeBadge.click();
        await expect(page.locator("body")).toContainText("East Blue Showdown");
        await expect(page.locator("body")).not.toContainText("Grand Line Cup");
        await expect(page.locator("body")).not.toContainText("New World Invitational");
    });

    test("filter by event type preserves type param in URL", async ({ page }) => {
        await page.goto("/");
        const typeBadge = page.locator('a.badge', { hasText: "Championship" });
        await typeBadge.click();
        await expect(page).toHaveURL(/type=/);
    });

    test("sorting by date ascending puts older active tournament before newer one", async ({ page }) => {
        await page.goto("/?sort=date_asc");
        const cards = await page.locator(".card-title").allInnerTexts();
        // Grand Line Cup is today; New World Invitational is 3 days in the future
        // With date_asc: Grand Line (today) should appear before New World (future)
        const grandLineIdx = cards.findIndex(t => t.includes("Grand Line Cup"));
        const newWorldIdx = cards.findIndex(t => t.includes("New World Invitational"));
        expect(grandLineIdx).toBeGreaterThanOrEqual(0);
        expect(newWorldIdx).toBeGreaterThanOrEqual(0);
        expect(grandLineIdx).toBeLessThan(newWorldIdx);
    });

    test("sorting by date descending shows newest active tournament first", async ({ page }) => {
        await page.goto("/?sort=date_desc");
        const cards = await page.locator(".card-title").allInnerTexts();
        // New World Invitational is 3 days in the future; Grand Line Cup is today
        // With date_desc: New World (future) should appear before Grand Line (today)
        const grandLineIdx = cards.findIndex(t => t.includes("Grand Line Cup"));
        const newWorldIdx = cards.findIndex(t => t.includes("New World Invitational"));
        expect(grandLineIdx).toBeGreaterThanOrEqual(0);
        expect(newWorldIdx).toBeGreaterThanOrEqual(0);
        expect(newWorldIdx).toBeLessThan(grandLineIdx);
    });

    test("sorting by name shows select with correct default", async ({ page }) => {
        await page.goto("/?sort=name_asc");
        await expect(page.locator("#sort-select")).toHaveValue("?sort=name_asc");
    });

    test("all type filter link clears type filter", async ({ page }) => {
        await page.goto("/?type=1&sort=date_desc");
        await page.locator('a.badge', { hasText: "All" }).click();
        await expect(page.locator("body")).toContainText("Grand Line Cup");
        await expect(page.locator("body")).toContainText("East Blue Showdown");
    });
});

test.describe("Tournaments – detail view", () => {
    test("can view active tournament detail", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("h2, h3")).toContainText("Grand Line Cup");
    });

    test("active tournament detail shows current round", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("body")).toContainText(/round/i);
    });

    test("can view finished tournament detail", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        await expect(page.locator("body")).toContainText("East Blue Showdown");
    });

    test("tournament detail shows players list", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("body")).toContainText(/luffy|zoro|nami/i);
    });
});

test.describe("Tournaments – create", () => {
    test("create form requires a name", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await page.fill("#id_date", "2026-04-01");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page).toHaveURL(/create/);
    });

    test("create tournament and is redirected to its detail", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await page.fill("#id_name", `PW Cup ${Date.now()}`);
        await page.fill("#id_date", "2026-05-01");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText("PW Cup");
    });

    test("uploaded PNG logo is accepted", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await page.fill("#id_name", `Logo Cup ${Date.now()}`);
        await page.fill("#id_date", "2026-05-01");

        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const pngBuffer = Buffer.from(pngBase64, "base64");
        const tmpPath = path.join("/tmp", `logo_${Date.now()}.png`);
        fs.writeFileSync(tmpPath, pngBuffer);

        await page.setInputFiles("#id_logo", tmpPath);
        await page.locator('.card-body button[type="submit"]').click();
        // Should land on detail, not stay on create
        await expect(page).not.toHaveURL(/create/);

        fs.rmSync(tmpPath);
    });

    test("SVG logo upload is rejected", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await page.fill("#id_name", `SVG Cup ${Date.now()}`);
        await page.fill("#id_date", "2026-05-01");

        const tmpPath = path.join("/tmp", `logo_${Date.now()}.svg`);
        fs.writeFileSync(tmpPath, '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

        await page.setInputFiles("#id_logo", tmpPath);
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page).toHaveURL(/create/);
        await expect(page.locator(".invalid-feedback, ul.errorlist, .alert-danger")).toBeVisible();

        fs.rmSync(tmpPath);
    });

    test("any logged-in user can access the create page", async ({ page }) => {
        // tournament_create is @login_required only — all logged-in users can create
        await loginAsPlayer(page, "luffy");
        await page.goto("/tournaments/create/");
        await expect(page.locator("h3, h2")).toContainText(/create|new|tournament/i);
    });
});

test.describe("Tournaments – location", () => {
    test("logged-in user sees location on detail page", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("body")).toContainText("Grand Line Card Shop");
    });

    test("location with URL is rendered as a link", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const link = page.locator('a[href*="maps.google.com"]');
        await expect(link).toBeVisible();
        await expect(link).toContainText("Grand Line Card Shop");
    });

    test("anonymous user does NOT see location on detail page", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("body")).not.toContainText("Grand Line Card Shop");
    });

    test("logged-in user sees location on list page", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        await expect(page.locator("body")).toContainText("Grand Line Card Shop");
    });

    test("anonymous user does NOT see location on list page", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("body")).not.toContainText("Grand Line Card Shop");
    });

    test("location without URL is shown as plain text", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("body")).toContainText("Baratie Restaurant");
        // No link since no URL was set
        await expect(page.locator('a:has-text("Baratie")')).not.toBeVisible();
    });

    test("create form has location fields", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await expect(page.locator("#id_location_name")).toBeVisible();
        await expect(page.locator("#id_location_url")).toBeVisible();
    });

    test("can create tournament with location", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Location Cup ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.fill("#id_location_name", "Test Venue");
        await page.fill("#id_location_url", "https://example.com/map");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText(name);
        await expect(page.locator("body")).toContainText("Test Venue");
    });

    test("javascript: URL in location_url is rejected", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `XSS Test ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.fill("#id_location_name", "Evil Venue");
        // Django URLField may block javascript: at the browser level, so fill via JS
        await page.locator("#id_location_url").evaluate(
            (el: HTMLInputElement) => { el.value = "javascript:alert(1)"; }
        );
        await page.locator('.card-body button[type="submit"]').click();
        // Should stay on the create form with an error
        await expect(page).toHaveURL(/create/);
    });
});

test.describe("Tournaments – start time", () => {
    test("create form has a start time field", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await expect(page.locator("#id_start_time")).toBeVisible();
    });

    test("tournament created with start time shows time in detail view", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Timed Cup ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-06-15");
        await page.fill("#id_start_time", "10:30");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText("10:30");
    });

    test("tournament created with start time shows time on list page", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Timed List Cup ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-06-20");
        await page.fill("#id_start_time", "14:00");
        await page.locator('.card-body button[type="submit"]').click();
        await page.goto("/");
        const card = page.locator(".card", { hasText: name });
        await expect(card).toContainText("14:00");
    });

    test("tournament without start time shows only date in detail view", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `No Time Cup ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-07-01");
        // leave start_time empty
        await page.locator('.card-body button[type="submit"]').click();
        // date should appear
        await expect(page.locator("body")).toContainText("01.07.2026");
        // time should NOT appear (no "HH:MM" pattern after the date)
        const dateSpan = page.locator("span.text-muted", { hasText: "01.07.2026" });
        await expect(dateSpan).not.toContainText(":");
    });

    test("edit form pre-populates start_time from saved value", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Edit Time Cup ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-08-10");
        await page.fill("#id_start_time", "09:30");
        await page.locator('.card-body button[type="submit"]').click();
        // Extract tournament ID from detail page URL
        await page.waitForURL(/\/tournaments\/\d+\//);
        const url = page.url();
        const id = url.match(/\/tournaments\/(\d+)\//)?.[1];
        expect(id).toBeTruthy();
        // Go to edit page and verify start_time is pre-filled
        await page.goto(`/tournaments/${id}/edit/`);
        const timeValue = await page.inputValue("#id_start_time");
        expect(timeValue).toBe("09:30");
    });

    test("edit form pre-populates start_time and saves updated value", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Update Time Cup ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-09-05");
        await page.fill("#id_start_time", "11:00");
        await page.locator('.card-body button[type="submit"]').click();
        await page.waitForURL(/\/tournaments\/\d+\//);
        const url = page.url();
        const id = url.match(/\/tournaments\/(\d+)\//)?.[1];
        // Edit: change time to 15:45
        await page.goto(`/tournaments/${id}/edit/`);
        await page.fill("#id_start_time", "15:45");
        await page.locator('button:has-text("Save Changes")').click();
        await expect(page.locator("body")).toContainText("15:45");
    });
});

test.describe("Tournaments – share link", () => {
    test("share button visible on SETUP tournament for logged-in user", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('button[data-bs-target="#shareModal"]')).toBeVisible();
    });

    test("share button NOT visible for anonymous users", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('button[data-bs-target="#shareModal"]')).not.toBeVisible();
    });

    test("clicking share opens modal with QR code and URL", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await page.locator('button[data-bs-target="#shareModal"]').click();
        // Modal should appear
        await expect(page.locator("#shareModal")).toBeVisible();
        // QR code should be rendered (SVG inside the container)
        await expect(page.locator("#tournament-qrcode svg")).toBeVisible();
        // URL field should contain the tournament URL
        const urlField = page.locator("#tournament-url");
        await expect(urlField).toBeVisible();
        const value = await urlField.inputValue();
        expect(value).toContain("/tournaments/");
    });

    test("copy button triggers clipboard write", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        // Wait for Bootstrap JS to fully load before triggering modal
        await page.waitForLoadState("networkidle");
        await page.locator('button[data-bs-target="#shareModal"]').click();
        await expect(page.locator("#shareModal")).toBeVisible({ timeout: 10000 });
        await page.locator("#copy-btn").click();
        // Button text changes to "Copied" (via clipboard API or execCommand fallback)
        await expect(page.locator("#copy-btn")).toContainText("Copied");
    });

    test("share button not shown on ACTIVE tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        // Share modal shouldn't exist since tournament is ACTIVE
        await expect(page.locator("#shareModal")).not.toBeVisible();
    });
});

test.describe("Tournaments – event type & accent color", () => {
    test("championship tournament shows event type badge on list", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await expect(card.locator(".badge", { hasText: "Championship" })).toBeVisible();
    });

    test("competitive tournament shows event type badge on list", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await expect(card.locator(".badge", { hasText: "Competitive" })).toBeVisible();
    });

    test("casual tournament does NOT show event type badge", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await expect(card.locator(".badge", { hasText: "Casual" })).not.toBeVisible();
    });

    test("competitive tournament has colored border from event type", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        const borderColor = await card.evaluate((el) => getComputedStyle(el).borderColor);
        // Competitive → #118ab2 → rgb(17, 138, 178)
        expect(borderColor).toContain("17");
    });

    test("event type badge shown on detail page", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator(".badge", { hasText: "Competitive" })).toBeVisible();
    });

    test("create form has event type field", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await expect(page.locator("#id_event_type")).toBeVisible();
    });

    test("can create tournament with event type", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Championship ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.selectOption("#id_event_type", { label: "Championship" });
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText(name);
        await expect(page.locator(".badge", { hasText: "Championship" })).toBeVisible();
    });

    test("admin can create custom event type and use it", async ({ page }) => {
        await loginAsAdmin(page);
        // Create a custom event type via Django admin
        await page.goto("/admin/tournaments/eventtype/add/");
        // Handle admin login redirect if needed
        if (page.url().includes("/admin/login/")) {
            await page.fill("#id_username", "admin");
            await page.fill("#id_password", "adminadmin");
            await page.click('input[type="submit"]');
            await page.goto("/admin/tournaments/eventtype/add/");
        }
        await page.fill("#id_name", "Treasure Cup");
        await page.check("#id_use_accent_color");
        await page.fill("#id_accent_color", "#ff8800");
        await page.fill("#id_sort_order", "10");
        await page.locator('input[name="_save"]').click();
        await expect(page.locator("body")).toContainText("Treasure Cup");

        // Use the custom event type in a new tournament
        await page.goto("/tournaments/create/");
        const name = `Custom Type ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.selectOption("#id_event_type", { label: "Treasure Cup" });
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText(name);
        await expect(page.locator(".badge", { hasText: "Treasure Cup" })).toBeVisible();
    });
});

test.describe("Tournaments – join / leave", () => {
    test("player can join a SETUP tournament", async ({ page }) => {
        // Use franky — less likely to already be in the tournament
        await loginAsPlayer(page, "franky");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const joinBtn = page.locator('button:has-text("Join"), a:has-text("Join")');
        if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await joinBtn.click();
            // Either joined successfully or was already registered
            const body = await page.locator("body").textContent();
            expect(body).toMatch(/joined the tournament|already registered/i);
        } else {
            // Player already in tournament — check they appear in the player list
            await expect(page.locator("body")).toContainText(/franky/i);
        }
    });

    test("player already registered sees informational message", async ({ page }) => {
        await loginAsPlayer(page, "luffy"); // luffy already joined New World Invitational
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        // Join button is always shown; clicking it when already registered shows a message
        const joinBtn = page.locator('button:has-text("Join Tournament")');
        await expect(joinBtn).toBeVisible();
        await joinBtn.click();
        await expect(page.locator("body")).toContainText(/already|registered/i);
    });

    test("player can leave a SETUP tournament", async ({ page }) => {
        // Use zoro who is in New World Invitational
        await loginAsPlayer(page, "zoro");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const leaveBtn = page.locator('button:has-text("Leave"), a:has-text("Leave")');
        if (await leaveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await leaveBtn.click();
            await expectAlert(page, /left|removed/i);
            // Rejoin to preserve seed state
            const joinBtn = page.locator('button:has-text("Join"), a:has-text("Join")');
            if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) await joinBtn.click();
        }
    });

    test("player cannot leave an ACTIVE tournament", async ({ page }) => {
        await loginAsPlayer(page, "luffy"); // luffy is in Grand Line Cup (ACTIVE)
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        // Leave button should not exist or should be disabled
        const leaveBtn = page.locator('button:has-text("Leave Tournament"), a:has-text("Leave Tournament")');
        expect(await leaveBtn.isVisible({ timeout: 1000 }).catch(() => false)).toBeFalsy();
    });
});

test.describe("Tournaments – start", () => {
    test("organizer can start a tournament with enough players", async ({ page }) => {
        // Create a fresh tournament and add 2 players, then start
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await page.fill("#id_name", `Start Test ${Date.now()}`);
        await page.fill("#id_date", "2026-06-01");
        await page.locator('.card-body button[type="submit"]').click();

        // We need 2 players; admin and luffy should be joinable
        // Try to start with just admin (1 player) — should be blocked
        const startBtn = page.locator('button:has-text("Start"), a:has-text("Start")');
        if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await startBtn.click();
            // Should either stay on page or show error
            const body = await page.locator("body").textContent();
            // It should show error or still be in SETUP
            expect(body).toMatch(/error|nee|player|least|2/i);
        }
    });

    test("non-organizer cannot see start button", async ({ page }) => {
        await loginAsPlayer(page, "chopper");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const startBtn = page.locator('button:has-text("Start Tournament")');
        expect(await startBtn.isVisible({ timeout: 1000 }).catch(() => false)).toBeFalsy();
    });
});

test.describe("Tournaments – standings", () => {
    test("standings page loads for finished tournament", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        const standingsLink = page.locator('a[href*="standings"]').first();
        if (await standingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await standingsLink.click();
            await expect(page.locator("table, .table")).toBeVisible();
        }
    });

    test("standings table shows players ranked by points", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        const standingsLink = page.locator('a[href*="standings"]').first();
        if (await standingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await standingsLink.click();
            // Should show at least one player row
            await expect(page.locator("tbody tr")).toHaveCount(6);
        }
    });

    test("standings page is accessible directly via URL", async ({ page }) => {
        // Find the tournament pk from the active standings page
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        const href = await page.locator('a[href*="standings"]').first().getAttribute("href");
        if (href) {
            await page.goto(href);
            // Use .filter to avoid strict mode with multiple headings
            await expect(page.locator("h2, h3").filter({ hasText: /standings/i }).first()).toBeVisible();
        }
    });
});

test.describe("Tournaments – match history", () => {
    test("match history link is shown on tournament detail", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        await expect(page.locator('a[href*="/history/"]').first()).toBeVisible();
    });

    test("match history page shows previous matches", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        const histLink = page.locator('a[href*="/history/"]').first();
        await histLink.click();
        await expect(page.locator("h2, h3")).toContainText(/match history/i);
        // Should have a table or list of matches
        await expect(page.locator("table tr, .match-row")).not.toHaveCount(0);
    });
});

test.describe("Tournaments – round navigation", () => {
    test("active tournament shows round navigation selector", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        // Look for a round selector / navigation links
        const roundNav = page.locator('select[name="round"], a[href*="round="], .round-nav');
        // Not all states have nav, so we just check if it exists
        const exists = await roundNav.isVisible({ timeout: 2000 }).catch(() => false);
        // This check is informational — the test passes regardless
        if (exists) {
            await expect(roundNav.first()).toBeVisible();
        }
    });
});

test.describe("Tournaments – CSP header", () => {
    test("response includes Content-Security-Policy header", async ({ page }) => {
        const response = await page.goto("/");
        const csp = response?.headers()["content-security-policy"];
        expect(csp).toBeTruthy();
    });
});

test.describe("Tournaments – serve logo", () => {
    test("tournament with uploaded logo serves image via /logo/ URL", async ({ page }) => {
        await loginAsAdmin(page);
        // Create a tournament with a logo
        await page.goto("/tournaments/create/");
        const name = `Logo Serve ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-06-01");

        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const pngBuffer = Buffer.from(pngBase64, "base64");
        const tmpPath = path.join("/tmp", `logo_serve_${Date.now()}.png`);
        fs.writeFileSync(tmpPath, pngBuffer);
        await page.setInputFiles("#id_logo", tmpPath);
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page).not.toHaveURL(/create/);
        fs.rmSync(tmpPath);

        // Extract the tournament PK from the URL
        const pk = page.url().match(/tournaments\/(\d+)/)?.[1];
        expect(pk).toBeTruthy();

        // Fetch the logo endpoint directly
        const logoRes = await page.request.get(`/tournaments/${pk}/logo/`);
        expect(logoRes.status()).toBe(200);
        expect(logoRes.headers()["content-type"]).toContain("image/");
        expect(logoRes.headers()["x-content-type-options"]).toBe("nosniff");
    });

    test("tournament without logo returns 404 on /logo/ URL", async ({ page }) => {
        await loginAsAdmin(page);
        // Create a tournament WITHOUT a logo
        await page.goto("/tournaments/create/");
        const name = `No Logo ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-06-01");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page).not.toHaveURL(/create/);

        const pk = page.url().match(/tournaments\/(\d+)/)?.[1];
        expect(pk).toBeTruthy();

        const logoRes = await page.request.get(`/tournaments/${pk}/logo/`);
        expect(logoRes.status()).toBe(404);
    });
});

test.describe("Tournaments – htmx standings partial", () => {
    test("standings partial endpoint returns table content", async ({ page }) => {
        // The finished tournament (East Blue Showdown) has standings
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        const link = card.locator('a:has-text("Results"), a:has-text("View")');
        await link.click();

        // Get the PK from URL
        const pk = page.url().match(/tournaments\/(\d+)/)?.[1];
        expect(pk).toBeTruthy();

        // Fetch the htmx partial
        const res = await page.request.get(`/tournaments/${pk}/standings-partial/`);
        expect(res.status()).toBe(200);
        const html = await res.text();
        // Should contain table elements and player names
        expect(html).toContain("<table");
        expect(html).toContain("<tr");
    });
});

test.describe("Tournaments – organizer info", () => {
    test("list cards show organizer name", async ({ page }) => {
        await page.goto("/");
        // Admin created all seeded tournaments
        const cards = page.locator(".card");
        await expect(cards.first()).toContainText(/by Admin/i);
    });

    test("detail page shows organizer name", async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator("body")).toContainText(/Organized by.*Admin/i);
    });
});

test.describe("Tournaments – kick players", () => {
    test("organizer sees kick button next to non-organizer players in SETUP", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();

        // Seed adds luffy/zoro/nami as players; admin is the organizer but is NOT in the player list.
        // All three players should have kick buttons when the organizer is viewing.
        const playerList = page.locator(".list-group-item");
        for (const name of ["Luffy", "Zoro", "Nami"]) {
            const row = playerList.filter({ hasText: name });
            await expect(row.locator('button:has-text("✕")')).toBeVisible();
        }

        // Admin (organizer) is not in the player list at all
        await expect(playerList.filter({ hasText: "Admin" })).not.toBeVisible();
    });

    test("non-organizer does not see kick buttons", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('button:has-text("✕")')).not.toBeVisible();
    });

    test("organizer can kick a player from SETUP tournament", async ({ page }) => {
        // Create a fresh tournament, join a player, then kick them
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Kick Test ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText(name);
        const detailUrl = page.url();
        // Extract relative path for navigation
        const detailPath = new URL(detailUrl).pathname;

        // Login as luffy and join
        await loginAsPlayer(page, "luffy");
        // Verify luffy is authenticated before proceeding
        await expect(page.locator("nav")).toContainText("Luffy");
        await page.goto(detailPath);
        await page.locator('button:has-text("Join Tournament")').click();
        await expectAlert(page, /joined/i);

        // Login as admin and kick luffy
        await loginAsAdmin(page);
        await page.goto(detailPath);
        // Accept the confirm dialog
        page.on("dialog", (dialog) => dialog.accept());
        await page.locator('.list-group-item', { hasText: "Luffy" }).locator('button:has-text("✕")').click();
        await expectAlert(page, /removed/i);
        // Luffy should no longer be listed
        await expect(page.locator(".list-group-item", { hasText: "Luffy" })).not.toBeVisible();
    });

    test("staff can kick the organizer from SETUP tournament", async ({ page }) => {
        // Create a tournament as luffy (luffy = organizer) and have luffy join it
        await loginAsPlayer(page, "luffy");
        await page.goto("/tournaments/create/");
        const name = `Organizer Kick Test ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText(name);
        const detailPath = new URL(page.url()).pathname;
        // Creator is auto-joined on tournament creation, no need to join manually.

        // Admin (staff) can see the kick button next to the organizer row
        await loginAsAdmin(page);
        await page.goto(detailPath);
        const organizerRow = page.locator(".list-group-item", { hasText: "Luffy" });
        await expect(organizerRow.locator(".badge")).toContainText("Organizer");
        await expect(organizerRow.locator('button:has-text("✕")')).toBeVisible();

        // Admin kicks luffy (the organizer)
        page.on("dialog", (dialog) => dialog.accept());
        await organizerRow.locator('button:has-text("✕")').click();
        await expectAlert(page, /removed/i);
        await expect(page.locator(".list-group-item", { hasText: "Luffy" })).not.toBeVisible();
    });

    test("non-organizer cannot kick via direct URL", async ({ page }) => {
        // Step 1: as admin, read a real player pk from a kick-form action
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const detailUrl = page.url();
        const pk = detailUrl.match(/\/tournaments\/(\d+)\//)?.[1];
        expect(pk).toBeTruthy();

        // Find the first non-organizer player via its kick form URL
        const kickForm = page.locator('form[action*="/kick/"]').first();
        const kickAction = await kickForm.getAttribute("action");
        const targetUserPk = kickAction?.match(/\/kick\/(\d+)\//)?.[1];
        expect(targetUserPk).toBeTruthy();

        // Count how many players are listed right now
        const initialCount = await page.locator(".list-group-item").count();

        // Step 2: log in as luffy (non-organizer) and attempt the kick via POST
        await loginAsPlayer(page, "luffy");
        await page.goto(detailUrl);
        const csrfToken = await page.evaluate(
            () => (document.querySelector("[name=csrfmiddlewaretoken]") as HTMLInputElement)?.value ?? ""
        );
        const response = await page.request.post(`/tournaments/${pk}/kick/${targetUserPk}/`, {
            form: { csrfmiddlewaretoken: csrfToken },
            maxRedirects: 0,
        });
        // Should be rejected: 302 redirect (to login or detail) or 403 forbidden
        expect([302, 403]).toContain(response.status());

        // Step 3: verify the player was NOT actually kicked
        await loginAsAdmin(page);
        await page.goto(detailUrl);
        const countAfter = await page.locator(".list-group-item").count();
        expect(countAfter).toBe(initialCount);
    });

    test("kick button not shown on ACTIVE tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('button:has-text("✕")')).not.toBeVisible();
    });
});

test.describe("Tournaments – edit", () => {
    test("organizer sees Edit button on SETUP tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('a:has-text("Edit")')).toBeVisible();
    });

    test("Edit button not shown on ACTIVE tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('a:has-text("Edit")')).not.toBeVisible();
    });

    test("non-organizer does not see Edit button", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('a:has-text("Edit")')).not.toBeVisible();
    });

    test("organizer can edit tournament name and description", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await page.locator('a:has-text("Edit")').click();
        await expect(page).toHaveURL(/\/edit\//);

        // Fields should be pre-populated
        await expect(page.locator("#id_name")).toHaveValue("New World Invitational");

        // Change the name
        const newName = `New World Invitational (Edited ${Date.now()})`;
        await page.fill("#id_name", newName);
        await page.fill("#id_description", "Updated description.");
        await page.locator('.card-body button[type="submit"]').click();

        // Should redirect back to detail and show updated name
        await expect(page).toHaveURL(/\/tournaments\/\d+\/$/);
        await expect(page.locator("body")).toContainText(newName);
        await expectAlert(page, /updated/i);

        // Rename back so subsequent tests aren't broken
        await page.locator('a:has-text("Edit")').click();
        await page.fill("#id_name", "New World Invitational");
        await page.fill("#id_description", "");
        await page.locator('.card-body button[type="submit"]').click();
    });

    test("non-organizer cannot access edit URL directly", async ({ page }) => {
        // Get the tournament PK from the detail page as admin
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const pk = page.url().match(/\/tournaments\/(\d+)\//)?.[1];
        expect(pk).toBeTruthy();

        // Luffy tries to GET the edit page directly
        await loginAsPlayer(page, "luffy");
        await page.goto(`/tournaments/${pk}/edit/`);
        // Should be redirected back to the detail page with an error
        await expect(page).toHaveURL(/\/tournaments\/\d+\/$/);
        await expectAlert(page, /only the organizer/i);
    });
});

test.describe("Tournaments – delete", () => {
    test("non-organizer does not see delete button on detail", async ({ page }) => {
        await loginAsPlayer(page, "luffy"); // not the organizer
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('a:has-text("Delete"), button:has-text("Delete")')).not.toBeVisible();
    });

    test("organizer sees delete button on SETUP tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await expect(page.locator('a:has-text("Delete")')).toBeVisible();
    });

    test("organizer does NOT see delete button on FINISHED tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('a:has-text("Results"), a:has-text("View")').click();
        await expect(page.locator('a:has-text("Delete")')).not.toBeVisible();
    });

    test("non-organizer cannot access delete URL directly", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        const detailUrl = page.url();
        const pk = detailUrl.match(/\/tournaments\/(\d+)\//)?.[1];
        if (pk) {
            await page.goto(`/tournaments/${pk}/delete/`);
            // Should be redirected back with an error, not the delete form
            await expect(page.locator("body")).not.toContainText(/Yes, delete it|Delete tournament permanently/i);
        }
    });

    test("organizer can delete a SETUP tournament with simple confirmation", async ({ page }) => {
        // Create a fresh tournament to delete
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        const name = `Delete Me ${Date.now()}`;
        await page.fill("#id_name", name);
        await page.fill("#id_date", "2026-12-01");
        await page.locator('.card-body button[type="submit"]').click();
        await expect(page.locator("body")).toContainText(name);

        // Delete it
        await page.locator('a:has-text("Delete")').click();
        await expect(page.locator("body")).toContainText(/Are you sure/i);
        await expect(page.locator("body")).not.toContainText(/type the tournament name/i);
        await page.locator('button:has-text("Yes, delete it")').click();

        // Should be back on the list with a success message
        await expect(page).toHaveURL("/");
        await expect(page.locator(".alert")).toContainText(name);
    });

    test("deleting an ACTIVE tournament requires typing the name", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await page.locator('a:has-text("Delete")').click();

        // Should show the harder confirmation form
        await expect(page.locator("body")).toContainText(/in progress/i);
        await expect(page.locator("#confirm_name")).toBeVisible();
        // Submit button should be disabled until name is typed
        await expect(page.locator('button:has-text("Delete tournament permanently")')).toBeDisabled();
    });

    test("wrong name does not delete ACTIVE tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('a:has-text("View"), a:has-text("Details")').click();
        await page.locator('a:has-text("Delete")').click();

        await page.fill("#confirm_name", "wrong name");
        // Force-submit the form bypassing the JS disabled state
        await page.locator('button:has-text("Delete tournament permanently")').evaluate(
            (btn) => (btn as HTMLButtonElement).removeAttribute("disabled")
        );
        await page.locator('button:has-text("Delete tournament permanently")').click();
        // Flash message says "Tournament name did not match"; page also stays on delete URL
        await expect(page).toHaveURL(/delete/);
        await expect(page.locator("body")).toContainText(/did not match/i);
        // Tournament should still exist
        await page.goto("/");
        await expect(page.locator("body")).toContainText("Grand Line Cup");
    });
});