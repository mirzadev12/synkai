import type { BoxData, ItemKind } from "./liveblocks.config";
import { isConnectableKind } from "./canvasGeometry";

export type SerializedWorkflowNode = {
  canvasId: string;
  nodeType: "trigger" | "ai_agent" | "condition" | "transform" | "output";
  config: Record<string, unknown>;
  canvasPosition: { x: number; y: number };
};

export type SerializedWorkflowEdge = {
  fromCanvasId: string;
  toCanvasId: string;
  branch: "default" | "true" | "false";
};

function canvasKindToNodeType(
  kind: ItemKind | undefined,
): SerializedWorkflowNode["nodeType"] | null {
  if (kind === "ai") return "ai_agent";
  if (kind === "trigger") return "trigger";
  if (kind === "condition") return "condition";
  if (kind === "transform") return "transform";
  if (kind === "output") return "output";
  return null;
}

function configFromBox(id: string, box: BoxData): Record<string, unknown> {
  const canvasId = id;
  if (box.kind === "ai") {
    return {
      canvasId,
      model: box.model === "groq" ? "groq" : "gemini",
      prompt: box.prompt ?? "",
    };
  }
  if (box.kind === "trigger") {
    return {
      canvasId,
      mode: box.triggerMode === "on_memory_event" ? "on_memory_event" : "manual",
      eventType: box.memoryFilter ?? "brief",
    };
  }
  if (box.kind === "condition") {
    return {
      canvasId,
      field: box.conditionField ?? "output",
      rule: box.conditionRule ?? "contains",
      value: box.conditionValue ?? "",
    };
  }
  if (box.kind === "transform") {
    return {
      canvasId,
      operation: box.transformOp ?? "uppercase",
      n: box.transformN ?? 8,
      template: box.transformTemplate ?? "Summary: {{input}}",
    };
  }
  return {
    canvasId,
    mode: box.outputMode === "webhook" ? "webhook" : "log_to_memory",
    url: box.webhookUrl ?? "",
  };
}

export function extractConnectedWorkflow(boxes: Record<string, BoxData>): {
  nodes: SerializedWorkflowNode[];
  edges: SerializedWorkflowEdge[];
  triggerInput: string;
} {
  const workflowIds = Object.entries(boxes)
    .filter(([, box]) => isConnectableKind(box.kind))
    .map(([id]) => id);

  const triggerId =
    workflowIds.find((id) => boxes[id]?.kind === "trigger") ?? workflowIds[0];

  if (!triggerId) {
    return { nodes: [], edges: [], triggerInput: "" };
  }

  const ids = new Set<string>([triggerId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [, conn] of Object.entries(boxes)) {
      if (conn.kind !== "connection") continue;
      const fromId = conn.fromId;
      const toId = conn.toId;
      if (!fromId || !toId) continue;
      if (!isConnectableKind(boxes[fromId]?.kind)) continue;
      if (!isConnectableKind(boxes[toId]?.kind)) continue;
      if (ids.has(fromId) && !ids.has(toId)) {
        ids.add(toId);
        grew = true;
      }
      if (ids.has(toId) && !ids.has(fromId)) {
        ids.add(fromId);
        grew = true;
      }
    }
  }

  const nodes: SerializedWorkflowNode[] = [...ids].flatMap((id) => {
    const box = boxes[id];
    if (!box) return [];
    const nodeType = canvasKindToNodeType(box.kind);
    if (!nodeType) return [];
    return [
      {
        canvasId: id,
        nodeType,
        config: configFromBox(id, box),
        canvasPosition: { x: box.x, y: box.y },
      },
    ];
  });

  const edges: SerializedWorkflowEdge[] = Object.values(boxes).flatMap((conn) => {
    if (conn.kind !== "connection" || !conn.fromId || !conn.toId) return [];
    if (!ids.has(conn.fromId) || !ids.has(conn.toId)) return [];
    const branch =
      conn.branch === "true" || conn.branch === "false" ? conn.branch : "default";
    return [
      {
        fromCanvasId: conn.fromId,
        toCanvasId: conn.toId,
        branch,
      },
    ];
  });

  const trigger = boxes[triggerId];
  return {
    nodes,
    edges,
    triggerInput: trigger?.triggerInput ?? "",
  };
}
