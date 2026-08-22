-- Agents registered in the system (config, not the AI itself)
create table if not exists agents (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,                    -- e.g. "story-writer", "design-drafter", "triage"
  role text not null,                    -- short description of what this agent does
  system_prompt text not null,           -- the agent's instruction template
  input_context_types text[] not null,   -- which memory event_types this agent should read, e.g. {'decision','brief'}
  output_event_type text not null,       -- what event_type this agent's output gets logged as
  model_provider text not null default 'anthropic',  -- 'anthropic' | 'gemini' — model-agnostic by design
  created_at timestamp default now()
);

-- Structured memory (extends the earlier memory_events table — keep that table, add this)
create table if not exists memory_events (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  event_type text not null,              -- 'brief' | 'agent_output' | 'decision' | 'handoff'
  source_agent_id uuid references agents(id),  -- null if a human created this event
  content text not null,
  metadata jsonb default '{}',           -- flexible: e.g. { "confidence": 0.9, "linked_shape_id": "..." }
  created_at timestamp default now()
);

create index if not exists memory_events_workspace_type_idx
  on memory_events (workspace_id, event_type, created_at desc);

-- Orchestration runs: tracks a chain of agent handoffs for one unit of work
create table if not exists orchestration_runs (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  trigger_event_id uuid references memory_events(id),  -- the human input that started this run
  status text not null default 'pending',  -- 'pending' | 'running' | 'completed' | 'failed'
  created_at timestamp default now(),
  completed_at timestamp
);

-- Individual steps within a run (one agent's execution)
create table if not exists orchestration_steps (
  id uuid default gen_random_uuid() primary key,
  run_id uuid references orchestration_runs(id) on delete cascade,
  agent_id uuid references agents(id),
  step_order int not null,
  status text not null default 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  input_context text,                     -- the assembled context this step actually received
  output_event_id uuid references memory_events(id),
  error_message text,
  started_at timestamp,
  completed_at timestamp
);
