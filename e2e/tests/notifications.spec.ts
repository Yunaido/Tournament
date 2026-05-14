import { expect, test } from "@playwright/test";
import { expectAlert, loginAsPlayer } from "./helpers";

test.describe("Notification Preferences", () => {
    test("notification preferences page renders with all checkboxes", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/notifications/");
        await expect(page.locator("h3")).toContainText("Notification Preferences");

        // All checkboxes should be visible
        await expect(page.locator("#id_round_started")).toBeVisible();
        await expect(page.locator("#id_result_reported")).toBeVisible();
        await expect(page.locator("#id_match_confirmed")).toBeVisible();
        await expect(page.locator("#id_tournament_finished")).toBeVisible();

        // All should be checked by default
        await expect(page.locator("#id_round_started")).toBeChecked();
        await expect(page.locator("#id_result_reported")).toBeChecked();
        await expect(page.locator("#id_match_confirmed")).toBeChecked();
        await expect(page.locator("#id_tournament_finished")).toBeChecked();
    });

    test("toggle notification preferences and save", async ({ page }) => {
        await loginAsPlayer(page, "zoro");
        await page.goto("/accounts/notifications/");

        // Uncheck two preferences
        await page.uncheck("#id_round_started");
        await page.uncheck("#id_tournament_finished");

        await page.click('button:has-text("Save Preferences")');
        await expectAlert(page, "Notification preferences updated.");

        // Reload and verify they persisted
        await page.goto("/accounts/notifications/");
        await expect(page.locator("#id_round_started")).not.toBeChecked();
        await expect(page.locator("#id_result_reported")).toBeChecked();
        await expect(page.locator("#id_match_confirmed")).toBeChecked();
        await expect(page.locator("#id_tournament_finished")).not.toBeChecked();

        // Restore defaults for other tests
        await page.check("#id_round_started");
        await page.check("#id_tournament_finished");
        await page.click('button:has-text("Save Preferences")');
    });

    test("security page has notification preferences link", async ({ page }) => {
        await loginAsPlayer(page, "nami");
        await page.goto("/accounts/profile/security/");

        const link = page.locator('a:has-text("Notification Preferences")');
        await expect(link).toBeVisible();
        await link.click();
        await expect(page).toHaveURL(/\/accounts\/notifications\//);
    });

    test("push notification UI elements are present", async ({ page }) => {
        await loginAsPlayer(page, "sanji");
        await page.goto("/accounts/notifications/");

        // Push status indicator should be present
        await expect(page.locator("#push-status")).toBeVisible();

        // Subscribe button should exist (may be hidden based on browser support)
        const subscribeBtn = page.locator("#push-subscribe-btn");
        await expect(subscribeBtn).toBeAttached();

        // Unsubscribe button should exist (hidden initially)
        const unsubscribeBtn = page.locator("#push-unsubscribe-btn");
        await expect(unsubscribeBtn).toBeAttached();
    });

    test("notification preferences require login", async ({ page }) => {
        await page.goto("/accounts/notifications/");
        // Should redirect to login
        await expect(page).toHaveURL(/\/accounts\/login\//);
    });
});

test.describe("Push Subscription API", () => {
    test("subscribe endpoint requires authentication", async ({ page }) => {
        const res = await page.request.post("/accounts/push/subscribe/", {
            data: JSON.stringify({ endpoint: "https://example.com/push", keys: { p256dh: "key1", auth: "key2" } }),
            headers: { "Content-Type": "application/json" },
        });
        // Unauthenticated POST requests get 302 (redirect) or 403 (CSRF rejection)
        expect([302, 403]).toContain(res.status());
    });

    test("unsubscribe endpoint requires authentication", async ({ page }) => {
        const res = await page.request.post("/accounts/push/unsubscribe/", {
            data: JSON.stringify({ endpoint: "https://example.com/push" }),
            headers: { "Content-Type": "application/json" },
        });
        expect([302, 403]).toContain(res.status());
    });

    test("vapid public key endpoint returns JSON", async ({ page }) => {
        const res = await page.request.get("/accounts/push/vapid-key/");
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty("publicKey");
        expect(typeof body.publicKey).toBe("string");
    });

    test("subscribe with valid data", async ({ page }) => {
        await loginAsPlayer(page, "nami");

        // Visit page to get session + CSRF cookie established
        await page.goto("/accounts/notifications/");

        // Get CSRF token from cookie
        const cookies = await page.context().cookies();
        const csrfCookie = cookies.find(c => c.name === "csrftoken");
        expect(csrfCookie).toBeTruthy();

        const res = await page.request.post("/accounts/push/subscribe/", {
            data: JSON.stringify({
                endpoint: "https://push.example.com/test-nami",
                keys: { p256dh: "test-p256dh-key-value", auth: "test-auth-key" },
            }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfCookie!.value,
            },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    test("subscribe with missing data returns 400", async ({ page }) => {
        await loginAsPlayer(page, "sanji");
        await page.goto("/accounts/notifications/");

        const cookies = await page.context().cookies();
        const csrfCookie = cookies.find(c => c.name === "csrftoken");

        const res = await page.request.post("/accounts/push/subscribe/", {
            data: JSON.stringify({ endpoint: "" }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfCookie!.value,
            },
        });
        expect(res.status()).toBe(400);
    });

    test("unsubscribe removes subscription", async ({ page }) => {
        await loginAsPlayer(page, "luffy");
        await page.goto("/accounts/notifications/");

        const cookies = await page.context().cookies();
        const csrfCookie = cookies.find(c => c.name === "csrftoken");

        // Subscribe first
        await page.request.post("/accounts/push/subscribe/", {
            data: JSON.stringify({
                endpoint: "https://push.example.com/test-luffy",
                keys: { p256dh: "test-p256dh", auth: "test-auth" },
            }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfCookie!.value,
            },
        });

        // Unsubscribe
        const res = await page.request.post("/accounts/push/unsubscribe/", {
            data: JSON.stringify({ endpoint: "https://push.example.com/test-luffy" }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfCookie!.value,
            },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.deleted).toBe(true);
    });

    test("unsubscribe with nonexistent endpoint returns deleted false", async ({ page }) => {
        await loginAsPlayer(page, "zoro");
        await page.goto("/accounts/notifications/");

        const cookies = await page.context().cookies();
        const csrfCookie = cookies.find(c => c.name === "csrftoken");

        const res = await page.request.post("/accounts/push/unsubscribe/", {
            data: JSON.stringify({ endpoint: "https://push.example.com/nonexistent" }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfCookie!.value,
            },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.deleted).toBe(false);
    });
});

test.describe("Service Worker", () => {
    test("service worker is served at /sw.js", async ({ page }) => {
        const res = await page.request.get("/sw.js");
        expect(res.status()).toBe(200);
        const contentType = res.headers()["content-type"];
        expect(contentType).toContain("javascript");
        const body = await res.text();
        expect(body).toContain("push");
        expect(body).toContain("notificationclick");
    });

    test("service worker has correct Service-Worker-Allowed header", async ({ page }) => {
        const res = await page.request.get("/sw.js");
        expect(res.headers()["service-worker-allowed"]).toBe("/");
    });
});
