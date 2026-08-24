import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as workflowEngine from "../../../backend/src/lib/workflowEngine.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "id required" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const body = asRecord(req.body);
    const fromNodeId = body.fromNodeId;
    const toNodeId = body.toNodeId;
    if (typeof fromNodeId !== "string" || typeof toNodeId !== "string") {
      res.status(400).json({ error: "fromNodeId and toNodeId required" });
      return;
    }
    const branch = typeof body.branch === "string" ? body.branch : "default";
    const created = await workflowEngine.addWorkflowEdge(
      id,
      fromNodeId,
      toNodeId,
      branch,
    );
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
