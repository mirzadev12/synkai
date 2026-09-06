/**
 * Both code formats are valid: 10-char alphanumeric for new rooms, and 6-digit
 * for every room created before codes were lengthened. Rejecting the legacy
 * form here would lock people out of their existing canvases.
 */
export function isJoinCode(code: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(code) || /^\d{6}$/.test(code);
}

export type MissingMigration = {
  migration: string;
  feature: string;
};

export type ServerSession = {
  code: string;
  workspaceId: string;
  roomId: string;
  /** Migrations the database is missing — surfaced as a banner, not silently. */
  missingMigrations?: MissingMigration[];
};

const STORAGE_KEY = "synkai-server-session";

export function loadServerSession(): ServerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerSession>;
    if (
      typeof parsed.code === "string" &&
      isJoinCode(parsed.code) &&
      typeof parsed.workspaceId === "string" &&
      parsed.workspaceId.length > 10 &&
      typeof parsed.roomId === "string" &&
      parsed.roomId.startsWith("synkai-room-")
    ) {
      return {
        code: parsed.code,
        workspaceId: parsed.workspaceId,
        roomId: parsed.roomId,
        // Carried across reloads, otherwise the warning would appear once on
        // join and never again — which is exactly when it would be missed.
        // Re-checked against the server on the next join.
        missingMigrations: Array.isArray(parsed.missingMigrations)
          ? parsed.missingMigrations
          : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveServerSession(session: ServerSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

export function clearServerSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function requestServerSession(
  action: "create" | "join",
  code?: string,
): Promise<ServerSession> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      action === "join" ? { action: "join", code } : { action: "create" },
    ),
  });
  const payload: unknown = await response.json();
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  if (!response.ok) {
    throw new Error(
      typeof record.error === "string" ? record.error : "Could not open server",
    );
  }
  const missing = Array.isArray(record.missingMigrations)
    ? record.missingMigrations.flatMap((row) => {
        const r =
          row && typeof row === "object" && !Array.isArray(row)
            ? (row as Record<string, unknown>)
            : {};
        return typeof r.migration === "string"
          ? [{ migration: r.migration, feature: String(r.feature ?? "") }]
          : [];
      })
    : [];

  const session: ServerSession = {
    code: String(record.code ?? ""),
    workspaceId: String(record.workspaceId ?? ""),
    roomId: String(record.roomId ?? ""),
    missingMigrations: missing,
  };
  if (!isJoinCode(session.code) || !session.workspaceId || !session.roomId) {
    throw new Error("Invalid server response");
  }
  saveServerSession(session);
  return session;
}
