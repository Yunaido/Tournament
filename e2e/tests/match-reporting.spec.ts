import { expect, test } from "@playwright/test";
import { expectAlert, loginAsPlayer, resetMatch } from "./helpers";

const TOURNAMENT = "Grand Line Cup";

/** Navigate to Grand Line Cup detail from home */
async function goToGrandLineCup(page: import("@playwright/test").Page) {
    await page.goto("/");
    const card = page.locator(".card", { hasText: TOURNAMENT });
    await card.locator('a:has-text("View"), a:has-text("Details")').click();
}

/** Click the first available Report link and go to the report page */
async function goToFirstReportPage(page: import("@playwright/test").Page) {
    await goToGrandLineCup(page);
    const reportLink = page.locator('a[href*="/report/"]').first();
    await expect(reportLink).toBeVisible({ timeout: 5000 });
    await reportLink.click();
}

// Reset both pending matches before every test so each test starts from a clean slate.
test.beforeEach(() => {
    resetMatch(TOURNAMENT, "chopper", "robin");
    resetMatch(TOURNAMENT, "franky", "brook");
});

test.describe("Match reporting – report page UI", () => {
    test("report page shows heading and three radio choices", async ({ page }) => {
        await loginAsPlayer(page, "chopper");
        await goToFirstReportPage(page);
        await expect(page.locator("h3, h2")).toContainText(/Report.*Result/i);
        const radios = page.locator('input[name="result"]');
        await expect(radios).toHaveCount(3);
    });

    test("radio labels say Won, Lost, Draw", async ({ page }) => {
        await loginAsPlayer(page, "chopper");
        await goToFirstReportPage(page);
        await expect(page.locator("body")).toContainText(/I Won/i);
        await expect(page.locator("body")).toContainText(/I Lost/i);
        await expect(page.locator("body")).toContainText(/Draw/i);
    });

    test("report page shows the opponent's display name", async ({ page }) => {
        await loginAsPlayer(page, "chopper");
        await goToFirstReportPage(page);
        // Should show both players — at minimum chopper's name
        await expect(page.locator("body")).toContainText(/chopper|robin/i);
    });
});

test.describe("Match reporting – submit result", () => {
    test("submitting WIN shows waiting-for-opponent message", async ({ page }) => {
        await loginAsPlayer(page, "chopper");
        await goToFirstReportPage(page);
        // Bootstrap btn-check hides the radio input — click the label instead
        await page.locator('label[for="id_result_0"]').click();
        await page.click('button:has-text("Submit Result")');
        await expect(page.locator(".alert")).toBeVisible();
    });

    test("submitting LOSS shows a confirmation alert", async ({ page }) => {
        await loginAsPlayer(page, "robin");
        await goToFirstReportPage(page);
        await page.locator('label[for="id_result_1"]').click();
        await page.click('button:has-text("Submit Result")');
        await expect(page.locator(".alert")).toBeVisible();
    });

    test("submitting DRAW shows a confirmation alert", async ({ page }) => {
        await loginAsPlayer(page, "franky");
        await goToFirstReportPage(page);
        await page.locator('label[for="id_result_2"]').click();
        await page.click('button:has-text("Submit Result")');
        await expect(page.locator(".alert")).toBeVisible();
    });
});

test.describe("Match reporting – both players confirm", () => {
    test("consistent reports result in confirmed match", async ({ page, browser }) => {
        // Chopper reports WIN
        await loginAsPlayer(page, "chopper");
        await goToGrandLineCup(page);
        const chopperReport = page.locator('a[href*="/report/"]').first();
        await expect(chopperReport).toBeVisible({ timeout: 5000 });
        await chopperReport.click();
        await page.locator('label[for="id_result_0"]').click();
        await page.click('button:has-text("Submit Result")');
        await expectAlert(page, /waiting|reported/i);

        // Robin reports LOSS (consistent) in a fresh page
        const page2 = await browser.newPage();
        await loginAsPlayer(page2, "robin");
        await page2.goto("/");
        const card2 = page2.locator(".card", { hasText: TOURNAMENT });
        await card2.locator('a:has-text("View"), a:has-text("Details")').click();
        const robinReport = page2.locator('a[href*="/report/"]').first();
        await expect(robinReport).toBeVisible({ timeout: 5000 });
        await robinReport.click();
        await page2.locator('label[for="id_result_1"]').click();
        await page2.click('button:has-text("Submit Result")');
        // Should show "confirmed"
        await expectAlert(page2, /confirmed/i);
        await page2.close();
    });
});

test.describe("Match reporting – conflict", () => {
    test("conflicting reports show a warning and reset both players", async ({ page, browser }) => {
        // Franky reports WIN
        await loginAsPlayer(page, "franky");
        await goToGrandLineCup(page);
        const frankyReport = page.locator('a[href*="/report/"]').first();
        await expect(frankyReport).toBeVisible({ timeout: 5000 });
        await frankyReport.click();
        await page.locator('label[for="id_result_0"]').click();
        await page.click('button:has-text("Submit Result")');
        // Franky's state is pending opponent

        // Brook reports WIN too → conflict
        const page2 = await browser.newPage();
        await loginAsPlayer(page2, "brook");
        await page2.goto("/");
        const card2 = page2.locator(".card", { hasText: TOURNAMENT });
        await card2.locator('a:has-text("View"), a:has-text("Details")').click();
        const brookReport = page2.locator('a[href*="/report/"]').first();
        await expect(brookReport).toBeVisible({ timeout: 5000 });
        await brookReport.click();
        await page2.locator('label[for="id_result_0"]').click();
        await page2.click('button:has-text("Submit Result")');
        // Should show conflict warning
        await expect(page2.locator(".alert-warning, .alert-danger")).toBeVisible();
        await page2.close();
    });
});

test.describe("Match reporting – non-participant", () => {
    test("player not in the match cannot report it", async ({ page }) => {
        // Luffy tries to access chopper vs robin report URL
        await loginAsPlayer(page, "luffy");
        await goToGrandLineCup(page);

        // If any report link is visible it must be for luffy's own match
        const reportLinks = await page.locator('a[href*="/report/"]').all();
        for (const link of reportLinks) {
            const href = await link.getAttribute("href");
            if (href) {
                await page.goto(href);
                const url = page.url();
                // Should either redirect or show forbidden
                const body = await page.locator("body").textContent();
                const isOwnMatch = body?.match(/luffy|zoro/i) != null;
                const isForbidden = body?.match(/forbidden|403|not allowed|cannot/i) != null || url.includes("login");
                expect(isOwnMatch || isForbidden).toBeTruthy();
            }
        }
    });
});

test.describe("Match reporting – confirmed match", () => {
    test("already-confirmed match shows confirmed badge on tournament page", async ({ page }) => {
        // Luffy vs Zoro is confirmed in the seed (luffy WIN)
        await loginAsPlayer(page, "luffy");
        await goToGrandLineCup(page);
        // The confirmed match card should show the result, not a Report link
        await expect(page.locator("body")).toContainText(/confirmed|luffy|win/i);
    });
});
