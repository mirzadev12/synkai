-- Additive migration for SYNKAI orchestration (safe on existing workspaces + memory_events)

-- Agents registered in the system
create table if not exists agents (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  role text not null,
  system_prompt text not null,
  input_context_types text[] not null,
  output_event_type text not null,
  model_provider text not null default 'anthropic',
  created_at timestamp default now()
);

-- Extend existing memory_events (older schema had created_by only)
alter table memory_events
  add column if not exists source_agent_id uuid references agents(id);

alter table memory_events
  add column if not exists metadata jsonb default '{}';

create index if not exists memory_events_workspace_type_idx
  on memory_events (workspace_id, event_type, created_at desc);

create table if not exists orchestration_runs (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  trigger_event_id uuid references memory_events(id),
  status text not null default 'pending',
  created_at timestamp default now(),
  completed_at timestamp
);

create table if not exists orchestration_steps (
  id uuid default gen_random_uuid() primary key,
  run_id uuid references orchestration_runs(id) on delete cascade,
  agent_id uuid references agents(id),
  step_order int not null,
  status text not null default 'pending',
  input_context text,
  output_event_id uuid references memory_events(id),
  error_message text,
  started_at timestamp,
  completed_at timestamp
);
