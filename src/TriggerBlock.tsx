import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData, TriggerMode } from "./liveblocks.config";

type TriggerBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  running: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onOutputDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onRunWorkflow: () => void;
};

export function TriggerBlock({
  id,
  box,
  dragging,
  selected,
  running,
  onSelect,
  onDragStart,
  onOutputDown,
  onRunWorkflow,
}: TriggerBlockProps) {
  const mode: TriggerMode =
    box.triggerMode === "on_memory_event" ? "on_memory_event" : "manual";
  const update = useMutation(
    (
      { storage },
      patch: Partial<
        Pick<BoxData, "triggerMode" | "memoryFilter" | "triggerInput">
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
        className="port port-out"
        title="Output — drag to the next node"
        aria-label="Output connector"
        onPointerDown={onOutputDown}
      />
      <div className="ai-block-handle" onPointerDown={onDragStart}>
        Trigger
      </div>
      <select
        className="ai-model"
        value={mode}
        onChange={(event) =>
          update({ triggerMode: event.target.value as TriggerMode })
        }
      >
        <option value="manual">Manual</option>
        <option value="on_memory_event">On Memory Event</option>
      </select>
      {mode === "on_memory_event" ? (
        <input
          className="ai-prompt"
          type="text"
          placeholder="Event type filter (e.g. brief)"
          value={box.memoryFilter ?? "brief"}
          onChange={(event) => update({ memoryFilter: event.target.value })}
        />
      ) : (
        <>
          <input
            className="ai-prompt"
            type="text"
            placeholder="Brief / trigger input"
            value={box.triggerInput ?? ""}
            onChange={(event) => update({ triggerInput: event.target.value })}
          />
          <button
            type="button"
            className="ai-run"
            disabled={running}
            onClick={() => onRunWorkflow()}
          >
            {running ? "Running…" : "Run Workflow"}
          </button>
        </>
      )}
      <div className="ai-output">{box.output ?? ""}</div>
    </div>
  );
}
