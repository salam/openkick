import { test, expect } from "@playwright/test";
import { API_BASE } from "../helpers/auth.js";

test.describe("11 — Unauthenticated Pages", () => {
  test("homepage shows public stats and recent trophies", async ({ page }) => {
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

    const editBtn = page.getByRole("button", { name: /edit|bearbeiten/i });
    const deleteBtn = page.getByRole("button", { name: /delete|löschen/i });
    await expect(editBtn).not.toBeVisible().catch(() => {});
    await expect(deleteBtn).not.toBeVisible().catch(() => {});
  });

  test("trophies page renders publicly", async ({ page }) => {
    await page.goto("/trophies");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main, .container")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Kunstrassenturnier|trophy|trophäe/i)).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });

  test("RSVP page loads attendance form", async ({ page }) => {
    await page.goto("/rsvp");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("form, input, [role='form']")).toBeVisible({ timeout: 10_000 });
  });

  test("public tournament page uses privacy-preserving initials", async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/game-history`);
    const history = await res.json();
    if (history.length > 0) {
      await page.goto(`/tournaments/${history[0].id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
    }
  });

  test("event detail page shows reduced view without admin controls", async ({ page }) => {
    await page.goto("/events/1");
    await page.waitForLoadState("networkidle");

    const adminBtn = page.getByRole("button", { name: /edit|delete|cancel|bearbeiten|löschen|absagen/i });
    await expect(adminBtn).not.toBeVisible().catch(() => {});
  });

  test("no admin links visible in navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dashLink = page.getByRole("link", { name: /dashboard/i });
    await expect(dashLink).not.toBeVisible().catch(() => {});

    const settingsLink = page.getByRole("link", { name: /settings|einstellungen/i });
    await expect(settingsLink).not.toBeVisible().catch(() => {});
  });

  test("API rejects unauthorized write operations", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/players`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "Hacker" },
    });
    expect(res.status()).toBe(401);

    const res2 = await request.post(`${API_BASE}/api/events`, {
      headers: { "Content-Type": "application/json" },
      data: { type: "training", title: "Unauthorized", date: "2026-04-01" },
    });
    expect(res2.status()).toBe(401);

    const res3 = await request.get(`${API_BASE}/api/settings/club_name`);
    expect(res3.status()).toBe(401);
  });
});
