import type { BoxData } from "./liveblocks.config";

type Point = { x: number; y: number };

function parsePoints(raw: string | undefined): Point[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Point).x === "number" &&
        typeof (entry as Point).y === "number"
      ) {
        return [{ x: (entry as Point).x, y: (entry as Point).y }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function toPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
}

type StrokeItemProps = {
  box: BoxData;
};

export function StrokeItem({ box }: StrokeItemProps) {
  const points = parsePoints(box.points);
  const width = box.width ?? 1;
  const height = box.height ?? 1;
  const color = box.color ?? "#1c1917";
  const strokeWidth = box.strokeWidth ?? 3;

  return (
    <svg
      className="stroke-item"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={toPath(points)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
