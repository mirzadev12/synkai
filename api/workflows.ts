import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as workflowEngine from "../backend/src/lib/workflowEngine.js";
import { isWorkspaceId } from "../backend/src/lib/roomIdentity.js";
import {
  MEMORY_WRITE_LIMIT,
  clientKey,
  rateLimit,
} from "../server/rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  // Creating a workflow writes a row, so it is budgeted like other writes.
  const limit = rateLimit(
    clientKey(req.headers as Record<string, unknown>, "workflows"),
    MEMORY_WRITE_LIMIT.limit,
    MEMORY_WRITE_LIMIT.windowMs,
  );
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: "Too many requests — slow down a moment." });
    return;
  }

  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const workspaceId = body.workspaceId;
    const name = body.name;
    if (!isWorkspaceId(workspaceId) || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "workspaceId and name required" });
      return;
    }
    const created = await workflowEngine.createWorkflow(workspaceId, name.trim());
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
