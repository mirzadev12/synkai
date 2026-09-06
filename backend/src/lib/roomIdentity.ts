import { createHash, randomInt } from "node:crypto";

const NS = Buffer.from("synkai-v1-room-namespace");

/**
 * Crockford-style base32: no I, L, O or U, so codes cannot be misread aloud
 * and cannot accidentally spell words.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 10;

/**
 * Accepts both formats.
 *
 * Legacy 6-digit codes stay valid forever: workspaceIdFromCode hashes the code
 * string, so changing the format for NEW codes would otherwise have stranded
 * every canvas created before this change along with its team memory.
 */
export function normalizeJoinCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase().replace(/[\s-]/g, "");

  // New format: 10 chars of the alphabet above.
  if (trimmed.length === CODE_LENGTH) {
    for (const ch of trimmed) {
      if (!ALPHABET.includes(ch)) return null;
    }
    return trimmed;
  }

  // Legacy format: exactly 6 digits.
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 6) return digits;

  return null;
}

/**
 * ~1.1e15 possibilities (32^10) versus 1e6 for the old 6-digit codes.
 *
 * The join code IS the access control for a room — anyone holding it can read
 * and write the canvas and spend the workspace's model quota — so six digits
 * was brute-forceable in minutes.
 */
export function randomJoinCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/** Deterministic UUID v5 so a join code maps to one workspace without a new table. */
export function workspaceIdFromCode(code: string): string {
  const hash = createHash("sha1").update(NS).update(code).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Every workspace id this app mints is a UUID v5 from `workspaceIdFromCode`.
 * Endpoints that take a workspace id from the browser check the shape first, so
 * a malformed or injected id is rejected before it reaches Postgres or storage
 * rather than creating junk rows keyed on arbitrary text.
 */
export function isWorkspaceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function liveblocksRoomId(code: string): string {
  return `synkai-room-${code}`;
}
