import { useMutation } from "@liveblocks/react/suspense";
import { memo, useEffect, useRef, useState } from "react";
import {
  AI_HEIGHT,
  AI_WIDTH,
  type AiModel,
  type BoxData,
} from "./liveblocks.config";
import { requestAi } from "./runAiClient";
import { useWorkspace } from "./WorkspaceContext";

type AiBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  nearbyNoteLabels: string[];
  onSelect: (event: React.PointerEvent) => void;
  onClose: () => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
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

async function fetchWorkspaceMemory(workspaceId: string): Promise<{
  formatted: string;
  count: number;
}> {
  try {
    const response = await fetch(
      `/api/memory/${encodeURIComponent(workspaceId)}?limit=15`,
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
  workspaceId: string;
  blockId: string;
  model: AiModel;
  prompt: string;
  content: string;
}): Promise<void> {
  try {
    await fetch(`/api/memory/${encodeURIComponent(args.workspaceId)}`, {
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

/** Visual-only: hide connector-injected source blocks from the user bubble. */
function visibleUserMessage(prompt: string): string {
  const stripped = prompt
    .replace(/<<<SRC:[^>]+>>>[\s\S]*?<<<END:[^>]+>>>/g, "")
    .trim();
  return stripped;
}

export const AiBlock = memo(AiBlockInner);

function AiBlockInner({
  id,
  box,
  dragging,
  selected,
  nearbyNoteLabels,
  onSelect,
  onClose,
  onDragStart,
  onResizeStart,
  onOutputDown,
  onInputUp,
  onPropagateOutput,
  buildPrompt,
  onMemoryLogged,
}: AiBlockProps) {
  const { workspaceId } = useWorkspace();
  const model: AiModel = box.model === "groq" ? "groq" : "gemini";
  const prompt = box.prompt ?? "";
  const output = box.output ?? "";
  const answeredBy = box.answeredBy ?? "";
  const running = box.status === "running";
  const [memoryCount, setMemoryCount] = useState(0);
  const memoryCache = useRef({ formatted: "", count: 0 });
  const messagesRef = useRef<HTMLDivElement>(null);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [modelSelectKey, setModelSelectKey] = useState(0);
  const userMessage = visibleUserMessage(prompt);

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
    void fetchWorkspaceMemory(workspaceId).then((mem) => {
      if (!cancelled) {
        memoryCache.current = mem;
        setMemoryCount(mem.count);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [userMessage, output, running]);

  async function onRun() {
    if (running) return;
    updateAi({ status: "running", output: "", answeredBy: "" });
    try {
      const spatialPrompt = buildPrompt(prompt);
      const cached = memoryCache.current;
      const memoryPromise = fetchWorkspaceMemory(workspaceId).then((mem) => {
        memoryCache.current = mem;
        setMemoryCount(mem.count);
        return mem;
      });
      const memory =
        cached.formatted || cached.count
          ? cached
          : await memoryPromise;
      void memoryPromise;
      const finalPrompt = memory.formatted
        ? `Team memory (recent workspace events):\n${memory.formatted}\n\n${spatialPrompt}`
        : spatialPrompt;

      const { text, answeredBy } = await requestAi(finalPrompt, model);
      updateAi({ output: text, answeredBy, status: "idle" });
      onPropagateOutput(text);
      void logAiOutput({
        workspaceId,
        blockId: id,
        model,
        prompt,
        content: text,
      }).then(() => {
        setMemoryCount((n) => n + 1);
        onMemoryLogged?.();
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed";
      updateAi({ output: message, answeredBy: "", status: "error" });
    }
  }

  const width = box.width ?? AI_WIDTH;
  const height = box.height ?? AI_HEIGHT;
  const agentStatus = running
    ? "Thinking"
    : box.status === "error"
      ? "Needs a retry"
      : "Ready";

  return (
    <div
      className={`box ai-block ai-chat${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
      style={{ width, height }}
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
      <button
        type="button"
        className="port port-out"
        title="Output — drag to another AI Block"
        aria-label="Output connector"
        onPointerDown={onOutputDown}
      />

      <div className="ai-chat-header">
        <div className="ai-chat-header-drag" onPointerDown={onDragStart}>
          <span className="ai-agent-avatar" aria-hidden>
            <span className="material-symbols-outlined">{modelIcon(model)}</span>
          </span>
          <div className="ai-agent-meta">
            <strong className="ai-agent-name">Agent</strong>
            <span className={`ai-agent-status${running ? " is-busy" : ""}`}>
              {agentStatus}
            </span>
          </div>
        </div>
        <select
          key={`${model}-${modelSelectKey}`}
          className="ai-model"
          value={model}
          aria-label="Model"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "claude" || value === "midjourney") {
              setComingSoon(value === "claude" ? "Claude" : "Midjourney");
              // Remount so the controlled value stays Gemini/Groq.
              // Leaving the native select on "claude" crashes when switching back.
              setModelSelectKey((key) => key + 1);
              return;
            }
            setComingSoon(null);
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
          title="Remove this AI Block"
          aria-label="Close and remove AI Block"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden>
            close
          </span>
        </button>
      </div>

      <div className="ai-chat-messages" ref={messagesRef}>
        <div className="ai-context-hint">
          {nearbyNoteLabels.length > 0
            ? `Notices nearby: ${nearbyNoteLabels.join(", ")}`
            : "Listening to nearby notes and team memory"}
          {memoryCount > 0 ? ` · ${memoryCount} memories` : ""}
        </div>
        {!userMessage && !output && !running ? (
          <div className="ai-chat-empty">
            <p className="ai-chat-empty-title">
              How can I help you today?
            </p>
            <p>
              I’m your {modelLabel(model)} agent on this canvas. Type below —
              nearby notes and team memory ride along.
            </p>
          </div>
        ) : null}
        {userMessage ? (
          <div className="ai-turn ai-turn-user">
            <span className="ai-turn-label">You</span>
            <div className="ai-bubble ai-bubble-user">{userMessage}</div>
          </div>
        ) : null}
        {running ? (
          <div className="ai-turn ai-turn-ai">
            <span className="ai-turn-label">{modelLabel(model)}</span>
            <div className="ai-bubble ai-bubble-ai ai-bubble-pending">
              <span className="ai-thinking" aria-label="Thinking">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}
        {!running && output ? (
          <div className="ai-turn ai-turn-ai">
            <span className="ai-turn-label">
              {answeredBy || modelLabel(model)}
            </span>
            <div
              className={`ai-bubble ai-bubble-ai${box.status === "error" ? " ai-bubble-error" : ""}`}
            >
              {output}
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="ai-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void onRun();
        }}
      >
        <textarea
          className="ai-prompt"
          rows={1}
          placeholder={`Message ${modelLabel(model)}…`}
          value={prompt}
          onChange={(event) => updateAi({ prompt: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onRun();
            }
          }}
        />
        <button
          type="submit"
          className="ai-run"
          disabled={running}
        >
          {running ? "…" : "Send"}
        </button>
      </form>

      <div
        className="resize-handle"
        onPointerDown={onResizeStart}
      />

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
            onClick={() => {
              setComingSoon(null);
              setModelSelectKey((key) => key + 1);
            }}
          >
            OK
          </button>
        </div>
      ) : null}
    </div>
  );
}
