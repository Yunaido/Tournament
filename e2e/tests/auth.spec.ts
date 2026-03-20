import { expect, test } from "@playwright/test";
import {
    ADMIN,
    PLAYER_PASSWORD,
    clearMailpit,
    getLatestMailForRecipient,
    loginAsAdmin,
    loginAsPlayer,
    loginWithPassword,
    logout,
} from "./helpers";

const PROTECTED_URLS = [
    "/accounts/profile/",
    "/accounts/profile/edit/",
    "/accounts/profile/security/",
    "/accounts/invites/",
    "/tournaments/create/",
];

// ── Password Login ───────────────────────────────────────────────────────────

test.describe("Auth – password login", () => {
    test("login page renders with username and password fields", async ({ page }) => {
        await page.goto("/accounts/login/");
        await expect(page.locator("h3")).toContainText("Login");
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    });

    test("login page also shows email magic link form", async ({ page }) => {
        await page.goto("/accounts/login/");
        await expect(page.locator('form[action*="email"] input[name="email"]')).toBeVisible();
    });

    test("admin can log in with password", async ({ page }) => {
        await loginWithPassword(page, ADMIN.username, ADMIN.password);
        await expect(page.locator("nav")).toContainText("Admin");
    });

    test("player can log in with password", async ({ page }) => {
        await loginWithPassword(page, "luffy", PLAYER_PASSWORD);
        await expect(page.locator("nav")).toContainText("Luffy");
    });

    test("wrong password shows error message", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill('input[name="username"]', "admin");
        await page.fill('input[name="password"]', "wrongpassword");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/login/);
        await expect(page.locator(".alert-danger:not(#passkey-error)")).toBeVisible();
    });

    test("non-existent user shows error message", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill('input[name="username"]', "nobody_here");
        await page.fill('input[name="password"]', "whatever");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/login/);
        await expect(page.locator(".alert-danger:not(#passkey-error)")).toBeVisible();
    });

    test("password login redirects authenticated user away from login page", async ({ page }) => {
        await loginWithPassword(page, ADMIN.username, ADMIN.password);
        await page.goto("/accounts/login/");
        await expect(page).not.toHaveURL(/login/);
    });
});

// ── Magic Link Login ─────────────────────────────────────────────────────────

test.describe("Auth – magic link login", () => {
    test("magic link login redirects correctly", async ({ page }) => {
        await loginAsAdmin(page);
        const url = page.url();
        expect(url).toMatch(/\/(accounts\/profile)?/);
    });

    test("navbar shows display name after magic link login", async ({ page }) => {
        await loginAsAdmin(page);
        await expect(page.locator("nav")).toContainText("Admin");
    });

    test("email form submits and shows confirmation page", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill('input[name="email"]', "admin@local.dev");
        await page.click('form[action*="email"] button[type="submit"]');
        await expect(page.locator("h3")).toContainText("Check Your Email");
    });

    test("magic link confirmation page is shown even for unknown email (privacy)", async ({ page }) => {
        await page.goto("/accounts/login/");
        await page.fill('input[name="email"]', "nobody@example.invalid");
        await page.click('form[action*="email"] button[type="submit"]');
        // Should still show success — no leak of whether email exists
        await expect(page.locator("h3")).toContainText("Check Your Email");
    });

    test("invalid magic link token shows error page", async ({ page }) => {
        await page.goto("/accounts/login/email/verify/?sesame=invalidtoken");
        await expect(page.locator("h3")).toContainText(/invalid|expired/i);
    });
});

// ── Mailpit email delivery ───────────────────────────────────────────────────

test.describe("Auth – email delivery via Mailpit", () => {
    test("requesting a magic link delivers an email to Mailpit", async ({ page }) => {
        await clearMailpit(page);

        await page.goto("/accounts/login/");
        await page.fill('input[name="email"]', "admin@local.dev");
        await page.click('form[action*="email"] button[type="submit"]');
        await expect(page.locator("h3")).toContainText("Check Your Email");

        // Give the app a moment to send
        await page.waitForTimeout(500);

        const body = await getLatestMailForRecipient(page, "admin@local.dev");
        expect(body).not.toBeNull();
        expect(body).toContain("http://");
    });

    test("magic link in email actually works", async ({ page }) => {
        await clearMailpit(page);

        await page.goto("/accounts/login/");
        await page.fill('input[name="email"]', "luffy@crew.dev");
        await page.click('form[action*="email"] button[type="submit"]');
        await page.waitForTimeout(500);

        const body = await getLatestMailForRecipient(page, "luffy@crew.dev");
        expect(body).not.toBeNull();

        // Extract the login URL from the email body
        const urlMatch = body!.match(/http:\/\/\S+/);
        expect(urlMatch).not.toBeNull();
        const loginUrl = urlMatch![0];

        // Navigate to it — should log us in
        await page.goto(loginUrl);
        await page.waitForURL(/^http:\/\/localhost:8000\/(?!accounts\/login)/);
        await expect(page.locator("nav")).toContainText("Luffy");
    });
});

// ── Logout ───────────────────────────────────────────────────────────────────

test.describe("Auth – logout", () => {
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

// ── Unauthenticated redirects ────────────────────────────────────────────────

test.describe("Auth – unauthenticated redirects", () => {
    for (const url of PROTECTED_URLS) {
        test(`GET ${url} redirects to login when not authenticated`, async ({ page }) => {
            await page.goto(url);
            await expect(page).toHaveURL(/login/);
        });
    }
});

// ── Registration via invite ──────────────────────────────────────────────────

test.describe("Auth – registration via invite", () => {
    test("invalid invite UUID shows invalid-invite page", async ({ page }) => {
        await page.goto("/accounts/register/00000000-0000-0000-0000-000000000000/");
        await expect(page.locator("body")).toContainText(/invalid|expired|not valid|not found/i);
    });

    test("valid invite shows registration form with all fields", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        await expect(page.locator("#id_username")).toBeVisible();
        await expect(page.locator("#id_email")).toBeVisible();
        await expect(page.locator("#id_display_name")).toBeVisible();
        await expect(page.locator("#id_password1")).toBeVisible();
        await expect(page.locator("#id_password2")).toBeVisible();
    });

    test("password fields are type=password", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        await expect(page.locator("#id_password1")).toHaveAttribute("type", "password");
        await expect(page.locator("#id_password2")).toHaveAttribute("type", "password");
    });

    test("registration without email shows error", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", `noemail_${Date.now()}`);
        await page.fill("#id_display_name", "No Email User");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/register/);
    });

    test("registration with mismatched passwords shows error", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        const uniqueName = `mismatch_${Date.now()}`;
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_email", `${uniqueName}@test.example`);
        await page.fill("#id_display_name", "Mismatch User");
        await page.fill("#id_password1", "secure123!");
        await page.fill("#id_password2", "different456!");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/register/);
        await expect(page.locator(".invalid-feedback, .alert-danger")).toBeVisible();
    });

    test("successful registration without password logs the new user in", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        await page.goto(`/accounts/register/${token}/`);
        const uniqueName = `newplayer_${Date.now()}`;
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_email", `${uniqueName}@test.example`);
        await page.fill("#id_display_name", "Fresh Player");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL("/");
        await expect(page.locator("nav")).toContainText("Fresh Player");
    });

    test("successful registration WITH password allows password login", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        const uniqueName = `pwplayer_${Date.now()}`;
        const password = "MySecurePass1!";

        // Register with a password
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_email", `${uniqueName}@test.example`);
        await page.fill("#id_display_name", "PW Player");
        await page.fill("#id_password1", password);
        await page.fill("#id_password2", password);
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL("/");
        await expect(page.locator("nav")).toContainText("PW Player");

        // Logout, then log back in via password
        await page.locator('nav form button[type="submit"]').click();
        await page.waitForURL("/");
        await loginWithPassword(page, uniqueName, password);
        await expect(page.locator("nav")).toContainText("PW Player");
    });

    test("inactive invite shows invalid-invite page", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `InactiveTest ${Date.now()}`);
        await Promise.all([
            page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
            page.locator('#invite-form button[type="submit"]').click(),
        ]);
        const token = page.url().match(/invites\/([0-9a-f-]{36})/)?.[1];
        if (!token) return;

        const deactivateBtn = page.locator('button:has-text("Deactivate")');
        if (await deactivateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await deactivateBtn.click();
        }
        await logout(page);

        await page.goto(`/accounts/register/${token}/`);
        await expect(page.locator("body")).toContainText(/invalid|expired|deactivated|not valid/i);
    });

    test("registration with too-short password shows validation error", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        const uniqueName = `shortpw_${Date.now()}`;
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_email", `${uniqueName}@test.example`);
        await page.fill("#id_display_name", "Short PW");
        await page.fill("#id_password1", "abc");
        await page.fill("#id_password2", "abc");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/register/);
        await expect(page.locator(".invalid-feedback, .alert-danger, .errorlist").first()).toBeVisible();
    });

    test("registration with common password shows validation error", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        const uniqueName = `commonpw_${Date.now()}`;
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_email", `${uniqueName}@test.example`);
        await page.fill("#id_display_name", "Common PW");
        await page.fill("#id_password1", "password");
        await page.fill("#id_password2", "password");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/register/);
        await expect(page.locator(".invalid-feedback, .alert-danger, .errorlist")).toBeVisible();
    });

    test("registration with numeric-only password shows validation error", async ({ page }) => {
        const token = await getDevInviteToken(page);
        if (!token) return test.skip();
        const uniqueName = `numpw_${Date.now()}`;
        await page.goto(`/accounts/register/${token}/`);
        await page.fill("#id_username", uniqueName);
        await page.fill("#id_email", `${uniqueName}@test.example`);
        await page.fill("#id_display_name", "Numeric PW");
        await page.fill("#id_password1", "12345678");
        await page.fill("#id_password2", "12345678");
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/register/);
        await expect(page.locator(".invalid-feedback, .alert-danger, .errorlist").first()).toBeVisible();
    });
});

/** Helper: create a fresh invite as admin and return its UUID token. */
async function getDevInviteToken(page: import("@playwright/test").Page): Promise<string | null> {
    await loginAsAdmin(page);
    await page.goto("/accounts/invites/");
    await page.fill("#id_label", `AuthTest ${Date.now()}`);
    await Promise.all([
        page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
        page.locator('#invite-form button[type="submit"]').click(),
    ]);
    const detailUrl = page.url();
    const token = detailUrl.match(/invites\/([0-9a-f-]{36})/)?.[1] ?? null;
    await logout(page);
    return token;
}
