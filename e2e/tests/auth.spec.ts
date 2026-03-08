import { expect, test } from "@playwright/test";
import { loginAsAdmin, loginAsPlayer, logout } from "./helpers";

const PROTECTED_URLS = [
    "/accounts/profile/",
    "/accounts/profile/edit/",
    "/accounts/invites/",
    "/tournaments/create/",
];

test.describe("Auth – login / logout", () => {
    test("login page renders", async ({ page }) => {
        await page.goto("/accounts/login/");
        await expect(page.locator("h3")).toContainText("Login");
        await expect(page.locator('button[type="submit"]')).toHaveText("Login");
    });

    test("login with valid credentials redirects to home", async ({ page }) => {
        await loginAsAdmin(page);
        await expect(page).toHaveURL("/");
    });

    test("navbar shows display name after login", async ({ page }) => {
        await loginAsAdmin(page);
        await expect(page.locator("nav")).toContainText("Admin");
    });

    test("login with wrong password shows error and stays on page", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill("#id_username", "admin");
        await page.fill("#id_password", "wrongpassword");
        await page.click('button[type="submit"]');
        await expect(page.locator(".alert-danger")).toBeVisible();
        await expect(page).toHaveURL(/login/);
    });

    test("login with non-existent username shows error", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill("#id_username", "doesnotexist");
        await page.fill("#id_password", "testpass123");
        await page.click('button[type="submit"]');
        await expect(page.locator(".alert-danger")).toBeVisible();
    });

    test("logout clears session and shows Login link", async ({ page }) => {
        await loginAsAdmin(page);
        await logout(page);
        await expect(page.locator('a[href*="login"]')).toBeVisible();
        await expect(page.locator("nav")).not.toContainText("Admin");
    });

    test("logout redirects to home", async ({ page }) => {
        await loginAsAdmin(page);
        await logout(page);
        await expect(page).toHaveURL("/");
    });

    test("unauthenticated user sees Login link in navbar", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator('a[href*="login"]')).toBeVisible();
    });

    test("session persists across page navigation", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/");
        await expect(page.locator("nav")).toContainText("Luffy");
        await page.goto("/accounts/profile/");
        await expect(page.locator("nav")).toContainText("Luffy");
    });
});

test.describe("Auth – unauthenticated redirects", () => {
    for (const url of PROTECTED_URLS) {
        test(`GET ${url} redirects to login when not authenticated`, async ({ page }) => {
            await page.goto(url);
            await expect(page).toHaveURL(/login/);
        });
    }
});

test.describe("Auth – registration via invite", () => {
    test("invalid invite UUID shows invalid-invite page", async ({ page }) => {
        await page.goto("/accounts/register/00000000-0000-0000-0000-000000000000/");
        // Django returns 404 for non-existent invite
        await expect(page.locator("body")).toContainText(/invalid|expired|not valid|not found/i);
    });

    test("valid invite shows registration form", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        await expect(page.locator("#id_username")).toBeVisible();
        await expect(page.locator("#id_password1")).toBeVisible();
    });

    test("registration with mismatched passwords shows error", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", `mismatch_${Date.now()}`);
        await page.fill("#id_display_name", "Mismatch User");
        await page.fill("#id_password1", "password12345");
        await page.fill("#id_password2", "different12345");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/register/);
        await expect(page.locator(".invalid-feedback, ul.errorlist")).toBeVisible();
    });

    test("successful registration logs the new user in", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        const uniqueName = `newplayer_${Date.now()}`;
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_display_name", "Fresh Player");
        await page.fill("#id_password1", "s3cur3pass!");
        await page.fill("#id_password2", "s3cur3pass!");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL("/");
        await expect(page.locator("nav")).toContainText("Fresh Player");
    });

    test("inactive invite shows invalid-invite page", async ({ page }) => {
        // Create a fresh invite, deactivate it, then try to use it
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `InactiveTest ${Date.now()}`);
        await Promise.all([
            page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
            page.locator('#invite-form button[type="submit"]').click(),
        ]);
        const token = page.url().match(/invites\/([0-9a-f-]{36})/)?.[1];
        if (!token) return;

        // Deactivate it
        const deactivateBtn = page.locator('button:has-text("Deactivate")');
        if (await deactivateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await deactivateBtn.click();
        }
        await logout(page);

        // Try to register with the deactivated invite
        await page.goto(`/accounts/register/${token}/`);
        await expect(page.locator("body")).toContainText(/invalid|expired|deactivated|not valid/i);
    });
});

/** Helper: create a fresh invite as admin and return its UUID token. */
async function getDevInviteToken(page: import("@playwright/test").Page): Promise<string | null> {
    await loginAsAdmin(page);
    await page.goto("/accounts/invites/");
    await page.fill("#id_label", `AuthTest ${Date.now()}`);
    // Wait for navigation to the detail page after form submit
    await Promise.all([
        page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
        page.locator('#invite-form button[type="submit"]').click(),
    ]);
    const detailUrl = page.url();
    const token = detailUrl.match(/invites\/([0-9a-f-]{36})/)?.[1] ?? null;
    await logout(page);
    return token;
}
