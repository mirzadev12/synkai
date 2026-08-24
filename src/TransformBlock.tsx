import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData, TransformOp } from "./liveblocks.config";

type TransformBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onOutputDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onInputUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export function TransformBlock({
  id,
  box,
  dragging,
  selected,
  onSelect,
  onDragStart,
  onOutputDown,
  onInputUp,
}: TransformBlockProps) {
  const operation: TransformOp = box.transformOp ?? "uppercase";
  const update = useMutation(
    (
      { storage },
      patch: Partial<
        Pick<
          BoxData,
          "transformOp" | "transformN" | "transformTemplate" | "output"
        >
      >,
    ) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  return (
    <div
      className={`box wf-block${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
      onPointerDown={() => onSelect()}
    >
      <button
        type="button"
        className="port port-in"
        title="Input"
        aria-label="Input connector"
        onPointerUp={onInputUp}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        className="port port-out"
        title="Output — drag to the next node"
        aria-label="Output connector"
        onPointerDown={onOutputDown}
      />
      <div className="ai-block-handle" onPointerDown={onDragStart}>
        Transform
      </div>
      <select
        className="ai-model"
        value={operation}
        onChange={(event) =>
          update({ transformOp: event.target.value as TransformOp })
        }
      >
        <option value="uppercase">Uppercase</option>
        <option value="extract_n">Extract first N words</option>
        <option value="template">Template</option>
      </select>
      {operation === "extract_n" ? (
        <input
          className="ai-prompt"
          type="number"
          min={1}
          placeholder="N words"
          value={box.transformN ?? 8}
          onChange={(event) =>
            update({ transformN: Number.parseInt(event.target.value, 10) || 8 })
          }
        />
      ) : null}
      {operation === "template" ? (
        <input
          className="ai-prompt"
          type="text"
          placeholder="Template with {{input}}"
          value={box.transformTemplate ?? "Summary: {{input}}"}
          onChange={(event) =>
            update({ transformTemplate: event.target.value })
          }
        />
      ) : null}
      <div className="ai-output">{box.output ?? ""}</div>
    </div>
  );
}
