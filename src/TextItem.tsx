import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData } from "./liveblocks.config";

const FONT_SIZES = [16, 24, 32] as const;

type TextItemProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export function TextItem({
  id,
  box,
  dragging,
  onDragStart,
  onResizeStart,
}: TextItemProps) {
  const width = box.width ?? 200;
  const height = box.height ?? 80;
  const fontSize = box.fontSize ?? 24;
  const text = box.text ?? "";

  const update = useMutation(
    (
      { storage },
      patch: Partial<Pick<BoxData, "text" | "fontSize">>,
    ) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  return (
    <div
      className={`canvas-item text-item${dragging ? " box-dragging" : ""}`}
      style={{ width, height }}
    >
      <div className="item-handle" onPointerDown={onDragStart}>
        Text
      </div>
      <div className="font-row">
        {FONT_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={`font-btn${fontSize === size ? " active" : ""}`}
            onClick={() => update({ fontSize: size })}
          >
            {size}
          </button>
        ))}
      </div>
      <textarea
        className="text-box-input"
        style={{ fontSize }}
        value={text}
        placeholder="Label or heading"
        onChange={(event) => update({ text: event.target.value })}
      />
      <div className="resize-handle" onPointerDown={onResizeStart} />
    </div>
  );
}
