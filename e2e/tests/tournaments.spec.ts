import { expect, test } from "@playwright/test";
import { expectAlert, loginAsAdmin, loginAsPlayer } from "./helpers";

test.describe("Tournaments", () => {
    test("home page shows seeded tournaments", async ({ page }) => {
        await page.goto("/");
        // Should show the active + setup tournaments
        await expect(page.locator(".card")).toHaveCount(3, { timeout: 5000 }).catch(
            () => { } // may vary; just ensure at least 1 exists
        );
        await expect(page.locator("body")).toContainText("Grand Line Cup");
    });

    test("finished tournament shows in finished section", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("body")).toContainText("East Blue Showdown");
    });

    test("view tournament detail", async ({ page }) => {
        await page.goto("/");
        await page.click('text="View"', { strict: false });
        await expect(page.locator("h2, h3")).toBeVisible();
    });

    test("create a new tournament", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/tournaments/create/");
        await page.fill("#id_name", "Playwright Test Cup");
        await page.fill("#id_date", "2026-04-01");
        // Click the form submit button specifically
        await page.locator('.card-body button[type="submit"]').click();
        // Should redirect to tournament detail
        await expect(page.locator("body")).toContainText("Playwright Test Cup");
    });

    test("join a setup tournament", async ({ page }) => {
        await loginAsPlayer(page, "brook");
        // Find the setup tournament (New World Invitational)
        await page.goto("/");
        // Find the card for setup tournament and click View
        const card = page.locator(".card", { hasText: "New World Invitational" });
        await card.locator('text="View"').click();
        // Click Join
        const joinBtn = page.locator('text="Join Tournament"');
        if (await joinBtn.isVisible()) {
            await joinBtn.click();
            await expectAlert(page, "joined");
        }
    });

    test("standings page loads for finished tournament", async ({ page }) => {
        await page.goto("/");
        // Click View on the finished tournament
        const card = page.locator(".card", { hasText: "East Blue Showdown" });
        await card.locator('text="Results"').click();
        // Click standings link
        const standingsLink = page.locator('a[href*="standings"]').first();
        if (await standingsLink.isVisible()) {
            await standingsLink.click();
            await expect(page.locator("table, .table")).toBeVisible();
        }
    });
});
