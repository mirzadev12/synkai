import { useState } from "react";
import {
  requestServerSession,
  type ServerSession,
} from "./serverSession";

type ServerGateProps = {
  onReady: (session: ServerSession) => void;
};

export function ServerGate({ onReady }: ServerGateProps) {
  const [mode, setMode] = useState<"pick" | "join">("pick");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createServer() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await requestServerSession("create");
      onReady(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create server");
    } finally {
      setBusy(false);
    }
  }

  async function joinServer() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await requestServerSession("join", code);
      onReady(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="name-gate" role="dialog" aria-modal="true" aria-label="Join a server">
      <div className="name-gate-card">
        <p className="brand-wordmark setup-brand">Synk AI</p>
        <h2 className="name-gate-title">Servers</h2>
        <p className="name-gate-copy">
          Each 6-digit code is its own canvas and team memory. Create one, or
          join a friend’s.
        </p>
        {error ? <p className="team-memory-error">{error}</p> : null}
        {mode === "pick" ? (
          <>
            <button
              type="button"
              className="nav-run"
              disabled={busy}
              onClick={() => void createServer()}
            >
              {busy ? "Creating…" : "Create a new server"}
            </button>
            <button
              type="button"
              className="nav-ghost"
              disabled={busy}
              onClick={() => setMode("join")}
            >
              Join with a code
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void joinServer();
            }}
          >
            <input
              className="name-input name-gate-input"
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <div className="server-gate-actions">
              <button
                type="button"
                className="nav-ghost"
                disabled={busy}
                onClick={() => {
                  setMode("pick");
                  setError(null);
                }}
              >
                Back
              </button>
              <button
                type="submit"
                className="nav-run"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Joining…" : "Join"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
