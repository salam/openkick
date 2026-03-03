import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";

test.use({ storageState: AUTH_FILE });

test.describe("03 — Adding Events", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const api = new ApiHelper(request);
    const { token: t } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    token = t;
  });

  test("create training event via API", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const { status, body } = await api.createEvent({
      type: "training",
      title: "Monday Training",
      date: "2026-03-09",
      startTime: "18:00",
      location: "Sportplatz Dübendorf",
    });
    expect(status).toBe(201);
    expect(body.title).toBe("Monday Training");
  });

  test("create match event via API", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const { status, body } = await api.createEvent({
      type: "match",
      title: "Friendly vs FC Zürich",
      date: "2026-03-14",
      startTime: "10:00",
      location: "Heerenschürli",
    });
    expect(status).toBe(201);
    expect(body.type).toBe("match");
  });

  test("create tournament event via API", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const { status, body } = await api.createEvent({
      type: "tournament",
      title: "Kunstrassenturnier Indoor",
      date: "2026-03-01",
      startTime: "07:15",
      location: "360Footballarena, Oberembrach",
    });
    expect(status).toBe(201);
    expect(body.type).toBe("tournament");
  });

  test("events appear in calendar page", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByText("Monday Training")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Friendly vs FC Zürich")).toBeVisible();
    await expect(page.getByText("Kunstrassenturnier Indoor")).toBeVisible();
  });

  test("event detail page renders", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByText("Monday Training").click();
    await expect(page).toHaveURL(/\/events\/\d+/);
    await expect(page.getByText("Sportplatz Dübendorf")).toBeVisible();
  });
});
