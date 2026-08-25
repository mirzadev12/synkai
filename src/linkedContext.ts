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
