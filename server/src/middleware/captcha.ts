import { createChallenge, verifySolution } from "altcha-lib";
import type { Request, Response, NextFunction } from "express";

export interface CaptchaChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber?: number;
}

export interface CaptchaProvider {
  generateChallenge(): Promise<CaptchaChallenge>;
  verifySolution(payload: string): Promise<boolean>;
}

export class AltchaCaptchaProvider implements CaptchaProvider {
  constructor(private hmacKey: string) {}

  async generateChallenge(): Promise<CaptchaChallenge> {
    const challenge = await createChallenge({
      hmacKey: this.hmacKey,
      maxNumber: 100000,
    });
    return challenge as CaptchaChallenge;
  }

  async verifySolution(payload: string): Promise<boolean> {
    try {
      const ok = await verifySolution(payload, this.hmacKey);
      return ok;
    } catch {
      return false;
    }
  }
}

export function verifyCaptchaMiddleware(provider: CaptchaProvider) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const payload = req.body?.captcha;
    if (!payload || typeof payload !== "string") {
      res.status(400).json({ error: "Captcha verification required" });
      return;
    }

    const valid = await provider.verifySolution(payload);
    if (!valid) {
      res.status(403).json({ error: "Captcha verification failed" });
      return;
    }

    next();
  };
}
