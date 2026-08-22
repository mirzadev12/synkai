// Types for Liveblocks Storage. This file is only TypeScript types — no runtime code.
import type { LiveMap, LiveObject } from "@liveblocks/client";

export type AiModel = "gemini" | "groq";

export type ItemKind =
  | "ai"
  | "sticky"
  | "image"
  | "stroke"
  | "shape"
  | "text";

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
};

declare global {
  interface Liveblocks {
    Presence: {
      // Empty for this prototype — we only sync the canvas, not cursors.
    };
    Storage: {
      boxes: LiveMap<string, LiveObject<BoxData>>;
    };
  }
}

export {};
