import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDB } from "./database.js";
import { playersRouter } from "./routes/players.js";
import { eventsRouter } from "./routes/events.js";

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: CORS_ORIGIN.split(",") }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", playersRouter);
app.use("/api", eventsRouter);

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
