-- Canvas Team Memory: columns for AI Block logging + recency index
-- Safe to re-run. Apply in Supabase SQL Editor if CLI is not linked.

alter table memory_events
  add column if not exists block_id text;

alter table memory_events
  add column if not exists model_provider text;

alter table memory_events
  add column if not exists prompt text;

alter table memory_events
  add column if not exists metadata jsonb default '{}';

create index if not exists memory_events_workspace_idx
  on memory_events (workspace_id, created_at desc);
