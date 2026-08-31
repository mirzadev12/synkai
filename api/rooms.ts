import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureWorkspace } from "../backend/src/lib/ensureWorkspace.js";
import {
  liveblocksRoomId,
  normalizeJoinCode,
  randomJoinCode,
  workspaceIdFromCode,
} from "../backend/src/lib/roomIdentity.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const action = body.action === "join" ? "join" : "create";

  try {
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
    res.status(200).json({ code, workspaceId, roomId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
