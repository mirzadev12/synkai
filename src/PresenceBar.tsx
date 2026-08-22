import {
  useOthers,
  useSelf,
  useUpdateMyPresence,
} from "@liveblocks/react/suspense";
import { useEffect, useState } from "react";
import { colorForUser, loadUserName, saveUserName } from "./userName";

export function PresenceBar() {
  const self = useSelf();
  const others = useOthers();
  const updatePresence = useUpdateMyPresence();
  const [draft, setDraft] = useState(() => loadUserName());

  useEffect(() => {
    const saved = loadUserName();
    if (saved) {
      setDraft(saved);
      updatePresence({ name: saved });
    }
  }, [updatePresence]);

  function commitName() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    saveUserName(trimmed);
    updatePresence({ name: trimmed });
  }

  const selfId = self ? String(self.connectionId) : "self";
  const selfName =
    (self?.presence.name ?? "").trim() || draft.trim() || "You";

  const online = [
    { id: selfId, name: selfName, you: true },
    ...others.map((user) => ({
      id: String(user.connectionId),
      name: (user.presence.name ?? "").trim() || "Guest",
      you: false,
    })),
  ];

  return (
    <div className="presence-bar">
      <label className="name-field">
        <span className="name-label">Your name</span>
        <input
          className="name-input"
          type="text"
          placeholder="Enter your name"
          value={draft}
          maxLength={32}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              commitName();
            }
          }}
        />
      </label>
      <div className="online-list" aria-label="People online">
        {online.map((person) => (
          <span
            key={person.id}
            className="online-chip"
            style={{ borderColor: colorForUser(person.id) }}
          >
            <span
              className="online-dot"
              style={{ background: colorForUser(person.id) }}
            />
            {person.name}
            {person.you ? " (you)" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
