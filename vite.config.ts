import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { runAi, type AiModel } from "./server/runAi.ts";
import {
  AI_RUN_LIMIT,
  MAX_MEMORY_CHARS,
  MAX_PROMPT_CHARS,
  MEMORY_WRITE_LIMIT,
  ROOM_LIMIT,
  UPLOAD_LIMIT,
  clientKey,
  rateLimit,
} from "./server/rateLimit.ts";

function isAiModel(value: unknown): value is AiModel {
  return value === "gemini" || value === "groq" || value === "claude";
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

function sendTooManyRequests(res: ServerResponse, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  sendJson(res, 429, { error: "Too many requests — slow down a moment." });
}

function applyServerEnv(env: Record<string, string>) {
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "DEMO_WORKSPACE_ID",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
  ]) {
    if (env[key] && !process.env[key]) {
      process.env[key] = env[key];
    }
  }
}

function parseMemoryPath(
  url: string,
): { workspaceId: string; limit: number; query: string } | null {
  const match = /^\/api\/memory\/([^/?]+)\/?(?:\?(.*))?$/.exec(url);
  if (!match) return null;
  const workspaceId = decodeURIComponent(match[1] ?? "");
  if (!workspaceId) return null;
  const params = new URLSearchParams(match[2] ?? "");
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(params.get("limit") ?? "15", 10) || 15),
  );
  return { workspaceId, limit, query: params.get("q") ?? "" };
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

          const limit = rateLimit(
            clientKey(req.headers as Record<string, unknown>, "run"),
            AI_RUN_LIMIT.limit,
            AI_RUN_LIMIT.windowMs,
          );
          if (!limit.allowed) {
            res.setHeader("Retry-After", String(limit.retryAfterSeconds));
            sendJson(res, 429, {
              error: "Too many requests — slow down a moment.",
            });
            return;
          }

          try {
            const body = await readJsonBody(req);
            const record =
              body && typeof body === "object" && !Array.isArray(body)
                ? (body as Record<string, unknown>)
                : {};
            const prompt = typeof record.prompt === "string" ? record.prompt : "";
            if (prompt.length > MAX_PROMPT_CHARS) {
              sendJson(res, 413, { error: "Prompt is too long" });
              return;
            }
            const model = record.model;
            if (!isAiModel(model)) {
              sendJson(res, 400, {
                error: "model must be gemini, groq, or claude",
              });
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
          const { isWorkspaceId } = await import(
            "./backend/src/lib/roomIdentity.ts"
          );
          if (!parsed || !isWorkspaceId(parsed.workspaceId)) {
            sendJson(res, 400, { error: "workspaceId required" });
            return;
          }

          const memoryService = await import(
            "./backend/src/lib/memoryService.ts"
          );

          if (req.method === "GET") {
            // Mirrors api/memory/[workspaceId].ts — ?q= switches to semantic.
            if (parsed.query.trim()) {
              const { retrieveRelevantMemory } = await import(
                "./server/memoryRetrieval.ts"
              );
              const result = await retrieveRelevantMemory({
                workspaceId: parsed.workspaceId,
                query: parsed.query,
                apiKey: env.GEMINI_API_KEY ?? "",
              });
              sendJson(res, 200, {
                events: result.events,
                formatted: result.formatted,
                count: result.count,
                mode: "semantic",
              });
              return;
            }

            const events = await memoryService.getWorkspaceMemory(
              parsed.workspaceId,
              parsed.limit,
            );
            sendJson(res, 200, {
              events,
              formatted: memoryService.formatMemoryAsContext(events),
              count: events.length,
              mode: "recent",
            });
            return;
          }

          if (req.method === "POST") {
            const limit = rateLimit(
              clientKey(req.headers, "memory"),
              MEMORY_WRITE_LIMIT.limit,
              MEMORY_WRITE_LIMIT.windowMs,
            );
            if (!limit.allowed) {
              sendTooManyRequests(res, limit.retryAfterSeconds);
              return;
            }
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
            if (content.length > MAX_MEMORY_CHARS) {
              sendJson(res, 413, { error: "Memory entry is too long" });
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

            const { embedAndStoreEvent } = await import(
              "./server/memoryRetrieval.ts"
            );
            const embedded = await embedAndStoreEvent({
              eventId: id,
              workspaceId: parsed.workspaceId,
              content,
              apiKey: env.GEMINI_API_KEY ?? "",
            });

            sendJson(res, 201, { id, embedded });
            return;
          }

          sendJson(res, 405, { error: "Method not allowed" });
        })().catch(next);
      });

      server.middlewares.use("/api/files", (req, res, next) => {
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
          const { createUploadTicket, MAX_FILE_BYTES, uploadRejectionReason } =
            await import("./backend/src/lib/fileStorage.ts");
          const { isWorkspaceId } = await import(
            "./backend/src/lib/roomIdentity.ts"
          );
          const workspaceId =
            typeof record.workspaceId === "string" ? record.workspaceId : "";
          const fileName =
            typeof record.fileName === "string" ? record.fileName : "";
          const size = typeof record.size === "number" ? record.size : 0;
          if (!isWorkspaceId(workspaceId) || !fileName) {
            sendJson(res, 400, { error: "workspaceId and fileName are required" });
            return;
          }
          const uploadLimit = rateLimit(
            clientKey(req.headers, "files"),
            UPLOAD_LIMIT.limit,
            UPLOAD_LIMIT.windowMs,
          );
          if (!uploadLimit.allowed) {
            sendTooManyRequests(res, uploadLimit.retryAfterSeconds);
            return;
          }
          const rejection = uploadRejectionReason(fileName);
          if (rejection) {
            sendJson(res, 400, { error: rejection });
            return;
          }
          if (size > MAX_FILE_BYTES) {
            sendJson(res, 413, {
              error: `File is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`,
            });
            return;
          }
          sendJson(res, 200, await createUploadTicket({ workspaceId, fileName }));
        })().catch(next);
      });

      server.middlewares.use("/api/rooms", (req, res, next) => {
        void (async () => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }
          const roomLimit = rateLimit(
            clientKey(req.headers, "rooms"),
            ROOM_LIMIT.limit,
            ROOM_LIMIT.windowMs,
          );
          if (!roomLimit.allowed) {
            sendTooManyRequests(res, roomLimit.retryAfterSeconds);
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
            sendJson(res, 400, { error: "That join code isn't valid" });
            return;
          }
          const workspaceId = workspaceIdFromCode(code);
          const roomId = liveblocksRoomId(code);
          await ensureWorkspace(workspaceId, `Server ${code}`);
          const { missingMigrations } = await import(
            "./backend/src/lib/schemaCheck.ts"
          );
          const missing = await missingMigrations().catch(() => []);
          sendJson(res, 200, {
            code,
            workspaceId,
            roomId,
            missingMigrations: missing,
          });
        })().catch(next);
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/workflows")) {
          next();
          return;
        }

        void (async () => {
          const limit = rateLimit(
            clientKey(req.headers, "workflows"),
            AI_RUN_LIMIT.limit,
            AI_RUN_LIMIT.windowMs,
          );
          if (!limit.allowed) {
            sendTooManyRequests(res, limit.retryAfterSeconds);
            return;
          }
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
