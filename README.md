# SYNKAI

Multiplayer canvas (Vite + React + Liveblocks) with multi-model AI blocks, plus an
**orchestration & memory backend** (Express + Supabase) for sequential multi-agent handoffs.

## Frontend (canvas)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — keys live in `.env.local` (`VITE_LIVEBLOCKS_PUBLIC_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`).

## Orchestration & memory backend

The backend under `backend/` routes work across pluggable AI agents and logs shared
team memory in Postgres (Supabase). It does **not** replace the canvas AI Block `/api/run`
path — that stays on Vercel for in-canvas Gemini/Groq runs.

### 1. Apply Supabase migrations

In the Supabase SQL editor (or CLI), run in order:

1. `supabase/migrations/001_workspaces.sql`
2. `supabase/migrations/002_orchestration.sql`

Confirm tables exist: `workspaces`, `agents`, `memory_events`, `orchestration_runs`, `orchestration_steps`.

### 2. Configure env

Copy `backend/.env.example` → `backend/.env` and fill:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred for server inserts)
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` (can reuse the same key as the frontend)

The server also loads the repo-root `.env.local` if present.

Optional: `GEMINI_MODEL` if your key rejects `gemini-2.0-flash` (e.g. set `gemini-3.6-flash`).

### 3. Install & start

```bash
cd backend
npm install
npm run dev
```

API: http://localhost:3001 — health check: `GET /health`

### 4. Seed the demo agent chain

```bash
cd backend
npm run seed
# or: npm run seed -- <existing-workspace-uuid>
```

This registers three agents:

| Agent | Provider | Role |
|---|---|---|
| `story-writer` | Anthropic (Claude) | Brief → user stories |
| `design-drafter` | Gemini | Stories → wireframe description |
| `dev-scaffolder` | Anthropic (Claude) | Wireframe → React component breakdown |

The script prints the `workspaceId` and three agent IDs.

### 5. Test the orchestration chain (curl)

```bash
curl -X POST http://localhost:3001/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "<demo-workspace-id>",
    "agentIds": ["<story-writer-id>", "<design-drafter-id>", "<dev-scaffolder-id>"],
    "triggerContent": "Users need a faster mobile checkout flow"
  }'
```

Expected: one brief → three sequential handoffs (Claude → Gemini → Claude). Each step’s
output is logged to `memory_events` and returned in the JSON `steps` array.

### Other orchestration routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/agents` | Register an agent |
| `GET` | `/api/agents/:workspaceId` | List agents |
| `POST` | `/api/orchestrate` | Run an agent chain |
| `GET` | `/api/memory/:workspaceId` | Team memory summary |
| `POST` | `/api/generate-stories` | Convenience single-agent endpoint (**migrated** to `orchestrator.runAgent`) |

## Layout

```
api/run.ts              # Vercel serverless — canvas AI Block Gemini/Groq
server/runAi.ts         # Shared canvas AI helpers
backend/                # Express orchestration + memory layer
supabase/migrations/    # Postgres schema for agents & memory
src/                    # React canvas (Liveblocks) — do not confuse with backend
```
