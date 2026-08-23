import { LiveObject } from "@liveblocks/client";
import {
  useMutation,
  useStorage,
} from "@liveblocks/react/suspense";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiBlock } from "./AiBlock";
import {
  boundsOfPoints,
  eraseNearPoints,
  parseStrokePoints,
  type Point,
} from "./canvasGeometry";
import { ComparePanel } from "./ComparePanel";
import { ConnectionsLayer } from "./ConnectionsLayer";
import { creatorFromSelf } from "./creatorMeta";
import { CreatorBadge } from "./CreatorBadge";
import { ImageItem } from "./ImageItem";
import { PresenceBar } from "./PresenceBar";
import {
  AI_HEIGHT,
  AI_WIDTH,
  CONTEXT_RANGE,
  getItemSize,
  withinRange,
  type AiModel,
} from "./liveblocks.config";
import { ShapeItem } from "./ShapeItem";
import { StickyNote } from "./StickyNote";
import { StrokeItem } from "./StrokeItem";
import { TeamMemoryPanel } from "./TeamMemoryPanel";
import { TextItem } from "./TextItem";
import "./liveblocks.config";

const PEN_COLORS = ["#1c1917", "#dc2626", "#2563eb"] as const;
const PEN_WIDTHS = [2, 4, 8] as const;
const ERASER_RADIUS = 18;
const TRASH_SIZE = 56;

type Tool = "select" | "pen" | "eraser";

export function Canvas() {
  const boxes = useStorage((root) => root.boxes);

  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState<(typeof PEN_COLORS)[number]>(
    PEN_COLORS[0],
  );
  const [penWidth, setPenWidth] = useState<(typeof PEN_WIDTHS)[number]>(4);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    null,
  );
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [linkCursor, setLinkCursor] = useState<Point | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0);

  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const drawPoints = useRef<Point[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkFromRef = useRef<string | null>(null);

  const addBox = useMutation(({ storage, self }) => {
    const id = crypto.randomUUID();
    const count = storage.get("boxes").size + 1;
    storage.get("boxes").set(
      id,
      new LiveObject({
        x: 48 + ((count * 24) % 280),
        y: 48 + ((count * 24) % 200),
        text: `Box ${count}`,
        ...creatorFromSelf(self),
      }),
    );
    return id;
  }, []);

  const addAiBlock = useMutation(
    (
      { storage, self },
      opts?: { x?: number; y?: number; model?: AiModel; prompt?: string },
    ) => {
      const id = crypto.randomUUID();
      const count = storage.get("boxes").size + 1;
      storage.get("boxes").set(
        id,
        new LiveObject({
          x: opts?.x ?? 72 + ((count * 24) % 240),
          y: opts?.y ?? 72 + ((count * 24) % 160),
          text: "AI Block",
          kind: "ai",
          model: opts?.model ?? "gemini",
          prompt: opts?.prompt ?? "",
          output: "",
          answeredBy: "",
          status: "idle",
          ...creatorFromSelf(self),
        }),
      );
      return id;
    },
    [],
  );

  const addCompareBlocks = useMutation(
    ({ storage, self }, prompt: string, models: AiModel[]) => {
      const baseX = 80;
      const baseY = 80;
      const creator = creatorFromSelf(self);
      for (let i = 0; i < models.length; i += 1) {
        const id = crypto.randomUUID();
        storage.get("boxes").set(
          id,
          new LiveObject({
            x: baseX + i * (AI_WIDTH + 24),
            y: baseY,
            text: "AI Block",
            kind: "ai",
            model: models[i],
            prompt,
            output: "",
            answeredBy: "",
            status: "idle",
            ...creator,
          }),
        );
      }
    },
    [],
  );

  const addSticky = useMutation(({ storage, self }) => {
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
        ...creatorFromSelf(self),
      }),
    );
    return id;
  }, []);

  const addShape = useMutation(
    ({ storage, self }, shapeType: "rect" | "ellipse") => {
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
          ...creatorFromSelf(self),
        }),
      );
      return id;
    },
    [],
  );

  const addText = useMutation(({ storage, self }) => {
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
        ...creatorFromSelf(self),
      }),
    );
    return id;
  }, []);

  const addImageFromSrc = useMutation(({ storage, self }, src: string) => {
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
        ...creatorFromSelf(self),
      }),
    );
    return id;
  }, []);

  const startStroke = useMutation(
    (
      { storage, self },
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
          ...creatorFromSelf(self),
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

  const eraseAtPoint = useMutation(({ storage }, point: Point) => {
    const map = storage.get("boxes");
    for (const [id, live] of map) {
      if (live.get("kind") !== "stroke") continue;
      const points = parseStrokePoints(live.get("points"));
      const next = eraseNearPoints(points, point, ERASER_RADIUS);
      if (next.length === points.length) continue;
      if (next.length < 2) {
        map.delete(id);
      } else {
        const bounds = boundsOfPoints(next);
        live.update({
          points: JSON.stringify(next),
          width: bounds.width,
          height: bounds.height,
        });
      }
    }
  }, []);

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

  const addConnection = useMutation(
    ({ storage }, fromId: string, toId: string) => {
      if (fromId === toId) return;
      const map = storage.get("boxes");
      for (const [, live] of map) {
        if (
          live.get("kind") === "connection" &&
          live.get("fromId") === fromId &&
          live.get("toId") === toId
        ) {
          return;
        }
      }
      const id = crypto.randomUUID();
      map.set(
        id,
        new LiveObject({
          x: 0,
          y: 0,
          text: "Connection",
          kind: "connection",
          fromId,
          toId,
        }),
      );
    },
    [],
  );

  const deleteItems = useMutation(({ storage }, ids: string[]) => {
    const map = storage.get("boxes");
    const remove = new Set(ids);
    for (const [id, live] of [...map]) {
      if (remove.has(id)) {
        map.delete(id);
        continue;
      }
      if (live.get("kind") !== "connection") continue;
      const fromId = live.get("fromId");
      const toId = live.get("toId");
      if (
        (fromId && remove.has(fromId)) ||
        (toId && remove.has(toId))
      ) {
        map.delete(id);
      }
    }
  }, []);

  const feedConnectedPrompts = useMutation(
    ({ storage }, fromId: string, output: string) => {
      const map = storage.get("boxes");
      for (const [, live] of map) {
        if (live.get("kind") !== "connection" || live.get("fromId") !== fromId) {
          continue;
        }
        const toId = live.get("toId");
        if (!toId) continue;
        const target = map.get(toId);
        if (!target || target.get("kind") !== "ai") continue;
        const existing = (target.get("prompt") ?? "").trim();
        const next = existing ? `${output}\n\n---\n\n${existing}` : output;
        target.update({ prompt: next });
      }
    },
    [],
  );

  function canvasPoint(event: { clientX: number; clientY: number }): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function isOverTrash(point: Point): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const left = rect.width - TRASH_SIZE - 16;
    const top = rect.height - TRASH_SIZE - 16;
    return (
      point.x >= left &&
      point.x <= left + TRASH_SIZE &&
      point.y >= top &&
      point.y <= top + TRASH_SIZE
    );
  }

  useEffect(() => {
    if (!draggingId) return;
    const id = draggingId;
    const item = boxes[id];
    if (!item || item.kind === "stroke" || item.kind === "connection") return;
    const { width, height } = getItemSize(item);

    function onMove(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left - dragOffset.current.x;
      const y = event.clientY - rect.top - dragOffset.current.y;
      const maxX = Math.max(0, rect.width - width);
      const maxY = Math.max(0, rect.height - height);
      const nextX = Math.min(Math.max(0, x), maxX);
      const nextY = Math.min(Math.max(0, y), maxY);
      moveBox(id, nextX, nextY);
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setOverTrash(isOverTrash(point));
    }

    function onUp(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        if (isOverTrash(point)) {
          deleteItems([id]);
          setSelectedId(null);
        }
      }
      setDraggingId(null);
      setOverTrash(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [boxes, draggingId, moveBox, deleteItems]);

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
      const point = canvasPoint(event);
      if (!point) return;
      drawPoints.current = [...drawPoints.current, point];
      const bounds = boundsOfPoints(drawPoints.current);
      updateStroke({
        id,
        points: drawPoints.current,
        width: bounds.width,
        height: bounds.height,
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

  useEffect(() => {
    if (!linkFromId) return;

    function onMove(event: PointerEvent) {
      const point = canvasPoint(event);
      if (point) setLinkCursor(point);
    }

    function onUp() {
      linkFromRef.current = null;
      setLinkFromId(null);
      setLinkCursor(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [linkFromId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (selectedConnectionId) {
        event.preventDefault();
        deleteItems([selectedConnectionId]);
        setSelectedConnectionId(null);
        return;
      }
      if (selectedId) {
        event.preventDefault();
        deleteItems([selectedId]);
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedConnectionId, selectedId, deleteItems]);

  const nearbyByAi = useMemo(() => {
    const result: Record<string, { ids: string[]; labels: string[] }> = {};
    const notes = Object.entries(boxes).filter(
      ([, box]) =>
        (box.kind === "sticky" || box.kind === "text") &&
        (box.text ?? "").trim().length > 0,
    );
    for (const [aiId, ai] of Object.entries(boxes)) {
      if (ai.kind !== "ai") continue;
      const aiRect = {
        x: ai.x,
        y: ai.y,
        width: AI_WIDTH,
        height: AI_HEIGHT,
      };
      const ids: string[] = [];
      const labels: string[] = [];
      for (const [noteId, note] of notes) {
        const size = getItemSize(note);
        if (
          withinRange(
            aiRect,
            { x: note.x, y: note.y, width: size.width, height: size.height },
            CONTEXT_RANGE,
          )
        ) {
          ids.push(noteId);
          const snippet = (note.text ?? "").trim().slice(0, 24);
          labels.push(note.kind === "sticky" ? `Sticky “${snippet}”` : `Text “${snippet}”`);
        }
      }
      result[aiId] = { ids, labels };
    }
    return result;
  }, [boxes]);

  const entries = Object.entries(boxes);

  function startDrag(
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
    x: number,
    y: number,
  ) {
    if (tool === "pen" || tool === "eraser") return;
    event.preventDefault();
    event.stopPropagation();
    const point = canvasPoint(event);
    if (!point) return;
    dragOffset.current = {
      x: point.x - x,
      y: point.y - y,
    };
    setSelectedId(id);
    setSelectedConnectionId(null);
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
    if (event.target !== canvasRef.current) return;
    setSelectedId(null);
    setSelectedConnectionId(null);

    const point = canvasPoint(event);
    if (!point) return;

    if (tool === "pen") {
      event.preventDefault();
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
      return;
    }

    if (tool === "eraser") {
      event.preventDefault();
      eraseAtPoint(point);
      function onMove(moveEvent: PointerEvent) {
        const p = canvasPoint(moveEvent);
        if (p) eraseAtPoint(p);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
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

  function onOutputDown(
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    linkFromRef.current = id;
    setLinkFromId(id);
    const point = canvasPoint(event);
    if (point) setLinkCursor(point);
  }

  function onInputUp(
    event: React.PointerEvent<HTMLButtonElement>,
    toId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const fromId = linkFromRef.current;
    if (fromId && fromId !== toId) {
      addConnection(fromId, toId);
    }
    linkFromRef.current = null;
    setLinkFromId(null);
    setLinkCursor(null);
  }

  function buildPromptFor(aiId: string, userPrompt: string): string {
    const nearby = nearbyByAi[aiId];
    if (!nearby || nearby.ids.length === 0) return userPrompt;
    const chunks = nearby.ids.map((noteId) => {
      const note = boxes[noteId];
      return (note?.text ?? "").trim();
    }).filter(Boolean);
    if (chunks.length === 0) return userPrompt;
    return `Context from nearby notes on the canvas:\n${chunks.map((c) => `- ${c}`).join("\n")}\n\nUser prompt:\n${userPrompt}`;
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <strong>SYNKAI</strong>
          <PresenceBar />
        </div>
        <div className="toolbar-actions">
          <button type="button" className="add-btn" onClick={() => addBox()}>
            Box
          </button>
          <button type="button" className="add-btn" onClick={() => addAiBlock()}>
            AI Block
          </button>
          <button
            type="button"
            className="add-btn"
            onClick={() => setCompareOpen(true)}
          >
            Compare
          </button>
          <button
            type="button"
            className={`add-btn${memoryOpen ? " add-btn-active" : ""}`}
            onClick={() => setMemoryOpen((open) => !open)}
          >
            Team Memory
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
          <button
            type="button"
            className={`add-btn${tool === "eraser" ? " add-btn-active" : ""}`}
            onClick={() =>
              setTool((t) => (t === "eraser" ? "select" : "eraser"))
            }
          >
            Eraser
          </button>
        </div>
      </header>

      {tool === "pen" || tool === "eraser" ? (
        <div className="pen-bar">
          <span>
            {tool === "pen"
              ? "Draw on the canvas"
              : "Drag over strokes to erase"}
          </span>
          {tool === "pen" ? (
            <>
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
            </>
          ) : null}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickImage}
      />

      <ComparePanel
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        onCreate={(prompt, models) => addCompareBlocks(prompt, models)}
      />

      <TeamMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        refreshKey={memoryRefreshKey}
      />

      <div
        ref={canvasRef}
        className={`canvas${tool === "pen" || tool === "eraser" ? " canvas-pen" : ""}${tool === "eraser" ? " canvas-eraser" : ""}`}
        onPointerDown={onCanvasPointerDown}
      >
        <ConnectionsLayer
          boxes={boxes}
          selectedConnectionId={selectedConnectionId}
          draftFromId={linkFromId}
          draftTo={linkCursor}
          onSelectConnection={(id) => {
            setSelectedConnectionId(id);
            setSelectedId(null);
          }}
          onDeleteConnection={(id) => {
            deleteItems([id]);
            setSelectedConnectionId(null);
          }}
        />

        {entries.map(([id, box]) => {
          if (box.kind === "connection") return null;

          if (box.kind === "stroke") {
            return (
              <div
                key={id}
                className="item-wrap stroke-wrap"
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <StrokeItem box={box} />
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "ai") {
            const nearby = nearbyByAi[id] ?? { ids: [], labels: [] };
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
                  selected={selectedId === id}
                  nearbyNoteLabels={nearby.labels}
                  onSelect={() => {
                    setSelectedId(id);
                    setSelectedConnectionId(null);
                  }}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onOutputDown={(event) => onOutputDown(event, id)}
                  onInputUp={(event) => onInputUp(event, id)}
                  onPropagateOutput={(text) => feedConnectedPrompts(id, text)}
                  buildPrompt={(userPrompt) => buildPromptFor(id, userPrompt)}
                  onMemoryLogged={() =>
                    setMemoryRefreshKey((key) => key + 1)
                  }
                />
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "sticky") {
            const inRange =
              selectedId &&
              boxes[selectedId]?.kind === "ai" &&
              nearbyByAi[selectedId]?.ids.includes(id);
            return (
              <div
                key={id}
                className={`item-wrap${inRange ? " note-in-range" : ""}`}
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
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
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
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
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
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "text") {
            const inRange =
              selectedId &&
              boxes[selectedId]?.kind === "ai" &&
              nearbyByAi[selectedId]?.ids.includes(id);
            return (
              <div
                key={id}
                className={`item-wrap${inRange ? " note-in-range" : ""}`}
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
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          return (
            <div
              key={id}
              className={`box${draggingId === id ? " box-dragging" : ""}${selectedId === id ? " item-selected" : ""}`}
              style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              onPointerDown={(event) => {
                setSelectedId(id);
                startDrag(event, id, box.x, box.y);
              }}
            >
              {box.text}
              <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
            </div>
          );
        })}

        <div
          className={`trash-bin${overTrash ? " trash-hot" : ""}`}
          aria-label="Trash — drag items here to delete"
          title="Drag items here to delete"
        >
          <span className="trash-icon">⌫</span>
          <span className="trash-label">Trash</span>
        </div>
      </div>
    </div>
  );
}
