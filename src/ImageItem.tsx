import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData } from "./liveblocks.config";

type ImageItemProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export function ImageItem({
  id,
  box,
  dragging,
  onDragStart,
  onResizeStart,
}: ImageItemProps) {
  const width = box.width ?? 220;
  const height = box.height ?? 160;
  const src = box.src ?? "";

  const update = useMutation(
    ({ storage }, patch: Partial<Pick<BoxData, "src">>) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        update({ src: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      className={`canvas-item image-item${dragging ? " box-dragging" : ""}`}
      style={{ width, height }}
    >
      <div className="item-handle" onPointerDown={onDragStart}>
        Image
      </div>
      {src ? (
        <img className="image-preview" src={src} alt="" draggable={false} />
      ) : (
        <label className="image-upload">
          Upload image
          <input type="file" accept="image/*" onChange={onFile} hidden />
        </label>
      )}
      <div className="resize-handle" onPointerDown={onResizeStart} />
    </div>
  );
}
