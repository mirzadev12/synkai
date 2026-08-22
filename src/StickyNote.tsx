import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData } from "./liveblocks.config";

const STICKY_COLORS = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bfdbfe"] as const;

type StickyNoteProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export function StickyNote({
  id,
  box,
  dragging,
  onDragStart,
  onResizeStart,
}: StickyNoteProps) {
  const width = box.width ?? 180;
  const height = box.height ?? 160;
  const color = box.color ?? STICKY_COLORS[0];
  const text = box.text ?? "";

  const update = useMutation(
    (
      { storage },
      patch: Partial<Pick<BoxData, "text" | "color">>,
    ) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  return (
    <div
      className={`canvas-item sticky-note${dragging ? " box-dragging" : ""}`}
      style={{ width, height, background: color }}
    >
      <div className="item-handle" onPointerDown={onDragStart}>
        Sticky
      </div>
      <div className="color-row">
        {STICKY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch${color === c ? " active" : ""}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => update({ color: c })}
          />
        ))}
      </div>
      <textarea
        className="sticky-text"
        value={text}
        placeholder="Write a note…"
        onChange={(event) => update({ text: event.target.value })}
      />
      <div className="resize-handle" onPointerDown={onResizeStart} />
    </div>
  );
}
