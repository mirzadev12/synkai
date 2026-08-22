import type { User } from "@liveblocks/client";

type PresenceUser = User<{ name: string }>;

export function creatorFromSelf(self: PresenceUser) {
  const name = (self.presence.name ?? "").trim() || "Anonymous";
  return {
    createdBy: name,
    creatorId: String(self.connectionId),
  };
}
