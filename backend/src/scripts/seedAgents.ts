import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as orchestrator from "../lib/orchestrator.js";
import { getSupabase } from "../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function ensureWorkspace(workspaceId?: string): Promise<string> {
  if (workspaceId) {
    const { data } = await getSupabase()
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data, error } = await getSupabase()
    .from("workspaces")
    .insert({ name: "Synk AI demo workspace" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Could not create demo workspace: ${error?.message ?? "unknown"}`,
    );
  }
  return data.id as string;
}

async function main() {
  const argWorkspaceId = process.argv[2];
  const workspaceId = await ensureWorkspace(argWorkspaceId);

  console.log(`Seeding agents for workspace: ${workspaceId}`);

  const storyWriterId = await orchestrator.registerAgent(workspaceId, {
    name: "story-writer",
    role: "Turns product briefs into user stories",
    systemPrompt:
      "You are a product assistant. Given team context and a new brief, generate 3-5 clear user stories in the format 'As a [role], I want [goal], so that [benefit]'.",
    inputContextTypes: ["brief", "decision"],
    outputEventType: "agent_output",
    modelProvider: "anthropic",
  });

  const designDrafterId = await orchestrator.registerAgent(workspaceId, {
    name: "design-drafter",
    role: "Converts user stories into a rough wireframe description",
    systemPrompt:
      "You are a UI/UX assistant. Given user stories and team design context, describe a simple wireframe layout in plain text (sections, key components, rough positions) that a designer could sketch from.",
    inputContextTypes: ["agent_output", "decision"],
    outputEventType: "agent_output",
    modelProvider: "gemini",
  });

  const devScaffolderId = await orchestrator.registerAgent(workspaceId, {
    name: "dev-scaffolder",
    role: "Converts a wireframe description into component scaffolding suggestions",
    systemPrompt:
      "You are a frontend engineering assistant. Given a wireframe description, suggest a React component breakdown (component names and responsibilities only, no full code).",
    inputContextTypes: ["agent_output"],
    outputEventType: "agent_output",
    modelProvider: "anthropic",
  });

  console.log("\nSeed complete. Agent IDs:");
  console.log(`  story-writer:   ${storyWriterId}`);
  console.log(`  design-drafter: ${designDrafterId}`);
  console.log(`  dev-scaffolder: ${devScaffolderId}`);
  console.log(`\nWorkspace ID: ${workspaceId}`);
  console.log(`\nTest chain:\n`);
  console.log(`curl -X POST http://localhost:3001/api/orchestrate \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{`);
  console.log(`    "workspaceId": "${workspaceId}",`);
  console.log(
    `    "agentIds": ["${storyWriterId}", "${designDrafterId}", "${devScaffolderId}"],`,
  );
  console.log(
    `    "triggerContent": "Users need a faster mobile checkout flow"`,
  );
  console.log(`  }'`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
