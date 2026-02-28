import { Router, type Request, type Response } from "express";
import type { CaptchaProvider } from "../middleware/captcha.js";

export function captchaRouter(provider: CaptchaProvider): Router {
  const router = Router();

  router.get("/captcha/challenge", async (_req: Request, res: Response) => {
    try {
      const challenge = await provider.generateChallenge();
      res.json(challenge);
    } catch {
      res.status(500).json({ error: "Failed to generate captcha challenge" });
    }
  });

  return router;
}
