import { type Page, expect } from "@playwright/test";

/** Login as a user via the login form. */
export async function login(page: Page, username: string, password: string) {
    await page.goto("/accounts/login/");
    await page.fill("#id_username", username);
    await page.fill("#id_password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
}

/** Login as admin. */
export async function loginAsAdmin(page: Page) {
    await login(page, "admin", "adminadmin");
}

/** Login as a seeded test player. */
export async function loginAsPlayer(page: Page, username: string) {
    await login(page, username, "testpass123");
}

/** Logout via the navbar form. */
export async function logout(page: Page) {
    await page.locator('nav form button[type="submit"]').click();
    await page.waitForURL("/");
}

/** Expect a Bootstrap alert with specific text. */
export async function expectAlert(page: Page, text: string) {
    await expect(page.locator(".alert").filter({ hasText: text })).toBeVisible();
}
