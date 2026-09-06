import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as workflowEngine from "../../../backend/src/lib/workflowEngine.js";
import {
  AI_RUN_LIMIT,
  MAX_PROMPT_CHARS,
  clientKey,
  rateLimit,
} from "../../../server/rateLimit.js";

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
  // A workflow run fans out to the model per AI node, so it gets the tight
  // model budget rather than the write budget.
  const limit = rateLimit(
    clientKey(req.headers as Record<string, unknown>, "workflow-run"),
    AI_RUN_LIMIT.limit,
    AI_RUN_LIMIT.windowMs,
  );
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: "Too many requests — slow down a moment." });
    return;
  }

  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const triggerInput =
      typeof body.triggerInput === "string" ? body.triggerInput : "";
    if (triggerInput.length > MAX_PROMPT_CHARS) {
      res.status(413).json({ error: "Trigger input is too long" });
      return;
    }
    const result = await workflowEngine.runWorkflow(id, triggerInput);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
