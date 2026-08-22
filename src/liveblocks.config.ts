// Types for Liveblocks Storage. This file is only TypeScript types — no runtime code.
import type { LiveMap, LiveObject } from "@liveblocks/client";

export type AiModel = "gemini" | "groq";

export type BoxData = {
  x: number;
  y: number;
  text: string;
  kind?: "ai";
  model?: AiModel;
  prompt?: string;
  output?: string;
  answeredBy?: string;
  status?: "idle" | "running" | "error";
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
