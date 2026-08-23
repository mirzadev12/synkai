import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as memoryService from "../../backend/src/lib/memoryService.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const workspaceId = req.query.workspaceId;
  const id = Array.isArray(workspaceId) ? workspaceId[0] : workspaceId;
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }

  try {
    if (req.method === "GET") {
      const limitRaw = req.query.limit;
      const limitStr = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
      const limit = Math.min(
        50,
        Math.max(1, Number.parseInt(String(limitStr ?? "15"), 10) || 15),
      );
      const events = await memoryService.getWorkspaceMemory(id, limit);
      res.status(200).json({
        events,
        formatted: memoryService.formatMemoryAsContext(events),
        count: events.length,
      });
      return;
    }

    if (req.method === "POST") {
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const content = typeof body.content === "string" ? body.content : "";
      if (!content.trim()) {
        res.status(400).json({ error: "content required" });
        return;
      }
      const eventType =
        typeof body.eventType === "string" && body.eventType.trim()
          ? body.eventType
          : "ai_output";
      const blockId =
        typeof body.blockId === "string" ? body.blockId : null;
      const modelProvider =
        typeof body.modelProvider === "string" ? body.modelProvider : null;
      const prompt = typeof body.prompt === "string" ? body.prompt : null;

      const eventId = await memoryService.logMemoryEvent(
        id,
        blockId,
        eventType,
        modelProvider,
        prompt,
        content,
      );
      res.status(201).json({ id: eventId });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
