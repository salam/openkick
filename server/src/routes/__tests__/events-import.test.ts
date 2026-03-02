import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { eventsRouter } from "../events.js";
import type { Database } from "sql.js";

// BUG6 — POST /api/events/import-url and POST /api/events/import-pdf return 404
// because routes were never registered in the events router.

// Mock the tournament-import service
vi.mock("../../services/tournament-import.js", () => ({
  extractFromUrl: vi.fn(),
  extractFromPdf: vi.fn(),
}));

import { extractFromUrl, extractFromPdf } from "../../services/tournament-import.js";

const VALID_IMPORT: import("../../services/tournament-import.js").ImportedTournament = {
  title: "Juniorenturnier Zürich",
  date: "2026-06-15",
  startTime: "09:00",
  location: "Sportanlage Buchlern, Zürich",
  categoryRequirement: "E,F",
  deadline: "2026-06-08",
  maxParticipants: 32,
  description: "Juniorenturnier für Kategorien E und F",
};

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use(express.raw({ type: "application/pdf", limit: "10mb" }));
  app.use("/api", eventsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  db.close();
}

describe("POST /api/events/import-url", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("returns 200 with imported tournament data", async () => {
    vi.mocked(extractFromUrl).mockResolvedValue(VALID_IMPORT);

    const res = await fetch(`${baseUrl}/api/events/import-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.turnieragenda.ch/event/detail/7918" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(VALID_IMPORT);
    expect(extractFromUrl).toHaveBeenCalledWith(
      "https://www.turnieragenda.ch/event/detail/7918",
    );
  });

  it("returns 400 when url is missing", async () => {
    const res = await fetch(`${baseUrl}/api/events/import-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/url/i);
  });

  it("returns 500 when extraction fails", async () => {
    vi.mocked(extractFromUrl).mockRejectedValue(new Error("Failed to fetch URL (404): https://bad.url"));

    const res = await fetch(`${baseUrl}/api/events/import-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://bad.url" }),
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Failed to fetch URL");
  });
});

describe("POST /api/events/import-pdf", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("returns 200 with imported tournament data from PDF", async () => {
    vi.mocked(extractFromPdf).mockResolvedValue(VALID_IMPORT);

    const pdfBuffer = Buffer.from("fake-pdf-content");
    const res = await fetch(`${baseUrl}/api/events/import-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: pdfBuffer,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(VALID_IMPORT);
    expect(extractFromPdf).toHaveBeenCalledOnce();
  });

  it("returns 400 when body is empty", async () => {
    const res = await fetch(`${baseUrl}/api/events/import-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(0),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/pdf/i);
  });

  it("returns 500 when PDF extraction fails", async () => {
    vi.mocked(extractFromPdf).mockRejectedValue(new Error("Invalid PDF structure"));

    const res = await fetch(`${baseUrl}/api/events/import-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.from("not-a-real-pdf"),
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Invalid PDF structure");
  });
});
