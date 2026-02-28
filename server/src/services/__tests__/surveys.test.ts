import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

describe("surveys schema", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    db.close();
  });

  it("creates surveys table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='surveys'");
    expect(result[0]?.values.length).toBe(1);
  });

  it("creates survey_questions table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_questions'");
    expect(result[0]?.values.length).toBe(1);
  });

  it("creates survey_responses table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_responses'");
    expect(result[0]?.values.length).toBe(1);
  });

  it("creates survey_answers table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_answers'");
    expect(result[0]?.values.length).toBe(1);
  });
});
