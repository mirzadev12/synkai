import { useEffect, useState } from "react";
import { useWorkspace } from "./WorkspaceContext";

function notesKey(code: string) {
  return `synkai-notes-${code}`;
}

export function NotesWindow() {
  const { code } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      setText(localStorage.getItem(notesKey(code)) ?? "");
    } catch {
      setText("");
    }
  }, [code]);

  function persist(next: string) {
    setText(next);
    try {
      localStorage.setItem(notesKey(code), next);
    } catch {
      // ignore
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="notes-chip"
        onClick={() => setExpanded(true)}
        title="Open notes"
      >
        <span className="material-symbols-outlined" aria-hidden>
          description
        </span>
        Notes
      </button>
    );
  }

  return (
    <div className="notes-window" role="dialog" aria-label="Notes">
      <div className="notes-window-header">
        <strong>Notes</strong>
        <span className="notes-window-hint">This server only</span>
        <button
          type="button"
          className="team-memory-close"
          onClick={() => setExpanded(false)}
        >
          Min
        </button>
      </div>
      <textarea
        className="notes-window-body"
        placeholder="Paste or write notes for this server…"
        value={text}
        onChange={(event) => persist(event.target.value)}
      />
    </div>
  );
}
