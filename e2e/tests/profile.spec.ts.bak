import { expect, test } from "@playwright/test";
import { loginAsPlayer } from "./helpers";

test.describe("Profile", () => {
    test("profile page shows display name", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        await expect(page.locator("body")).toContainText("Luffy");
    });

    test("profile shows invited-by info", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        // Luffy was invited by admin
        await expect(page.locator("body")).toContainText("Admin");
    });

    test("navbar shows display name when logged in", async ({ page }) => {
        await loginAsPlayer(page, "nami");
        await expect(page.locator("nav")).toContainText("Nami");
    });
});
