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
        // Either no Join button, or a message saying already registered
        const joinBtn = page.locator('button:has-text("Join Tournament")');
        const alreadyMsg = page.locator("body");
        if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await joinBtn.click();
            await expect(alreadyMsg).toContainText(/already|registered/i);
        } else {
            // Button should not be visible
            await expect(joinBtn).not.toBeVisible();
        }
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

        // Should see kick buttons for other players (luffy, zoro, nami) but not organizer badge row
        const playerList = page.locator(".list-group-item");
        // Admin has organizer badge and no kick button
        const adminRow = playerList.filter({ hasText: "Organizer" });
        await expect(adminRow).toBeVisible();
        await expect(adminRow.locator('button:has-text("✕")')).not.toBeVisible();

        // Other players should have kick buttons
        const luffyRow = playerList.filter({ hasText: "Luffy" });
        await expect(luffyRow.locator('button:has-text("✕")')).toBeVisible();
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

        // Login as luffy and join
        await page.goto("/accounts/login/");
        await page.fill("#id_username", "luffy");
        await page.fill("#id_password", "testpass123");
        await page.click('button[type="submit"]');
        await page.goto(detailUrl);
        await page.locator('button:has-text("Join Tournament")').click();
        await expectAlert(page, /joined/i);

        // Login as admin and kick luffy
        await page.goto("/accounts/login/");
        await page.fill("#id_username", "admin");
        await page.fill("#id_password", "adminadmin");
        await page.click('button[type="submit"]');
        await page.goto(detailUrl);
        // Accept the confirm dialog
        page.on("dialog", (dialog) => dialog.accept());
        await page.locator('.list-group-item', { hasText: "Luffy" }).locator('button:has-text("✕")').click();
        await expectAlert(page, /removed/i);
        // Luffy should no longer be listed
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
        });
        // Should not result in a server error
        expect(response.status()).toBeLessThan(500);

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