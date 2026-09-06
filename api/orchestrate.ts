import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureWorkspace } from "../backend/src/lib/ensureWorkspace.js";
import {
  createUploadTicket,
  MAX_FILE_BYTES,
  uploadRejectionReason,
} from "../backend/src/lib/fileStorage.js";
import {
  ROOM_LIMIT,
  UPLOAD_LIMIT,
  clientKey,
  rateLimit,
} from "../server/rateLimit.js";
import { missingMigrations } from "../backend/src/lib/schemaCheck.js";
import {
  isWorkspaceId,
  liveblocksRoomId,
  normalizeJoinCode,
  randomJoinCode,
  workspaceIdFromCode,
} from "../backend/src/lib/roomIdentity.js";

/** Shared shape for the 429 responses below. */
function tooManyRequests(res: VercelResponse, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({ error: "Too many requests — slow down a moment." });
}

async function handleServerSession(
  body: Record<string, unknown>,
  res: VercelResponse,
  roomKey: string,
) {
  const action = body.action === "join" ? "join" : "create";
  // Join is an online guessing oracle for room codes; the limiter caps how fast
  // that guessing can go on any one instance. The real defence is the code's
  // 32^10 keyspace — see randomJoinCode.
  const limit = rateLimit(roomKey, ROOM_LIMIT.limit, ROOM_LIMIT.windowMs);
  if (!limit.allowed) {
    tooManyRequests(res, limit.retryAfterSeconds);
    return;
  }
  const code =
    action === "join"
      ? normalizeJoinCode(typeof body.code === "string" ? body.code : "")
      : randomJoinCode();
  if (!code) {
    res.status(400).json({ error: "That join code isn't valid" });
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
      await handleServerSession(
        body,
        res,
        clientKey(req.headers as Record<string, unknown>, "rooms"),
      );
      return;
    }

    // /api/files is rewritten here rather than given its own route: the project
    // is already at Vercel Hobby's 12-function ceiling.
    if (body.action === "upload-url") {
      const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "";
      const size = typeof body.size === "number" ? body.size : 0;
      if (!isWorkspaceId(workspaceId) || !fileName) {
        res.status(400).json({ error: "workspaceId and fileName are required" });
        return;
      }
      const uploadLimit = rateLimit(
        clientKey(req.headers as Record<string, unknown>, "files"),
        UPLOAD_LIMIT.limit,
        UPLOAD_LIMIT.windowMs,
      );
      if (!uploadLimit.allowed) {
        tooManyRequests(res, uploadLimit.retryAfterSeconds);
        return;
      }
      const rejection = uploadRejectionReason(fileName);
      if (rejection) {
        res.status(400).json({ error: rejection });
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

    // The agent-chain branch used to live here. Nothing in the canvas ever
    // called it, but it was a public URL that spent this project's Gemini quota
    // for anyone who found it — no join code needed. The Express app under
    // backend/ still exposes it on localhost for orchestration work.
    res.status(400).json({ error: "Unsupported action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
