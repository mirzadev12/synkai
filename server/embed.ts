/**
 * Gemini embeddings for semantic memory retrieval.
 *
 * Free of charge on the Gemini API free tier, and reuses the GEMINI_API_KEY
 * that already powers AI Block runs — no new environment variable.
 *
 * Shared by api/memory (Vercel), vite.config.ts (local dev middleware) and the
 * backfill script, the same way server/runAi.ts is shared.
 */

export const EMBED_MODEL = "gemini-embedding-001";

/**
 * gemini-embedding-001 emits 3072 dims by default and supports Matryoshka
 * truncation. 768 keeps retrieval quality essentially intact at a quarter of
 * the storage — ~3KB/row, so ~100k rows inside Supabase's 500MB free tier.
 * Must match the vector(768) column in 006_memory_embeddings.sql.
 */
export const EMBED_DIMS = 768;

/**
 * RETRIEVAL_DOCUMENT for stored memories, RETRIEVAL_QUERY for the search text.
 * Using the matching pair measurably improves retrieval over embedding both
 * sides identically.
 */
export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Gemini rejects very long inputs; memory content is trimmed to stay well clear. */
const MAX_CHARS = 8000;

export class EmbeddingError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmbeddingError";
    this.status = status;
    // 429 = rate limited, 5xx = transient upstream. Both are worth retrying.
    this.retryable = status === 429 || status >= 500;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Cosine ranking is scale-invariant, but normalising keeps stored vectors uniform. */
function normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v * v;
  const magnitude = Math.sqrt(sum);
  if (!magnitude || !Number.isFinite(magnitude)) return values;
  return values.map((v) => v / magnitude);
}

export async function embedText(
  text: string,
  taskType: EmbedTaskType,
  apiKey: string,
): Promise<number[]> {
  const trimmed = text.trim().slice(0, MAX_CHARS);
  if (!trimmed) {
    throw new EmbeddingError("Cannot embed empty text", 400);
  }
  if (!apiKey) {
    throw new EmbeddingError("GEMINI_API_KEY is missing", 401);
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}` +
    `:embedContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: trimmed }] },
      taskType,
      outputDimensionality: EMBED_DIMS,
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = asRecord(asRecord(payload)?.error)?.message;
    throw new EmbeddingError(
      typeof message === "string"
        ? message
        : `Embedding request failed (${response.status})`,
      response.status,
    );
  }

  const values = asRecord(asRecord(payload)?.embedding)?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new EmbeddingError("Embedding response had no values", 502);
  }
  if (values.length !== EMBED_DIMS) {
    throw new EmbeddingError(
      `Expected ${EMBED_DIMS} dimensions, got ${values.length}`,
      502,
    );
  }

  return normalize(values as number[]);
}
