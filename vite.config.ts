import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { runAi, type AiModel } from "./server/runAi.ts";

function isAiModel(value: unknown): value is AiModel {
  return value === "gemini" || value === "groq";
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function aiApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: "ai-api",
    configureServer(server) {
      server.middlewares.use("/api/run", (req, res, next) => {
        void (async () => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          try {
            const body = await readJsonBody(req);
            const record =
              body && typeof body === "object" && !Array.isArray(body)
                ? (body as Record<string, unknown>)
                : {};
            const prompt = typeof record.prompt === "string" ? record.prompt : "";
            const model = record.model;
            if (!isAiModel(model)) {
              sendJson(res, 400, { error: "model must be gemini or groq" });
              return;
            }

            const result = await runAi(prompt, model, env);
            sendJson(res, 200, result);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "AI request failed";
            sendJson(res, 500, { error: message });
          }
        })().catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), aiApiPlugin(env)],
  };
});
