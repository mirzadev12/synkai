/**
 * Splitting AI output into prose and fenced code.
 *
 * Used to decide whether a "Review" action is worth offering, and to render
 * code with syntax highlighting instead of as an undifferentiated blob of text.
 */

export type OutputSegment =
  | { type: "prose"; text: string }
  | { type: "code"; lang: string; code: string };

/** ```lang\n…\n``` — lang optional. */
const FENCE = /```([\w+#-]*)\n?([\s\S]*?)```/g;

export function splitOutput(text: string): OutputSegment[] {
  if (!text) return [];
  const segments: OutputSegment[] = [];
  let lastIndex = 0;

  FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const prose = text.slice(lastIndex, match.index);
      if (prose.trim()) segments.push({ type: "prose", text: prose.trim() });
    }
    const code = (match[2] ?? "").replace(/\n+$/, "");
    if (code.trim()) {
      segments.push({
        type: "code",
        lang: (match[1] || "text").toLowerCase(),
        code,
      });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex);
    if (rest.trim()) segments.push({ type: "prose", text: rest.trim() });
  }

  return segments.length > 0 ? segments : [{ type: "prose", text }];
}

/** Whether output contains fenced code worth reviewing. */
export function hasCode(text: string | undefined): boolean {
  if (!text) return false;
  return splitOutput(text).some((segment) => segment.type === "code");
}

/** Just the code, fences stripped — what actually gets sent for review. */
export function extractCode(text: string): string {
  return splitOutput(text)
    .filter((segment): segment is Extract<OutputSegment, { type: "code" }> =>
      segment.type === "code",
    )
    .map((segment) =>
      segment.lang && segment.lang !== "text"
        ? `// ${segment.lang}\n${segment.code}`
        : segment.code,
    )
    .join("\n\n");
}

/**
 * The review instruction. Analysis only — this prompt deliberately never asks
 * the model to run anything, and nothing in this app executes AI-produced code.
 */
export function buildReviewPrompt(code: string): string {
  return [
    "You are reviewing code written by another AI model. Do not rewrite it in full.",
    "Give a focused review covering, in this order:",
    "1. Bugs — anything that is outright wrong or will throw.",
    "2. Edge cases — inputs or states that are unhandled.",
    "3. Security — injection, unsafe input handling, secret exposure.",
    "4. Readability — naming, structure, anything that will confuse the next reader.",
    "",
    "Be specific and cite the relevant line or expression. If a section is fine, say so briefly rather than inventing problems.",
    "",
    "Code under review:",
    "```",
    code,
    "```",
  ].join("\n");
}
