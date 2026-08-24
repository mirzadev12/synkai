import { getSupabase } from "./supabase.js";

export type MemorySummary = {
  eventCount: number;
  lastActivity: string;
  topics: string[];
};

export type MemoryEvent = {
  id: string;
  workspace_id: string;
  block_id: string | null;
  event_type: string;
  model_provider: string | null;
  prompt: string | null;
  content: string;
  created_at: string;
};

type MemoryMeta = {
  block_id?: string | null;
  model_provider?: string | null;
  prompt?: string | null;
};

function parseCreatedByMeta(raw: unknown): MemoryMeta {
  if (typeof raw !== "string" || !raw.startsWith("{")) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      block_id:
        typeof parsed.block_id === "string" ? parsed.block_id : null,
      model_provider:
        typeof parsed.model_provider === "string"
          ? parsed.model_provider
          : null,
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : null,
    };
  } catch {
    return {};
  }
}

function relativeTime(iso: string, now = Date.now()): string {
  // Supabase timestamps are UTC; treat missing offset as UTC.
  const normalized =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function rowToMemoryEvent(row: Record<string, unknown>): MemoryEvent {
  const meta = parseCreatedByMeta(row.created_by);
  return {
    id: String(row.id ?? ""),
    workspace_id: String(row.workspace_id ?? ""),
    block_id:
      (typeof row.block_id === "string" ? row.block_id : null) ??
      meta.block_id ??
      null,
    event_type: String(row.event_type ?? ""),
    model_provider:
      (typeof row.model_provider === "string" ? row.model_provider : null) ??
      meta.model_provider ??
      null,
    prompt:
      (typeof row.prompt === "string" ? row.prompt : null) ??
      meta.prompt ??
      null,
    content: String(row.content ?? ""),
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * Fetch recent memory events for a workspace filtered by event type.
 * Returns chronological text (oldest → newest) for agent prompts.
 */
export async function getRecentContext(
  workspaceId: string,
  eventTypes: string[],
  limit = 10,
): Promise<string> {
  if (eventTypes.length === 0) return "";

  const { data, error } = await getSupabase()
    .from("memory_events")
    .select("event_type, content, created_at")
    .eq("workspace_id", workspaceId)
    .in("event_type", eventTypes)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentContext failed: ${error.message}`);
  }

  const rows = [...(data ?? [])].reverse();
  return rows
    .map(
      (row) =>
        `[${row.event_type} at ${row.created_at}]: ${row.content}`,
    )
    .join("\n");
}

/**
 * Insert a memory event. Returns the new event id.
 */
export async function logEvent(
  workspaceId: string,
  eventType: string,
  content: string,
  sourceAgentId?: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const base = {
    workspace_id: workspaceId,
    event_type: eventType,
    content,
  };

  const rich = {
    ...base,
    source_agent_id: sourceAgentId ?? null,
    metadata: metadata ?? {},
  };

  let result = await getSupabase()
    .from("memory_events")
    .insert(rich)
    .select("id")
    .single();

  if (result.error) {
    result = await getSupabase()
      .from("memory_events")
      .insert(base)
      .select("id")
      .single();
  }

  if (result.error || !result.data) {
    throw new Error(
      `logEvent failed: ${result.error?.message ?? "no row returned"}`,
    );
  }

  return result.data.id as string;
}

/**
 * Log an AI Block / canvas memory event (prompt schema).
 */
export async function logMemoryEvent(
  workspaceId: string,
  blockId: string | null,
  eventType: string,
  modelProvider: string | null,
  prompt: string | null,
  content: string,
  options?: { skipWorkflowTrigger?: boolean },
): Promise<string> {
  const metaPayload = JSON.stringify({
    block_id: blockId,
    model_provider: modelProvider,
    prompt,
  });

  const fullRow = {
    workspace_id: workspaceId,
    block_id: blockId,
    event_type: eventType,
    model_provider: modelProvider,
    prompt,
    content,
    created_by: metaPayload,
  };

  let result = await getSupabase()
    .from("memory_events")
    .insert(fullRow)
    .select("id")
    .single();

  if (result.error) {
    result = await getSupabase()
      .from("memory_events")
      .insert({
        workspace_id: workspaceId,
        event_type: eventType,
        content,
        created_by: metaPayload,
      })
      .select("id")
      .single();
  }

  if (result.error || !result.data) {
    throw new Error(
      `logMemoryEvent failed: ${result.error?.message ?? "no row returned"}`,
    );
  }

  const eventId = result.data.id as string;
  if (!options?.skipWorkflowTrigger) {
    void import("./workflowEngine.js")
      .then((engine) =>
        engine.triggerWorkflowsForMemoryEvent(
          workspaceId,
          eventType,
          content,
        ),
      )
      .catch(() => {
        // Auto-run is best-effort.
      });
  }
  return eventId;
}

/**
 * Most recent events for a workspace (newest first).
 */
export async function getWorkspaceMemory(
  workspaceId: string,
  limit = 15,
): Promise<MemoryEvent[]> {
  const { data, error } = await getSupabase()
    .from("memory_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getWorkspaceMemory failed: ${error.message}`);
  }

  return (data ?? []).map((row) =>
    rowToMemoryEvent(row as Record<string, unknown>),
  );
}

/**
 * Readable string for prompt injection, e.g. "[decision, 2h ago]: ...".
 */
export function formatMemoryAsContext(events: MemoryEvent[]): string {
  if (events.length === 0) return "";
  const now = Date.now();
  // Inject oldest → newest so the model sees recent last
  const chronological = [...events].reverse();
  return chronological
    .map(
      (event) =>
        `[${event.event_type}, ${relativeTime(event.created_at, now)}]: ${event.content}`,
    )
    .join("\n");
}

/**
 * Lightweight summary for a "team memory" UI indicator.
 */
export async function getWorkspaceMemorySummary(
  workspaceId: string,
): Promise<MemorySummary> {
  const { data, error } = await getSupabase()
    .from("memory_events")
    .select("event_type, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getWorkspaceMemorySummary failed: ${error.message}`);
  }

  const rows = data ?? [];
  const topics = [...new Set(rows.map((row) => row.event_type as string))];

  return {
    eventCount: rows.length,
    lastActivity: rows[0]?.created_at
      ? String(rows[0].created_at)
      : "never",
    topics,
  };
}
