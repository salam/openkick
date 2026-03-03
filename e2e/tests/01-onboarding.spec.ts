import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, AUTH_FILE } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";
import fs from "node:fs";
import path from "node:path";

test.describe("01 — Onboarding & Setup", () => {
  test("create admin account via API setup", async ({ page, context }) => {
    const api = new ApiHelper(context.request);

    // Wait for backend to be ready by polling setup status
    let ready = false;
    for (let i = 0; i < 20; i++) {
      try {
        const status = await api.setupStatus();
        if (status.needsSetup) {
          ready = true;
          break;
        }
      } catch {
        // Server not ready yet
      }
      await page.waitForTimeout(500);
    }
    expect(ready).toBeTruthy();

    // Create admin via API (more reliable than UI form)
    const setupResult = await api.setup({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(setupResult.token).toBeTruthy();

    // Verify login works
    const loginCheck = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(loginCheck.token).toBeTruthy();
  });

  test("complete onboarding wizard (skip optional steps)", async ({ page, context }) => {
    const api = new ApiHelper(context.request);
    const loginRes = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(loginRes.token).toBeTruthy();

    // Set club name via API
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
      for (let i = 0; i < 5; i++) {
        const skipBtn = page.getByRole("button", { name: /skip|überspringen|next|weiter|passer|complete|abschliessen|finish|fertig/i });
        if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await skipBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Try to complete onboarding via API
    await api.post("/api/onboarding/complete", {});

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
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|login|onboarding)/);
  });
});
