import { describe, it, expect } from "vitest";
import { AltchaCaptchaProvider } from "../middleware/captcha.js";

const HMAC_KEY = "test-hmac-secret-key-for-testing";

describe("AltchaCaptchaProvider", () => {
  const provider = new AltchaCaptchaProvider(HMAC_KEY);

  it("generateChallenge returns a challenge object", async () => {
    const challenge = await provider.generateChallenge();
    expect(challenge).toBeDefined();
    expect(challenge).toHaveProperty("algorithm");
    expect(challenge).toHaveProperty("challenge");
    expect(challenge).toHaveProperty("salt");
    expect(challenge).toHaveProperty("signature");
  });

  it("verifySolution returns false for invalid payload", async () => {
    const result = await provider.verifySolution("invalid-base64-payload");
    expect(result).toBe(false);
  });

  it("verifySolution returns false for empty string", async () => {
    const result = await provider.verifySolution("");
    expect(result).toBe(false);
  });
});
