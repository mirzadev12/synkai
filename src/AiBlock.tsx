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
  onClose: () => void;
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

function modelIcon(model: AiModel) {
  return model === "groq" ? "bolt" : "auto_awesome";
}

function modelLabel(model: AiModel) {
  return model === "groq" ? "Groq" : "Gemini";
}

export function AiBlock({
  id,
  box,
  dragging,
  selected,
  nearbyNoteLabels,
  onSelect,
  onClose,
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
  const [comingSoon, setComingSoon] = useState<string | null>(null);

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
      className={`box ai-block ai-chat${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
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

      <div className="ai-chat-header" onPointerDown={onDragStart}>
        <span className="material-symbols-outlined ai-chat-logo" aria-hidden>
          {modelIcon(model)}
        </span>
        <select
          className="ai-model"
          value={model}
          aria-label="Model"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "claude" || value === "midjourney") {
              setComingSoon(value === "claude" ? "Claude" : "Midjourney");
              return;
            }
            updateAi({ model: value as AiModel });
          }}
        >
          <option value="gemini">Gemini</option>
          <option value="groq">Groq</option>
          <option value="claude">Claude</option>
          <option value="midjourney">Midjourney</option>
        </select>
        <button
          type="button"
          className="ai-chat-close"
          title="Deselect"
          aria-label="Close chat"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden>
            close
          </span>
        </button>
      </div>

      <div className="ai-chat-messages">
        <div className="ai-context-hint">
          {spatialLabel ? <div>{spatialLabel}</div> : null}
          <div>{memoryLabel}</div>
        </div>
        {prompt.trim() ? (
          <div className="ai-bubble ai-bubble-user">{prompt}</div>
        ) : (
          <p className="ai-chat-empty">Ask {modelLabel(model)} anything…</p>
        )}
        {running ? (
          <div className="ai-bubble ai-bubble-ai ai-bubble-pending">
            Thinking…
          </div>
        ) : null}
        {!running && output ? (
          <div
            className={`ai-bubble ai-bubble-ai${box.status === "error" ? " ai-bubble-error" : ""}`}
          >
            {output}
          </div>
        ) : null}
        {answeredBy && !running ? (
          <div className="ai-answered">Answered by {answeredBy}</div>
        ) : null}
      </div>

      <form
        className="ai-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void onRun();
        }}
      >
        <input
          className="ai-prompt"
          type="text"
          placeholder="Message…"
          value={prompt}
          onChange={(event) => updateAi({ prompt: event.target.value })}
        />
        <button
          type="submit"
          className="ai-run"
          disabled={running}
        >
          {running ? "…" : "Send"}
        </button>
      </form>

      {comingSoon ? (
        <div
          className="coming-soon-pop"
          role="dialog"
          aria-label={`${comingSoon} coming soon`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p>
            <strong>{comingSoon}</strong> is coming soon on this canvas.
          </p>
          <button
            type="button"
            className="ai-run"
            onClick={() => setComingSoon(null)}
          >
            OK
          </button>
        </div>
      ) : null}
    </div>
  );
}
