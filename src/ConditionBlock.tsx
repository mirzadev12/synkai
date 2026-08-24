import { useMutation } from "@liveblocks/react/suspense";
import type { BoxData, ConditionRule } from "./liveblocks.config";

type ConditionBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onInputUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTrueDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onFalseDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export function ConditionBlock({
  id,
  box,
  dragging,
  selected,
  onSelect,
  onDragStart,
  onInputUp,
  onTrueDown,
  onFalseDown,
}: ConditionBlockProps) {
  const rule: ConditionRule = box.conditionRule ?? "contains";
  const update = useMutation(
    (
      { storage },
      patch: Partial<
        Pick<BoxData, "conditionField" | "conditionRule" | "conditionValue">
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
        className="port port-out port-out-true"
        title="True — drag to next node"
        aria-label="True output"
        onPointerDown={onTrueDown}
      >
        T
      </button>
      <button
        type="button"
        className="port port-out port-out-false"
        title="False — drag to next node"
        aria-label="False output"
        onPointerDown={onFalseDown}
      >
        F
      </button>
      <div className="ai-block-handle" onPointerDown={onDragStart}>
        Condition
      </div>
      <select
        className="ai-model"
        value={box.conditionField ?? "output"}
        onChange={() => update({ conditionField: "output" })}
      >
        <option value="output">Incoming output</option>
      </select>
      <select
        className="ai-model"
        value={rule}
        onChange={(event) =>
          update({ conditionRule: event.target.value as ConditionRule })
        }
      >
        <option value="contains">contains</option>
        <option value="equals">equals</option>
        <option value="length_gt">length &gt;</option>
        <option value="length_lt">length &lt;</option>
      </select>
      <input
        className="ai-prompt"
        type="text"
        placeholder="Comparison value"
        value={box.conditionValue ?? ""}
        onChange={(event) => update({ conditionValue: event.target.value })}
      />
      <div className="wf-branch-hint">True / False ports on the right</div>
    </div>
  );
}
