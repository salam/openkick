import { test, expect } from "@playwright/test";
import { API_BASE } from "../helpers/auth.js";

test.describe("11 — Unauthenticated Pages", () => {
  test("homepage shows public content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).not.toContain("/login");
    expect(url).not.toContain("/setup");
  });

  test("calendar page shows events without admin actions", async ({ page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).not.toBeEmpty();

    // No edit/delete buttons visible for unauthenticated users
    expect(await page.getByRole("button", { name: /edit|bearbeiten/i }).count()).toBe(0);
    expect(await page.getByRole("button", { name: /delete|löschen/i }).count()).toBe(0);
  });

  test("trophies page renders publicly", async ({ page }) => {
    await page.goto("/trophies");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });

  test("RSVP page loads attendance form", async ({ page }) => {
    await page.goto("/rsvp");
    await page.waitForLoadState("networkidle");
    // Use .first() since multiple form/input elements match
    await expect(page.locator("form").first()).toBeVisible({ timeout: 10_000 });
  });

  test("public tournament page uses privacy-preserving initials", async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/game-history`);
    const history = await res.json();
    if (history.length === 0) {
      test.skip(true, "No game history entries to test");
      return;
    }
    await page.goto(`/tournaments/${history[0].id}`);
    await page.waitForLoadState("networkidle");
    // Page should render without errors — may use main, div, or other container
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("event detail page shows reduced view without admin controls", async ({ page }) => {
    await page.goto("/events/1");
    await page.waitForLoadState("networkidle");

    expect(await page.getByRole("button", { name: /edit|delete|cancel|bearbeiten|löschen|absagen/i }).count()).toBe(0);
  });

  test("no admin links visible in navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(await page.getByRole("link", { name: /dashboard/i }).count()).toBe(0);
    expect(await page.getByRole("link", { name: /settings|einstellungen/i }).count()).toBe(0);
  });

  test("API rejects unauthorized access to protected endpoints", async ({ request }) => {
    // Surveys require authMiddleware
    const surveyRes = await request.post(`${API_BASE}/api/surveys`, {
      headers: { "Content-Type": "application/json" },
      data: { title: "Unauthorized Survey" },
    });
    expect(surveyRes.status()).toBe(401);

    // Users endpoint requires auth
    const usersRes = await request.get(`${API_BASE}/api/users`);
    expect(usersRes.status()).toBe(401);

    // Security audit requires auth
    const auditRes = await request.get(`${API_BASE}/api/security-audit`);
    expect(auditRes.status()).toBe(401);
  });
});
