import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseTurnieragendaSchedule,
  isTurnieragendaUrl,
  extractTurnieragendaEventId,
} from "../turnieragenda.parser.js";

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/turnieragenda-schedule.html",
);

describe("turnieragenda.parser", () => {
  describe("isTurnieragendaUrl", () => {
    it("recognises turnieragenda.ch URLs", () => {
      expect(
        isTurnieragendaUrl(
          "https://www.turnieragenda.ch/de/event/schedule/7918",
        ),
      ).toBe(true);
      expect(
        isTurnieragendaUrl("https://turnieragenda.ch/event/detail/7918"),
      ).toBe(true);
    });

    it("rejects other URLs", () => {
      expect(isTurnieragendaUrl("https://example.com/schedule")).toBe(false);
    });
  });

  describe("extractTurnieragendaEventId", () => {
    it("extracts event ID from URL", () => {
      expect(
        extractTurnieragendaEventId(
          "https://www.turnieragenda.ch/de/event/schedule/7918",
        ),
      ).toBe("7918");
      expect(
        extractTurnieragendaEventId(
          "https://www.turnieragenda.ch/event/detail/7918",
        ),
      ).toBe("7918");
    });
  });

  describe("parseTurnieragendaSchedule", () => {
    it("extracts match results from real schedule HTML fixture", () => {
      if (!fs.existsSync(FIXTURE_PATH)) {
        console.warn("Fixture not found, skipping real HTML test");
        return;
      }
      const html = fs.readFileSync(FIXTURE_PATH, "utf-8");
      const results = parseTurnieragendaSchedule(html);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("home");
      expect(results[0]).toHaveProperty("away");
      expect(results[0]).toHaveProperty("score");
      expect(results[0]).toHaveProperty("time");
    });

    it("extracts matches from inline HTML with colon-separated score cells", () => {
      const html = `<table class="table"><tbody>
        <tr><td>1</td><td>10:00</td><td>Team A</td><td>2</td><td>:</td><td>1</td><td>Team B</td></tr>
        <tr><td>2</td><td>10:15</td><td>Team C</td><td>0</td><td>:</td><td>0</td><td>Team D</td></tr>
      </tbody></table>`;
      const results = parseTurnieragendaSchedule(html);
      expect(results).toHaveLength(2);
      expect(results[0].home).toBe("Team A");
      expect(results[0].away).toBe("Team B");
      expect(results[0].score).toBe("2:1");
      expect(results[0].time).toBe("10:00");
      expect(results[1].home).toBe("Team C");
      expect(results[1].score).toBe("0:0");
    });

    it("handles matches without scores yet", () => {
      const html = `<table class="table"><tbody>
        <tr><td>1</td><td>10:00</td><td>Team A</td><td></td><td>:</td><td></td><td>Team B</td></tr>
      </tbody></table>`;
      const results = parseTurnieragendaSchedule(html);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe("pending");
    });
  });
});
