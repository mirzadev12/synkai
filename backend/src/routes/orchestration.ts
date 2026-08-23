import { Router } from "express";
import * as memoryService from "../lib/memoryService.js";
import * as orchestrator from "../lib/orchestrator.js";

const router = Router();

/**
 * POST /api/agents
 * Register a new agent config for a workspace.
 */
router.post("/agents", async (req, res) => {
  try {
    const {
      workspaceId,
      name,
      role,
      systemPrompt,
      inputContextTypes,
      outputEventType,
      modelProvider,
    } = req.body ?? {};

    if (
      typeof workspaceId !== "string" ||
      typeof name !== "string" ||
      typeof role !== "string" ||
      typeof systemPrompt !== "string" ||
      !Array.isArray(inputContextTypes) ||
      typeof outputEventType !== "string"
    ) {
      res.status(400).json({
        error:
          "workspaceId, name, role, systemPrompt, inputContextTypes[], outputEventType required",
      });
      return;
    }

    const provider =
      modelProvider === "gemini" || modelProvider === "anthropic"
        ? modelProvider
        : "anthropic";

    const id = await orchestrator.registerAgent(workspaceId, {
      name,
      role,
      systemPrompt,
      inputContextTypes: inputContextTypes.map(String),
      outputEventType,
      modelProvider: provider,
    });

    res.status(201).json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/agents/:workspaceId
 * List agents registered for a workspace.
 */
router.get("/agents/:workspaceId", async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const agents = await orchestrator.listAgents(workspaceId);
    res.json({ agents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/orchestrate
 * Run a sequential agent handoff chain.
 */
router.post("/orchestrate", async (req, res) => {
  try {
    const { workspaceId, agentIds, triggerContent } = req.body ?? {};

    if (
      typeof workspaceId !== "string" ||
      !Array.isArray(agentIds) ||
      agentIds.length === 0 ||
      typeof triggerContent !== "string"
    ) {
      res.status(400).json({
        error: "workspaceId, agentIds[], and triggerContent are required",
      });
      return;
    }

    const run = await orchestrator.runOrchestrationChain(
      workspaceId,
      agentIds.map(String),
      triggerContent,
    );

    res.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/memory/:workspaceId
 * Recent team-memory events (+ formatted context string).
 */
router.get("/memory/:workspaceId", async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "15"), 10) || 15),
    );
    const events = await memoryService.getWorkspaceMemory(workspaceId, limit);
    res.json({
      events,
      formatted: memoryService.formatMemoryAsContext(events),
      count: events.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/memory/:workspaceId
 * Log a canvas / AI Block memory event.
 */
router.post("/memory/:workspaceId", async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const body = req.body ?? {};
    const content = typeof body.content === "string" ? body.content : "";
    if (!content.trim()) {
      res.status(400).json({ error: "content required" });
      return;
    }
    const eventType =
      typeof body.eventType === "string" && body.eventType.trim()
        ? body.eventType
        : "ai_output";
    const blockId = typeof body.blockId === "string" ? body.blockId : null;
    const modelProvider =
      typeof body.modelProvider === "string" ? body.modelProvider : null;
    const prompt = typeof body.prompt === "string" ? body.prompt : null;
    const id = await memoryService.logMemoryEvent(
      workspaceId,
      blockId,
      eventType,
      modelProvider,
      prompt,
      content,
    );
    res.status(201).json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/generate-stories
 * Convenience single-agent endpoint (kept for compatibility).
 * Internally uses runAgent when agentId is provided; otherwise registers a
 * temporary story-writer-style call via the first matching agent named
 * "story-writer" in the workspace.
 */
router.post("/generate-stories", async (req, res) => {
  try {
    const { workspaceId, agentId, brief } = req.body ?? {};
    if (typeof workspaceId !== "string" || typeof brief !== "string") {
      res.status(400).json({ error: "workspaceId and brief are required" });
      return;
    }

    let targetAgentId =
      typeof agentId === "string" && agentId ? agentId : undefined;

    if (!targetAgentId) {
      const agents = await orchestrator.listAgents(workspaceId);
      const story = agents.find((a) => a.name === "story-writer");
      if (!story) {
        res.status(404).json({
          error:
            'No story-writer agent found. Run the seed script or pass agentId.',
        });
        return;
      }
      targetAgentId = story.id;
    }

    const result = await orchestrator.runAgent(
      targetAgentId,
      workspaceId,
      brief,
    );
    res.json({
      output: result.output,
      eventId: result.eventId,
      note: "Migrated to orchestrator.runAgent (single-agent convenience).",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

export default router;
