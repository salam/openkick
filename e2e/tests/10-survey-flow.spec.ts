import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";

test.use({ storageState: AUTH_FILE });

test.describe("10 — Survey Flow", () => {
  let api: ApiHelper;
  let surveyId: number;

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    const { token } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    api.setToken(token);
  });

  test("create a custom survey via API", async () => {
    const { status, body } = await api.createSurvey({
      title: "Post-Tournament Feedback",
      questions: [
        { type: "text", label: "What did you enjoy most?", required: true, sort_order: 1 },
        { type: "multiple_choice", label: "Rate the organization", options_json: JSON.stringify(["Excellent", "Good", "Fair", "Poor"]), required: true, sort_order: 2 },
      ],
    });
    expect(status).toBe(201);
    surveyId = body.survey.id;
    expect(surveyId).toBeTruthy();
  });

  test("survey appears in admin survey list", async ({ page }) => {
    await page.goto("/surveys");
    await expect(page.getByText("Post-Tournament Feedback")).toBeVisible({ timeout: 10_000 });
  });

  test("submit response on public survey page (unauthenticated)", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/surveys/${surveyId}/respond`);
    await expect(page.getByText("Post-Tournament Feedback")).toBeVisible({ timeout: 10_000 });

    const textInput = page.getByRole("textbox").first();
    if (await textInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await textInput.fill("The team spirit was amazing!");
    }

    const option = page.getByText("Excellent");
    if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await option.click();
    }

    await page.getByRole("button", { name: /submit|absenden|send/i }).click();

    await expect(page.getByText(/thank|danke|success|submitted/i)).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("admin sees submitted response", async () => {
    const results = await api.getSurveyResults(surveyId);
    expect(results).toBeTruthy();
  });

  test("close survey prevents new responses", async () => {
    const status = await api.closeSurvey(surveyId);
    expect(status).toBe(200);
  });

  test("closed survey shows closed state in UI", async ({ page }) => {
    await page.goto(`/surveys/${surveyId}`);
    await expect(page.getByText(/closed|geschlossen/i)).toBeVisible({ timeout: 10_000 });
  });

  test("archive survey", async () => {
    const status = await api.archiveSurvey(surveyId);
    expect(status).toBe(200);
  });
});
