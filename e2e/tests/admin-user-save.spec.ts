import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin – user save", () => {
    test("can save a user twice without a 500 error", async ({ page }) => {
        await loginAsAdmin(page);

        await page.goto("/admin/auth/user/");
        await page.locator("#result_list").getByRole("link", { name: "sanji" }).click();
        await expect(page).toHaveURL(/\/admin\/auth\/user\/\d+\/change\//);

        // First save: change first name
        await page.fill('input[name="first_name"]', "TestFirst");
        await page.locator('input[name="_save"]').click();
        await expect(page).toHaveURL("/admin/auth/user/");
        await expect(page.locator(".success")).toContainText("changed successfully");

        // Navigate back to the same user
        await page.locator("#result_list").getByRole("link", { name: "sanji" }).click();
        await expect(page).toHaveURL(/\/admin\/auth\/user\/\d+\/change\//);

        // Second save (this is what triggered the 500)
        await page.fill('input[name="first_name"]', "TestFirstUpdated");
        await page.locator('input[name="_save"]').click();

        await expect(page).toHaveURL("/admin/auth/user/");
        await expect(page.locator(".success")).toContainText("changed successfully");
    });

    test("can save a user after changing email via admin", async ({ page }) => {
        await loginAsAdmin(page);

        await page.goto("/admin/auth/user/");
        await page.locator("#result_list").getByRole("link", { name: "sanji" }).click();
        await expect(page).toHaveURL(/\/admin\/auth\/user\/\d+\/change\//);

        const newEmail = `test_${Date.now()}@example.com`;
        await page.fill('input[name="email"]', newEmail);
        await page.locator('input[name="_save"]').click();
        await expect(page).toHaveURL("/admin/auth/user/");
        await expect(page.locator(".success")).toContainText("changed successfully");

        // Second save after email change
        await page.locator("#result_list").getByRole("link", { name: "sanji" }).click();
        await page.fill('input[name="last_name"]', "UpdatedLast");
        await page.locator('input[name="_save"]').click();

        await expect(page).toHaveURL("/admin/auth/user/");
        await expect(page.locator(".success")).toContainText("changed successfully");
    });

    test("can update PlayerProfile display name via admin inline", async ({ page }) => {
        await loginAsAdmin(page);

        await page.goto("/admin/auth/user/");
        await page.locator("#result_list").getByRole("link", { name: "sanji" }).click();
        await expect(page).toHaveURL(/\/admin\/auth\/user\/\d+\/change\//);

        await page.fill('input[name="profile-0-display_name"]', "TestUser Renamed");
        await page.locator('input[name="_save"]').click();
        await expect(page).toHaveURL("/admin/auth/user/");
        await expect(page.locator(".success")).toContainText("changed successfully");

        // Second save with a different display name
        await page.locator("#result_list").getByRole("link", { name: "sanji" }).click();
        await page.fill('input[name="profile-0-display_name"]', "Sanji");
        await page.locator('input[name="_save"]').click();

        await expect(page).toHaveURL("/admin/auth/user/");
        await expect(page.locator(".success")).toContainText("changed successfully");
    });
});
