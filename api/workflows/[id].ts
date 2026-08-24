import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as workflowEngine from "../../backend/src/lib/workflowEngine.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "id required" });
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const graph = await workflowEngine.getWorkflow(id);
    res.status(200).json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
