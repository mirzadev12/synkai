// Types for Liveblocks Storage. This file is only TypeScript types — no runtime code.
import type { LiveMap, LiveObject } from "@liveblocks/client";

/**
 * "claude" is deliberately still in this union even though the UI no longer
 * offers it: blocks created earlier may have it saved in Liveblocks storage,
 * and server/runAi.ts still implements it via OpenRouter. It is not selectable
 * because Claude has no free tier through OpenRouter — offering it without a
 * paid key only ever produced a 500. AiBlock falls stored "claude" back to
 * Gemini so those old blocks still run.
 *
 * To re-enable: set OPENROUTER_API_KEY, then restore the <option> in
 * AiBlock.tsx, the checkbox in ComparePanel.tsx, and "claude" in REVIEW_MODELS.
 */
export type AiModel = "gemini" | "groq" | "claude";

export type ItemKind =
  | "ai"
  | "sticky"
  | "doc"
  | "file"
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
  // Doc block — an explicit title, editable in the overlay header. Docs
  // created before this existed have none, so readers fall back to the
  // first line of content.
  docName?: string;
  // File block — uploaded to Supabase Storage. `src` holds the public URL;
  // only metadata lives in the Liveblocks document, never the bytes.
  fileName?: string;
  fileSize?: number;
  fileType?: string;
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
export const FILE_WIDTH = 210;
export const FILE_HEIGHT = 82;
export const DOC_WIDTH = 210;
export const DOC_HEIGHT = 116;
export const CONTEXT_RANGE = 100;

/**
 * The shared world. Every client renders items and cursors into a surface of
 * exactly this size and scrolls its own view of it, so a given coordinate means
 * the same place on every screen regardless of window size.
 *
 * Before this existed the canvas was sized to each viewer's window, so an item
 * at x=1700 sat on-screen for someone on a wide display and off-screen for
 * someone on a laptop — and live cursors pointed at different content for
 * different people.
 */
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 3000;

/**
 * Doc block content is stored as HTML (TipTap). Anything that reads a doc as
 * *text* — the minimised title, spatial nearby-context fed to AI Blocks — must
 * go through this, or the model sees markup instead of prose.
 */
export function docPlainText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * What to call a doc: its explicit title if it has one, else the first line of
 * its content, else a placeholder.
 */
export function docTitle(html: string | undefined, name?: string): string {
  const explicit = (name ?? "").trim();
  if (explicit) return explicit.length > 60 ? `${explicit.slice(0, 59)}…` : explicit;
  const first = docPlainText(html)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first) return "Untitled document";
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

export function getItemSize(box: {
  kind?: string;
  width?: number;
  height?: number;
}): { width: number; height: number } {
  if (box.kind === "ai") {
    return {
      width: box.width ?? AI_WIDTH,
      height: box.height ?? AI_HEIGHT,
    };
  }
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
  if (box.kind === "file") {
    return {
      width: box.width ?? FILE_WIDTH,
      height: box.height ?? FILE_HEIGHT,
    };
  }
  if (box.kind === "doc") {
    return {
      width: box.width ?? DOC_WIDTH,
      height: box.height ?? DOC_HEIGHT,
    };
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
      /**
       * Pointer position in CANVAS coordinates (same space as box.x/box.y), so
       * a cursor lands on the same item for everyone. null when the pointer is
       * off the canvas.
       */
      cursor: { x: number; y: number } | null;
    };
    Storage: {
      boxes: LiveMap<string, LiveObject<BoxData>>;
    };
  }
}

export {};
