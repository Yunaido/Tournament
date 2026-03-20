import { type Page, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";

export const ADMIN = { username: "admin", password: "adminadmin" };
export const PLAYERS = ["luffy", "zoro", "nami", "sanji", "chopper", "robin", "franky", "brook"];
export const PLAYER_PASSWORD = "testpass123";

/** Mailpit API base URL (exposed on host port 8025). */
export const MAILPIT_API = "http://localhost:8025/api/v1";

/** Project root (one level up from e2e/). */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Get a one-time magic login URL for the given username.
 * Calls the Django management command inside the running web container.
 */
function getMagicLoginUrl(username: string): string {
    const cmd = `docker compose exec -T web python manage.py get_login_url ${username}`;
    return execSync(cmd, { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim();
}

/** Login as a user via a magic link (sesame token). */
export async function login(page: Page, username: string, _password?: string) {
    const loginPath = getMagicLoginUrl(username);
    await page.goto(loginPath);
    await page.waitForURL(/^http:\/\/localhost:8000\/(?!accounts\/login)/);
}

/** Login as a user via the password form in the browser. */
export async function loginWithPassword(page: Page, username: string, password: string) {
    await page.goto("/accounts/login/");
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/^http:\/\/localhost:8000\/(?!accounts\/login)/);
}

/** Login as admin. */
export async function loginAsAdmin(page: Page) {
    await login(page, ADMIN.username);
}

/** Login as a seeded test player. */
export async function loginAsPlayer(page: Page, username: string) {
    await login(page, username);
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

/** Delete all messages in Mailpit. */
export async function clearMailpit(page: Page) {
    await page.request.delete(`${MAILPIT_API}/messages`);
}

/** Get all messages from Mailpit. */
export async function getMailpitMessages(page: Page): Promise<MailpitMessage[]> {
    const res = await page.request.get(`${MAILPIT_API}/messages`);
    const body = await res.json();
    return body.messages ?? [];
}

/** Get the plain-text body of the latest message matching the recipient. */
export async function getLatestMailForRecipient(
    page: Page,
    email: string
): Promise<string | null> {
    const messages = await getMailpitMessages(page);
    const match = messages.find((m) =>
        m.To?.some((to: { Address: string }) => to.Address.toLowerCase() === email.toLowerCase())
    );
    if (!match) return null;
    const res = await page.request.get(`${MAILPIT_API}/message/${match.ID}`);
    const detail = await res.json();
    return detail.Text ?? null;
}

interface MailpitMessage {
    ID: string;
    To?: Array<{ Address: string }>;
    Subject?: string;
}
