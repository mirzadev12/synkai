const startMark = (fromId: string) => `<<<SRC:${fromId}>>>`;
const endMark = (fromId: string) => `<<<END:${fromId}>>>`;

/** Replace or insert one labeled source block; keep the rest of the prompt. */
export function upsertLinkedContext(
  prompt: string,
  fromId: string,
  sourceLabel: string,
  output: string,
): string {
  const start = startMark(fromId);
  const end = endMark(fromId);
  const block = `${start}\n[From ${sourceLabel}]\n${output.trim()}\n${end}`;
  const from = prompt.indexOf(start);
  const to = prompt.indexOf(end);
  if (from >= 0 && to > from) {
    return `${prompt.slice(0, from)}${block}${prompt.slice(to + end.length)}`;
  }
  const rest = prompt.trim();
  return rest ? `${block}\n\n${rest}` : block;
}

const BLOCK_RE = /<<<SRC:([^>]+)>>>\n?\[From ([^\]]*)\]\n?([\s\S]*?)<<<END:\1>>>/g;

export type LinkedSource = {
  fromId: string;
  label: string;
};

/** The user's own words, with any injected source blocks removed. */
export function userTextOf(prompt: string): string {
  return prompt.replace(/<<<SRC:[^>]+>>>[\s\S]*?<<<END:[^>]+>>>/g, "").trim();
}

/** Which upstream blocks have injected context into this prompt. */
export function linkedSources(prompt: string): LinkedSource[] {
  const found: LinkedSource[] = [];
  BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_RE.exec(prompt)) !== null) {
    found.push({ fromId: match[1], label: (match[2] || "Source").trim() });
  }
  return found;
}

/**
 * Swap the user-authored portion while preserving injected source blocks.
 * The composer edits only what the user wrote; the markers stay in storage so
 * the model still receives the upstream output.
 */
export function replaceUserText(prompt: string, text: string): string {
  const blocks: string[] = [];
  BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_RE.exec(prompt)) !== null) blocks.push(match[0]);
  const joined = blocks.join("\n\n");
  const body = text.trim();
  if (!joined) return text;
  return body ? `${joined}\n\n${text}` : joined;
}

/**
 * Detach one upstream source from this prompt.
 * Index-based rather than a built regex: block ids are uuids today, but
 * escaping them into a pattern is a needless sharp edge.
 */
export function removeLinkedContext(prompt: string, fromId: string): string {
  const start = prompt.indexOf(startMark(fromId));
  if (start < 0) return prompt;
  const endToken = endMark(fromId);
  const end = prompt.indexOf(endToken, start);
  if (end < 0) return prompt;
  return `${prompt.slice(0, start)}${prompt.slice(end + endToken.length)}`.trim();
}
