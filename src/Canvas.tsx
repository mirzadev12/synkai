import { LiveObject } from "@liveblocks/client";
import {
  useMutation,
  useOthers,
  useStorage,
} from "@liveblocks/react/suspense";
import { useEffect, useRef, useState } from "react";
import { AiBlock } from "./AiBlock";
import { ImageItem } from "./ImageItem";
import { ShapeItem } from "./ShapeItem";
import { StickyNote } from "./StickyNote";
import { StrokeItem } from "./StrokeItem";
import { TextItem } from "./TextItem";
import "./liveblocks.config";

const BOX_WIDTH = 160;
const BOX_HEIGHT = 88;
const AI_WIDTH = 280;
const AI_HEIGHT = 260;

const PEN_COLORS = ["#1c1917", "#dc2626", "#2563eb"] as const;
const PEN_WIDTHS = [2, 4, 8] as const;

type Tool = "select" | "pen";

type Point = { x: number; y: number };

function itemSize(box: {
  kind?: string;
  width?: number;
  height?: number;
}): { width: number; height: number } {
  if (box.kind === "ai") return { width: AI_WIDTH, height: AI_HEIGHT };
  if (box.kind === "stroke") {
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

export function Canvas() {
  const boxes = useStorage((root) => root.boxes);
  const others = useOthers();
  const peopleHere = others.length + 1;

  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState<(typeof PEN_COLORS)[number]>(
    PEN_COLORS[0],
  );
  const [penWidth, setPenWidth] = useState<(typeof PEN_WIDTHS)[number]>(4);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);

  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const drawPoints = useRef<Point[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addBox = useMutation(({ storage }) => {
    const id = crypto.randomUUID();
    const count = storage.get("boxes").size + 1;
    storage.get("boxes").set(
      id,
      new LiveObject({
        x: 48 + ((count * 24) % 280),
        y: 48 + ((count * 24) % 200),
        text: `Box ${count}`,
      }),
    );
  }, []);

  const addAiBlock = useMutation(({ storage }) => {
    const id = crypto.randomUUID();
    const count = storage.get("boxes").size + 1;
    storage.get("boxes").set(
      id,
      new LiveObject({
        x: 72 + ((count * 24) % 240),
        y: 72 + ((count * 24) % 160),
        text: "AI Block",
        kind: "ai",
        model: "gemini",
        prompt: "",
        output: "",
        answeredBy: "",
        status: "idle",
      }),
    );
  }, []);

  const addSticky = useMutation(({ storage }) => {
    const id = crypto.randomUUID();
    const count = storage.get("boxes").size + 1;
    storage.get("boxes").set(
      id,
      new LiveObject({
        x: 60 + ((count * 20) % 260),
        y: 60 + ((count * 20) % 180),
        text: "",
        kind: "sticky",
        width: 180,
        height: 160,
        color: "#fef08a",
      }),
    );
  }, []);

  const addShape = useMutation(
    ({ storage }, shapeType: "rect" | "ellipse") => {
      const id = crypto.randomUUID();
      const count = storage.get("boxes").size + 1;
      storage.get("boxes").set(
        id,
        new LiveObject({
          x: 80 + ((count * 20) % 240),
          y: 80 + ((count * 20) % 160),
          text: shapeType === "ellipse" ? "Circle" : "Rectangle",
          kind: "shape",
          shapeType,
          width: 140,
          height: 100,
          color: "#1c1917",
        }),
      );
    },
    [],
  );

  const addText = useMutation(({ storage }) => {
    const id = crypto.randomUUID();
    const count = storage.get("boxes").size + 1;
    storage.get("boxes").set(
      id,
      new LiveObject({
        x: 90 + ((count * 20) % 220),
        y: 90 + ((count * 20) % 140),
        text: "Text",
        kind: "text",
        width: 200,
        height: 80,
        fontSize: 24,
      }),
    );
  }, []);

  const addImageFromSrc = useMutation(({ storage }, src: string) => {
    const id = crypto.randomUUID();
    const count = storage.get("boxes").size + 1;
    storage.get("boxes").set(
      id,
      new LiveObject({
        x: 100 + ((count * 20) % 200),
        y: 100 + ((count * 20) % 120),
        text: "Image",
        kind: "image",
        width: 220,
        height: 160,
        src,
      }),
    );
  }, []);

  const startStroke = useMutation(
    (
      { storage },
      args: { id: string; x: number; y: number; color: string; strokeWidth: number },
    ) => {
      storage.get("boxes").set(
        args.id,
        new LiveObject({
          x: 0,
          y: 0,
          text: "Stroke",
          kind: "stroke",
          color: args.color,
          strokeWidth: args.strokeWidth,
          points: JSON.stringify([{ x: args.x, y: args.y }]),
          width: Math.max(1, args.x + 1),
          height: Math.max(1, args.y + 1),
        }),
      );
    },
    [],
  );

  const updateStroke = useMutation(
    (
      { storage },
      args: { id: string; points: Point[]; width: number; height: number },
    ) => {
      storage.get("boxes").get(args.id)?.update({
        points: JSON.stringify(args.points),
        width: args.width,
        height: args.height,
      });
    },
    [],
  );

  const moveBox = useMutation(
    ({ storage }, id: string, x: number, y: number) => {
      storage.get("boxes").get(id)?.update({ x, y });
    },
    [],
  );

  const resizeBox = useMutation(
    ({ storage }, id: string, width: number, height: number) => {
      storage.get("boxes").get(id)?.update({ width, height });
    },
    [],
  );

  useEffect(() => {
    if (!draggingId) return;
    const id = draggingId;
    const item = boxes[id];
    if (!item || item.kind === "stroke") return;
    const { width, height } = itemSize(item);

    function onMove(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left - dragOffset.current.x;
      const y = event.clientY - rect.top - dragOffset.current.y;
      const maxX = Math.max(0, rect.width - width);
      const maxY = Math.max(0, rect.height - height);
      moveBox(
        id,
        Math.min(Math.max(0, x), maxX),
        Math.min(Math.max(0, y), maxY),
      );
    }

    function onUp() {
      setDraggingId(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [boxes, draggingId, moveBox]);

  useEffect(() => {
    if (!resizingId) return;
    const id = resizingId;

    function onMove(event: PointerEvent) {
      const dx = event.clientX - resizeStart.current.x;
      const dy = event.clientY - resizeStart.current.y;
      resizeBox(
        id,
        Math.max(80, resizeStart.current.w + dx),
        Math.max(60, resizeStart.current.h + dy),
      );
    }

    function onUp() {
      setResizingId(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizingId, resizeBox]);

  useEffect(() => {
    if (!drawingId) return;
    const id = drawingId;

    function onMove(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      drawPoints.current = [...drawPoints.current, point];
      const xs = drawPoints.current.map((p) => p.x);
      const ys = drawPoints.current.map((p) => p.y);
      updateStroke({
        id,
        points: drawPoints.current,
        width: Math.max(1, Math.max(...xs) + 8),
        height: Math.max(1, Math.max(...ys) + 8),
      });
    }

    function onUp() {
      setDrawingId(null);
      drawPoints.current = [];
      setTool("select");
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drawingId, updateStroke]);

  const entries = Object.entries(boxes);

  function startDrag(
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
    x: number,
    y: number,
  ) {
    if (tool === "pen") return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left - x,
      y: event.clientY - rect.top - y,
    };
    setDraggingId(id);
  }

  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
    width: number,
    height: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    resizeStart.current = {
      x: event.clientX,
      y: event.clientY,
      w: width,
      h: height,
    };
    setResizingId(id);
  }

  function onCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (tool !== "pen" || event.target !== canvasRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const id = crypto.randomUUID();
    drawPoints.current = [point];
    startStroke({
      id,
      x: point.x,
      y: point.y,
      color: penColor,
      strokeWidth: penWidth,
    });
    setDrawingId(id);
  }

  function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        addImageFromSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <strong>SYNKAI</strong>
          <span className="presence">
            {peopleHere === 1
              ? "1 person here — open another tab to test live sync"
              : `${peopleHere} people here`}
          </span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="add-btn" onClick={() => addBox()}>
            Box
          </button>
          <button type="button" className="add-btn" onClick={() => addAiBlock()}>
            AI Block
          </button>
          <button type="button" className="add-btn" onClick={() => addSticky()}>
            Sticky
          </button>
          <button
            type="button"
            className="add-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Image
          </button>
          <button type="button" className="add-btn" onClick={() => addText()}>
            Text
          </button>
          <button
            type="button"
            className="add-btn"
            onClick={() => addShape("rect")}
          >
            Rectangle
          </button>
          <button
            type="button"
            className="add-btn"
            onClick={() => addShape("ellipse")}
          >
            Circle
          </button>
          <button
            type="button"
            className={`add-btn${tool === "pen" ? " add-btn-active" : ""}`}
            onClick={() => setTool((t) => (t === "pen" ? "select" : "pen"))}
          >
            Pen
          </button>
        </div>
      </header>

      {tool === "pen" ? (
        <div className="pen-bar">
          <span>Draw on the canvas</span>
          <div className="color-row">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${penColor === c ? " active" : ""}`}
                style={{ background: c }}
                aria-label={`Pen ${c}`}
                onClick={() => setPenColor(c)}
              />
            ))}
          </div>
          <div className="font-row">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className={`font-btn${penWidth === w ? " active" : ""}`}
                onClick={() => setPenWidth(w)}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickImage}
      />

      <div
        ref={canvasRef}
        className={`canvas${tool === "pen" ? " canvas-pen" : ""}`}
        onPointerDown={onCanvasPointerDown}
      >
        {entries.map(([id, box]) => {
          if (box.kind === "stroke") {
            return (
              <div
                key={id}
                className="item-wrap stroke-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <StrokeItem box={box} />
              </div>
            );
          }

          if (box.kind === "ai") {
            return (
              <div
                key={id}
                className="item-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <AiBlock
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                />
              </div>
            );
          }

          if (box.kind === "sticky") {
            return (
              <div
                key={id}
                className="item-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <StickyNote
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onResizeStart={(event) =>
                    startResize(event, id, box.width ?? 180, box.height ?? 160)
                  }
                />
              </div>
            );
          }

          if (box.kind === "image") {
            return (
              <div
                key={id}
                className="item-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <ImageItem
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onResizeStart={(event) =>
                    startResize(event, id, box.width ?? 220, box.height ?? 160)
                  }
                />
              </div>
            );
          }

          if (box.kind === "shape") {
            return (
              <div
                key={id}
                className="item-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <ShapeItem
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onResizeStart={(event) =>
                    startResize(event, id, box.width ?? 140, box.height ?? 100)
                  }
                />
              </div>
            );
          }

          if (box.kind === "text") {
            return (
              <div
                key={id}
                className="item-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <TextItem
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onResizeStart={(event) =>
                    startResize(event, id, box.width ?? 200, box.height ?? 80)
                  }
                />
              </div>
            );
          }

          return (
            <div
              key={id}
              className={`box${draggingId === id ? " box-dragging" : ""}`}
              style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              onPointerDown={(event) => startDrag(event, id, box.x, box.y)}
            >
              {box.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
