import { expect, test } from "@playwright/test";
import { clearMailpit, expectAlert, getLatestMailForRecipient, loginAsPlayer, loginWithPassword, logout, PLAYER_PASSWORD } from "./helpers";

test.describe("Security – page structure", () => {
    test("security page loads and shows all sections", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await expect(page.locator("h3")).toContainText("Security Settings");
        await expect(page.locator("body")).toContainText("Email Address");
        await expect(page.locator("body")).toContainText("Password");
        await expect(page.locator("body")).toContainText("Passkeys");
    });

    test("security page has back link to profile", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        const backLink = page.locator('a[href*="/profile/"]').filter({ hasText: "Profile" });
        await expect(backLink).toBeVisible();
    });

    test("security page requires login", async ({ page }) => {
        await page.goto("/accounts/profile/security/");
        await expect(page).toHaveURL(/\/accounts\/login\//);
    });
});

test.describe("Security – email", () => {
    test("current email is shown in the form", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        const emailInput = page.locator("#id_email");
        await expect(emailInput).toHaveValue("luffy@crew.dev");
    });

    test("can change email address via verification", async ({ page }) => {
        await clearMailpit(page);
        await loginAsPlayer(page, "brook");
        await page.goto("/accounts/profile/security/");
        const newEmail = `brook_${Date.now()}@crew.dev`;
        await page.fill("#id_email", newEmail);
        await page.locator('button:has-text("Update Email")').click();
        await expect(page.locator(".alert-success")).toContainText("verification link has been sent");

        // Email should NOT be changed yet
        await expect(page.locator("#id_email")).toHaveValue("brook@crew.dev");

        // Pending verification banner should be visible
        await expect(page.locator(".alert-info")).toContainText(newEmail);

        // Click the verification link from email
        await page.waitForTimeout(500);
        const body = await getLatestMailForRecipient(page, newEmail);
        expect(body).not.toBeNull();
        const urlMatch = body!.match(/http:\/\/\S+/);
        expect(urlMatch).not.toBeNull();
        await page.goto(urlMatch![0]);
        await expectAlert(page, "Email updated");

        // Verify the new email is shown
        await expect(page.locator("#id_email")).toHaveValue(newEmail);

        // Restore original via another verification
        await clearMailpit(page);
        await page.fill("#id_email", "brook@crew.dev");
        await page.locator('button:has-text("Update Email")').click();
        await page.waitForTimeout(500);
        const restoreBody = await getLatestMailForRecipient(page, "brook@crew.dev");
        expect(restoreBody).not.toBeNull();
        const restoreUrlMatch = restoreBody!.match(/http:\/\/\S+/);
        expect(restoreUrlMatch).not.toBeNull();
        await page.goto(restoreUrlMatch![0]);
    });

    test("duplicate email is rejected", async ({ page }) => {
        await loginAsPlayer(page, "brook");
        await page.goto("/accounts/profile/security/");
        // Use luffy's email
        await page.fill("#id_email", "luffy@crew.dev");
        await page.locator('button:has-text("Update Email")').click();
        // Should stay on security page with error
        await expect(page).toHaveURL(/security/);
        await expect(page.locator(".invalid-feedback")).toBeVisible();
    });

    test("invalid email is rejected", async ({ page }) => {
        await loginAsPlayer(page, "brook");
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_email", "not-an-email");
        await page.locator('button:has-text("Update Email")').click();
        await expect(page).toHaveURL(/security/);
    });
});

test.describe("Security – password", () => {
    test("user with password sees current password field", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await expect(page.locator("#id_current_password")).toBeVisible();
        await expect(page.locator("body")).toContainText("You have a password set");
    });

    test("can change password with correct current password", async ({ page }) => {
        // Use nami — change and then change back
        // Avoid franky/brook/chopper/robin as they are used in match-reporting tests.
        await loginAsPlayer(page, "nami");
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_current_password", PLAYER_PASSWORD);
        await page.fill("#id_new_password1", "NewSecurePass1!");
        await page.fill("#id_new_password2", "NewSecurePass1!");
        await page.locator('button:has-text("Change Password")').click();
        await expectAlert(page, "Password updated");

        // Logout and verify new password works
        await logout(page);
        await loginWithPassword(page, "nami", "NewSecurePass1!");
        await expect(page.locator("nav")).toContainText("Nami");

        // Restore original password
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_current_password", "NewSecurePass1!");
        await page.fill("#id_new_password1", PLAYER_PASSWORD);
        await page.fill("#id_new_password2", PLAYER_PASSWORD);
        await page.locator('button:has-text("Change Password")').click();
    });

    test("wrong current password is rejected", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_current_password", "wrongpassword");
        await page.fill("#id_new_password1", "NewSecurePass1!");
        await page.fill("#id_new_password2", "NewSecurePass1!");
        await page.locator('button:has-text("Change Password")').click();
        await expect(page).toHaveURL(/security/);
        await expect(page.locator(".invalid-feedback")).toContainText(/incorrect/i);
    });

    test("mismatched new passwords are rejected", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_current_password", PLAYER_PASSWORD);
        await page.fill("#id_new_password1", "NewSecurePass1!");
        await page.fill("#id_new_password2", "DifferentPass2!");
        await page.locator('button:has-text("Change Password")').click();
        await expect(page).toHaveURL(/security/);
        await expect(page.locator(".invalid-feedback")).toBeVisible();
    });

    test("too-short new password is rejected", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_current_password", PLAYER_PASSWORD);
        await page.fill("#id_new_password1", "xQ7!");
        await page.fill("#id_new_password2", "xQ7!");
        await page.locator('button:has-text("Change Password")').click();
        await expect(page).toHaveURL(/security/);
        await expect(page.getByText("too short")).toBeVisible();
    });

    test("common new password is rejected", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await page.fill("#id_current_password", PLAYER_PASSWORD);
        await page.fill("#id_new_password1", "password");
        await page.fill("#id_new_password2", "password");
        await page.locator('button:has-text("Change Password")').click();
        await expect(page).toHaveURL(/security/);
        await expect(page.getByText("too common")).toBeVisible();
    });
});

test.describe("Security – passkeys section", () => {
    test("passkey section is visible on security page", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await expect(page.locator("body")).toContainText("Passkeys");
        // Add Passkey button should be present
        await expect(page.locator("#passkey-register-btn")).toBeVisible();
    });

    test("passkey section shows 'no passkeys' message when none registered", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/profile/security/");
        await expect(page.locator("body")).toContainText(/no passkeys/i);
    });
});
