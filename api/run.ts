import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAi, type AiModel } from "../server/runAi.js";

function isAiModel(value: unknown): value is AiModel {
  return value === "gemini" || value === "groq" || value === "claude";
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const model = body.model;
    if (!isAiModel(model)) {
      res.status(400).json({ error: "model must be gemini, groq, or claude" });
      return;
    }

    const result = await runAi(prompt, model, {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    });
    res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI request failed";
    res.status(500).json({ error: message });
  }
}
