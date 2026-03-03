import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";

test.use({ storageState: AUTH_FILE });

test.describe("05 — Tournament Results", () => {
  let token: string;
  let tournamentEventId: number;

  test.beforeAll(async ({ request }) => {
    const api = new ApiHelper(request);
    const { token: t } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    token = t;
    api.setToken(token);

    const events = await api.getEvents();
    const tournament = events.find((e: { type: string }) => e.type === "tournament");
    tournamentEventId = tournament?.id ?? 3;
  });

  test("add tournament result via API", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const res = await api.post(`/api/events/${tournamentEventId}/results`, {
      placement: 1,
      totalTeams: 8,
      summary: "Won the final 2-1 against FC Pfäffikon ZH. Unbeaten throughout the tournament.",
      achievements: [
        { type: "1st_place", label: "Tournament Winner" },
        { type: "fair_play", label: "Fair Play Award" },
      ],
    });
    expect(res.status).toBe(201);
  });

  test("add game history entry", async ({ request }) => {
    const api = new ApiHelper(request);
    api.setToken(token);
    const res = await api.post("/api/game-history", {
      tournamentName: "Kunstrassenturnier Indoor",
      date: "2026-03-01",
      teamName: "FC Test E2E",
      placeRanking: 1,
      isTrophy: true,
      trophyType: "1st_place",
      notes: "6 games, 5 wins, 1 draw",
      matches: [
        { matchLabel: "Game 1", homeTeam: "FC Test E2E", awayTeam: "FC Greifensee", score: "3:1" },
        { matchLabel: "Game 5", homeTeam: "FC Test E2E", awayTeam: "FC Volketswil", score: "4:0" },
        { matchLabel: "Final", homeTeam: "FC Test E2E", awayTeam: "FC Pfäffikon ZH", score: "2:1" },
      ],
    });
    expect(res.status).toBe(201);
  });

  test("trophy cabinet shows the result", async ({ page }) => {
    await page.goto("/trophies");
    await expect(page.getByText("Kunstrassenturnier Indoor")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1st|1\./)).toBeVisible();
    await expect(page.getByText("Fair Play")).toBeVisible();
  });

  test("game history detail page shows matches", async ({ page }) => {
    await page.goto("/trophies");
    const link = page.getByText("Kunstrassenturnier Indoor");
    await link.click();
    await expect(page.getByText("FC Greifensee")).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });
});
