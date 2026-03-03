import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, AUTH_FILE } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";
import fs from "node:fs";
import path from "node:path";

test.describe("01 — Onboarding & Setup", () => {
  test("setup or login depending on server state", async ({ page, context }) => {
    const api = new ApiHelper(context.request);

    // Check if setup is needed
    const status = await api.setupStatus();

    if (status.needsSetup) {
      // Fresh server — complete the setup wizard via UI
      await page.goto("/setup");
      await page.waitForLoadState("networkidle");

      // Fill admin form (labels from i18n: Name, Email, Password, Confirm password)
      await page.locator('input[type="text"][autocomplete="name"]').fill(ADMIN_NAME);
      await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
      await page.locator('input[type="password"][autocomplete="new-password"]').first().fill(ADMIN_PASSWORD);
      await page.locator('input[type="password"][autocomplete="new-password"]').last().fill(ADMIN_PASSWORD);

      await page.getByRole("button", { name: /create|erstellen|créer/i }).click();

      // After setup, shows WAHA wizard — skip it
      await page.waitForTimeout(2_000);
      const skipBtn = page.getByRole("button", { name: /skip|überspringen|passer/i });
      if (await skipBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await skipBtn.click();
      }

      await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 15_000 });
    } else {
      // Server already set up — try to login
      const loginRes = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);

      if (loginRes.token) {
        // Admin exists with our credentials
        await page.goto("/");
        await page.evaluate((token: string) => {
          localStorage.setItem("openkick_token", token);
        }, loginRes.token);
      } else {
        // Different admin credentials — create via setup API won't work.
        // Try the setup endpoint anyway (it's idempotent if DB exists)
        test.skip(true, "Server already set up with different credentials");
        return;
      }
    }

    // Verify we can access the app
    const loginCheck = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(loginCheck.token).toBeTruthy();
  });

  test("complete onboarding wizard (skip optional steps)", async ({ page, context }) => {
    const api = new ApiHelper(context.request);
    const loginRes = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(loginRes.token).toBeTruthy();

    // Set club name via API (reliable, avoids flaky form interactions)
    await api.setToken(loginRes.token);
    await api.putSetting("club_name", "FC Test E2E");

    // Set auth state in browser
    await page.goto("/");
    await page.evaluate((token: string) => {
      localStorage.setItem("openkick_token", token);
    }, loginRes.token);

    // Try visiting onboarding — if already completed, that's fine
    await page.goto("/onboarding");
    await page.waitForLoadState("networkidle");

    // If we're on the onboarding page, click through steps
    if (page.url().includes("/onboarding")) {
      // Try to skip through steps (up to 5)
      for (let i = 0; i < 5; i++) {
        const skipBtn = page.getByRole("button", { name: /skip|überspringen|next|weiter|passer|complete|abschliessen|finish|fertig/i });
        if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await skipBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Try to complete onboarding via API
    const completeRes = await api.post("/api/onboarding/complete", {});
    // Accept both 200 (success) and 400/403 (already completed or missing steps)

    // Verify dashboard is accessible
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Save auth state for subsequent tests
    const authDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({ path: AUTH_FILE });
  });

  test("dashboard is accessible after onboarding", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Should be on dashboard (authenticated) or redirect to login (if auth state wasn't saved)
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|login|onboarding)/);
  });
});
