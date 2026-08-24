import type { BoxData, ConnectionBranch } from "./liveblocks.config";
import { getItemSize } from "./liveblocks.config";

export type Point = { x: number; y: number };

export function isConnectableKind(kind?: string): boolean {
  return (
    kind === "ai" ||
    kind === "trigger" ||
    kind === "condition" ||
    kind === "transform" ||
    kind === "output"
  );
}

export function itemInputPort(box: BoxData): Point {
  const { height } = getItemSize(box);
  return { x: box.x, y: box.y + height / 2 };
}

export function itemOutputPort(
  box: BoxData,
  branch: ConnectionBranch = "default",
): Point {
  const { width, height } = getItemSize(box);
  if (box.kind === "condition") {
    const ratio = branch === "false" ? 0.68 : 0.32;
    return { x: box.x + width, y: box.y + height * ratio };
  }
  return { x: box.x + width, y: box.y + height / 2 };
}

export function aiOutputPort(box: BoxData): Point {
  return itemOutputPort(box, "default");
}

export function aiInputPort(box: BoxData): Point {
  return itemInputPort(box);
}

export function curvedPath(from: Point, to: Point): string {
  const dx = Math.max(40, Math.abs(to.x - from.x) * 0.45);
  const c1x = from.x + dx;
  const c2x = to.x - dx;
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}

export function parseStrokePoints(raw: string | undefined): Point[] {
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

export function eraseNearPoints(
  points: Point[],
  eraser: Point,
  radius: number,
): Point[] {
  return points.filter((point) => {
    const dx = point.x - eraser.x;
    const dy = point.y - eraser.y;
    return dx * dx + dy * dy > radius * radius;
  });
}

export function boundsOfPoints(points: Point[]): {
  width: number;
  height: number;
} {
  if (points.length === 0) return { width: 1, height: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    width: Math.max(1, Math.max(...xs) + 8),
    height: Math.max(1, Math.max(...ys) + 8),
  };
}
