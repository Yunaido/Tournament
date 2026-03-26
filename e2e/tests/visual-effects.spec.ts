import { expect, test } from "@playwright/test";

/**
 * Visual effects (ocean-fx) toggle button tests.
 * These tests verify the toggle button is present and that
 * clicking it toggles the visual effects state via localStorage.
 */
test.describe("Visual effects toggle", () => {
    test("toggle button is visible on the homepage", async ({ page }) => {
        await page.goto("/");
        const btn = page.locator("#op-fx-toggle");
        await expect(btn).toBeVisible();
        await expect(btn).toHaveAttribute("aria-label", "Toggle visual effects");
    });

    test("toggle button starts with effects enabled (✨)", async ({ page }) => {
        // Clear any stored preference so we get the default (enabled)
        await page.goto("/");
        await page.evaluate(() => localStorage.removeItem("op_fx_enabled"));
        await page.reload();
        const btn = page.locator("#op-fx-toggle");
        await expect(btn).toContainText("✨");
    });

    test("clicking toggle button disables effects and shows sleep icon", async ({ page }) => {
        await page.goto("/");
        // Ensure starting state is enabled
        await page.evaluate(() => localStorage.setItem("op_fx_enabled", "true"));
        await page.reload();

        const btn = page.locator("#op-fx-toggle");
        await expect(btn).toContainText("✨");
        await btn.click();
        await expect(btn).toContainText("💤");

        // Preference should be persisted
        const stored = await page.evaluate(() => localStorage.getItem("op_fx_enabled"));
        expect(stored).toBe("false");
    });

    test("clicking toggle button again re-enables effects", async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => localStorage.setItem("op_fx_enabled", "false"));
        await page.reload();

        const btn = page.locator("#op-fx-toggle");
        await expect(btn).toContainText("💤");
        await btn.click();
        await expect(btn).toContainText("✨");

        const stored = await page.evaluate(() => localStorage.getItem("op_fx_enabled"));
        expect(stored).toBe("true");
    });

    test("toggle button is present on authenticated pages too", async ({ page }) => {
        await page.goto("/accounts/login/");
        const btn = page.locator("#op-fx-toggle");
        await expect(btn).toBeVisible();
    });

    test("disabled preference persists across page navigation", async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => localStorage.setItem("op_fx_enabled", "false"));
        await page.reload();

        // Navigate to another page and check state is still off
        await page.goto("/accounts/login/");
        const btn = page.locator("#op-fx-toggle");
        await expect(btn).toContainText("💤");
    });
});
