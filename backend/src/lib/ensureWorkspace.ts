import { getSupabase } from "./supabase.js";

export async function ensureWorkspace(
  workspaceId: string,
  name: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("workspaces")
    .upsert({ id: workspaceId, name }, { onConflict: "id" });
  if (error) {
    throw new Error(`ensureWorkspace failed: ${error.message}`);
  }
}
