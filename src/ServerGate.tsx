import { useState } from "react";
import {
  isJoinCode,
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
          Each code is its own canvas and team memory. Create one, or
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
              autoComplete="off"
              maxLength={12}
              placeholder="Join code"
              value={code}
              onChange={(event) =>
                // Accepts both formats: 10-char alphanumeric for new rooms and
                // 6-digit for legacy ones. Stripping non-digits here (as it
                // used to) would make a new code impossible to type.
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^0-9A-Z]/g, "")
                    .slice(0, 10),
                )
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
                disabled={busy || !isJoinCode(code)}
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
