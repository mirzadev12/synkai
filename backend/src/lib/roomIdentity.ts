import { createHash, randomInt } from "node:crypto";

const NS = Buffer.from("synkai-v1-room-namespace");

export function normalizeJoinCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 6) return null;
  return digits;
}

export function randomJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Deterministic UUID v5 so a join code maps to one workspace without a new table. */
export function workspaceIdFromCode(code: string): string {
  const hash = createHash("sha1").update(NS).update(code).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function liveblocksRoomId(code: string): string {
  return `synkai-room-${code}`;
}
