import type { AiModel } from "./liveblocks.config";

export async function requestAi(
  prompt: string,
  model: AiModel,
): Promise<{ text: string; answeredBy: "Gemini" | "Groq" | "Claude" }> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model }),
  });
  const payload: unknown = await response.json();
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  if (!response.ok) {
    const message =
      typeof record.error === "string" ? record.error : "Request failed";
    throw new Error(message);
  }
  const text = typeof record.text === "string" ? record.text : "";
  const by =
    record.answeredBy === "Groq" ||
    record.answeredBy === "Gemini" ||
    record.answeredBy === "Claude"
      ? record.answeredBy
      : model === "groq"
        ? "Groq"
        : model === "claude"
          ? "Claude"
          : "Gemini";
  return { text, answeredBy: by };
}
