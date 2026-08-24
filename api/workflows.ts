import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as workflowEngine from "../backend/src/lib/workflowEngine.js";

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
    const workspaceId = body.workspaceId;
    const name = body.name;
    if (typeof workspaceId !== "string" || typeof name !== "string" || !name.trim()) {
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
