import { useOthers, useSelf, useUpdateMyPresence } from "@liveblocks/react/suspense";
import { useEffect } from "react";
import { colorForUser, loadUserName } from "./userName";

export function PresenceBar() {
  const self = useSelf();
  const others = useOthers();
  const updatePresence = useUpdateMyPresence();

  useEffect(() => {
    const saved = loadUserName();
    if (saved) updatePresence({ name: saved });
  }, [updatePresence]);

  const selfId = self ? String(self.connectionId) : "self";
  const selfName =
    (self?.presence.name ?? "").trim() || loadUserName() || "You";

  const online = [
    { id: selfId, name: selfName, you: true },
    ...others.map((user) => ({
      id: String(user.connectionId),
      name: (user.presence.name ?? "").trim() || "Guest",
      you: false,
    })),
  ];

  const count = 1 + others.length;

  return (
    <div className="presence-bar">
      <span className="presence-count" title={`${count} in this workspace`}>
        {count} online
      </span>
      <div className="online-list" aria-label="People online">
        {online.map((person) => (
          <span
            key={person.id}
            className="online-chip"
            style={{ borderColor: colorForUser(person.id) }}
            title={person.you ? `${person.name} (you)` : person.name}
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
