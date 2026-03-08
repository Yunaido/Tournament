import { type Page, expect } from "@playwright/test";

export const ADMIN = { username: "admin", password: "adminadmin" };
export const PLAYERS = ["luffy", "zoro", "nami", "sanji", "chopper", "robin", "franky", "brook"];
export const PLAYER_PASSWORD = "testpass123";

/** Login as a user via the login form. */
export async function login(page: Page, username: string, password: string) {
    await page.goto("/accounts/login/");
    await page.fill("#id_username", username);
    await page.fill("#id_password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/^http:\/\/localhost:8000\//);
}

/** Login as admin. */
export async function loginAsAdmin(page: Page) {
    await login(page, ADMIN.username, ADMIN.password);
}

/** Login as a seeded test player. */
export async function loginAsPlayer(page: Page, username: string) {
    await login(page, username, PLAYER_PASSWORD);
}

/** Logout via the navbar form. */
export async function logout(page: Page) {
    await page.locator('nav form button[type="submit"]').click();
    await page.waitForURL("/");
}

/** Expect a Bootstrap alert containing the given text or matching the regex. */
export async function expectAlert(page: Page, text: string | RegExp) {
    await expect(page.locator(".alert").filter({ hasText: text })).toBeVisible({ timeout: 5000 });
}

/** Expect an alert with one of the Django message tags. */
export async function expectAlertTag(page: Page, tag: "success" | "info" | "warning" | "danger") {
    await expect(page.locator(`.alert-${tag}`)).toBeVisible({ timeout: 5000 });
}

/** Navigate to the first match report link visible on the current detail page. */
export async function clickFirstReportLink(page: Page): Promise<boolean> {
    const link = page.locator('a[href*="/report/"]').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
        await link.click();
        return true;
    }
    return false;
}

/** Get the pk from the current URL, assuming it ends with /.../<pk>/. */
export function pkFromUrl(url: string): string {
    const parts = url.replace(/\/$/, "").split("/");
    return parts[parts.length - 1];
}
