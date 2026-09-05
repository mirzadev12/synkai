import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "./WorkspaceContext";

export type TeamMemoryEvent = {
  id: string;
  event_type: string;
  model_provider: string | null;
  content: string;
  created_at: string;
  /** Present only for search results — cosine similarity, 0..1. */
  similarity?: number;
};

type TeamMemoryPanelProps = {
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
};

/** Debounce so typing doesn't fire an embedding request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

function relativeTime(iso: string): string {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function preview(text: string, max = 150): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
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
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (search: string) => {
      setLoading(true);
      setError(null);
      try {
        const trimmed = search.trim();
        const url = trimmed
          ? `/api/memory/${encodeURIComponent(workspaceId)}?q=${encodeURIComponent(trimmed)}`
          : `/api/memory/${encodeURIComponent(workspaceId)}?limit=30`;
        const response = await fetch(url);
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
              similarity:
                typeof r.similarity === "number" ? r.similarity : undefined,
            };
          }),
        );
        setActiveQuery(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  // Debounced search. Also covers the initial load (empty query → recent).
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => void load(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [open, query, refreshKey, load]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const searching = activeQuery.length > 0;

  return (
    <aside className="team-memory-panel" aria-label="Team Memory">
      <header className="team-memory-header">
        <div className="team-memory-title">
          <span className="team-memory-title-text">Team Memory</span>
          <span className="team-memory-count">{events.length}</span>
        </div>
        <button
          type="button"
          className="team-memory-close"
          aria-label="Close Team Memory"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="team-memory-search">
        <svg className="team-memory-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="team-memory-search-input"
          placeholder="Search by meaning…"
          value={query}
          aria-label="Search memories by meaning"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="team-memory-search-clear"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            ×
          </button>
        ) : null}
      </div>

      <p className="team-memory-mode">
        {searching ? (
          <>
            <span className="team-memory-mode-dot" aria-hidden />
            ranked by relevance
          </>
        ) : (
          "newest first · shared by every AI Block"
        )}
      </p>

      {error ? <p className="team-memory-error">{error}</p> : null}

      {loading && events.length === 0 ? (
        <p className="team-memory-status">
          {searching ? "Searching memories…" : "Reading the workspace…"}
        </p>
      ) : null}

      {!loading && !error && events.length === 0 ? (
        <div className="team-memory-empty">
          <p className="team-memory-empty-title">
            {searching ? "Nothing close enough" : "No memories yet"}
          </p>
          <p className="team-memory-empty-copy">
            {searching
              ? "No memory was similar enough to that. Try describing it differently."
              : "Run an AI Block and its answer will be remembered here."}
          </p>
        </div>
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
              {typeof event.similarity === "number" ? (
                <span
                  className="team-memory-score"
                  title="Cosine similarity to your search"
                >
                  {event.similarity.toFixed(2)}
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
