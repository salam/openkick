import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";
import { GUARDIAN_PHONE } from "../fixtures/waha-messages.js";

test.use({ storageState: AUTH_FILE });

test.describe("02 — Adding Users", () => {
  let api: ApiHelper;

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    const { token } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    api.setToken(token);
  });

  test("add players via API", async () => {
    const players = [
      { name: "Ava", yearOfBirth: 2017 },
      { name: "Marlo", yearOfBirth: 2017 },
      { name: "Luca", yearOfBirth: 2016 },
      { name: "Noah", yearOfBirth: 2018 },
    ];

    for (const p of players) {
      const { status, body } = await api.createPlayer(p);
      expect(status).toBe(201);
      expect(body.name).toBe(p.name);
    }
  });

  test("add guardian linked to Ava and Marlo", async () => {
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
    await expect(page.getByText("Ava")).toBeVisible();
    await expect(page.getByText("Marlo")).toBeVisible();
    await expect(page.getByText("Luca")).toBeVisible();
    await expect(page.getByText("Noah")).toBeVisible();
  });
});
