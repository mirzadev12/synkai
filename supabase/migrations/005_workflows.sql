-- Canvas workflow engine (nodes, edges, inspectable runs)
-- Safe to re-run. Apply in Supabase SQL Editor if CLI is not linked.

create table if not exists workflows (
  id uuid default gen_random_uuid() primary key,
  workspace_id text not null,
  name text not null,
  created_at timestamp default now()
);

create table if not exists workflow_nodes (
  id uuid default gen_random_uuid() primary key,
  workflow_id uuid references workflows(id) on delete cascade,
  node_type text not null,
  config jsonb not null default '{}',
  canvas_position jsonb,
  created_at timestamp default now()
);

create table if not exists workflow_edges (
  id uuid default gen_random_uuid() primary key,
  workflow_id uuid references workflows(id) on delete cascade,
  from_node_id uuid references workflow_nodes(id) on delete cascade,
  to_node_id uuid references workflow_nodes(id) on delete cascade,
  branch text default 'default'
);

create table if not exists workflow_runs (
  id uuid default gen_random_uuid() primary key,
  workflow_id uuid references workflows(id) on delete cascade,
  status text not null default 'running',
  trigger_input text,
  created_at timestamp default now(),
  completed_at timestamp
);

create table if not exists workflow_run_steps (
  id uuid default gen_random_uuid() primary key,
  run_id uuid references workflow_runs(id) on delete cascade,
  node_id uuid references workflow_nodes(id) on delete set null,
  node_type text not null,
  step_order int not null,
  status text not null default 'pending',
  input text,
  output text,
  error_message text,
  started_at timestamp,
  completed_at timestamp
);

create index if not exists workflows_workspace_idx
  on workflows (workspace_id, created_at desc);

create index if not exists workflow_nodes_workflow_idx
  on workflow_nodes (workflow_id);

create index if not exists workflow_edges_workflow_idx
  on workflow_edges (workflow_id);

create index if not exists workflow_runs_workflow_idx
  on workflow_runs (workflow_id, created_at desc);

create index if not exists workflow_run_steps_run_idx
  on workflow_run_steps (run_id, step_order);
