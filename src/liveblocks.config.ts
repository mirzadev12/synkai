// Types for Liveblocks Storage. This file is only TypeScript types — no runtime code.
import type { LiveMap, LiveObject } from "@liveblocks/client";

export type AiModel = "gemini" | "groq";

export type ItemKind =
  | "ai"
  | "sticky"
  | "image"
  | "stroke"
  | "shape"
  | "text"
  | "connection"
  | "trigger"
  | "condition"
  | "transform"
  | "output";

export type ConnectionBranch = "default" | "true" | "false";

export type TriggerMode = "manual" | "on_memory_event";
export type ConditionRule = "contains" | "equals" | "length_gt" | "length_lt";
export type TransformOp = "uppercase" | "extract_n" | "template";
export type OutputMode = "log_to_memory" | "webhook";

export type ShapeType = "rect" | "ellipse";

export type BoxData = {
  x: number;
  y: number;
  text: string;
  kind?: ItemKind;
  // AI Block
  model?: AiModel;
  prompt?: string;
  output?: string;
  answeredBy?: string;
  status?: "idle" | "running" | "error";
  // Shared visual props
  width?: number;
  height?: number;
  color?: string;
  fontSize?: number;
  // Shape
  shapeType?: ShapeType;
  // Image (data URL for prototype)
  src?: string;
  // Freehand stroke — JSON string of {x,y}[]
  points?: string;
  strokeWidth?: number;
  // Connection (from AI block → to AI block)
  fromId?: string;
  toId?: string;
  branch?: ConnectionBranch;
  // Workflow nodes (extend AI Block model)
  triggerMode?: TriggerMode;
  memoryFilter?: string;
  triggerInput?: string;
  conditionField?: "output";
  conditionRule?: ConditionRule;
  conditionValue?: string;
  transformOp?: TransformOp;
  transformN?: number;
  transformTemplate?: string;
  outputMode?: OutputMode;
  webhookUrl?: string;
  // Attribution
  createdBy?: string;
  creatorId?: string;
};

export const AI_WIDTH = 300;
export const AI_HEIGHT = 340;
export const WF_WIDTH = 260;
export const WF_HEIGHT = 228;
export const BOX_WIDTH = 160;
export const BOX_HEIGHT = 88;
export const CONTEXT_RANGE = 100;

export function getItemSize(box: {
  kind?: string;
  width?: number;
  height?: number;
}): { width: number; height: number } {
  if (box.kind === "ai") return { width: AI_WIDTH, height: AI_HEIGHT };
  if (
    box.kind === "trigger" ||
    box.kind === "condition" ||
    box.kind === "transform" ||
    box.kind === "output"
  ) {
    return { width: WF_WIDTH, height: WF_HEIGHT };
  }
  if (box.kind === "stroke" || box.kind === "connection") {
    return { width: box.width ?? 1, height: box.height ?? 1 };
  }
  if (
    box.kind === "sticky" ||
    box.kind === "image" ||
    box.kind === "shape" ||
    box.kind === "text"
  ) {
    return {
      width: box.width ?? BOX_WIDTH,
      height: box.height ?? BOX_HEIGHT,
    };
  }
  return { width: BOX_WIDTH, height: BOX_HEIGHT };
}

/** True if two axis-aligned rects are within `range` pixels (including overlap). */
export function withinRange(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  range: number,
): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const gapX = a.x > bx2 ? a.x - bx2 : b.x > ax2 ? b.x - ax2 : 0;
  const gapY = a.y > by2 ? a.y - by2 : b.y > ay2 ? b.y - ay2 : 0;
  return gapX <= range && gapY <= range;
}

declare global {
  interface Liveblocks {
    Presence: {
      name: string;
    };
    Storage: {
      boxes: LiveMap<string, LiveObject<BoxData>>;
    };
  }
}

export {};
