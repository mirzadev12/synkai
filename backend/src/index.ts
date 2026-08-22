import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import orchestrationRoutes from "./routes/orchestration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load repo-root .env.local first (SYNKAI already keeps keys there), then backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "synkai-orchestration" });
});

app.use("/api", orchestrationRoutes);

app.listen(port, () => {
  console.log(`SYNKAI orchestration API listening on http://localhost:${port}`);
});
