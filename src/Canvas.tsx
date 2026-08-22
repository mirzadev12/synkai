import { LiveObject } from "@liveblocks/client";
import {
  useMutation,
  useOthers,
  useStorage,
} from "@liveblocks/react/suspense";
import { useEffect, useRef, useState } from "react";
import { AiBlock } from "./AiBlock";
import "./liveblocks.config";

const BOX_WIDTH = 160;
const BOX_HEIGHT = 88;
const AI_WIDTH = 280;
const AI_HEIGHT = 260;

export function Canvas() {
  const boxes = useStorage((root) => root.boxes);
  const others = useOthers();
  const peopleHere = others.length + 1;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

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

  const moveBox = useMutation(
    ({ storage }, id: string, x: number, y: number) => {
      storage.get("boxes").get(id)?.update({ x, y });
    },
    [],
  );

  useEffect(() => {
    if (!draggingId) return;
    const id = draggingId;
    const item = boxes[id];
    const width = item?.kind === "ai" ? AI_WIDTH : BOX_WIDTH;
    const height = item?.kind === "ai" ? AI_HEIGHT : BOX_HEIGHT;

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

  // Liveblocks Storage snapshots LiveMap as a plain object, not a JS Map.
  const entries = Object.entries(boxes);

  function startDrag(
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
    x: number,
    y: number,
  ) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left - x,
      y: event.clientY - rect.top - y,
    };
    setDraggingId(id);
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <strong>Live canvas</strong>
          <span className="presence">
            {peopleHere === 1
              ? "1 person here — open another tab to test live sync"
              : `${peopleHere} people here`}
          </span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="add-btn" onClick={() => addBox()}>
            Add box
          </button>
          <button type="button" className="add-btn" onClick={() => addAiBlock()}>
            Add AI Block
          </button>
        </div>
      </header>

      <div ref={canvasRef} className="canvas">
        {entries.map(([id, box]) =>
          box.kind === "ai" ? (
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
          ) : (
            <div
              key={id}
              className={`box${draggingId === id ? " box-dragging" : ""}`}
              style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
              onPointerDown={(event) => startDrag(event, id, box.x, box.y)}
            >
              {box.text}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
