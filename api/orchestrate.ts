import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureWorkspace } from "../backend/src/lib/ensureWorkspace.js";
import * as orchestrator from "../backend/src/lib/orchestrator.js";
import { createUploadTicket, MAX_FILE_BYTES } from "../backend/src/lib/fileStorage.js";
import { missingMigrations } from "../backend/src/lib/schemaCheck.js";
import {
  liveblocksRoomId,
  normalizeJoinCode,
  randomJoinCode,
  workspaceIdFromCode,
} from "../backend/src/lib/roomIdentity.js";

async function handleServerSession(
  body: Record<string, unknown>,
  res: VercelResponse,
) {
  const action = body.action === "join" ? "join" : "create";
  const code =
    action === "join"
      ? normalizeJoinCode(typeof body.code === "string" ? body.code : "")
      : randomJoinCode();
  if (!code) {
    res.status(400).json({ error: "Enter a 6-digit server code" });
    return;
  }
  const workspaceId = workspaceIdFromCode(code);
  const roomId = liveblocksRoomId(code);
  await ensureWorkspace(workspaceId, `Server ${code}`);
  // Reported at join so an unapplied migration surfaces as a visible warning
  // instead of a feature that silently does nothing.
  const missing = await missingMigrations().catch(() => []);
  res.status(200).json({ code, workspaceId, roomId, missingMigrations: missing });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};

    if (body.action === "create" || body.action === "join") {
      await handleServerSession(body, res);
      return;
    }

    // /api/files is rewritten here rather than given its own route: the project
    // is already at Vercel Hobby's 12-function ceiling.
    if (body.action === "upload-url") {
      const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "";
      const size = typeof body.size === "number" ? body.size : 0;
      if (!workspaceId || !fileName) {
        res.status(400).json({ error: "workspaceId and fileName are required" });
        return;
      }
      if (size > MAX_FILE_BYTES) {
        res.status(413).json({
          error: `File is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`,
        });
        return;
      }
      const ticket = await createUploadTicket({ workspaceId, fileName });
      res.status(200).json(ticket);
      return;
    }

    const { workspaceId, agentIds, triggerContent } = body;

    if (
      typeof workspaceId !== "string" ||
      !Array.isArray(agentIds) ||
      agentIds.length === 0 ||
      typeof triggerContent !== "string"
    ) {
      res.status(400).json({
        error: "workspaceId, agentIds[], and triggerContent are required",
      });
      return;
    }

    const run = await orchestrator.runOrchestrationChain(
      workspaceId,
      agentIds.map(String),
      triggerContent,
    );
    res.status(200).json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
