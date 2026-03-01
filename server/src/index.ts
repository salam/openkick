import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { initDB, getDB } from "./database.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { AltchaCaptchaProvider, verifyCaptchaMiddleware } from "./middleware/captcha.js";
import { captchaRouter } from "./routes/captcha.js";
import { authRouter } from "./routes/auth.js";
import { playersRouter } from "./routes/players.js";
import { eventsRouter } from "./routes/events.js";
import { attendanceRouter } from "./routes/attendance.js";
import { settingsRouter } from "./routes/settings.js";
import { usersRouter } from "./routes/users.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { broadcastsRouter } from "./routes/broadcasts.js";
import { calendarRouter } from "./routes/calendar.js";
import { eventSeriesRouter } from "./routes/event-series.js";
import { teamsRouter } from "./routes/teams.js";
import { tournamentResultsRouter } from "./routes/tournament-results.js";
import { llmsRouter } from "./routes/llms.js";
import { feedsRouter, wellKnownRouter } from "./routes/feeds.js";
import { mcpRouter } from "./mcp/index.js";
import { securityAuditRouter } from "./routes/security-audit.js";
import { setupWahaRouter } from "./routes/setup-waha.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { gdprRouter } from "./routes/gdpr.js";
import { runHolidaySync, startHolidaySyncScheduler } from "./services/holiday-scheduler.js";
import { startCrawlScheduler } from "./services/crawl-scheduler.js";
import { liveTickerRouter } from "./routes/live-ticker.routes.js";
import { notificationsRouter } from "./routes/notifications.js";
import { publicTournamentsRouter } from "./routes/public-tournaments.js";
import { publicEventsRouter } from "./routes/public-events.js";
import { gameHistoryRouter } from "./routes/game-history.routes.js";
import { createRsvpRouter } from "./routes/rsvp.js";
import { securityTxtRouter } from "./routes/security-txt.js";
import { htmlInjector } from "./middleware/html-injector.js";
import { checklistsRouter } from "./routes/checklists.routes.js";
import { resetAdminChecklists } from "./services/checklist.service.js";
import { surveysRouter } from "./routes/surveys.routes.js";
import { surveyRespondRouter } from "./routes/public/survey-respond.routes.js";
import { createStripeWebhookRouter } from "./routes/webhooks/stripe.webhook.js";
import { createDatatransWebhookRouter } from "./routes/webhooks/datatrans.webhook.js";
import { PaymentService } from "./services/payment.service.js";
import { StripeProvider } from "./services/stripe.service.js";
import { DatatransProvider } from "./services/datatrans.service.js";
import { createPaymentsRouter } from "./routes/payments.js";
import { statisticsRouter } from "./routes/statistics.js";
import { homepageStatsRouter } from "./routes/public/homepage-stats.js";

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: CORS_ORIGIN.split(",") }));

// Payment webhook routes MUST come before express.json() for raw body access
const paymentService = new PaymentService();
app.use("/api/webhooks/stripe", createStripeWebhookRouter(paymentService));
app.use("/api/webhooks/datatrans", createDatatransWebhookRouter(paymentService));

app.use(express.json());
app.use(express.raw({ type: "application/pdf", limit: "10mb" }));

app.use("/api", createPaymentsRouter(paymentService));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(securityTxtRouter);
app.use(htmlInjector);
app.use(express.static(path.resolve(__dirname, "../../public")));

app.use("/", llmsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", publicTournamentsRouter);
app.use("/api", publicEventsRouter);
app.use("/api", authRouter);
app.use("/api", playersRouter);
app.use("/api", eventsRouter);
app.use("/api", attendanceRouter);
app.use("/api", settingsRouter);
app.use("/api", usersRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api", broadcastsRouter);
app.use("/api", calendarRouter);
app.use("/api", eventSeriesRouter);
app.use("/api", teamsRouter);
app.use("/api", tournamentResultsRouter);
app.use(wellKnownRouter);
app.use("/api", feedsRouter);
app.use("/api", securityAuditRouter);
app.use("/api", onboardingRouter);
app.use("/api", gdprRouter);
app.use("/api/setup-waha", setupWahaRouter);
app.use("/api", liveTickerRouter);
app.use("/api", notificationsRouter);
app.use("/api", gameHistoryRouter);
app.use("/api", checklistsRouter);
app.use("/api", surveysRouter);
app.use("/api/public", surveyRespondRouter);
app.use("/api", statisticsRouter);
app.use("/api", homepageStatsRouter);
app.use("/mcp", mcpRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const DB_PATH = process.env.DB_PATH || "./data/openkick.db";

async function main() {
  await initDB(DB_PATH);

  const db = getDB();

  // Initialize payment providers from DB config
  function initPaymentProviders() {
    const db = getDB();
    const providers = db.exec("SELECT id, enabled, config, testMode FROM payment_providers");
    if (providers.length === 0) return;

    for (const row of providers[0].values) {
      const [id, enabled, configJson, testMode] = row as [string, number, string, number];
      if (!enabled) continue;

      try {
        const config = JSON.parse(configJson);
        if (id === "stripe") {
          const secretKey = testMode ? (config.testSecretKey || process.env.STRIPE_SECRET_KEY) : (config.liveSecretKey || process.env.STRIPE_SECRET_KEY);
          const webhookSecret = testMode ? (config.testWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET) : (config.liveWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET);
          if (secretKey && webhookSecret) {
            paymentService.register(new StripeProvider({ secretKey, webhookSecret }));
          }
        } else if (id === "datatrans") {
          const merchantId = config.merchantId || process.env.DATATRANS_MERCHANT_ID;
          const apiPassword = testMode ? (config.testApiPassword || process.env.DATATRANS_API_PASSWORD) : (config.liveApiPassword || process.env.DATATRANS_API_PASSWORD);
          const hmacKey = config.hmacKey || process.env.DATATRANS_HMAC_KEY;
          const baseUrl = testMode ? "https://api.sandbox.datatrans.com" : "https://api.datatrans.com";
          if (merchantId && apiPassword && hmacKey) {
            paymentService.register(new DatatransProvider({ merchantId, apiPassword, hmacKey, baseUrl }));
          }
        }
      } catch (err) {
        console.error(`Failed to initialize payment provider ${id}:`, err);
      }
    }
  }

  initPaymentProviders();

  const hmacKeyResult = db.exec("SELECT value FROM settings WHERE key = 'captcha_hmac_secret'");
  let hmacKey: string;
  if (hmacKeyResult.length === 0 || hmacKeyResult[0].values.length === 0) {
    hmacKey = crypto.randomBytes(32).toString("hex");
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["captcha_hmac_secret", hmacKey]);
  } else {
    hmacKey = hmacKeyResult[0].values[0][0] as string;
  }
  const captchaProvider = new AltchaCaptchaProvider(hmacKey);

  app.use("/api/rsvp", createRsvpRouter(captchaProvider));
  app.use("/api", generalLimiter);
  app.post("/api/guardians/login", verifyCaptchaMiddleware(captchaProvider));
  app.post("/api/attendance", verifyCaptchaMiddleware(captchaProvider));
  app.use("/api", captchaRouter(captchaProvider));

  // Auto-reset admin checklists on semester boundaries
  resetAdminChecklists();

  // Run initial holiday sync and start daily scheduler
  runHolidaySync();
  startHolidaySyncScheduler();

  // Start live ticker crawl scheduler (checks every minute)
  startCrawlScheduler();

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch(console.error);

export default app;
