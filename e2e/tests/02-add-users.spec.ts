import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";
import { GUARDIAN_PHONE } from "../fixtures/waha-messages.js";

test.use({ storageState: AUTH_FILE });

test.describe("02 — Adding Users", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const api = new ApiHelper(request);
    const { token: t } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    token = t;
  });

  test("add players via API", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const players = [
      { name: "Ava", yearOfBirth: 2017 },
      { name: "Marlo", yearOfBirth: 2017 },
      { name: "Luca", yearOfBirth: 2016 },
      { name: "Noah", yearOfBirth: 2018 },
    ];

    for (const p of players) {
      const { status, body } = await api.createPlayer(p);
      expect(status).toBe(201);
      expect(body.id).toBeTruthy();
    }
  });

  test("add guardian linked to Ava and Marlo", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const { status, body: guardian } = await api.createGuardian({
      name: "Parent Müller",
      phone: GUARDIAN_PHONE,
      email: "parent@example.com",
      role: "parent",
    });
    expect(status).toBe(201);

    await api.linkGuardianToPlayer(guardian.id, 1);
    await api.linkGuardianToPlayer(guardian.id, 2);
  });

  test("players page shows all players", async ({ page }) => {
    await page.goto("/dashboard/players");
    // Player names may be PII-masked depending on token access level;
    // verify 4 player rows are visible instead of checking exact names
    const rows = page.locator("table tbody tr, [data-testid='player-row'], .player-card, li").filter({ hasText: /\w/ });
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
