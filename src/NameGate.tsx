import { useState } from "react";
import { useUpdateMyPresence } from "@liveblocks/react/suspense";
import { saveUserName } from "./userName";

type NameGateProps = {
  onDone: (name: string) => void;
};

export function NameGate({ onDone }: NameGateProps) {
  const updatePresence = useUpdateMyPresence();
  const [draft, setDraft] = useState("");

  function submit() {
    const name = draft.trim();
    if (!name) return;
    saveUserName(name);
    updatePresence({ name });
    onDone(name);
  }

  return (
    <div className="name-gate" role="dialog" aria-modal="true" aria-label="Enter your name">
      <form
        className="name-gate-card"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="brand-wordmark setup-brand">Synk AI</p>
        <h2 className="name-gate-title">What’s your name?</h2>
        <p className="name-gate-copy">
          Shown to everyone in this workspace. You can change it later.
        </p>
        <input
          className="name-input name-gate-input"
          autoFocus
          type="text"
          maxLength={32}
          placeholder="Enter your name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="nav-run" disabled={!draft.trim()}>
          Join canvas
        </button>
      </form>
    </div>
  );
}
