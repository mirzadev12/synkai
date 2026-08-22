import { getSupabase } from "./supabase.js";

export type MemorySummary = {
  eventCount: number;
  lastActivity: string;
  topics: string[];
};

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
  const { data, error } = await getSupabase()
    .from("memory_events")
    .insert({
      workspace_id: workspaceId,
      event_type: eventType,
      content,
      source_agent_id: sourceAgentId ?? null,
      metadata: metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`logEvent failed: ${error?.message ?? "no row returned"}`);
  }

  return data.id as string;
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
