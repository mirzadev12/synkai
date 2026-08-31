export type ServerSession = {
  code: string;
  workspaceId: string;
  roomId: string;
};

const STORAGE_KEY = "synkai-server-session";

export function loadServerSession(): ServerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerSession>;
    if (
      typeof parsed.code === "string" &&
      /^\d{6}$/.test(parsed.code) &&
      typeof parsed.workspaceId === "string" &&
      parsed.workspaceId.length > 10 &&
      typeof parsed.roomId === "string" &&
      parsed.roomId.startsWith("synkai-room-")
    ) {
      return {
        code: parsed.code,
        workspaceId: parsed.workspaceId,
        roomId: parsed.roomId,
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
  const session: ServerSession = {
    code: String(record.code ?? ""),
    workspaceId: String(record.workspaceId ?? ""),
    roomId: String(record.roomId ?? ""),
  };
  if (!/^\d{6}$/.test(session.code) || !session.workspaceId || !session.roomId) {
    throw new Error("Invalid server response");
  }
  saveServerSession(session);
  return session;
}
