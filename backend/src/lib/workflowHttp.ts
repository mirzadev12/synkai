import * as workflowEngine from "./workflowEngine.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parsePath(pathname: string): {
  kind:
    | "create"
    | "get"
    | "nodes"
    | "edges"
    | "run"
    | "getRun"
    | "unknown";
  id?: string;
  runId?: string;
} {
  const clean = pathname.split("?")[0] ?? pathname;
  if (clean === "/api/workflows" || clean === "/api/workflows/") {
    return { kind: "create" };
  }
  const runMatch = /^\/api\/workflows\/([^/]+)\/runs\/([^/]+)\/?$/.exec(clean);
  if (runMatch) {
    return { kind: "getRun", id: decodeURIComponent(runMatch[1] ?? ""), runId: decodeURIComponent(runMatch[2] ?? "") };
  }
  const nested = /^\/api\/workflows\/([^/]+)\/(nodes|edges|run)\/?$/.exec(clean);
  if (nested) {
    const id = decodeURIComponent(nested[1] ?? "");
    const action = nested[2];
    if (action === "nodes") return { kind: "nodes", id };
    if (action === "edges") return { kind: "edges", id };
    return { kind: "run", id };
  }
  const getMatch = /^\/api\/workflows\/([^/]+)\/?$/.exec(clean);
  if (getMatch) {
    return { kind: "get", id: decodeURIComponent(getMatch[1] ?? "") };
  }
  return { kind: "unknown" };
}

export async function dispatchWorkflowApi(
  method: string,
  pathname: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const parsed = parsePath(pathname);
  const record = asRecord(body);

  try {
    if (parsed.kind === "create" && method === "POST") {
      const workspaceId = record.workspaceId;
      const name = record.name;
      if (typeof workspaceId !== "string" || typeof name !== "string" || !name.trim()) {
        return { status: 400, json: { error: "workspaceId and name required" } };
      }
      const created = await workflowEngine.createWorkflow(workspaceId, name.trim());
      return { status: 201, json: created };
    }

    if (parsed.kind === "get" && parsed.id && method === "GET") {
      const graph = await workflowEngine.getWorkflow(parsed.id);
      return { status: 200, json: graph };
    }

    if (parsed.kind === "nodes" && parsed.id && method === "POST") {
      const nodeType = record.nodeType;
      if (typeof nodeType !== "string") {
        return { status: 400, json: { error: "nodeType required" } };
      }
      const config = asRecord(record.config);
      const pos = asRecord(record.canvasPosition);
      const canvasPosition =
        typeof pos.x === "number" && typeof pos.y === "number"
          ? { x: pos.x, y: pos.y }
          : null;
      const created = await workflowEngine.addWorkflowNode(
        parsed.id,
        nodeType,
        config,
        canvasPosition,
      );
      return { status: 201, json: created };
    }

    if (parsed.kind === "edges" && parsed.id && method === "POST") {
      const fromNodeId = record.fromNodeId;
      const toNodeId = record.toNodeId;
      if (typeof fromNodeId !== "string" || typeof toNodeId !== "string") {
        return { status: 400, json: { error: "fromNodeId and toNodeId required" } };
      }
      const branch = typeof record.branch === "string" ? record.branch : "default";
      const created = await workflowEngine.addWorkflowEdge(
        parsed.id,
        fromNodeId,
        toNodeId,
        branch,
      );
      return { status: 201, json: created };
    }

    if (parsed.kind === "run" && parsed.id && method === "POST") {
      const triggerInput =
        typeof record.triggerInput === "string" ? record.triggerInput : "";
      const result = await workflowEngine.runWorkflow(parsed.id, triggerInput);
      return { status: 200, json: result };
    }

    if (parsed.kind === "getRun" && parsed.id && parsed.runId && method === "GET") {
      const result = await workflowEngine.getWorkflowRun(parsed.id, parsed.runId);
      return { status: 200, json: result };
    }

    if (parsed.kind === "unknown") {
      return { status: 404, json: { error: "Not found" } };
    }
    return { status: 405, json: { error: "Method not allowed" } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return { status: 500, json: { error: message } };
  }
}

export function isWorkflowApiPath(url: string): boolean {
  return url.split("?")[0]?.startsWith("/api/workflows") ?? false;
}
