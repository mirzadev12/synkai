import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Thin Gemini wrapper — orchestrator stays model-agnostic.
 * Uses gemini-2.0-flash-compatible free-tier Flash model.
 * (If your key rejects this id, set GEMINI_MODEL in env.)
 */
export async function callGemini(
  systemAndUserPrompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const modelName =
    process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(systemAndUserPrompt);
  const text = result.response.text()?.trim();
  if (!text) {
    throw new Error("Gemini returned empty text");
  }
  return text;
}
