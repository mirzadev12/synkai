/**
 * Backfill embeddings for memory events created before semantic retrieval.
 *
 *   cd backend && npm run backfill:embeddings
 *   cd backend && npm run backfill:embeddings -- --delay 1500 --limit 200
 *
 * Safe to re-run: it only ever selects rows with no embedding (via the
 * memory_events_missing_embeddings view), so an interrupted run resumes where
 * it stopped and a completed run is a no-op.
 *
 * Rate limits: Gemini embeddings are free but throttled. This paces requests
 * with a delay and backs off on 429 rather than hammering through the limit.
 * Raise --delay if you see repeated backoffs.
 */

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { EMBED_MODEL, EmbeddingError, embedText } from "../../../server/embed.js";
import {
  listEventsMissingEmbeddings,
  storeEmbedding,
} from "../lib/memoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/** Gentle by default — raise it if you hit repeated rate limits. */
const DEFAULT_DELAY_MS = 1200;
/** Rows fetched per page. Not a request batch; each row is its own API call. */
const PAGE_SIZE = 100;
const MAX_BACKOFF_MS = 60_000;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const delayMs = Number.parseInt(arg("delay") ?? "", 10) || DEFAULT_DELAY_MS;
  const maxRows = Number.parseInt(arg("limit") ?? "", 10) || Infinity;
  const apiKey = process.env.GEMINI_API_KEY ?? "";

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing — set it in .env.local or backend/.env");
    process.exit(1);
  }

  console.log(
    `Backfilling embeddings with ${EMBED_MODEL} · ${delayMs}ms between calls` +
      (maxRows === Infinity ? "" : ` · max ${maxRows} rows`),
  );

  let processed = 0;
  let embedded = 0;
  let failed = 0;
  let backoffMs = 2000;

  for (;;) {
    if (processed >= maxRows) break;

    const pageSize = Math.min(PAGE_SIZE, maxRows - processed);
    const rows = await listEventsMissingEmbeddings(pageSize);

    if (rows.length === 0) {
      console.log(
        embedded === 0 && processed === 0
          ? "Nothing to do — every memory event already has an embedding."
          : "No rows left to embed.",
      );
      break;
    }

    for (const row of rows) {
      if (processed >= maxRows) break;
      processed += 1;

      try {
        const vector = await embedText(row.content, "RETRIEVAL_DOCUMENT", apiKey);
        await storeEmbedding(row.id, row.workspace_id, vector, EMBED_MODEL);
        embedded += 1;
        backoffMs = 2000; // reset after a success
        console.log(
          `  [${embedded}] ${row.id.slice(0, 8)} ✓  ${row.content.replace(/\s+/g, " ").slice(0, 60)}`,
        );
      } catch (error) {
        if (error instanceof EmbeddingError && error.retryable) {
          console.warn(
            `  rate limited / transient (${error.status}) — backing off ${Math.round(backoffMs / 1000)}s`,
          );
          await sleep(backoffMs);
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
          processed -= 1; // not consumed; the view will return it again
          continue;
        }
        failed += 1;
        console.error(
          `  ${row.id.slice(0, 8)} ✗  ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }

      await sleep(delayMs);
    }
  }

  console.log(
    `\nDone. embedded=${embedded} failed=${failed}` +
      (failed > 0 ? " — re-run to retry the failures." : ""),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
