import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";
import fs from "node:fs";
import path from "node:path";

test.use({ storageState: AUTH_FILE });

test.describe("04 — Tournament Import", () => {
  let api: ApiHelper;

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    const { token } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    api.setToken(token);
  });

  test("turnieragenda fixture HTML is valid for parsing", async () => {
    const html = fs.readFileSync(
      path.join(import.meta.dirname, "..", "fixtures", "turnieragenda-7918-schedule.html"),
      "utf-8"
    );
    expect(html).toContain("js-schedule-game");
    expect(html).toContain("FC Glattal a");
    expect(html).toContain("3:1");
  });

  test("create imported tournament event with extracted data", async () => {
    const { status, body } = await api.createEvent({
      type: "tournament",
      title: "Kunstrassenturnier Indoor (Hallenturnier) — Imported",
      date: "2026-02-27",
      startTime: "07:15",
      location: "360Footballarena, Bächlistrasse 1, 8425 Oberembrach",
    });
    expect(status).toBe(201);
    expect(body.location).toContain("Oberembrach");
  });

  test("imported event visible in calendar", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByText(/Kunstrassenturnier.*Imported/)).toBeVisible({ timeout: 10_000 });
  });
});
