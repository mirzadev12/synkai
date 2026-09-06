import { getSupabase } from "./supabase.js";

/**
 * Which migration provides what, and a cheap probe for each.
 *
 * This exists because three separate features — canvas memory metadata,
 * workflows, and semantic retrieval — all looked "broken" in the app when the
 * real cause was an unapplied migration. The failure was invisible: the UI
 * offered the feature, the code was correct, and the database simply had no
 * table. Surfacing it costs one query per column at join time.
 */
type Probe = {
  migration: string;
  /** What breaks without it, in the user's terms. */
  feature: string;
  table: string;
  /** A column that only exists once the migration ran. */
  column: string;
};

const PROBES: Probe[] = [
  {
    migration: "001_workspaces.sql",
    feature: "Servers and canvases",
    table: "workspaces",
    column: "id",
  },
  {
    migration: "002_orchestration.sql",
    feature: "Team memory",
    table: "memory_events",
    column: "id",
  },
  {
    migration: "004_canvas_team_memory.sql",
    feature: "Per-block memory attribution",
    table: "memory_events",
    column: "model_provider",
  },
  {
    migration: "005_workflows.sql",
    feature: "Workflows",
    table: "workflows",
    column: "id",
  },
  {
    migration: "006_memory_embeddings.sql",
    feature: "Semantic memory retrieval",
    table: "memory_embeddings",
    column: "event_id",
  },
];

export type MissingMigration = {
  migration: string;
  feature: string;
};

let cached: MissingMigration[] | null = null;

/**
 * Migrations that have not been applied. Cached for the process lifetime —
 * schema does not change under a running server, and this must never become a
 * per-request cost.
 */
export async function missingMigrations(): Promise<MissingMigration[]> {
  if (cached) return cached;

  const supabase = getSupabase();
  const missing: MissingMigration[] = [];

  for (const probe of PROBES) {
    const { error } = await supabase
      .from(probe.table)
      .select(probe.column)
      .limit(1);

    // PostgREST reports an absent table or column rather than throwing.
    if (error && /does not exist|could not find|schema cache/i.test(error.message)) {
      missing.push({ migration: probe.migration, feature: probe.feature });
    }
  }

  cached = missing;
  return missing;
}
