/**
 * A small fixed-window rate limiter for the API routes.
 *
 * HONEST LIMITATION: this is per-instance and in-memory. Vercel runs several
 * function instances and recycles them, so a determined attacker spreading
 * requests across instances gets more than the nominal limit, and a cold start
 * resets the window. It is not a security boundary — it is a cost guard that
 * stops one client hammering the model endpoints, which is the realistic abuse
 * here (whoever holds a join code can spend the workspace's Gemini/Groq quota).
 *
 * A durable version would keep counters in Postgres; that costs a round trip
 * per request and a seventh migration, which is not worth it at this scale.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stop the map growing without bound on a long-lived warm instance. */
function sweep(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client identity. `x-forwarded-for` is spoofable, which is another
 * reason this is a cost guard rather than a security control.
 */
export function clientKey(headers: Record<string, unknown>, scope: string): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip =
    typeof raw === "string" && raw.trim()
      ? raw.split(",")[0].trim()
      : "unknown";
  return `${scope}:${ip}`;
}

/** Model calls cost money and quota, so they get the tightest budget. */
export const AI_RUN_LIMIT = { limit: 20, windowMs: 60_000 };
/** Each write also triggers an embedding call. */
export const MEMORY_WRITE_LIMIT = { limit: 40, windowMs: 60_000 };
/** Upload tickets are cheap, but they mint storage writes. */
export const UPLOAD_LIMIT = { limit: 30, windowMs: 60_000 };

/**
 * A single prompt this long is either a mistake or an attempt to run up a bill.
 * Gemini and Groq both accept far more than anyone types by hand.
 */
export const MAX_PROMPT_CHARS = 24_000;

/**
 * A memory event is one model answer. Anything past this is either a runaway
 * response or someone using team memory as free storage — and every stored
 * event also costs an embedding call and a row in a 500MB free-tier database.
 */
export const MAX_MEMORY_CHARS = 40_000;

/** Room create/join hits Supabase and the schema probe on every call. */
export const ROOM_LIMIT = { limit: 30, windowMs: 60_000 };
