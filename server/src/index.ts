import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDB } from "./database.js";
import { playersRouter } from "./routes/players.js";
import { eventsRouter } from "./routes/events.js";
import { attendanceRouter } from "./routes/attendance.js";
import { settingsRouter } from "./routes/settings.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { broadcastsRouter } from "./routes/broadcasts.js";
import { calendarRouter } from "./routes/calendar.js";
import { teamsRouter } from "./routes/teams.js";

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: CORS_ORIGIN.split(",") }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", playersRouter);
app.use("/api", eventsRouter);
app.use("/api", attendanceRouter);
app.use("/api", settingsRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api", broadcastsRouter);
app.use("/api", calendarRouter);
app.use("/api", teamsRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const DB_PATH = process.env.DB_PATH || "./data/openkick.db";

async function main() {
  await initDB(DB_PATH);
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch(console.error);

export default app;
