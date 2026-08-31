import { useEffect, useState } from "react";
import { useWorkspace } from "./WorkspaceContext";

function documentKey(code: string) {
  return `synkai-document-${code}`;
}

type DocumentPadProps = {
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
};

export function DocumentPad({ expanded, onExpandedChange }: DocumentPadProps) {
  const { code } = useWorkspace();
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      const next =
        localStorage.getItem(documentKey(code)) ??
        localStorage.getItem(`synkai-notes-${code}`) ??
        "";
      setText(next);
    } catch {
      setText("");
    }
  }, [code]);

  function persist(next: string) {
    setText(next);
    try {
      localStorage.setItem(documentKey(code), next);
    } catch {
      // ignore
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="notes-chip"
        onClick={() => onExpandedChange(true)}
        title="Open document"
      >
        <span className="material-symbols-outlined" aria-hidden>
          description
        </span>
        Document
      </button>
    );
  }

  return (
    <div className="notes-window" role="dialog" aria-label="Document">
      <div className="notes-window-header">
        <strong>Document</strong>
        <span className="notes-window-hint">Scratch pad for this server</span>
        <button
          type="button"
          className="team-memory-close"
          onClick={() => onExpandedChange(false)}
        >
          Minimize
        </button>
      </div>
      <textarea
        className="notes-window-body"
        placeholder="Paste or write a document here. Minimize it to keep working on the canvas."
        value={text}
        onChange={(event) => persist(event.target.value)}
      />
    </div>
  );
}
