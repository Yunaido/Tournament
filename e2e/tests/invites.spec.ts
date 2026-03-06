import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Invites", () => {
    test("invite list page loads", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await expect(page.locator("h2, h3")).toContainText("Invite");
    });

    test("create a new invite", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", "Playwright Invite");
        // Click the Create button specifically (not the navbar Logout)
        await page.locator('#invite-form button[type="submit"]').click();
        // Should redirect to invite detail page
        await expect(page.locator("body")).toContainText("Playwright Invite");
    });

    test("invite detail shows share options", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");

        // Click the Share link in the invite table
        const shareLink = page.locator('a:has-text("Share")').first();
        if (await shareLink.isVisible()) {
            await shareLink.click();
            // Should see copy button on the detail page
            await expect(page.locator('button:has-text("Copy")')).toBeVisible();
        }
    });
});
