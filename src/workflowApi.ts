export type WorkflowStepTrace = {
  nodeId: string;
  nodeType: string;
  input: string;
  output: string;
  status: "success" | "failed";
  errorMessage: string | null;
  canvasId: string | null;
};

export type WorkflowRunResult = {
  runId: string;
  workflowId: string;
  status: "completed" | "failed";
  triggerInput: string;
  steps: WorkflowStepTrace[];
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json();
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

export async function saveWorkflowGraph(args: {
  workspaceId: string;
  name: string;
  nodes: {
    canvasId: string;
    nodeType: string;
    config: Record<string, unknown>;
    canvasPosition: { x: number; y: number };
  }[];
  edges: {
    fromCanvasId: string;
    toCanvasId: string;
    branch: string;
  }[];
}): Promise<string> {
  const createdRes = await fetch("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: args.workspaceId, name: args.name }),
  });
  const created = await readJson(createdRes);
  if (!createdRes.ok || typeof created.id !== "string") {
    throw new Error(
      typeof created.error === "string" ? created.error : "Save workflow failed",
    );
  }
  const workflowId = created.id;
  const idMap = new Map<string, string>();

  for (const node of args.nodes) {
    const res = await fetch(
      `/api/workflows/${encodeURIComponent(workflowId)}/nodes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: node.nodeType,
          config: node.config,
          canvasPosition: node.canvasPosition,
        }),
      },
    );
    const payload = await readJson(res);
    if (!res.ok || typeof payload.id !== "string") {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "Add node failed",
      );
    }
    idMap.set(node.canvasId, payload.id);
  }

  for (const edge of args.edges) {
    const fromNodeId = idMap.get(edge.fromCanvasId);
    const toNodeId = idMap.get(edge.toCanvasId);
    if (!fromNodeId || !toNodeId) continue;
    const res = await fetch(
      `/api/workflows/${encodeURIComponent(workflowId)}/edges`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromNodeId,
          toNodeId,
          branch: edge.branch,
        }),
      },
    );
    if (!res.ok) {
      const payload = await readJson(res);
      throw new Error(
        typeof payload.error === "string" ? payload.error : "Add edge failed",
      );
    }
  }

  return workflowId;
}

export async function runSavedWorkflow(
  workflowId: string,
  triggerInput: string,
): Promise<WorkflowRunResult> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerInput }),
    },
  );
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Run failed",
    );
  }
  return payload as unknown as WorkflowRunResult;
}
