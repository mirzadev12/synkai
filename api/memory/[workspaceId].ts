import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as memoryService from "../../backend/src/lib/memoryService.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const workspaceId = req.query.workspaceId;
    const id = Array.isArray(workspaceId) ? workspaceId[0] : workspaceId;
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const summary = await memoryService.getWorkspaceMemorySummary(id);
    res.status(200).json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
