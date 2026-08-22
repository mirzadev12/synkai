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
    const { workspaceId, agentId, brief } = body;

    if (typeof workspaceId !== "string" || typeof brief !== "string") {
      res.status(400).json({ error: "workspaceId and brief are required" });
      return;
    }

    let targetAgentId =
      typeof agentId === "string" && agentId ? agentId : undefined;

    if (!targetAgentId) {
      const agents = await orchestrator.listAgents(workspaceId);
      const story = agents.find((a) => a.name === "story-writer");
      if (!story) {
        res.status(404).json({
          error:
            "No story-writer agent found. Run the seed script or pass agentId.",
        });
        return;
      }
      targetAgentId = story.id;
    }

    const result = await orchestrator.runAgent(
      targetAgentId,
      workspaceId,
      brief,
    );
    res.status(200).json({
      output: result.output,
      eventId: result.eventId,
      note: "Migrated to orchestrator.runAgent (single-agent convenience).",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
