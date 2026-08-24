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
    const nodeType = body.nodeType;
    if (typeof nodeType !== "string") {
      res.status(400).json({ error: "nodeType required" });
      return;
    }
    const config = asRecord(body.config);
    const pos = asRecord(body.canvasPosition);
    const canvasPosition =
      typeof pos.x === "number" && typeof pos.y === "number"
        ? { x: pos.x, y: pos.y }
        : null;
    const created = await workflowEngine.addWorkflowNode(
      id,
      nodeType,
      config,
      canvasPosition,
    );
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
