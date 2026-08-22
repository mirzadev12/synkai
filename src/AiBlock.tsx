import { useMutation } from "@liveblocks/react/suspense";
import type { AiModel, BoxData } from "./liveblocks.config";

type AiBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  nearbyNoteLabels: string[];
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onOutputDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onInputUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPropagateOutput: (output: string) => void;
  buildPrompt: (userPrompt: string) => string;
};

export function AiBlock({
  id,
  box,
  dragging,
  selected,
  nearbyNoteLabels,
  onSelect,
  onDragStart,
  onOutputDown,
  onInputUp,
  onPropagateOutput,
  buildPrompt,
}: AiBlockProps) {
  const model: AiModel = box.model === "groq" ? "groq" : "gemini";
  const prompt = box.prompt ?? "";
  const output = box.output ?? "";
  const answeredBy = box.answeredBy ?? "";
  const running = box.status === "running";

  const updateAi = useMutation(
    (
      { storage },
      patch: Partial<
        Pick<BoxData, "model" | "prompt" | "output" | "answeredBy" | "status">
      >,
    ) => {
      storage.get("boxes").get(id)?.update(patch);
    },
    [id],
  );

  async function onRun() {
    if (running) return;
    const finalPrompt = buildPrompt(prompt);
    updateAi({ status: "running", output: "", answeredBy: "" });
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt, model }),
      });
      const payload: unknown = await response.json();
      const record =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      if (!response.ok) {
        const message =
          typeof record.error === "string" ? record.error : "Request failed";
        throw new Error(message);
      }
      const text = typeof record.text === "string" ? record.text : "";
      const by =
        record.answeredBy === "Groq" || record.answeredBy === "Gemini"
          ? record.answeredBy
          : model === "groq"
            ? "Groq"
            : "Gemini";
      updateAi({ output: text, answeredBy: by, status: "idle" });
      onPropagateOutput(text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed";
      updateAi({ output: message, answeredBy: "", status: "error" });
    }
  }

  return (
    <div
      className={`box ai-block${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
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
        title="Output — drag to another AI Block"
        aria-label="Output connector"
        onPointerDown={onOutputDown}
      />

      <div className="ai-block-handle" onPointerDown={onDragStart}>
        AI Block
      </div>
      <select
        className="ai-model"
        value={model}
        onChange={(event) =>
          updateAi({ model: event.target.value as AiModel })
        }
      >
        <option value="gemini">Gemini</option>
        <option value="groq">Groq</option>
      </select>
      <input
        className="ai-prompt"
        type="text"
        placeholder="Type a prompt"
        value={prompt}
        onChange={(event) => updateAi({ prompt: event.target.value })}
      />
      {nearbyNoteLabels.length > 0 ? (
        <div className="ai-context-hint">
          Nearby context: {nearbyNoteLabels.join(", ")}
        </div>
      ) : null}
      <button
        type="button"
        className="ai-run"
        disabled={running}
        onClick={() => void onRun()}
      >
        {running ? "Running…" : "Run"}
      </button>
      <div className="ai-output">{output}</div>
      {answeredBy ? (
        <div className="ai-answered">Answered by {answeredBy}</div>
      ) : null}
    </div>
  );
}
