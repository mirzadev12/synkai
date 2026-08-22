import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin Anthropic wrapper — orchestrator stays model-agnostic.
 */
export async function callAnthropic(
  systemAndUserPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: systemAndUserPrompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }
  return block.text;
}
