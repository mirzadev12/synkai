import { LiveObject } from "@liveblocks/client";
import {
  useMutation,
  useStorage,
} from "@liveblocks/react/suspense";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiBlock } from "./AiBlock";
import { ConditionBlock } from "./ConditionBlock";
import { OutputBlock } from "./OutputBlock";
import { TransformBlock } from "./TransformBlock";
import { TriggerBlock } from "./TriggerBlock";
import {
  boundsOfPoints,
  eraseNearPoints,
  parseStrokePoints,
  type Point,
} from "./canvasGeometry";
import { ComparePanel } from "./ComparePanel";
import { DisagreementPanel } from "./DisagreementPanel";
import { ConnectionsLayer } from "./ConnectionsLayer";
import { DocsPanel } from "./DocsPanel";
import { DocumentPad } from "./DocumentPad";
import { creatorFromSelf } from "./creatorMeta";
import { CreatorBadge } from "./CreatorBadge";
import { ImageItem } from "./ImageItem";
import { NameGate } from "./NameGate";
import { PresenceBar } from "./PresenceBar";
import { clearServerSession } from "./serverSession";
import { useWorkspace } from "./WorkspaceContext";
import { requestAi } from "./runAiClient";
import { upsertLinkedContext } from "./linkedContext";
import { loadUserName } from "./userName";
import {
  AI_HEIGHT,
  AI_WIDTH,
  CONTEXT_RANGE,
  getItemSize,
  withinRange,
  type AiModel,
  type ConnectionBranch,
  type ItemKind,
} from "./liveblocks.config";
import { ShapeItem } from "./ShapeItem";
import { StickyNote } from "./StickyNote";
import { StrokeItem } from "./StrokeItem";
import { TeamMemoryPanel } from "./TeamMemoryPanel";
import { TextItem } from "./TextItem";
import { ThemeToggle } from "./ThemeToggle";
import { WorkflowTracePanel } from "./WorkflowTracePanel";
import { extractConnectedWorkflow } from "./workflowGraph";
import {
  runSavedWorkflow,
  saveWorkflowGraph,
  type WorkflowRunResult,
} from "./workflowApi";
import "./liveblocks.config";

const PEN_COLORS = ["#1c1917", "#dc2626", "#2563eb"] as const;
const PEN_WIDTHS = [2, 4, 8] as const;
const ERASER_RADIUS = 18;
const TRASH_SIZE = 56;

type Tool = "select" | "pen" | "eraser";

export function Canvas() {
  const { code: serverCode, workspaceId } = useWorkspace();
  const boxes = useStorage((root) => root.boxes);

  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState<(typeof PEN_COLORS)[number]>(
    PEN_COLORS[0],
  );
  const [penWidth, setPenWidth] = useState<(typeof PEN_WIDTHS)[number]>(4);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [nameReady, setNameReady] = useState(() => Boolean(loadUserName()));
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    null,
  );
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [linkBranch, setLinkBranch] = useState<ConnectionBranch>("default");
  const [linkCursor, setLinkCursor] = useState<Point | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [disagreeOpen, setDisagreeOpen] = useState(false);
  const [lastCompare, setLastCompare] = useState<{
    prompt: string;
    left: { model: string; text: string };
    right: { model: string; text: string };
  } | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceResult, setTraceResult] = useState<WorkflowRunResult | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const dragOffset = useRef({ x: 0, y: 0 });
  const dragGroupRef = useRef<string[]>([]);
  const dragOriginsRef = useRef<Record<string, { x: number; y: number }>>({});
  const pointerOriginRef = useRef({ x: 0, y: 0 });
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedIds;
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const drawPoints = useRef<Point[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkFromRef = useRef<string | null>(null);
  const linkBranchRef = useRef<ConnectionBranch>("default");

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
          width: AI_WIDTH,
          height: AI_HEIGHT,
          ...creatorFromSelf(self),
        }),
      );
      return id;
    },
    [],
  );

  const addWorkflowNode = useMutation(
    (
      { storage, self },
      kind: Extract<ItemKind, "trigger" | "condition" | "transform" | "output">,
    ) => {
      const id = crypto.randomUUID();
      const count = storage.get("boxes").size + 1;
      const creator = creatorFromSelf(self);
      const base = {
        x: 64 + ((count * 24) % 240),
        y: 64 + ((count * 24) % 160),
        output: "",
        status: "idle" as const,
        ...creator,
      };
      if (kind === "trigger") {
        storage.get("boxes").set(
          id,
          new LiveObject({
            ...base,
            text: "Trigger",
            kind: "trigger",
            triggerMode: "manual",
            triggerInput: "",
            memoryFilter: "brief",
          }),
        );
      } else if (kind === "condition") {
        storage.get("boxes").set(
          id,
          new LiveObject({
            ...base,
            text: "Condition",
            kind: "condition",
            conditionField: "output",
            conditionRule: "contains",
            conditionValue: "urgent",
          }),
        );
      } else if (kind === "transform") {
        storage.get("boxes").set(
          id,
          new LiveObject({
            ...base,
            text: "Transform",
            kind: "transform",
            transformOp: "uppercase",
            transformN: 8,
            transformTemplate: "Summary: {{input}}",
          }),
        );
      } else {
        storage.get("boxes").set(
          id,
          new LiveObject({
            ...base,
            text: "Output",
            kind: "output",
            outputMode: "log_to_memory",
            webhookUrl: "",
          }),
        );
      }
      return id;
    },
    [],
  );

  const addCompareBlocks = useMutation(
    ({ storage, self }, prompt: string, models: AiModel[]) => {
      const baseX = 80;
      const baseY = 80;
      const creator = creatorFromSelf(self);
      const ids: string[] = [];
      for (let i = 0; i < models.length; i += 1) {
        const id = crypto.randomUUID();
        ids.push(id);
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
            width: AI_WIDTH,
            height: AI_HEIGHT,
            ...creator,
          }),
        );
      }
      return ids;
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

  const moveBoxes = useMutation(
    ({ storage }, updates: { id: string; x: number; y: number }[]) => {
      const map = storage.get("boxes");
      for (const update of updates) {
        map.get(update.id)?.update({ x: update.x, y: update.y });
      }
    },
    [],
  );

  const patchAi = useMutation(
    (
      { storage },
      id: string,
      patch: Partial<{
        output: string;
        answeredBy: string;
        status: "idle" | "running" | "error";
      }>,
    ) => {
      storage.get("boxes").get(id)?.update(patch);
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
    (
      { storage },
      fromId: string,
      toId: string,
      branch: ConnectionBranch = "default",
    ) => {
      if (fromId === toId) return;
      const map = storage.get("boxes");
      for (const [, live] of map) {
        const existingBranch = live.get("branch") ?? "default";
        if (
          live.get("kind") === "connection" &&
          live.get("fromId") === fromId &&
          live.get("toId") === toId &&
          existingBranch === branch
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
          branch,
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
      const source = map.get(fromId);
      const sourceLabel =
        (source?.get("text") ?? "").trim() ||
        (source?.get("model") === "groq" ? "Groq" : "Gemini") ||
        "AI Block";
      for (const [, live] of map) {
        if (live.get("kind") !== "connection" || live.get("fromId") !== fromId) {
          continue;
        }
        const toId = live.get("toId");
        if (!toId) continue;
        const target = map.get(toId);
        if (!target || target.get("kind") !== "ai") continue;
        const existing = target.get("prompt") ?? "";
        target.update({
          prompt: upsertLinkedContext(existing, fromId, sourceLabel, output),
        });
      }
    },
    [],
  );

  const applyRunOutputs = useMutation(
    (
      { storage },
      steps: { canvasId: string | null; output: string; status: string }[],
    ) => {
      const map = storage.get("boxes");
      for (const step of steps) {
        if (!step.canvasId) continue;
        map.get(step.canvasId)?.update({
          output: step.output,
          status: step.status === "failed" ? "error" : "idle",
        });
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

    function onMove(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const dx = point.x - pointerOriginRef.current.x;
      const dy = point.y - pointerOriginRef.current.y;
      const group = dragGroupRef.current;
      const updates: { id: string; x: number; y: number }[] = [];
      for (const gid of group) {
        const origin = dragOriginsRef.current[gid];
        const item = boxes[gid];
        if (!origin || !item || item.kind === "stroke" || item.kind === "connection") {
          continue;
        }
        const { width, height } = getItemSize(item);
        const maxX = Math.max(0, rect.width - width);
        const maxY = Math.max(0, rect.height - height);
        updates.push({
          id: gid,
          x: Math.min(Math.max(0, origin.x + dx), maxX),
          y: Math.min(Math.max(0, origin.y + dy), maxY),
        });
      }
      if (updates.length === 1) {
        moveBox(updates[0].id, updates[0].x, updates[0].y);
      } else if (updates.length > 1) {
        moveBoxes(updates);
      }
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
          const ids = dragGroupRef.current;
          deleteItems(ids);
          clearSelection();
        }
      }
      setDraggingId(null);
      setOverTrash(false);
      dragGroupRef.current = [];
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [boxes, draggingId, moveBox, moveBoxes, deleteItems]);

  useEffect(() => {
    if (!resizingId) return;
    const id = resizingId;

    function onMove(event: PointerEvent) {
      const dx = event.clientX - resizeStart.current.x;
      const dy = event.clientY - resizeStart.current.y;
      const isAi = boxes[id]?.kind === "ai";
      resizeBox(
        id,
        Math.max(isAi ? 260 : 80, resizeStart.current.w + dx),
        Math.max(isAi ? 280 : 60, resizeStart.current.h + dy),
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
  }, [boxes, resizingId, resizeBox]);

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
      linkBranchRef.current = "default";
      setLinkBranch("default");
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
      if (selectedIds.length > 0) {
        event.preventDefault();
        deleteItems(selectedIds);
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedConnectionId, selectedIds, deleteItems]);

  const nearbyByAi = useMemo(() => {
    const result: Record<string, { ids: string[]; labels: string[] }> = {};
    const notes = Object.entries(boxes).filter(
      ([, box]) =>
        (box.kind === "sticky" || box.kind === "text") &&
        (box.text ?? "").trim().length > 0,
    );
    for (const [aiId, ai] of Object.entries(boxes)) {
      if (ai.kind !== "ai") continue;
      const size = getItemSize(ai);
      const aiRect = {
        x: ai.x,
        y: ai.y,
        width: size.width,
        height: size.height,
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

  function clearSelection() {
    setSelectedIds([]);
  }

  function applySelection(ids: string[]) {
    setSelectedIds(ids);
  }

  function selectItem(id: string, shiftKey: boolean) {
    setSelectedConnectionId(null);
    const prev = selectedIdsRef.current;
    if (shiftKey) {
      applySelection(
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      return;
    }
    applySelection([id]);
  }

  function isSelected(id: string) {
    return selectedIds.includes(id);
  }

  function wrapClass(id: string, extra = "") {
    return `item-wrap${isSelected(id) ? " item-selected" : ""}${extra}`;
  }

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
    const prev = selectedIdsRef.current;
    let group: string[];
    if (event.shiftKey) {
      group = prev.includes(id) ? prev : [...prev, id];
    } else if (prev.includes(id)) {
      group = prev;
    } else {
      group = [id];
    }
    applySelection(group);
    setSelectedConnectionId(null);
    const movable = group.filter((gid) => {
      const item = boxes[gid];
      return item && item.kind !== "stroke" && item.kind !== "connection";
    });
    dragGroupRef.current = movable.length > 0 ? movable : [id];
    dragOriginsRef.current = Object.fromEntries(
      dragGroupRef.current.map((gid) => {
        const item = boxes[gid];
        return [gid, { x: item?.x ?? x, y: item?.y ?? y }];
      }),
    );
    pointerOriginRef.current = point;
    dragOffset.current = {
      x: point.x - x,
      y: point.y - y,
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
    if (event.target !== canvasRef.current) return;
    setSelectedConnectionId(null);

    const point = canvasPoint(event);
    if (!point) return;

    if (tool === "pen") {
      clearSelection();
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
      clearSelection();
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
      return;
    }

    event.preventDefault();
    const origin = point;
    let last = point;
    let moved = false;
    setMarquee({ x: point.x, y: point.y, w: 0, h: 0 });

    function onMove(moveEvent: PointerEvent) {
      const p = canvasPoint(moveEvent);
      if (!p) return;
      last = p;
      if (Math.abs(p.x - origin.x) > 3 || Math.abs(p.y - origin.y) > 3) {
        moved = true;
      }
      const x = Math.min(origin.x, p.x);
      const y = Math.min(origin.y, p.y);
      setMarquee({
        x,
        y,
        w: Math.abs(p.x - origin.x),
        h: Math.abs(p.y - origin.y),
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setMarquee(null);
      if (!moved) {
        clearSelection();
        return;
      }
      const left = Math.min(origin.x, last.x);
      const top = Math.min(origin.y, last.y);
      const right = Math.max(origin.x, last.x);
      const bottom = Math.max(origin.y, last.y);
      const hits: string[] = [];
      for (const [id, box] of Object.entries(boxes)) {
        if (box.kind === "connection") continue;
        const size = getItemSize(box);
        const bx1 = box.x + size.width;
        const by1 = box.y + size.height;
        if (box.x < right && bx1 > left && box.y < bottom && by1 > top) {
          hits.push(id);
        }
      }
      applySelection(hits);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
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
    branch: ConnectionBranch = "default",
  ) {
    event.preventDefault();
    event.stopPropagation();
    linkFromRef.current = id;
    linkBranchRef.current = branch;
    setLinkBranch(branch);
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
    const branch = linkBranchRef.current;
    if (fromId && fromId !== toId) {
      addConnection(fromId, toId, branch);
    }
    linkFromRef.current = null;
    linkBranchRef.current = "default";
    setLinkFromId(null);
    setLinkCursor(null);
  }

  async function persistWorkflow(name: string): Promise<string> {
    const graph = extractConnectedWorkflow(boxes);
    if (graph.nodes.length === 0) {
      throw new Error("Add a Trigger and connect nodes first");
    }
    const id = await saveWorkflowGraph({
      workspaceId,
      name,
      nodes: graph.nodes,
      edges: graph.edges,
    });
    return id;
  }

  async function onSaveWorkflow() {
    if (saveBusy) return;
    const name = window.prompt("Workflow name", "Canvas workflow");
    if (!name?.trim()) return;
    setSaveBusy(true);
    setTraceError(null);
    try {
      await persistWorkflow(name.trim());
      setTraceOpen(true);
    } catch (error) {
      setTraceOpen(true);
      setTraceError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }

  async function onRunWorkflow(triggerCanvasId: string) {
    if (workflowRunning) return;
    setWorkflowRunning(true);
    setTraceOpen(true);
    setTraceError(null);
    try {
      const workflowId = await persistWorkflow("Canvas workflow");
      const triggerInput = boxes[triggerCanvasId]?.triggerInput ?? "";
      const result = await runSavedWorkflow(workflowId, triggerInput);
      setTraceResult(result);
      applyRunOutputs(result.steps);
      setMemoryRefreshKey((key) => key + 1);
    } catch (error) {
      setTraceError(error instanceof Error ? error.message : "Run failed");
    } finally {
      setWorkflowRunning(false);
    }
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

  async function onCreateCompare(prompt: string, models: AiModel[]) {
    const ids = addCompareBlocks(prompt, models);
    applySelection(ids);
    for (const id of ids) {
      patchAi(id, { status: "running", output: "", answeredBy: "" });
    }
    const collected: { model: string; text: string }[] = [];
    await Promise.all(
      ids.map(async (id, index) => {
        const model = models[index];
        try {
          const { text, answeredBy } = await requestAi(prompt, model);
          patchAi(id, { output: text, answeredBy, status: "idle" });
          collected[index] = { model: answeredBy || model, text };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Request failed";
          patchAi(id, { output: message, status: "error" });
          collected[index] = { model, text: message };
        }
      }),
    );
    if (collected[0] && collected[1]) {
      setLastCompare({
        prompt,
        left: collected[0],
        right: collected[1],
      });
      setDisagreeOpen(true);
    }
  }

  return (
    <div className={`app${docsOpen ? " docs-open" : ""}`}>
      {!nameReady ? (
        <NameGate onDone={() => setNameReady(true)} />
      ) : null}
      <header className="toolbar">
        <div className="toolbar-brand-row">
          <strong className="brand-wordmark">Synk AI</strong>
          <span className="toolbar-rule" aria-hidden />
          <span className="workspace-tab" title="Share this code to invite others">
            Server {serverCode}
          </span>
          <button
            type="button"
            className="nav-ghost"
            onClick={() => {
              clearServerSession();
              window.location.reload();
            }}
          >
            Switch
          </button>
        </div>
        <div className="toolbar-right">
          <PresenceBar />
          <button
            type="button"
            className="nav-ghost"
            onClick={() => setCompareOpen(true)}
          >
            Compare
          </button>
          {lastCompare ? (
            <button
              type="button"
              className={`nav-ghost${disagreeOpen ? " nav-ghost-active" : ""}`}
              onClick={() => setDisagreeOpen(true)}
            >
              Disagree
            </button>
          ) : null}
          <button
            type="button"
            className={`nav-ghost${memoryOpen ? " nav-ghost-active" : ""}`}
            onClick={() => setMemoryOpen((open) => !open)}
          >
            Team Memory
          </button>
          <button
            type="button"
            className={`nav-ghost${documentOpen ? " nav-ghost-active" : ""}`}
            onClick={() => setDocumentOpen((open) => !open)}
          >
            Document
          </button>
          <button
            type="button"
            className={`nav-ghost${docsOpen ? " nav-ghost-active" : ""}`}
            onClick={() => setDocsOpen((open) => !open)}
          >
            Help
          </button>
          <ThemeToggle />
          <button
            type="button"
            className="nav-ghost"
            onClick={() => void onSaveWorkflow()}
            disabled={saveBusy}
          >
            {saveBusy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={`nav-run${traceOpen ? " nav-run-active" : ""}`}
            onClick={() => setTraceOpen((open) => !open)}
          >
            Run
          </button>
        </div>
      </header>

      <div className="tool-dock" role="toolbar" aria-label="Canvas tools">
        <DockButton
          icon="bolt"
          label="Trigger"
          onClick={() => addWorkflowNode("trigger")}
        />
        <DockButton
          icon="psychology"
          label="AI Agent"
          onClick={() => addAiBlock()}
        />
        <DockButton
          icon="alt_route"
          label="Condition"
          onClick={() => addWorkflowNode("condition")}
        />
        <DockButton
          icon="auto_fix_high"
          label="Transform"
          onClick={() => addWorkflowNode("transform")}
        />
        <DockButton
          icon="output"
          label="Output"
          onClick={() => addWorkflowNode("output")}
        />
        <DockButton icon="sticky_note_2" label="Note" onClick={() => addSticky()} />
        <DockButton
          icon="description"
          label="Doc"
          active={documentOpen}
          onClick={() => setDocumentOpen((open) => !open)}
        />
        <span className="dock-split" aria-hidden />
        <DockButton icon="crop_square" label="Box" onClick={() => addBox()} />
        <DockButton
          icon="image"
          label="Image"
          onClick={() => fileInputRef.current?.click()}
        />
        <DockButton icon="title" label="Text" onClick={() => addText()} />
        <DockButton
          icon="rectangle"
          label="Rect"
          onClick={() => addShape("rect")}
        />
        <DockButton
          icon="circle"
          label="Circle"
          onClick={() => addShape("ellipse")}
        />
        <DockButton
          icon="edit"
          label="Pen"
          active={tool === "pen"}
          onClick={() => setTool((t) => (t === "pen" ? "select" : "pen"))}
        />
        <DockButton
          icon="ink_eraser"
          label="Eraser"
          active={tool === "eraser"}
          onClick={() =>
            setTool((t) => (t === "eraser" ? "select" : "eraser"))
          }
        />
      </div>

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
        onCreate={(prompt, models) => void onCreateCompare(prompt, models)}
      />

      {lastCompare ? (
        <DisagreementPanel
          open={disagreeOpen}
          prompt={lastCompare.prompt}
          left={lastCompare.left}
          right={lastCompare.right}
          onClose={() => setDisagreeOpen(false)}
        />
      ) : null}

      <DocumentPad
        expanded={documentOpen}
        onExpandedChange={setDocumentOpen}
      />

      <TeamMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        refreshKey={memoryRefreshKey}
      />

      <DocsPanel open={docsOpen} onClose={() => setDocsOpen(false)} />

      <WorkflowTracePanel
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        result={traceResult}
        error={traceError}
        running={workflowRunning}
      />

      <div
        ref={canvasRef}
        className={`canvas${tool === "pen" || tool === "eraser" ? " canvas-pen" : ""}${tool === "eraser" ? " canvas-eraser" : ""}`}
        onPointerDown={onCanvasPointerDown}
      >
        {entries.length === 0 ? (
          <div className="empty-canvas">
            <div className="empty-orb">
              <span className="material-symbols-outlined" aria-hidden>
                dashboard_customize
              </span>
            </div>
            <h2 className="empty-title">Start building</h2>
            <p className="empty-copy">
              Add your first block from the toolbar above to begin constructing
              your AI thought-stream.
            </p>
          </div>
        ) : null}

        <ConnectionsLayer
          boxes={boxes}
          selectedConnectionId={selectedConnectionId}
          draftFromId={linkFromId}
          draftBranch={linkBranch}
          draftTo={linkCursor}
          onSelectConnection={(id) => {
            setSelectedConnectionId(id);
            clearSelection();
          }}
          onDeleteConnection={(id) => {
            deleteItems([id]);
            setSelectedConnectionId(null);
          }}
        />

        {marquee && marquee.w + marquee.h > 0 ? (
          <div
            className="marquee-rect"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
            }}
          />
        ) : null}

        {entries.map(([id, box]) => {
          if (box.kind === "connection") return null;

          if (box.kind === "stroke") {
            return (
              <div
                key={id}
                className={wrapClass(id, " stroke-wrap")}
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  selectItem(id, event.shiftKey);
                }}
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
                className={wrapClass(id)}
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <AiBlock
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  selected={isSelected(id)}
                  nearbyNoteLabels={nearby.labels}
                  onSelect={(event) => selectItem(id, event.shiftKey)}
                  onClose={() => {
                    deleteItems([id]);
                    applySelection(selectedIds.filter((sid) => sid !== id));
                  }}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onResizeStart={(event) =>
                    startResize(
                      event,
                      id,
                      box.width ?? AI_WIDTH,
                      box.height ?? AI_HEIGHT,
                    )
                  }
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

          if (box.kind === "trigger") {
            return (
              <div
                key={id}
                className={wrapClass(id)}
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <TriggerBlock
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  selected={isSelected(id)}
                  running={workflowRunning}
                  onSelect={(event) => selectItem(id, event.shiftKey)}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onOutputDown={(event) => onOutputDown(event, id)}
                  onRunWorkflow={() => void onRunWorkflow(id)}
                />
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "condition") {
            return (
              <div
                key={id}
                className={wrapClass(id)}
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <ConditionBlock
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  selected={isSelected(id)}
                  onSelect={(event) => selectItem(id, event.shiftKey)}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onInputUp={(event) => onInputUp(event, id)}
                  onTrueDown={(event) => onOutputDown(event, id, "true")}
                  onFalseDown={(event) => onOutputDown(event, id, "false")}
                />
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "transform") {
            return (
              <div
                key={id}
                className={wrapClass(id)}
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <TransformBlock
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  selected={isSelected(id)}
                  onSelect={(event) => selectItem(id, event.shiftKey)}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onOutputDown={(event) => onOutputDown(event, id)}
                  onInputUp={(event) => onInputUp(event, id)}
                />
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "output") {
            return (
              <div
                key={id}
                className={wrapClass(id)}
                style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              >
                <OutputBlock
                  id={id}
                  box={box}
                  dragging={draggingId === id}
                  selected={isSelected(id)}
                  onSelect={(event) => selectItem(id, event.shiftKey)}
                  onDragStart={(event) => startDrag(event, id, box.x, box.y)}
                  onInputUp={(event) => onInputUp(event, id)}
                />
                <CreatorBadge name={box.createdBy} creatorId={box.creatorId} />
              </div>
            );
          }

          if (box.kind === "sticky") {
            const inRange = selectedIds.some(
              (sid) =>
                boxes[sid]?.kind === "ai" &&
                nearbyByAi[sid]?.ids.includes(id),
            );
            return (
              <div
                key={id}
                className={wrapClass(id, inRange ? " note-in-range" : "")}
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
                className={wrapClass(id)}
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
                className={wrapClass(id)}
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
            const inRange = selectedIds.some(
              (sid) =>
                boxes[sid]?.kind === "ai" &&
                nearbyByAi[sid]?.ids.includes(id),
            );
            return (
              <div
                key={id}
                className={wrapClass(id, inRange ? " note-in-range" : "")}
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
              className={`box${draggingId === id ? " box-dragging" : ""}${isSelected(id) ? " item-selected" : ""}`}
              style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              onPointerDown={(event) => {
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

function DockButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`dock-btn${active ? " dock-btn-active" : ""}`}
      title={label}
      onClick={onClick}
    >
      <span className="material-symbols-outlined" aria-hidden>
        {icon}
      </span>
      <span className="dock-label">{label}</span>
    </button>
  );
}
