import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as orchestrator from "../backend/src/lib/orchestrator.js";

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
