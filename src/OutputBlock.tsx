import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData, OutputMode } from "./liveblocks.config";

type OutputBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  onSelect: (event: React.PointerEvent) => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onInputUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export function OutputBlock({
  id,
  box,
  dragging,
  selected,
  onSelect,
  onDragStart,
  onInputUp,
}: OutputBlockProps) {
  const mode: OutputMode =
    box.outputMode === "webhook" ? "webhook" : "log_to_memory";
  const update = useMutation(
    (
      { storage },
      patch: Partial<Pick<BoxData, "outputMode" | "webhookUrl" | "output">>,
    ) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  return (
    <div
      className={`box wf-block${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
      onPointerDown={(event) => onSelect(event)}
    >
      <button
        type="button"
        className="port port-in"
        title="Input"
        aria-label="Input connector"
        onPointerUp={onInputUp}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <div className="ai-block-handle" onPointerDown={onDragStart}>
        Output
      </div>
      <select
        className="ai-model"
        value={mode}
        onChange={(event) =>
          update({ outputMode: event.target.value as OutputMode })
        }
      >
        <option value="log_to_memory">Log to Memory</option>
        <option value="webhook">Webhook</option>
      </select>
      {mode === "webhook" ? (
        <input
          className="ai-prompt"
          type="url"
          placeholder="https://hooks.slack.com/..."
          value={box.webhookUrl ?? ""}
          onChange={(event) => update({ webhookUrl: event.target.value })}
        />
      ) : null}
      <div className="ai-output">{box.output ?? ""}</div>
    </div>
  );
}
