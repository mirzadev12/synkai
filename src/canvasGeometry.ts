import type { BoxData } from "./liveblocks.config";
import { AI_HEIGHT, AI_WIDTH } from "./liveblocks.config";

export type Point = { x: number; y: number };

export function aiOutputPort(box: BoxData): Point {
  return { x: box.x + AI_WIDTH, y: box.y + AI_HEIGHT / 2 };
}

export function aiInputPort(box: BoxData): Point {
  return { x: box.x, y: box.y + AI_HEIGHT / 2 };
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
