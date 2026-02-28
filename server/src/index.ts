import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export default app;
