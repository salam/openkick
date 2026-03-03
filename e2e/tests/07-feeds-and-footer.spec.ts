import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";

test.use({ storageState: AUTH_FILE });

test.describe("07 — Feeds & Footer Links", () => {
  let api: ApiHelper;

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    const { token } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    api.setToken(token);

    for (const key of ["feeds_enabled", "feed_rss_enabled", "feed_atom_enabled", "feed_ics_enabled"]) {
      await api.putSetting(key, "true");
    }
  });

  test("RSS feed returns valid XML with events", async () => {
    const { status, text, headers } = await api.get("/api/feeds/rss");
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("xml");
    expect(text).toContain("<rss");
    expect(text).toContain("<channel>");
    expect(text).toContain("<item>");
    expect(text).toContain("Monday Training");
  });

  test("Atom feed returns valid XML", async () => {
    const { status, text, headers } = await api.get("/api/feeds/atom");
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("xml");
    expect(text).toContain("<feed");
    expect(text).toContain("<entry>");
  });

  test("sitemap.xml returns valid XML with URLs", async () => {
    const { status, text } = await api.get("/api/sitemap.xml");
    expect(status).toBe(200);
    expect(text).toContain("<urlset");
    expect(text).toContain("<url>");
    expect(text).toContain("<loc>");
  });

  test("llms.txt returns club info", async () => {
    const { status, text } = await api.get("/llms.txt");
    expect(status).toBe(200);
    expect(text).toContain("FC Test E2E");
  });

  test("robots.txt is accessible and allows feeds", async () => {
    const { status, text } = await api.get("/robots.txt");
    expect(status).toBe(200);
    expect(text).toContain("User-agent:");
    expect(text.toLowerCase()).toContain("allow");
  });

  test("security.txt is accessible", async () => {
    const { status, text } = await api.get("/.well-known/security.txt");
    expect(status).toBe(200);
    expect(text).toContain("Contact:");
  });

  test("imprint page renders", async ({ page }) => {
    await page.goto("/imprint");
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("main")).toBeVisible();
  });

  test("privacy page renders", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("main")).toBeVisible();
  });

  test("ICS calendar feed returns valid iCal", async () => {
    const { status, text } = await api.get("/api/feeds/calendar.ics");
    expect(status).toBe(200);
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain("END:VCALENDAR");
  });

  test("feeds contain trophy data when trophies=only", async () => {
    const { status, text } = await api.get("/api/feeds/rss?trophies=only");
    expect(status).toBe(200);
    expect(text).toContain("Kunstrassenturnier");
  });

  test("RSS with empty filter returns no items gracefully", async () => {
    const { status, text } = await api.get("/api/feeds/rss?type=match");
    expect(status).toBe(200);
    expect(text).toContain("<rss");
  });
});
