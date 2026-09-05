/**
 * Semantic memory retrieval, shared by the Vercel function (api/memory) and the
 * Vite dev middleware so the two cannot drift apart.
 *
 * ── TUNING ────────────────────────────────────────────────────────────────
 * These two constants are the whole feel of the feature. Adjust by hand.
 */

/** Never inject more than this many memories, however relevant. Token budget. */
export const MEMORY_MATCH_COUNT = 4;

/**
 * Cosine similarity floor, 0..1. Below this a memory is not injected at all.
 *
 * 0.65 is measured, not guessed. gemini-embedding-001 compresses cosine scores
 * into a narrow band — unrelated text still scores ~0.50-0.55, so a "sounds
 * reasonable" floor like 0.55 injects pure noise. Against six sample memories:
 *
 *   query                                 top hit   0.55 keeps   0.65 keeps
 *   "why are people dropping off…"        0.725     4 of 6       2 (both right)
 *   "which AI model … for speed?"         0.716     3 of 6       1 (right)
 *   "what did we decide about redesign?"  0.724     6 of 6 (!)   1 (right)
 *   "what is our refund policy?"          0.558     2 (noise)    0 (correct)
 *
 * Ranking was correct in every case — the top hit was always the right memory.
 * The floor is what stops the tail of near-noise coming along with it.
 *
 * Re-tune on real data after backfilling: if relevant memories get dropped,
 * lower toward 0.62; if noise creeps in, raise toward 0.70.
 */
export const MEMORY_MIN_SIMILARITY = 0.65;
/** ─────────────────────────────────────────────────────────────────────── */

import {
  EMBED_MODEL,
  EmbeddingError,
  embedText,
} from "./embed.js";
import {
  formatMatchesAsContext,
  searchMemoryEvents,
  storeEmbedding,
  type ScoredMemoryEvent,
} from "../backend/src/lib/memoryService.js";

export type RetrievalResult = {
  events: ScoredMemoryEvent[];
  formatted: string;
  count: number;
};

const EMPTY: RetrievalResult = { events: [], formatted: "", count: 0 };

/**
 * Embed one memory event and store the vector.
 *
 * Best-effort by contract: the caller has ALREADY persisted the event, so a
 * failure here loses a vector, never a memory. Unembedded rows are picked up
 * later by the backfill script. Returns whether it succeeded.
 */
export async function embedAndStoreEvent(args: {
  eventId: string;
  workspaceId: string;
  content: string;
  apiKey: string;
}): Promise<boolean> {
  try {
    const embedding = await embedText(
      args.content,
      "RETRIEVAL_DOCUMENT",
      args.apiKey,
    );
    await storeEmbedding(
      args.eventId,
      args.workspaceId,
      embedding,
      EMBED_MODEL,
    );
    return true;
  } catch {
    // Rate limit, transient upstream error, or a database that has not had
    // migration 006 applied yet. The memory event itself is already saved.
    return false;
  }
}

/**
 * Find memories relevant to `query` within one workspace.
 *
 * Returns an empty result rather than throwing when embedding or search fails —
 * a Run should still work (with spatial context only) if retrieval is down.
 */
export async function retrieveRelevantMemory(args: {
  workspaceId: string;
  query: string;
  apiKey: string;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<RetrievalResult> {
  const query = args.query.trim();
  if (!query) return EMPTY;

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(query, "RETRIEVAL_QUERY", args.apiKey);
  } catch (error) {
    if (error instanceof EmbeddingError && !error.retryable) {
      // Misconfiguration (missing key, bad request) — worth surfacing in logs.
      console.warn(`[memory] query embedding failed: ${error.message}`);
    }
    return EMPTY;
  }

  try {
    const events = await searchMemoryEvents(
      args.workspaceId,
      queryEmbedding,
      args.matchCount ?? MEMORY_MATCH_COUNT,
      args.minSimilarity ?? MEMORY_MIN_SIMILARITY,
    );
    return {
      events,
      formatted: formatMatchesAsContext(events),
      count: events.length,
    };
  } catch (error) {
    console.warn(
      `[memory] similarity search failed: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return EMPTY;
  }
}
