-- Base workspace table (required by orchestration schema)
create table if not exists workspaces (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'SYNKAI demo',
  created_at timestamp default now()
);
