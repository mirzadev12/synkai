-- Semantic memory retrieval: pgvector embeddings for memory_events.
-- Safe to re-run. Apply in the Supabase SQL Editor.
--
-- Design notes:
--   * Embeddings live in a SIDE TABLE, not a column on memory_events, because
--     getWorkspaceMemory() does `select("*")` — a vector column would drag ~3KB
--     per row into the Team Memory sidebar, which never uses it.
--   * workspace_id is denormalised so similarity search filters before the
--     join instead of scanning every workspace's vectors.
--   * 768 dimensions (gemini-embedding-001 truncated via outputDimensionality).
--     ~3KB/row, so ~100k rows fit comfortably inside Supabase's 500MB free tier.
--   * No HNSW/IVFFlat index yet — below ~10k rows a sequential scan over 768-dim
--     vectors is single-digit milliseconds, and index builds are expensive on a
--     500MB-RAM shared instance. See the commented-out index at the bottom.

create extension if not exists vector;

create table if not exists memory_embeddings (
  event_id uuid primary key
    references memory_events(id) on delete cascade,
  workspace_id uuid not null,
  embedding vector(768) not null,
  model text not null default 'gemini-embedding-001',
  created_at timestamptz not null default now()
);

create index if not exists memory_embeddings_workspace_idx
  on memory_embeddings (workspace_id);

-- Similarity search. supabase-js cannot express `order by embedding <=> $1`,
-- so retrieval goes through this RPC.
--   <=> is pgvector's cosine DISTANCE (0 = identical, 2 = opposite).
--   similarity = 1 - distance, so 1.0 = identical.
create or replace function match_memory_events(
  p_workspace_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 4,
  p_min_similarity float default 0.65
)
-- NOTE: deliberately selects only columns from migration 002 (id, event_type,
-- content, created_at). Migration 004's columns — block_id, model_provider,
-- prompt — are NOT present on every database this app runs against, so
-- depending on them here would make this migration fail. Nothing in the
-- retrieval path consumes model_provider.
returns table (
  id uuid,
  event_type text,
  content text,
  created_at timestamp,
  similarity float
)
language sql
stable
as $$
  select
    e.id,
    e.event_type,
    e.content,
    e.created_at,
    1 - (m.embedding <=> p_query_embedding) as similarity
  from memory_embeddings m
  join memory_events e on e.id = m.event_id
  where m.workspace_id = p_workspace_id
    and 1 - (m.embedding <=> p_query_embedding) >= p_min_similarity
  order by m.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Rows still needing an embedding (used by the backfill script).
create or replace view memory_events_missing_embeddings as
  select e.id, e.workspace_id, e.event_type, e.content, e.created_at
  from memory_events e
  left join memory_embeddings m on m.event_id = e.id
  where m.event_id is null
    and e.content is not null
    and length(btrim(e.content)) > 0;

-- Add this ONLY once you are past roughly 10k embedded rows. Until then the
-- planner is faster without it, and building it costs memory you don't have
-- on the free tier.
--
-- create index memory_embeddings_hnsw_idx
--   on memory_embeddings using hnsw (embedding vector_cosine_ops);
