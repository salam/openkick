import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../database.js", () => ({
  getDB: vi.fn(() => ({
    exec: vi.fn().mockReturnValue([{
      values: [["My Club"]],
    }]),
  })),
}));

import { generateReceipt } from "../receipt.service.js";

describe("Receipt Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a PDF buffer", async () => {
    const buffer = await generateReceipt({
      transactionId: 1,
      amount: 2500,
      currency: "CHF",
      useCase: "tournament_fee",
      nickname: "Max M.",
      date: "2026-03-01T10:00:00Z",
      description: "Spring Cup 2026",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.toString("ascii", 0, 4)).toBe("%PDF");
  });

  it("generates receipt without nickname", async () => {
    const buffer = await generateReceipt({
      transactionId: 2,
      amount: 1050,
      currency: "CHF",
      useCase: "donation",
      date: "2026-03-01T12:00:00Z",
      description: "Donation",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
