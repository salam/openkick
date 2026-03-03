import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, AUTH_FILE } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";

test.describe("01 — Onboarding & Setup", () => {
  test("fresh app redirects to /setup", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup/);
  });

  test("complete setup wizard creates admin account", async ({ page, request }) => {
    await page.goto("/setup");
    await expect(page.getByRole("heading")).toContainText(/setup|welcome|einrichten/i);

    await page.getByLabel(/name/i).fill(ADMIN_NAME);
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);
    await page.getByLabel(/confirm/i).fill(ADMIN_PASSWORD);

    await page.getByRole("button", { name: /create|submit|weiter|next/i }).click();
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 15_000 });
  });

  test("complete onboarding wizard (skip optional steps)", async ({ page, context }) => {
    const api = new ApiHelper(context.request);
    const loginRes = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(loginRes.token).toBeTruthy();

    await page.goto("/onboarding");
    await page.evaluate((token: string) => {
      localStorage.setItem("openkick_token", token);
    }, loginRes.token);
    await page.reload();

    await page.getByLabel(/club.*name|vereinsname/i).fill("FC Test E2E");
    await page.getByRole("button", { name: /next|weiter|save|speichern/i }).click();

    for (let i = 0; i < 3; i++) {
      const skipBtn = page.getByRole("button", { name: /skip|überspringen|next|weiter/i });
      if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await skipBtn.click();
      }
    }

    const completeBtn = page.getByRole("button", { name: /complete|abschliessen|finish|fertig/i });
    if (await completeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await completeBtn.click();
    }

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await context.storageState({ path: AUTH_FILE });
  });
});
