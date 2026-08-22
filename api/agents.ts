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
    const {
      workspaceId,
      name,
      role,
      systemPrompt,
      inputContextTypes,
      outputEventType,
      modelProvider,
    } = body;

    if (
      typeof workspaceId !== "string" ||
      typeof name !== "string" ||
      typeof role !== "string" ||
      typeof systemPrompt !== "string" ||
      !Array.isArray(inputContextTypes) ||
      typeof outputEventType !== "string"
    ) {
      res.status(400).json({
        error:
          "workspaceId, name, role, systemPrompt, inputContextTypes[], outputEventType required",
      });
      return;
    }

    const provider =
      modelProvider === "gemini" || modelProvider === "anthropic"
        ? modelProvider
        : "anthropic";

    const id = await orchestrator.registerAgent(workspaceId, {
      name,
      role,
      systemPrompt,
      inputContextTypes: inputContextTypes.map(String),
      outputEventType,
      modelProvider: provider,
    });

    res.status(201).json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
}
