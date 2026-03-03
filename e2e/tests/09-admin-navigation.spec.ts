import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "../helpers/auth.js";

test.use({ storageState: AUTH_FILE });

test.describe("09 — Admin Navigation", () => {
  const dashboardTabs = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/dashboard/players", label: "Players" },
    { path: "/dashboard/broadcasts", label: "Broadcasts" },
    { path: "/dashboard/checklists", label: "Checklists" },
    { path: "/dashboard/payments", label: "Payments" },
    { path: "/dashboard/stats", label: "Statistics" },
    { path: "/settings", label: "Settings" },
  ];

  for (const tab of dashboardTabs) {
    test(`navigate to ${tab.label} (${tab.path})`, async ({ page }) => {
      await page.goto(tab.path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main, [role='main'], .container, .dashboard")).toBeVisible({ timeout: 10_000 });
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.waitForTimeout(1_000);
      expect(errors).toHaveLength(0);
    });
  }

  test("logout redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const logoutBtn = page.getByRole("button", { name: /logout|abmelden|sign out/i })
      .or(page.getByRole("link", { name: /logout|abmelden|sign out/i }));

    if (await logoutBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForURL(/\/(login|setup)/, { timeout: 10_000 });
    } else {
      await page.evaluate(() => localStorage.removeItem("openkick_token"));
      await page.goto("/dashboard");
      await page.waitForURL(/\/(login|setup)/, { timeout: 10_000 });
    }
  });

  test("dashboard page loads without errors for fresh context", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);
    expect(errors).toHaveLength(0);
    await context.close();
  });
});
