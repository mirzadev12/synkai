import { callAnthropic } from "./anthropicClient.js";
import { callGemini } from "./geminiClient.js";
import * as memoryService from "./memoryService.js";
import { getSupabase } from "./supabase.js";

export type AgentConfig = {
  name: string;
  role: string;
  systemPrompt: string;
  inputContextTypes: string[];
  outputEventType: string;
  modelProvider: "anthropic" | "gemini";
};

export type AgentRow = {
  id: string;
  workspace_id: string;
  name: string;
  role: string;
  system_prompt: string;
  input_context_types: string[];
  output_event_type: string;
  model_provider: string;
};

export type OrchestrationStepResult = {
  id: string;
  agentId: string;
  agentName?: string;
  stepOrder: number;
  status: string;
  inputContext: string | null;
  outputEventId: string | null;
  output?: string;
  errorMessage: string | null;
};

export type OrchestrationRun = {
  id: string;
  workspaceId: string;
  status: string;
  triggerEventId: string | null;
  steps: OrchestrationStepResult[];
};

async function callProvider(
  provider: string,
  prompt: string,
): Promise<string> {
  if (provider === "gemini") {
    return callGemini(prompt);
  }
  if (provider === "anthropic") {
    return callAnthropic(prompt);
  }
  throw new Error(`Unknown model_provider: ${provider}`);
}

/**
 * Register an agent config row for a workspace.
 */
export async function registerAgent(
  workspaceId: string,
  config: AgentConfig,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name: config.name,
      role: config.role,
      system_prompt: config.systemPrompt,
      input_context_types: config.inputContextTypes,
      output_event_type: config.outputEventType,
      model_provider: config.modelProvider,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `registerAgent failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id as string;
}

/**
 * Run a single agent: assemble memory context → LLM → log output event.
 */
export async function runAgent(
  agentId: string,
  workspaceId: string,
  triggerContent: string,
): Promise<{ output: string; eventId: string; assembledPrompt: string }> {
  const { data: agent, error } = await getSupabase()
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !agent) {
    throw new Error(
      `runAgent: agent not found (${error?.message ?? agentId})`,
    );
  }

  const row = agent as AgentRow;
  const context = await memoryService.getRecentContext(
    workspaceId,
    row.input_context_types ?? [],
  );

  const assembledPrompt =
    `${row.system_prompt}\n\nTeam context:\n${context || "(none)"}\n\nInput:\n${triggerContent}`;

  const output = await callProvider(row.model_provider, assembledPrompt);
  const eventId = await memoryService.logEvent(
    workspaceId,
    row.output_event_type,
    output,
    agentId,
    { agent_name: row.name, model_provider: row.model_provider },
  );

  return { output, eventId, assembledPrompt };
}

/**
 * Sequential multi-agent handoff chain.
 * Each agent's output becomes the next agent's triggerContent.
 */
export async function runOrchestrationChain(
  workspaceId: string,
  agentIds: string[],
  triggerContent: string,
): Promise<OrchestrationRun> {
  if (agentIds.length === 0) {
    throw new Error("agentIds must contain at least one agent");
  }

  const triggerEventId = await memoryService.logEvent(
    workspaceId,
    "brief",
    triggerContent,
    undefined,
    { source: "orchestrate" },
  );

  const { data: run, error: runError } = await getSupabase()
    .from("orchestration_runs")
    .insert({
      workspace_id: workspaceId,
      trigger_event_id: triggerEventId,
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(
      `create orchestration_run failed: ${runError?.message ?? "no row"}`,
    );
  }

  const runId = run.id as string;
  const steps: OrchestrationStepResult[] = [];
  let nextInput = triggerContent;

  for (let i = 0; i < agentIds.length; i += 1) {
    const agentId = agentIds[i]!;
    const stepOrder = i + 1;

    const { data: agentMeta } = await getSupabase()
      .from("agents")
      .select("name")
      .eq("id", agentId)
      .maybeSingle();

    const { data: step, error: stepError } = await getSupabase()
      .from("orchestration_steps")
      .insert({
        run_id: runId,
        agent_id: agentId,
        step_order: stepOrder,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (stepError || !step) {
      await getSupabase()
        .from("orchestration_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      throw new Error(
        `create orchestration_step failed: ${stepError?.message ?? "no row"}`,
      );
    }

    const stepId = step.id as string;

    try {
      const result = await runAgent(agentId, workspaceId, nextInput);

      await getSupabase()
        .from("orchestration_steps")
        .update({
          status: "completed",
          input_context: result.assembledPrompt,
          output_event_id: result.eventId,
          completed_at: new Date().toISOString(),
        })
        .eq("id", stepId);

      steps.push({
        id: stepId,
        agentId,
        agentName: (agentMeta?.name as string | undefined) ?? undefined,
        stepOrder,
        status: "completed",
        inputContext: result.assembledPrompt,
        outputEventId: result.eventId,
        output: result.output,
        errorMessage: null,
      });

      nextInput = result.output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await getSupabase()
        .from("orchestration_steps")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", stepId);

      await getSupabase()
        .from("orchestration_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      steps.push({
        id: stepId,
        agentId,
        agentName: (agentMeta?.name as string | undefined) ?? undefined,
        stepOrder,
        status: "failed",
        inputContext: null,
        outputEventId: null,
        errorMessage: message,
      });

      return {
        id: runId,
        workspaceId,
        status: "failed",
        triggerEventId,
        steps,
      };
    }
  }

  await getSupabase()
    .from("orchestration_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return {
    id: runId,
    workspaceId,
    status: "completed",
    triggerEventId,
    steps,
  };
}

/**
 * List agents for a workspace.
 */
export async function listAgents(workspaceId: string): Promise<AgentRow[]> {
  const { data, error } = await getSupabase()
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listAgents failed: ${error.message}`);
  }
  return (data ?? []) as AgentRow[];
}
