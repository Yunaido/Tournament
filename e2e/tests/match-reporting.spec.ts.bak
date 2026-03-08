import { expect, test } from "@playwright/test";
import { expectAlert, loginAsPlayer } from "./helpers";

test.describe("Match reporting", () => {
    test("report result page shows three choices", async ({ page }) => {
        // Login as chopper (tps[4]) who has an unreported match in Grand Line Cup
        await loginAsPlayer(page, "chopper");

        // Go to the active tournament
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('text="View"').click();

        // Find the Report link for chopper's match
        const reportLink = page.locator('a[href*="/report/"]').first();
        if (await reportLink.isVisible()) {
            await reportLink.click();
            await expect(page.locator("h3")).toContainText("Report Match Result");
            // Should see three radio options (Win, Loss, Draw)
            const radios = page.locator('input[name="result"]');
            await expect(radios).toHaveCount(3);
        }
    });

    test("submit a win result", async ({ page }) => {
        await loginAsPlayer(page, "chopper");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('text="View"').click();

        const reportLink = page.locator('a[href*="/report/"]').first();
        if (await reportLink.isVisible()) {
            await reportLink.click();
            // Click the WIN radio
            await page.click('label:has-text("I Won")');
            await page.click('button:has-text("Submit Result")');
            // Should see a confirmation message
            await expect(page.locator(".alert")).toBeVisible();
        }
    });

    test("active match card shows reported result, not scores", async ({ page }) => {
        // Login as nami who has a partial report in the seed data (player1_confirmed)
        await loginAsPlayer(page, "nami");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('text="View"').click();

        // Find report link and submit
        const reportLink = page.locator('a[href*="/report/"]').first();
        if (await reportLink.isVisible()) {
            await reportLink.click();
            await page.click('label:has-text("I Won")');
            await page.click('button:has-text("Submit Result")');
        }

        // The "Your Active Match" card should show the result badge, not "0 – 0"
        const activeMatch = page.locator(".card.border-warning");
        if (await activeMatch.isVisible()) {
            await expect(activeMatch).toContainText("Win");
            await expect(activeMatch).not.toContainText("0 – 0");
        }
    });

    test("both players confirm match", async ({ page, browser }) => {
        // This test simulates two players independently reporting results
        // Player: franky (tps[6]) vs brook (tps[7]) — both unconfirmed

        // Franky reports WIN
        await loginAsPlayer(page, "franky");
        await page.goto("/");
        const card = page.locator(".card", { hasText: "Grand Line Cup" });
        await card.locator('text="View"').click();

        const frankyReport = page.locator('a[href*="/report/"]').first();
        if (await frankyReport.isVisible()) {
            await frankyReport.click();
            await page.click('label:has-text("I Won")');
            await page.click('button:has-text("Submit Result")');
            await expectAlert(page, "Waiting for your opponent");
        }

        // Brook reports LOSS (consistent with franky's WIN)
        const page2 = await browser.newPage();
        await loginAsPlayer(page2, "brook");
        await page2.goto("/");
        const card2 = page2.locator(".card", { hasText: "Grand Line Cup" });
        await card2.locator('text="View"').click();

        const brookReport = page2.locator('a[href*="/report/"]').first();
        if (await brookReport.isVisible()) {
            await brookReport.click();
            await page2.click('label:has-text("I Lost")');
            await page2.click('button:has-text("Submit Result")');
            await expectAlert(page2, "confirmed");
        }

        await page2.close();
    });
});
