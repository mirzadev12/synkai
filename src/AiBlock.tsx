import { useMutation } from "@liveblocks/react/suspense";
import { useEffect, useState } from "react";
import type { AiModel, BoxData } from "./liveblocks.config";
import { WORKSPACE_ID } from "./workspaceId";

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
  onMemoryLogged?: () => void;
};

type MemoryResponse = {
  events?: unknown[];
  formatted?: string;
  count?: number;
};

async function fetchWorkspaceMemory(): Promise<{
  formatted: string;
  count: number;
}> {
  try {
    const response = await fetch(
      `/api/memory/${encodeURIComponent(WORKSPACE_ID)}?limit=15`,
    );
    if (!response.ok) return { formatted: "", count: 0 };
    const payload = (await response.json()) as MemoryResponse;
    const count =
      typeof payload.count === "number"
        ? payload.count
        : Array.isArray(payload.events)
          ? payload.events.length
          : 0;
    return {
      formatted:
        typeof payload.formatted === "string" ? payload.formatted : "",
      count,
    };
  } catch {
    return { formatted: "", count: 0 };
  }
}

async function logAiOutput(args: {
  blockId: string;
  model: AiModel;
  prompt: string;
  content: string;
}): Promise<void> {
  try {
    await fetch(`/api/memory/${encodeURIComponent(WORKSPACE_ID)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "ai_output",
        blockId: args.blockId,
        modelProvider: args.model,
        prompt: args.prompt,
        content: args.content,
      }),
    });
  } catch {
    // Memory logging is best-effort; don't fail the Run UX.
  }
}

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
  onMemoryLogged,
}: AiBlockProps) {
  const model: AiModel = box.model === "groq" ? "groq" : "gemini";
  const prompt = box.prompt ?? "";
  const output = box.output ?? "";
  const answeredBy = box.answeredBy ?? "";
  const running = box.status === "running";
  const [memoryCount, setMemoryCount] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceMemory().then((mem) => {
      if (!cancelled) setMemoryCount(mem.count);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onRun() {
    if (running) return;
    updateAi({ status: "running", output: "", answeredBy: "" });
    try {
      const spatialPrompt = buildPrompt(prompt);
      const memory = await fetchWorkspaceMemory();
      setMemoryCount(memory.count);
      const finalPrompt = memory.formatted
        ? `Team memory (recent workspace events):\n${memory.formatted}\n\n${spatialPrompt}`
        : spatialPrompt;

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
      await logAiOutput({
        blockId: id,
        model,
        prompt,
        content: text,
      });
      setMemoryCount((n) => n + 1);
      onMemoryLogged?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed";
      updateAi({ output: message, answeredBy: "", status: "error" });
    }
  }

  const spatialLabel =
    nearbyNoteLabels.length > 0
      ? `Nearby: ${nearbyNoteLabels.join(", ")}`
      : null;
  const memoryLabel = `Team memory: ${memoryCount} event${memoryCount === 1 ? "" : "s"}`;

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
      <div className="ai-context-hint">
        {spatialLabel ? <div>{spatialLabel}</div> : null}
        <div>{memoryLabel}</div>
      </div>
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
