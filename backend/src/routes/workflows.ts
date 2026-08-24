import { Router } from "express";
import * as workflowEngine from "../lib/workflowEngine.js";

const router = Router();

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

router.post("/workflows", async (req, res) => {
  try {
    const body = asRecord(req.body);
    const workspaceId = body.workspaceId;
    const name = body.name;
    if (typeof workspaceId !== "string" || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "workspaceId and name required" });
      return;
    }
    const created = await workflowEngine.createWorkflow(workspaceId, name.trim());
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

router.get("/workflows/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const graph = await workflowEngine.getWorkflow(id);
    res.status(200).json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

router.post("/workflows/:id/nodes", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const body = asRecord(req.body);
    const nodeType = body.nodeType;
    if (typeof nodeType !== "string") {
      res.status(400).json({ error: "nodeType required" });
      return;
    }
    const config = asRecord(body.config);
    const pos = asRecord(body.canvasPosition);
    const canvasPosition =
      typeof pos.x === "number" && typeof pos.y === "number"
        ? { x: pos.x, y: pos.y }
        : null;
    const created = await workflowEngine.addWorkflowNode(
      id,
      nodeType,
      config,
      canvasPosition,
    );
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

router.post("/workflows/:id/edges", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const body = asRecord(req.body);
    const fromNodeId = body.fromNodeId;
    const toNodeId = body.toNodeId;
    if (typeof fromNodeId !== "string" || typeof toNodeId !== "string") {
      res.status(400).json({ error: "fromNodeId and toNodeId required" });
      return;
    }
    const branch = typeof body.branch === "string" ? body.branch : "default";
    const created = await workflowEngine.addWorkflowEdge(
      id,
      fromNodeId,
      toNodeId,
      branch,
    );
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

router.post("/workflows/:id/run", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const body = asRecord(req.body);
    const triggerInput =
      typeof body.triggerInput === "string" ? body.triggerInput : "";
    const result = await workflowEngine.runWorkflow(id, triggerInput);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

router.get("/workflows/:id/runs/:runId", async (req, res) => {
  try {
    const id = req.params.id;
    const runId = req.params.runId;
    if (!id || !runId) {
      res.status(400).json({ error: "id and runId required" });
      return;
    }
    const result = await workflowEngine.getWorkflowRun(id, runId);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    res.status(500).json({ error: message });
  }
});

export default router;
