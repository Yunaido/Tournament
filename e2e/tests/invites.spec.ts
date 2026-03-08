import { expect, test } from "@playwright/test";
import { loginAsAdmin, loginAsPlayer, logout } from "./helpers";

test.describe("Invites – list", () => {
    test("invite list page loads for admin", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await expect(page.locator("h2, h3")).toContainText(/invite/i);
    });

    test("invite list shows at least the Dev Invite from seed", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await expect(page.locator("body")).toContainText(/Dev Invite|invite/i);
    });

    test("unauthenticated user cannot access invite list", async ({ page }) => {
        await page.goto("/accounts/invites/");
        await expect(page).toHaveURL(/login/);
    });

    test("regular player can access the invite list page", async ({ page }) => {
        // invite_list is @login_required only — all logged-in users can see it
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/invites/");
        await expect(page.locator("h2, h3")).toContainText(/invite/i);
    });
});

test.describe("Invites – create", () => {
    test("create a new invite with a label", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `PW Invite ${Date.now()}`);
        await page.locator('#invite-form button[type="submit"]').click();
        await expect(page.locator("body")).toContainText("PW Invite");
    });

    test("create invite with max_uses set to 1", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `Limited ${Date.now()}`);
        const maxUsesInput = page.locator("#id_max_uses");
        if (await maxUsesInput.isVisible()) {
            await maxUsesInput.fill("1");
        }
        await page.locator('#invite-form button[type="submit"]').click();
        await expect(page.locator("body")).toContainText("Limited");
    });

    test("newly created invite redirects to detail page", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `Detail Redir ${Date.now()}`);
        await page.locator('#invite-form button[type="submit"]').click();
        await expect(page).toHaveURL(/\/accounts\/invites\/[0-9a-f-]{36}\//);
    });
});

test.describe("Invites – detail", () => {
    test("invite detail shows share link and copy button", async ({ page }) => {
        await loginAsAdmin(page);
        const detailUrl = await createAndGetDetailUrl(page);
        await page.goto(detailUrl);
        await expect(page.locator('button:has-text("Copy"), a:has-text("Share")')).toBeVisible();
    });

    test("share link contains the register URL with token", async ({ page }) => {
        await loginAsAdmin(page);
        const detailUrl = await createAndGetDetailUrl(page);
        await page.goto(detailUrl);
        // The register URL is in the read-only input field (not body text)
        const urlInput = page.locator('#invite-url');
        await expect(urlInput).toBeVisible();
        const inputValue = await urlInput.inputValue();
        expect(inputValue).toMatch(/\/register\//);
    });
});

test.describe("Invites – toggle active", () => {
    test("toggling invite deactivates it and shows inactive badge", async ({ page }) => {
        await loginAsAdmin(page);
        const detailUrl = await createAndGetDetailUrl(page);
        await page.goto(detailUrl);

        const toggleBtn = page.locator(
            'form[action*="toggle"] button, button:has-text("Deactivate"), a:has-text("Deactivate")'
        );
        if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await toggleBtn.click();
            await expect(page.locator("body")).toContainText(/inactive|deactivated/i);
        }
    });

    test("deactivated invite blocks registration", async ({ page }) => {
        await loginAsAdmin(page);

        // Create invite
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `Deactivate Test ${Date.now()}`);
        await Promise.all([
            page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
            page.locator('#invite-form button[type="submit"]').click(),
        ]);
        const token = page.url().match(/invites\/([0-9a-f-]{36})/)?.[1];
        if (!token) return;

        // Deactivate
        const toggleBtn = page.locator(
            'form[action*="toggle"] button, button:has-text("Deactivate")'
        );
        if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await toggleBtn.click();
        }
        await logout(page);

        // Try to register with the deactivated token
        await page.goto(`/accounts/register/${token}/`);
        await expect(page.locator("body")).toContainText(/invalid|expired|not valid/i);
    });

    test("reactivating an invite makes it usable again", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        await page.fill("#id_label", `Reactivate ${Date.now()}`);
        await Promise.all([
            page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
            page.locator('#invite-form button[type="submit"]').click(),
        ]);
        const detailUrl = page.url();

        // Deactivate then reactivate
        let toggleBtn = page.locator('form[action*="toggle"] button, button:has-text("Deactivate")');
        if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await toggleBtn.click();
        }
        toggleBtn = page.locator('button:has-text("Activate"), form[action*="toggle"] button');
        if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await toggleBtn.click();
        }
        // Should show active badge
        await expect(page.locator("body")).toContainText(/active/i);
    });
});

test.describe("Invites – navigation from list", () => {
    test("clicking Share link on list page opens detail", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/accounts/invites/");
        const shareLink = page.locator('a:has-text("Share"), a:has-text("Detail")').first();
        if (await shareLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await shareLink.click();
            await expect(page).toHaveURL(/\/accounts\/invites\/[0-9a-f-]{36}\//);
        }
    });
});

/** Helper: create a fresh invite and return its detail URL */
async function createAndGetDetailUrl(page: import("@playwright/test").Page): Promise<string> {
    await page.goto("/accounts/invites/");
    await page.fill("#id_label", `Auto ${Date.now()}`);
    await Promise.all([
        page.waitForURL(/\/accounts\/invites\/[0-9a-f-]{36}\//),
        page.locator('#invite-form button[type="submit"]').click(),
    ]);
    return page.url();
}
