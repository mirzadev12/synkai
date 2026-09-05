export type AiModel = "gemini" | "groq" | "claude";

export type RunAiResult = {
  text: string;
  answeredBy: "Gemini" | "Groq" | "Claude";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractGeminiText(payload: unknown): string {
  const root = asRecord(payload);
  const candidates = root?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Gemini returned no candidates");
  }
  const content = asRecord(candidates[0])?.content;
  const parts = asRecord(content)?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("Gemini returned no text");
  }
  const text = parts
    .map((part) => {
      const record = asRecord(part);
      return typeof record?.text === "string" ? record.text : "";
    })
    .join("")
    .trim();
  if (!text) {
    throw new Error("Gemini returned empty text");
  }
  return text;
}

/** Shared by Groq and OpenRouter — both speak the OpenAI chat-completions shape. */
function extractChatCompletionText(payload: unknown, providerName: string): string {
  const root = asRecord(payload);
  const choices = root?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`${providerName} returned no choices`);
  }
  const message = asRecord(choices[0])?.message;
  const text = asRecord(message)?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`${providerName} returned empty text`);
  }
  return text.trim();
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = asRecord(asRecord(payload)?.error)?.message;
    throw new Error(
      typeof error === "string" ? error : `Gemini request failed (${response.status})`,
    );
  }
  return extractGeminiText(payload);
}

async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = asRecord(asRecord(payload)?.error)?.message;
    throw new Error(
      typeof error === "string" ? error : `Groq request failed (${response.status})`,
    );
  }
  return extractChatCompletionText(payload, "Groq");
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-3.5-sonnet",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = asRecord(asRecord(payload)?.error)?.message;
    throw new Error(
      typeof error === "string" ? error : `Claude request failed (${response.status})`,
    );
  }
  return extractChatCompletionText(payload, "Claude");
}

export async function runAi(
  prompt: string,
  model: AiModel,
  env: {
    GEMINI_API_KEY?: string;
    GROQ_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
  },
): Promise<RunAiResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Prompt is empty");
  }

  if (model === "gemini") {
    const apiKey = env.GEMINI_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    return { text: await callGemini(trimmed, apiKey), answeredBy: "Gemini" };
  }

  if (model === "groq") {
    const apiKey = env.GROQ_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing");
    }
    return { text: await callGroq(trimmed, apiKey), answeredBy: "Groq" };
  }

  if (model === "claude") {
    const apiKey = env.OPENROUTER_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is missing");
    }
    return { text: await callClaude(trimmed, apiKey), answeredBy: "Claude" };
  }

  throw new Error("Unknown model");
}
