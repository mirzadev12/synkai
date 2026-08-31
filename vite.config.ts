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

function applyServerEnv(env: Record<string, string>) {
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "DEMO_WORKSPACE_ID",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
  ]) {
    if (env[key] && !process.env[key]) {
      process.env[key] = env[key];
    }
  }
}

function parseMemoryPath(url: string): { workspaceId: string; limit: number } | null {
  const match = /^\/api\/memory\/([^/?]+)\/?(?:\?(.*))?$/.exec(url);
  if (!match) return null;
  const workspaceId = decodeURIComponent(match[1] ?? "");
  if (!workspaceId) return null;
  const params = new URLSearchParams(match[2] ?? "");
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(params.get("limit") ?? "15", 10) || 15),
  );
  return { workspaceId, limit };
}

function aiApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: "ai-api",
    configureServer(server) {
      applyServerEnv(env);

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

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/memory/")) {
          next();
          return;
        }

        void (async () => {
          const parsed = parseMemoryPath(url.split("#")[0] ?? url);
          if (!parsed) {
            sendJson(res, 400, { error: "workspaceId required" });
            return;
          }

          const memoryService = await import(
            "./backend/src/lib/memoryService.ts"
          );

          if (req.method === "GET") {
            const events = await memoryService.getWorkspaceMemory(
              parsed.workspaceId,
              parsed.limit,
            );
            sendJson(res, 200, {
              events,
              formatted: memoryService.formatMemoryAsContext(events),
              count: events.length,
            });
            return;
          }

          if (req.method === "POST") {
            const body = await readJsonBody(req);
            const record =
              body && typeof body === "object" && !Array.isArray(body)
                ? (body as Record<string, unknown>)
                : {};
            const content =
              typeof record.content === "string" ? record.content : "";
            if (!content.trim()) {
              sendJson(res, 400, { error: "content required" });
              return;
            }
            const eventType =
              typeof record.eventType === "string" && record.eventType.trim()
                ? record.eventType
                : "ai_output";
            const blockId =
              typeof record.blockId === "string" ? record.blockId : null;
            const modelProvider =
              typeof record.modelProvider === "string"
                ? record.modelProvider
                : null;
            const prompt =
              typeof record.prompt === "string" ? record.prompt : null;
            const id = await memoryService.logMemoryEvent(
              parsed.workspaceId,
              blockId,
              eventType,
              modelProvider,
              prompt,
              content,
            );
            sendJson(res, 201, { id });
            return;
          }

          sendJson(res, 405, { error: "Method not allowed" });
        })().catch(next);
      });

      server.middlewares.use("/api/rooms", (req, res, next) => {
        void (async () => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }
          const body = await readJsonBody(req);
          const record =
            body && typeof body === "object" && !Array.isArray(body)
              ? (body as Record<string, unknown>)
              : {};
          const { ensureWorkspace } = await import(
            "./backend/src/lib/ensureWorkspace.ts"
          );
          const {
            liveblocksRoomId,
            normalizeJoinCode,
            randomJoinCode,
            workspaceIdFromCode,
          } = await import("./backend/src/lib/roomIdentity.ts");
          const action = record.action === "join" ? "join" : "create";
          const code =
            action === "join"
              ? normalizeJoinCode(
                  typeof record.code === "string" ? record.code : "",
                )
              : randomJoinCode();
          if (!code) {
            sendJson(res, 400, { error: "Enter a 6-digit server code" });
            return;
          }
          const workspaceId = workspaceIdFromCode(code);
          const roomId = liveblocksRoomId(code);
          await ensureWorkspace(workspaceId, `Server ${code}`);
          sendJson(res, 200, { code, workspaceId, roomId });
        })().catch(next);
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/workflows")) {
          next();
          return;
        }

        void (async () => {
          const { dispatchWorkflowApi } = await import(
            "./backend/src/lib/workflowHttp.ts"
          );
          const pathname = (url.split("#")[0] ?? url).split("?")[0] ?? url;
          const body =
            req.method === "GET" || req.method === "HEAD"
              ? {}
              : await readJsonBody(req);
          const result = await dispatchWorkflowApi(
            req.method ?? "GET",
            pathname,
            body,
          );
          sendJson(res, result.status, result.json);
        })().catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, process.cwd(), "");
  const backendEnv = loadEnv(mode, `${process.cwd()}/backend`, "");
  const env = { ...backendEnv, ...rootEnv };
  return {
    plugins: [react(), aiApiPlugin(env)],
  };
});
