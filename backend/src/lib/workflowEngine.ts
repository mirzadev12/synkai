import * as memoryService from "./memoryService.js";
import { getSupabase } from "./supabase.js";

export type WorkflowNodeType =
  | "trigger"
  | "ai_agent"
  | "condition"
  | "transform"
  | "output";

export type WorkflowBranch = "default" | "true" | "false";

export type WorkflowNodeRow = {
  id: string;
  workflow_id: string;
  node_type: string;
  config: Record<string, unknown>;
  canvas_position: { x?: number; y?: number } | null;
};

export type WorkflowEdgeRow = {
  id: string;
  workflow_id: string;
  from_node_id: string;
  to_node_id: string;
  branch: string | null;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function canvasIdFromConfig(config: Record<string, unknown>): string | null {
  const id = config.canvasId;
  return typeof id === "string" && id ? id : null;
}

function parsePosition(raw: unknown): { x?: number; y?: number } | null {
  const rec = asRecord(raw);
  if (typeof rec.x !== "number" && typeof rec.y !== "number") return null;
  return {
    x: typeof rec.x === "number" ? rec.x : undefined,
    y: typeof rec.y === "number" ? rec.y : undefined,
  };
}

function extractGeminiText(payload: unknown): string {
  const root = asRecord(payload);
  const candidates = root.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Gemini returned no candidates");
  }
  const content = asRecord(candidates[0]).content;
  const parts = asRecord(content).parts;
  if (!Array.isArray(parts)) {
    throw new Error("Gemini returned no text");
  }
  const text = parts
    .map((part) => {
      const rec = asRecord(part);
      return typeof rec.text === "string" ? rec.text : "";
    })
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned empty text");
  return text;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = asRecord(asRecord(payload).error).message;
    throw new Error(
      typeof message === "string"
        ? message
        : `Gemini request failed (${response.status})`,
    );
  }
  return extractGeminiText(payload);
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY ?? "";
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = asRecord(asRecord(payload).error).message;
    throw new Error(
      typeof message === "string"
        ? message
        : `Groq request failed (${response.status})`,
    );
  }
  const choices = asRecord(payload).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Groq returned no choices");
  }
  const text = asRecord(asRecord(choices[0]).message).content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Groq returned empty text");
  }
  return text.trim();
}

async function runAiAgent(
  workspaceId: string,
  node: WorkflowNodeRow,
  incoming: string,
): Promise<string> {
  const model = asString(node.config.model, "gemini") === "groq" ? "groq" : "gemini";
  const instruction = asString(node.config.prompt);
  const events = await memoryService.getWorkspaceMemory(workspaceId, 15);
  const memory = memoryService.formatMemoryAsContext(events);
  const prompt = [
    memory ? `Team memory (recent workspace events):\n${memory}` : "",
    instruction ? `Instructions:\n${instruction}` : "",
    `Input:\n${incoming}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const output =
    model === "groq" ? await callGroq(prompt) : await callGemini(prompt);

  await memoryService.logMemoryEvent(
    workspaceId,
    canvasIdFromConfig(node.config),
    "ai_output",
    model,
    instruction || incoming,
    output,
    { skipWorkflowTrigger: true },
  );
  return output;
}

function evaluateCondition(
  incoming: string,
  config: Record<string, unknown>,
): boolean {
  const rule = asString(config.rule, "contains");
  const value = asString(config.value);
  if (rule === "equals") {
    return incoming === value;
  }
  if (rule === "length_gt") {
    const n = Number.parseInt(value, 10);
    return incoming.length > (Number.isFinite(n) ? n : 0);
  }
  if (rule === "length_lt") {
    const n = Number.parseInt(value, 10);
    return incoming.length < (Number.isFinite(n) ? n : 0);
  }
  return incoming.toLowerCase().includes(value.toLowerCase());
}

function applyTransform(
  incoming: string,
  config: Record<string, unknown>,
): string {
  const operation = asString(config.operation, "uppercase");
  if (operation === "extract_n") {
    const n = Number.parseInt(asString(config.n, "8"), 10);
    const count = Number.isFinite(n) && n > 0 ? n : 8;
    return incoming.trim().split(/\s+/).filter(Boolean).slice(0, count).join(" ");
  }
  if (operation === "template") {
    const template = asString(config.template, "{{input}}");
    return template.replaceAll("{{input}}", incoming);
  }
  return incoming.toUpperCase();
}

async function runOutputNode(
  workspaceId: string,
  node: WorkflowNodeRow,
  incoming: string,
  runId: string,
): Promise<string> {
  const mode = asString(node.config.mode, "log_to_memory");
  if (mode === "webhook") {
    const url = asString(node.config.url).trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Webhook URL must start with http:// or https://");
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: incoming,
        output: incoming,
        workspaceId,
        runId,
        workflowId: node.workflow_id,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
    return incoming;
  }

  await memoryService.logMemoryEvent(
    workspaceId,
    canvasIdFromConfig(node.config),
    "workflow_output",
    null,
    null,
    incoming,
    { skipWorkflowTrigger: true },
  );
  return incoming;
}

async function logStep(args: {
  runId: string;
  node: WorkflowNodeRow;
  stepOrder: number;
  status: "success" | "failed";
  input: string;
  output: string;
  errorMessage: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await getSupabase().from("workflow_run_steps").insert({
    run_id: args.runId,
    node_id: args.node.id,
    node_type: args.node.node_type,
    step_order: args.stepOrder,
    status: args.status === "success" ? "completed" : "failed",
    input: args.input,
    output: args.output,
    error_message: args.errorMessage,
    started_at: now,
    completed_at: now,
  });
}

export async function createWorkflow(
  workspaceId: string,
  name: string,
): Promise<{ id: string }> {
  const { data, error } = await getSupabase()
    .from("workflows")
    .insert({ workspace_id: workspaceId, name })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`createWorkflow failed: ${error?.message ?? "no row"}`);
  }
  return { id: data.id as string };
}

export async function addWorkflowNode(
  workflowId: string,
  nodeType: string,
  config: Record<string, unknown>,
  canvasPosition: { x: number; y: number } | null,
): Promise<{ id: string }> {
  const allowed: WorkflowNodeType[] = [
    "trigger",
    "ai_agent",
    "condition",
    "transform",
    "output",
  ];
  if (!allowed.includes(nodeType as WorkflowNodeType)) {
    throw new Error(`Invalid node_type: ${nodeType}`);
  }
  const { data, error } = await getSupabase()
    .from("workflow_nodes")
    .insert({
      workflow_id: workflowId,
      node_type: nodeType,
      config,
      canvas_position: canvasPosition,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`addWorkflowNode failed: ${error?.message ?? "no row"}`);
  }
  return { id: data.id as string };
}

export async function addWorkflowEdge(
  workflowId: string,
  fromNodeId: string,
  toNodeId: string,
  branch: string,
): Promise<{ id: string }> {
  const nextBranch =
    branch === "true" || branch === "false" ? branch : "default";
  const { data, error } = await getSupabase()
    .from("workflow_edges")
    .insert({
      workflow_id: workflowId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      branch: nextBranch,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`addWorkflowEdge failed: ${error?.message ?? "no row"}`);
  }
  return { id: data.id as string };
}

export async function getWorkflow(workflowId: string): Promise<{
  workflow: { id: string; workspace_id: string; name: string; created_at: string };
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
}> {
  const { data: workflow, error } = await getSupabase()
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();
  if (error || !workflow) {
    throw new Error(`Workflow not found: ${error?.message ?? workflowId}`);
  }

  const { data: nodes, error: nodeError } = await getSupabase()
    .from("workflow_nodes")
    .select("*")
    .eq("workflow_id", workflowId);
  if (nodeError) {
    throw new Error(`getWorkflow nodes failed: ${nodeError.message}`);
  }

  const { data: edges, error: edgeError } = await getSupabase()
    .from("workflow_edges")
    .select("*")
    .eq("workflow_id", workflowId);
  if (edgeError) {
    throw new Error(`getWorkflow edges failed: ${edgeError.message}`);
  }

  return {
    workflow: workflow as {
      id: string;
      workspace_id: string;
      name: string;
      created_at: string;
    },
    nodes: (nodes ?? []).map((row) => ({
      id: String(row.id),
      workflow_id: String(row.workflow_id),
      node_type: String(row.node_type),
      config: asRecord(row.config),
      canvas_position: parsePosition(row.canvas_position),
    })),
    edges: (edges ?? []).map((row) => ({
      id: String(row.id),
      workflow_id: String(row.workflow_id),
      from_node_id: String(row.from_node_id),
      to_node_id: String(row.to_node_id),
      branch: typeof row.branch === "string" ? row.branch : "default",
    })),
  };
}

export async function getWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<WorkflowRunResult> {
  const { data: run, error } = await getSupabase()
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .eq("workflow_id", workflowId)
    .single();
  if (error || !run) {
    throw new Error(`Run not found: ${error?.message ?? runId}`);
  }

  const { data: steps, error: stepError } = await getSupabase()
    .from("workflow_run_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_order", { ascending: true });
  if (stepError) {
    throw new Error(`getWorkflowRun steps failed: ${stepError.message}`);
  }

  const graph = await getWorkflow(workflowId);
  const canvasByNode = new Map(
    graph.nodes.map((node) => [node.id, canvasIdFromConfig(node.config)]),
  );

  return {
    runId,
    workflowId,
    status: run.status === "failed" ? "failed" : "completed",
    triggerInput: asString(run.trigger_input),
    steps: (steps ?? []).map((row) => ({
      nodeId: String(row.node_id ?? ""),
      nodeType: String(row.node_type ?? ""),
      input: asString(row.input),
      output: asString(row.output),
      status: row.status === "failed" ? "failed" : "success",
      errorMessage:
        typeof row.error_message === "string" ? row.error_message : null,
      canvasId: canvasByNode.get(String(row.node_id ?? "")) ?? null,
    })),
  };
}

export async function runWorkflow(
  workflowId: string,
  triggerInput: string,
): Promise<WorkflowRunResult> {
  const graph = await getWorkflow(workflowId);
  const workspaceId = graph.workflow.workspace_id;
  const trigger = graph.nodes.find((node) => node.node_type === "trigger");
  if (!trigger) {
    throw new Error("Workflow has no trigger node");
  }

  const { data: run, error: runError } = await getSupabase()
    .from("workflow_runs")
    .insert({
      workflow_id: workflowId,
      status: "running",
      trigger_input: triggerInput,
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`create workflow_run failed: ${runError?.message ?? "no row"}`);
  }

  const runId = run.id as string;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEdgeRow[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from_node_id) ?? [];
    list.push(edge);
    outgoing.set(edge.from_node_id, list);
  }

  const steps: WorkflowStepTrace[] = [];
  const visited = new Set<string>();
  const queue: { nodeId: string; input: string }[] = [
    { nodeId: trigger.id, input: triggerInput },
  ];
  let failed = false;
  let stepOrder = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    const node = nodeById.get(current.nodeId);
    if (!node) continue;
    stepOrder += 1;
    const input = current.input;
    let output = "";
    let status: "success" | "failed" = "success";
    let errorMessage: string | null = null;

    try {
      if (node.node_type === "trigger") {
        output = input;
      } else if (node.node_type === "ai_agent") {
        output = await runAiAgent(workspaceId, node, input);
      } else if (node.node_type === "condition") {
        const passed = evaluateCondition(input, node.config);
        output = passed ? "true" : "false";
      } else if (node.node_type === "transform") {
        output = applyTransform(input, node.config);
      } else if (node.node_type === "output") {
        output = await runOutputNode(workspaceId, node, input, runId);
      } else {
        throw new Error(`Unknown node_type: ${node.node_type}`);
      }
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
      output = errorMessage;
      failed = true;
    }

    await logStep({
      runId,
      node,
      stepOrder,
      status,
      input,
      output,
      errorMessage,
    });

    steps.push({
      nodeId: node.id,
      nodeType: node.node_type,
      input,
      output,
      status,
      errorMessage,
      canvasId: canvasIdFromConfig(node.config),
    });

    if (status === "failed") break;

    const nextInput =
      node.node_type === "condition" ? input : output;
    const edges = outgoing.get(node.id) ?? [];
    const wanted: WorkflowBranch =
      node.node_type === "condition"
        ? output === "true"
          ? "true"
          : "false"
        : "default";
    for (const edge of edges) {
      const branch = (edge.branch || "default") as WorkflowBranch;
      if (node.node_type === "condition") {
        if (branch !== wanted) continue;
      } else if (branch !== "default" && branch !== wanted) {
        continue;
      }
      if (!visited.has(edge.to_node_id)) {
        queue.push({ nodeId: edge.to_node_id, input: nextInput });
      }
    }
  }

  const finalStatus = failed ? "failed" : "completed";
  await getSupabase()
    .from("workflow_runs")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return {
    runId,
    workflowId,
    status: finalStatus,
    triggerInput,
    steps,
  };
}

let triggering = false;

export async function triggerWorkflowsForMemoryEvent(
  workspaceId: string,
  eventType: string,
  content: string,
): Promise<void> {
  if (triggering) return;
  if (eventType === "workflow_output") return;

  const { data: workflows, error } = await getSupabase()
    .from("workflows")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (error || !workflows) return;

  triggering = true;
  try {
    for (const row of workflows) {
      const id = String(row.id);
      try {
        const graph = await getWorkflow(id);
        const trigger = graph.nodes.find((node) => node.node_type === "trigger");
        if (!trigger) continue;
        const mode = asString(trigger.config.mode, "manual");
        if (mode !== "on_memory_event") continue;
        const filter = asString(trigger.config.eventType).trim();
        if (filter && filter !== eventType) continue;
        await runWorkflow(id, content);
      } catch {
        // Best-effort: a failed auto-run should not block memory logging.
      }
    }
  } finally {
    triggering = false;
  }
}
