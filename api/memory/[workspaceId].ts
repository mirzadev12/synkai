import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as memoryService from "../../backend/src/lib/memoryService.js";
import {
  embedAndStoreEvent,
  retrieveRelevantMemory,
} from "../../server/memoryRetrieval.js";
import { isWorkspaceId } from "../../backend/src/lib/roomIdentity.js";
import {
  MAX_MEMORY_CHARS,
  MEMORY_WRITE_LIMIT,
  clientKey,
  rateLimit,
} from "../../server/rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const workspaceId = req.query.workspaceId;
  const id = Array.isArray(workspaceId) ? workspaceId[0] : workspaceId;
  if (!isWorkspaceId(id)) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }

  try {
    if (req.method === "GET") {
      // ?q=<text> switches from "most recent" to semantic relevance.
      // Without it the endpoint behaves exactly as before, so the Team Memory
      // sidebar keeps working unchanged.
      const qRaw = req.query.q;
      const query = Array.isArray(qRaw) ? qRaw[0] : qRaw;

      if (typeof query === "string" && query.trim()) {
        const result = await retrieveRelevantMemory({
          workspaceId: id,
          query,
          apiKey: process.env.GEMINI_API_KEY ?? "",
        });
        res.status(200).json({
          events: result.events,
          formatted: result.formatted,
          count: result.count,
          mode: "semantic",
        });
        return;
      }

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
        mode: "recent",
      });
      return;
    }

    if (req.method === "POST") {
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      // Each write costs a row plus an embedding call, so it is budgeted.
      const limit = rateLimit(
        clientKey(req.headers as Record<string, unknown>, "memory"),
        MEMORY_WRITE_LIMIT.limit,
        MEMORY_WRITE_LIMIT.windowMs,
      );
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        res.status(429).json({ error: "Too many requests — slow down a moment." });
        return;
      }

      const content = typeof body.content === "string" ? body.content : "";
      if (!content.trim()) {
        res.status(400).json({ error: "content required" });
        return;
      }
      if (content.length > MAX_MEMORY_CHARS) {
        res.status(413).json({ error: "Memory entry is too long" });
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

      // Embed AFTER the event is safely stored. This never throws, so a rate
      // limit or an unmigrated database costs a vector, never a memory — the
      // row is picked up later by the backfill script.
      //
      // Not awaited by the browser for UI purposes: AiBlock fires this POST
      // with `void logAiOutput(...)` once the model output is already rendered.
      const embedded = await embedAndStoreEvent({
        eventId,
        workspaceId: id,
        content,
        apiKey: process.env.GEMINI_API_KEY ?? "",
      });

      res.status(201).json({ id: eventId, embedded });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
