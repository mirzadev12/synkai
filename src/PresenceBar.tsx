import { useOthers, useSelf, useUpdateMyPresence } from "@liveblocks/react/suspense";
import { useEffect, useRef, useState } from "react";
import { colorForUser, loadUserName } from "./userName";

const MAX_AVATARS = 3;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Who is in this workspace right now.
 *
 * The previous version rendered names inside 28px circles and then hid them
 * with `font-size: 0; text-indent: -999px; color: transparent`, so all anyone
 * ever saw was a row of coloured dots. Names are legible here: initials on the
 * avatars, and the full list in a popover.
 */
export function PresenceBar() {
  const self = useSelf();
  const others = useOthers();
  const updatePresence = useUpdateMyPresence();
  const [listOpen, setListOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadUserName();
    if (saved) updatePresence({ name: saved });
  }, [updatePresence]);

  useEffect(() => {
    if (!listOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setListOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setListOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [listOpen]);

  const selfId = self ? String(self.connectionId) : "self";
  const selfName =
    (self?.presence?.name ?? "").trim() || loadUserName() || "You";

  const people = [
    { id: selfId, name: selfName, you: true },
    ...others.map((user) => ({
      id: String(user.connectionId),
      name: (user.presence?.name ?? "").trim() || "Guest",
      you: false,
    })),
  ];

  const shown = people.slice(0, MAX_AVATARS);
  const overflow = people.length - shown.length;

  return (
    <div className="presence-bar" ref={ref}>
      <button
        type="button"
        className="presence-trigger"
        aria-expanded={listOpen}
        aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} in this workspace`}
        onClick={() => setListOpen((open) => !open)}
      >
        <span className="presence-avatars">
          {shown.map((person) => (
            <span
              key={person.id}
              className="presence-avatar"
              style={{ background: colorForUser(person.id) }}
              title={person.you ? `${person.name} (you)` : person.name}
            >
              {initials(person.name)}
            </span>
          ))}
          {overflow > 0 ? (
            <span className="presence-avatar presence-avatar-more">
              +{overflow}
            </span>
          ) : null}
        </span>
        <span className="presence-label">
          {people.length} online
        </span>
      </button>

      {listOpen ? (
        <div className="presence-list" role="menu">
          <span className="presence-list-head">In this workspace</span>
          {people.map((person) => (
            <span key={person.id} className="presence-list-row">
              <span
                className="presence-dot"
                style={{ background: colorForUser(person.id) }}
              />
              <span className="presence-list-name">{person.name}</span>
              {person.you ? (
                <span className="presence-list-you">you</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
