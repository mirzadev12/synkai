import { colorForUser } from "./userName";

type CreatorBadgeProps = {
  name?: string;
  creatorId?: string;
};

export function CreatorBadge({ name, creatorId }: CreatorBadgeProps) {
  if (!name) return null;
  const color = creatorId ? colorForUser(creatorId) : "#78716c";
  return (
    <div className="creator-badge" style={{ borderColor: color, color }}>
      {name}
    </div>
  );
}
