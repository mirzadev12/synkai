import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "./WorkspaceContext";

export type TeamMemoryEvent = {
  id: string;
  event_type: string;
  model_provider: string | null;
  content: string;
  created_at: string;
};

type TeamMemoryPanelProps = {
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
};

function relativeTime(iso: string): string {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function preview(text: string, max = 120): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function TeamMemoryPanel({
  open,
  onClose,
  refreshKey = 0,
}: TeamMemoryPanelProps) {
  const { workspaceId } = useWorkspace();
  const [events, setEvents] = useState<TeamMemoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/memory/${encodeURIComponent(workspaceId)}?limit=30`,
      );
      const payload: unknown = await response.json();
      const record =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      if (!response.ok) {
        throw new Error(
          typeof record.error === "string" ? record.error : "Failed to load",
        );
      }
      const list = Array.isArray(record.events) ? record.events : [];
      setEvents(
        list.map((row) => {
          const r =
            row && typeof row === "object" && !Array.isArray(row)
              ? (row as Record<string, unknown>)
              : {};
          return {
            id: String(r.id ?? ""),
            event_type: String(r.event_type ?? "event"),
            model_provider:
              typeof r.model_provider === "string" ? r.model_provider : null,
            content: String(r.content ?? ""),
            created_at: String(r.created_at ?? ""),
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, refreshKey, load]);

  if (!open) return null;

  return (
    <aside className="team-memory-panel" aria-label="Team Memory">
      <div className="team-memory-header">
        <strong>Team Memory</strong>
        <button type="button" className="team-memory-close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="team-memory-sub">
        Collaborative history — newest first, shared by every AI Block.
      </p>
      {loading ? <p className="team-memory-status">Loading…</p> : null}
      {error ? <p className="team-memory-error">{error}</p> : null}
      {!loading && !error && events.length === 0 ? (
        <p className="team-memory-status">No events yet. Run an AI Block.</p>
      ) : null}
      <ul className="team-memory-list">
        {events.map((event) => (
          <li key={event.id} className="team-memory-item">
            <div className="team-memory-meta">
              <span className="team-memory-type">{event.event_type}</span>
              {event.model_provider ? (
                <span className="team-memory-model">
                  {event.model_provider}
                </span>
              ) : null}
              <span className="team-memory-time">
                {relativeTime(event.created_at)}
              </span>
            </div>
            <p className="team-memory-preview">{preview(event.content)}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
