export type ModelOutput = {
  model: string;
  text: string;
};

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

export function summarizeDisagreement(
  left: ModelOutput,
  right: ModelOutput,
): {
  shared: string[];
  onlyLeft: string[];
  onlyRight: string[];
  alike: boolean;
} {
  const a = sentences(left.text);
  const b = sentences(right.text);
  const bNorm = new Set(b.map(normalize));
  const aNorm = new Set(a.map(normalize));
  const shared = a.filter((s) => bNorm.has(normalize(s))).slice(0, 4);
  const onlyLeft = a.filter((s) => !bNorm.has(normalize(s))).slice(0, 5);
  const onlyRight = b.filter((s) => !aNorm.has(normalize(s))).slice(0, 5);
  const alike =
    onlyLeft.length === 0 &&
    onlyRight.length === 0 &&
    left.text.trim().length > 0;
  return { shared, onlyLeft, onlyRight, alike };
}
