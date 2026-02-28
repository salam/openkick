import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { surveysRouter } from "../surveys.routes.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
let adminToken: string;

async function createTestApp() {
  db = await initDB();

  // Insert admin guardian
  db.run(
    `INSERT INTO guardians (id, phone, name, role, passwordHash)
     VALUES (1, '+41700000001', 'Admin User', 'admin', 'hash')`,
  );

  adminToken = generateJWT({ id: 1, role: "admin" });

  const app = express();
  app.use(express.json());
  app.use("/api", surveysRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  db.close();
}

describe("Survey admin routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/surveys — returns 201 with survey object (auth required)", async () => {
    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Season Feedback",
        anonymous: true,
        questions: [
          { type: "star_rating", label: "Overall satisfaction", sort_order: 0 },
          { type: "free_text", label: "Any comments?", sort_order: 1 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.survey).toBeDefined();
    expect(body.survey.title).toBe("Season Feedback");
    expect(body.survey.anonymous).toBe(true);
    expect(body.survey.status).toBe("open");
    expect(body.questions).toBeDefined();
    expect(body.questions).toHaveLength(2);
  });

  it("POST /api/surveys — returns 400 when title is missing", async () => {
    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        anonymous: false,
        questions: [],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("POST /api/surveys — returns 401 without auth token", async () => {
    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "No Auth Survey",
        anonymous: false,
        questions: [],
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/surveys — returns 200 with list of surveys", async () => {
    // Create a survey first
    await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Test Survey",
        anonymous: false,
        questions: [{ type: "free_text", label: "Thoughts?", sort_order: 0 }],
      }),
    });

    const res = await fetch(`${baseUrl}/api/surveys`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].title).toBe("Test Survey");
  });

  it("GET /api/surveys/:id — returns 200 with survey + questions", async () => {
    // Create a survey first
    const createRes = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Detail Survey",
        anonymous: true,
        questions: [{ type: "star_rating", label: "Rate us", sort_order: 0 }],
      }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/surveys/${created.survey.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Detail Survey");
    expect(body.questions).toBeDefined();
    expect(body.questions).toHaveLength(1);
  });

  it("GET /api/surveys/:id — returns 404 for non-existent survey", async () => {
    const res = await fetch(`${baseUrl}/api/surveys/9999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/surveys/:id/results — returns 200 with aggregated data", async () => {
    // Create a survey
    const createRes = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Results Survey",
        anonymous: true,
        questions: [{ type: "star_rating", label: "Rate", sort_order: 0 }],
      }),
    });
    const created = await createRes.json();

    const res = await fetch(
      `${baseUrl}/api/surveys/${created.survey.id}/results`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("survey");
    expect(body).toHaveProperty("total_responses");
    expect(body).toHaveProperty("questions");
    expect(body.total_responses).toBe(0);
  });

  it("PUT /api/surveys/:id/close — returns 200, status is closed", async () => {
    // Create a survey
    const createRes = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Close Me",
        anonymous: false,
        questions: [{ type: "free_text", label: "Note", sort_order: 0 }],
      }),
    });
    const created = await createRes.json();

    const res = await fetch(
      `${baseUrl}/api/surveys/${created.survey.id}/close`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("closed");
  });

  it("PUT /api/surveys/:id/archive — returns 200, status is archived", async () => {
    // Create a survey
    const createRes = await fetch(`${baseUrl}/api/surveys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Archive Me",
        anonymous: false,
        questions: [{ type: "free_text", label: "Note", sort_order: 0 }],
      }),
    });
    const created = await createRes.json();

    const res = await fetch(
      `${baseUrl}/api/surveys/${created.survey.id}/archive`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("archived");
  });

  it("POST /api/surveys/templates/trikot-order — returns 201", async () => {
    const res = await fetch(`${baseUrl}/api/surveys/templates/trikot-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ team_id: null }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.survey).toBeDefined();
    expect(body.survey.title).toBe("Trikot & Cap Order");
    expect(body.questions).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
  });

  it("POST /api/surveys/templates/feedback — returns 201", async () => {
    const res = await fetch(`${baseUrl}/api/surveys/templates/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ team_id: null }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.survey).toBeDefined();
    expect(body.survey.title).toBe("End-of-Semester Feedback");
    expect(body.questions).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
  });
});
