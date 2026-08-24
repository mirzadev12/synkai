import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as workflowEngine from "../../../../backend/src/lib/workflowEngine.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const idRaw = req.query.id;
  const runRaw = req.query.runId;
  const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
  const runId = Array.isArray(runRaw) ? runRaw[0] : runRaw;
  if (!id || typeof id !== "string" || !runId || typeof runId !== "string") {
    res.status(400).json({ error: "id and runId required" });
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const result = await workflowEngine.getWorkflowRun(id, runId);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
