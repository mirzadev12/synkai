import type { WorkflowRunResult } from "./workflowApi";

type WorkflowTracePanelProps = {
  open: boolean;
  onClose: () => void;
  result: WorkflowRunResult | null;
  error: string | null;
  running: boolean;
};

function preview(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function WorkflowTracePanel({
  open,
  onClose,
  result,
  error,
  running,
}: WorkflowTracePanelProps) {
  if (!open) return null;

  return (
    <aside className="team-memory-panel workflow-trace-panel" aria-label="Run trace">
      <div className="team-memory-header">
        <strong>Run trace</strong>
        <button type="button" className="team-memory-close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="team-memory-sub">
        Step-by-step execution for the last workflow run.
      </p>
      {running ? <p className="team-memory-status">Running…</p> : null}
      {error ? <p className="team-memory-error">{error}</p> : null}
      {!running && !error && !result ? (
        <p className="team-memory-status">
          Save as Workflow, then click Run Workflow on a Trigger.
        </p>
      ) : null}
      {result ? (
        <>
          <p className="team-memory-status">
            Status: {result.status}
            {result.runId ? ` · ${result.runId.slice(0, 8)}` : ""}
          </p>
          <ul className="team-memory-list">
            {result.steps.map((step, index) => (
              <li key={`${step.nodeId}-${index}`} className="team-memory-item">
                <div className="team-memory-meta">
                  <span className="team-memory-type">{step.nodeType}</span>
                  <span
                    className={`team-memory-model${step.status === "failed" ? " trace-failed" : ""}`}
                  >
                    {step.status}
                  </span>
                </div>
                <p className="team-memory-preview">
                  <strong>In:</strong> {preview(step.input) || "(empty)"}
                </p>
                <p className="team-memory-preview">
                  <strong>Out:</strong> {preview(step.output) || "(empty)"}
                </p>
                {step.errorMessage ? (
                  <p className="team-memory-error">{step.errorMessage}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
