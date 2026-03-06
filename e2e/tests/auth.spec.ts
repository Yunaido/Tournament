import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout } from "./helpers";

test.describe("Auth", () => {
    test("login page renders", async ({ page }) => {
        await page.goto("/accounts/login/");
        await expect(page.locator("h3")).toContainText("Login");
        await expect(page.locator('button[type="submit"]')).toHaveText("Login");
    });

    test("login with valid credentials", async ({ page }) => {
        await loginAsAdmin(page);
        await expect(page.locator("nav")).toContainText("Admin");
    });

    test("login with wrong password shows error", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill("#id_username", "admin");
        await page.fill("#id_password", "wrongpassword");
        await page.click('button[type="submit"]');
        await expect(page.locator(".alert-danger")).toBeVisible();
    });

    test("logout works", async ({ page }) => {
        await loginAsAdmin(page);
        await logout(page);
        // After logout, user is redirected to / and sees Login button
        await expect(page.locator('a[href*="login"]')).toBeVisible();
    });

    test("unauthenticated user sees login button in navbar", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator('a[href*="login"]')).toBeVisible();
    });
});
