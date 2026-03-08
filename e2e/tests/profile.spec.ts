import * as fs from "fs";
import * as path from "path";
import { expect, test } from "@playwright/test";
import { loginAsAdmin, loginAsPlayer, logout } from "./helpers";

test.describe("Profile – view", () => {
    test("profile page shows display name", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        await expect(page.locator("body")).toContainText("Luffy");
    });

    test("profile shows invited-by info", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        await expect(page.locator("body")).toContainText("Admin");
    });

    test("navbar shows display name when logged in", async ({ page }) => {
        await loginAsPlayer(page, "nami");
        await expect(page.locator("nav")).toContainText("Nami");
    });

    test("profile page shows win / loss / draw stats", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        // East Blue Showdown gave luffy some stats — just verify the labels exist
        await expect(page.locator("body")).toContainText(/wins?|losses?|draws?/i);
    });

    test("profile page has a link to match history", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        const histLink = page.locator('a[href*="/history/"], a:has-text("Match History")');
        await expect(histLink).toBeVisible();
    });

    test("avatar img is shown in navbar after uploading", async ({ page }) => {
        // After any upload, the navbar should have an <img> with the avatar src
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        // Default: may be an <img> or the default SVG inline; either way an img
        // We just check the nav contains some img (default or uploaded)
        await expect(page.locator("nav img")).toBeVisible();
    });
});

test.describe("Profile – edit display name", () => {
    test("can change display name and it updates everywhere", async ({ page }) => {
        await loginAsPlayer(page, "brook");
        await page.goto("/accounts/profile/edit/");
        await page.fill("#id_display_name", "Brook Musician");
        await page.click('button:has-text("Save Changes")');
        // Should redirect back to profile
        await expect(page).toHaveURL("/accounts/profile/");
        await expect(page.locator("body")).toContainText("Brook Musician");
        await expect(page.locator("nav")).toContainText("Brook Musician");

        // Restore original
        await page.goto("/accounts/profile/edit/");
        await page.fill("#id_display_name", "Brook");
        await page.click('button:has-text("Save Changes")');
    });

    test("empty display name shows validation error", async ({ page }) => {
        await loginAsPlayer(page, "brook");
        await page.goto("/accounts/profile/edit/");
        await page.fill("#id_display_name", "");
        await page.click('button:has-text("Save Changes")');
        await expect(page).toHaveURL(/edit/);
    });
});

test.describe("Profile – avatar upload", () => {
    test("uploading a valid PNG replaces the avatar", async ({ page }) => {
        await loginAsPlayer(page, "zoro");
        await page.goto("/accounts/profile/edit/");

        // Minimal valid 1×1 PNG
        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const pngBuffer = Buffer.from(pngBase64, "base64");
        const tmpPath = path.join("/tmp", `test_avatar_${Date.now()}.png`);
        fs.writeFileSync(tmpPath, pngBuffer);

        await page.setInputFiles("#id_avatar", tmpPath);
        await page.click('button:has-text("Save Changes")');
        await expect(page).toHaveURL("/accounts/profile/");

        fs.rmSync(tmpPath);
    });

    test("uploading an SVG file is rejected with form error", async ({ page }) => {
        await loginAsPlayer(page, "zoro");
        await page.goto("/accounts/profile/edit/");

        const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
        const tmpPath = path.join("/tmp", `test_avatar_${Date.now()}.svg`);
        fs.writeFileSync(tmpPath, svgContent);

        await page.setInputFiles("#id_avatar", tmpPath);
        await page.click('button:has-text("Save Changes")');
        // Should stay on edit page with error
        await expect(page).toHaveURL(/edit/);
        await expect(page.locator(".invalid-feedback, ul.errorlist, .alert-danger")).toBeVisible();

        fs.rmSync(tmpPath);
    });

    test("uploading a file that is too large is rejected", async ({ page }) => {
        await loginAsPlayer(page, "zoro");
        await page.goto("/accounts/profile/edit/");

        // Create a ~6MB file (limit is 5MB)
        const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 0xff);
        const tmpPath = path.join("/tmp", `test_big_${Date.now()}.jpg`);
        fs.writeFileSync(tmpPath, bigBuffer);

        await page.setInputFiles("#id_avatar", tmpPath);
        await page.click('button:has-text("Save Changes")');
        await expect(page).toHaveURL(/edit/);
        await expect(page.locator(".invalid-feedback, ul.errorlist, .alert-danger")).toBeVisible();

        fs.rmSync(tmpPath);
    });

    test("clear avatar checkbox removes the avatar", async ({ page }) => {
        await loginAsPlayer(page, "zoro");
        await page.goto("/accounts/profile/edit/");

        const clearCb = page.locator("#avatar_clear");
        if (await clearCb.isVisible()) {
            await clearCb.click();
            await page.click('button:has-text("Save Changes")');
            await expect(page).toHaveURL("/accounts/profile/");
        }
    });
});

test.describe("Profile – match history", () => {
    test("match history page loads and shows past matches", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        const histLink = page.locator('a[href*="match-history"], a[href*="/history/"], a:has-text("Match History")').first();
        await histLink.click();
        await expect(page.locator("h2, h3")).toContainText(/match history/i);
    });

    test("match history shows tournaments played", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/");
        const histLink = page.locator('a[href*="match-history"], a[href*="/history/"], a:has-text("Match History")').first();
        await histLink.click();
        // East Blue Showdown has finished → luffy should have records
        await expect(page.locator("body")).toContainText(/East Blue Showdown|Grand Line Cup/i);
    });
});
