import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData } from "./liveblocks.config";

const SHAPE_COLORS = ["#1c1917", "#dc2626", "#2563eb", "#16a34a", "#ca8a04"] as const;

type ShapeItemProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export function ShapeItem({
  id,
  box,
  dragging,
  onDragStart,
  onResizeStart,
}: ShapeItemProps) {
  const width = box.width ?? 140;
  const height = box.height ?? 100;
  const color = box.color ?? SHAPE_COLORS[0];
  const isEllipse = box.shapeType === "ellipse";

  const update = useMutation(
    ({ storage }, patch: Partial<Pick<BoxData, "color">>) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  return (
    <div
      className={`canvas-item shape-item${dragging ? " box-dragging" : ""}`}
      style={{ width, height }}
    >
      <div className="item-handle" onPointerDown={onDragStart}>
        {isEllipse ? "Circle" : "Rectangle"}
      </div>
      <div className="color-row">
        {SHAPE_COLORS.map((c) => (
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
      <div
        className={`shape-body${isEllipse ? " shape-ellipse" : ""}`}
        style={{ background: color }}
      />
      <div className="resize-handle" onPointerDown={onResizeStart} />
    </div>
  );
}
