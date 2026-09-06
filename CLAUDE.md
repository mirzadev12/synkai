# Synk AI

Multiplayer canvas (Vite + React 19 + Liveblocks) where AI models live as draggable,
connectable blocks, backed by a shared Supabase "Team Memory" log. Package name is
still `synkai` internally; the product name is "Synk AI" and that's now used
consistently across every user-facing screen (see Feature checklist).

- Live: https://synkai-drab.vercel.app/
- GitHub: https://github.com/mirzadev12/synkai (remote `origin`, branch `master`)
- Vercel project: `synkai` (org `team_2yVw3AZdrOwKRIBBlphNeRjH`, linked via `.vercel/project.json`)

## Tech stack

- Frontend: Vite 8 + React 19 + TypeScript, no router (single canvas view).
- Realtime/state: Liveblocks (`@liveblocks/client`, `@liveblocks/react`) — one Liveblocks
  room per join-code "server"; canvas contents are one `LiveMap<string, LiveObject<BoxData>>`.
- AI providers: Gemini (`@google/generative-ai` REST), Groq (OpenAI-compatible REST),
  Claude via OpenRouter (OpenAI-compatible REST) — all called server-side, never from
  the browser.
- Persistence: Supabase/Postgres (`@supabase/supabase-js`) for workspaces, team memory,
  multi-agent orchestration, and saved workflow graphs.
- Hosting: Vercel (serverless functions under `api/`) for the deployed canvas;
  a separate standalone Express app under `backend/` for local orchestration work only.

## Layout

```
src/                     React canvas app (Liveblocks room = one "server")
api/run.ts               Vercel serverless — canvas AI Block Gemini/Groq/Claude calls
api/memory/[workspaceId].ts   GET/POST team memory events (Supabase)
api/orchestrate.ts       Also serves /api/rooms (create/join server codes) and /api/files —
                          folded in to stay under Vercel Hobby's serverless function count
api/workflows*           Saved workflow graphs (api/agents* and api/generate-stories
                          were deleted — see Security)
server/runAi.ts          Shared Gemini/Groq/Claude(OpenRouter) HTTP calls, used by api/run.ts
backend/                 Standalone Express app (port 3001) for orchestration/memory —
                          separate from the Vercel API, NOT what the deployed canvas uses
                          for its /api/run path
supabase/migrations/     Postgres schema, run in order 001 → 006
```

`vercel.json` rewrites `/api/rooms` and `/api/files` → `/api/orchestrate`, and everything
else (non-`/api`) → `index.html`. Both are folded in because the project sits at exactly
12 serverless functions, Vercel Hobby's ceiling — a 13th route breaks the deploy.

## Running locally

```bash
npm install        # root (frontend)
npm run dev         # vite, http://localhost:5173

cd backend
npm install
npm run dev         # tsx watch, http://localhost:3001, health check GET /health
```

Root `npm run dev` is Vite only — it does **not** serve `/api/*` the way Vercel does in
production. `vite.config.ts` has its own dev-time middleware that duplicates
`api/run.ts`/`api/memory`/`api/rooms`/`api/workflows` logic (importing the same
`server/runAi.ts` and `backend/src/lib/*` modules), so the full create-server → canvas →
AI Block flow works under plain `npm run dev`. **Gotcha:** that middleware is registered
in `vite.config.ts` itself, and Node's import cache means editing `api/*.ts` or
`server/runAi.ts` needs a dev-server restart to show up locally even though `vite.config.ts`
edits auto-restart the server (Vite watches its own config file, not everything it imports).

## Env vars (names only — see `.env.example` / `backend/.env.example`)

Root `.env.local`: `VITE_LIVEBLOCKS_PUBLIC_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` (optional — only needed if Claude is
re-enabled in the UI), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
`backend/.env`: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
`GEMINI_MODEL` (optional), `ANTHROPIC_API_KEY`, `DEMO_WORKSPACE_ID`.
Both `.env` files are gitignored; only the `.example` files are tracked.

No missing keys: every feature in the deployed app runs on free tiers (Gemini, Groq,
Liveblocks, Supabase, Vercel Hobby). `OPENROUTER_API_KEY` is unset by design — see the
AI Blocks note on Claude.

**Deploys come from `master`, not `main`.** Pushing to `main` deploys nothing. Also,
production cannot be verified with `curl`: Vercel serves a bot "Security Checkpoint" to
non-browser clients, so a scripted poll will never see the app. Check it in a browser.

## Canvas item model

Everything on the canvas is a `LiveObject<BoxData>` in one `LiveMap` (`storage.boxes`),
typed in `src/liveblocks.config.ts`. `kind` discriminates: `ai`, `sticky`, `image`,
`shape`, `text`, `doc`, `file`, `stroke` (pen), `connection`, plus workflow nodes
`trigger` / `condition` / `transform` / `output`. Multi-select, group-drag, marquee select, and
trash-bin delete (drag onto the corner bin, or Delete/Backspace) all operate over this
same map in `src/Canvas.tsx`.

## AI Blocks

- `AiModel` (`src/liveblocks.config.ts`) is `"gemini" | "groq" | "claude"`, but
  **only Gemini and Groq are selectable**. Claude is implemented server-side via
  OpenRouter and works, but OpenRouter has no free tier for Anthropic models
  (~$2/$10 per million tokens for Sonnet), so offering it without a paid key
  only produced 500s. It stays in the type because old blocks may have it
  stored; `AiBlock` falls those back to Gemini. Midjourney remains a UI-only
  "coming soon" option.
- Nearby context: `Canvas.tsx`'s `nearbyByAi` scans sticky notes and text boxes within
  `CONTEXT_RANGE` px and prepends their text to the prompt (`buildPromptFor`). Memoized
  off a cheap positional key so unrelated drags elsewhere on the canvas don't force a
  full rescan every pointer-move frame.
- Team memory: every successful Run POSTs to `/api/memory/:workspaceId`
  (`memory_events` table — `workspace_id, block_id, event_type, model_provider, prompt,
  content, created_at, metadata`). Retrieval is **semantic, not recency-based** — see
  "Semantic memory" below. `TeamMemoryPanel.tsx` is the read-only sidebar (newest first)
  and still uses the plain recent list.
- Block-to-block handoff: dragging from a block's output port to another's input port
  creates a `connection` object; on a successful Run, `feedConnectedPrompts` appends the
  source's output into **every** connected target's prompt via `upsertLinkedContext`
  (fan-out to multiple targets from one source works — verified against real
  `LiveMap`/`LiveObject` instances) — each target still requires a manual Send/Run,
  there is no auto-chaining.
- Compare mode: `ComparePanel.tsx` fires one prompt at both of Gemini/Groq
  simultaneously via `addCompareBlocks`, laying out one AI Block per model;
  `DisagreementPanel.tsx` then surfaces where the answers diverge.

## Semantic memory (the differentiator)

AI Blocks retrieve memories **by relevance to the prompt**, not by recency.

**Cost: zero.** `gemini-embedding-001` is free of charge on the Gemini free tier and
reuses the existing `GEMINI_API_KEY` — no new environment variable. pgvector is included
on Supabase's free plan.

**Flow**
1. A Run finishes → `POST /api/memory/:workspaceId` saves the event, *then* embeds it
   (`RETRIEVAL_DOCUMENT`) into `memory_embeddings`. Embedding failure never loses the
   event — the row is simply left unembedded for the backfill to pick up.
2. The next Run embeds its prompt (`RETRIEVAL_QUERY`) and calls the
   `match_memory_events` RPC, which ranks by cosine distance within that workspace.
3. Matches above the threshold are prepended to the prompt, weakest→strongest so the
   most relevant sits nearest the question. Spatial nearby-note context is applied
   independently and still works alongside this.

**Files**
```
server/embed.ts              Gemini embeddings, 768 dims, task types
server/memoryRetrieval.ts    Shared by api/ and vite.config.ts — TUNING CONSTANTS LIVE HERE
supabase/migrations/006_*    memory_embeddings table + match_memory_events RPC
backend/src/scripts/backfillEmbeddings.ts   Resumable backfill, 429-aware
```

**Tuning** (`server/memoryRetrieval.ts`): `MEMORY_MATCH_COUNT = 4`,
`MEMORY_MIN_SIMILARITY = 0.65`.

The threshold is measured, not guessed. `gemini-embedding-001` compresses cosine scores
into a narrow band — *unrelated* text still scores ~0.50-0.55, so an intuitive-sounding
floor like 0.55 injects pure noise (a query with no relevant memory still returned two
matches; a vague query returned all six). 0.65 returns exactly the right memories and
correctly returns *nothing* when nothing is relevant. Lower toward 0.62 if relevant
memories get dropped; raise toward 0.70 if noise creeps in.

**Design notes worth keeping**
- Embeddings live in a **side table**, not a column on `memory_events`, because
  `getWorkspaceMemory` does `select("*")` — a vector column would drag ~3KB/row into the
  Team Memory sidebar, which never uses it.
- `match_memory_events` deliberately selects **only migration 002 columns**. Migration
  004's columns are not present on every database, and depending on them made the
  migration fail outright.
- **No vector index yet.** Below ~10k rows a sequential scan is faster than an HNSW build
  is affordable on a 500MB-RAM shared instance. The commented-out index is in 006.
- Retrieval necessarily blocks the model call (one embed + one vector query, ~200-400ms):
  relevance depends on the prompt, so it cannot be prefetched the way the old recent-list
  was. This partially reverses the earlier latency fix, by design.

**Free-tier ceilings**: Supabase 500MB (~100k embedded rows at 768 dims) and **projects
pause after 7 days of inactivity** — that pause, not storage, is what will bite first.

## Security

The threat model is small and worth stating plainly: **the join code is the only
access control.** Anyone holding a code can read and write that canvas, spend the
workspace's model quota, and read its team memory. There are no user accounts,
and adding them is not on the roadmap. Everything below hardens *around* that,
it does not replace it.

| Measure | Where | Note |
|---|---|---|
| 10-char join codes (Crockford base32) | `backend/src/lib/roomIdentity.ts` | 32^10 ≈ 1.1e15 vs 1e6 for the old 6-digit codes, which were brute-forceable in minutes. Legacy 6-digit codes still work forever — `workspaceIdFromCode` hashes the code, so rejecting them would strand every existing canvas |
| Rate limits on every API route | `server/rateLimit.ts` | Fixed window, in-memory. **A cost guard, not a security boundary** — it is per-instance on serverless and `x-forwarded-for` is spoofable. It stops one client draining the free Gemini/Groq quota, which is the realistic abuse |
| Prompt / memory size caps | `server/rateLimit.ts` | `MAX_PROMPT_CHARS` 24k, `MAX_MEMORY_CHARS` 40k |
| Workspace ids validated as UUIDs | `isWorkspaceId` in `roomIdentity.ts` | Every id this app mints is a UUID v5 from the code. Checked on `/api/memory/*`, `/api/files`, `/api/workflows` — a workspace id is also the storage path prefix, so an unchecked one lets a caller scatter objects across the bucket |
| Upload extension denylist | `uploadRejectionReason` in `fileStorage.ts` | The bucket is **public**, so an `.html` or `.svg` upload would become a live page on the Supabase origin — a free phishing host. Blocks active-content and executable extensions |
| URLs from shared storage checked before render | `src/safeUrl.ts` | Canvas item URLs are written by whoever else is in the room; `javascript:` in an `href` runs on click, in this origin. `data:image/*` still allowed for legacy images |
| Security headers | `vercel.json` | `nosniff`, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` on `/api/*` |
| Narrow CSP | `vercel.json` | `frame-ancestors`, `base-uri`, `object-src`, `form-action` only. `script-src`/`connect-src` are **deliberately omitted**: `index.html` has an inline theme script and the app opens a Liveblocks websocket plus Supabase Storage requests, so a wrong origin list would break the site for every visitor |
| Dead public model endpoints deleted | — | `api/generate-stories.ts`, `api/agents.ts`, `api/agents/[workspaceId].ts` and the agent-chain branch of `api/orchestrate.ts` were reachable on the public URL, spent Gemini quota, and were called by **nothing** in the canvas. The Express app under `backend/` still exposes them on localhost. Also frees 3 of Vercel Hobby's 12 function slots |

**Known and accepted:**
- The storage bucket is public. Making it private would break every file URL already
  saved on a canvas, so it needs a migration, not a flag flip.
- API 500s return the underlying error message. That leaks table names on a schema
  error — which is exactly what made the unapplied-migration bugs findable.
- Prism's `innerHTML` in `AiOutput.tsx` is safe: `Prism.highlight` escapes its input,
  and it falls back to `textContent` when there is no grammar.

## Known gaps / not implemented

- **The canvas is not infinite or pannable.** `.canvas { overflow: hidden }` and item
  drag is clamped to `rect.width/height` (`Canvas.tsx`) — everything is bounded to the
  visible viewport, with no pan or zoom. This was found during audit but is out of
  scope for the current build pass; flagged for a future decision.
- No actual model brand logos anywhere — the model dropdown and AI Block header use
  Material Symbols icons, not Gemini/Groq/Claude/Midjourney logo images.
- `dist/` in the repo root is a stale local Vite build artifact; Vercel builds its own
  on deploy, this one isn't used for anything.

## CLI tooling on this machine

Node v24.19.0 / npm 11.17.0 / Cursor CLI installed. No global `vercel` or `supabase`
CLI — Supabase migrations are applied via the SQL editor (see README.md), and Vercel
env vars/deploys are managed through the Vercel dashboard, not this machine's CLI.

## Feature checklist

Status as of 2026-09-05. Update this table in place as things change — don't leave
stale rows.

| Feature | Status | Notes |
|---|---|---|
| Real-time multiplayer sync (Liveblocks) | working | Confirmed live on prod and local |
| Infinite/pannable canvas | missing | Viewport-bounded, no pan/zoom — not built this pass, see Known gaps |
| Vercel deploy connected to GitHub, keys in Vercel env vars | working | Verified live: prod `/api/run` returned a real Gemini answer |
| AI Block (dropdown, prompt, Run, output, connector handles) | working | |
| Sticky notes | working | |
| Image upload | working | Data-URL based |
| Shapes (rect/circle) | working | |
| Text boxes | working | |
| Pen + eraser | working | |
| Trash bin + keyboard delete | working | |
| Block-to-block handoff, single target | working | |
| Multi-target AI Block linking (one source → many targets) | working (fixed) | Logic was already correct (verified against real LiveMap); the real blocker was a missing `.port-out` CSS rule (regressed in an earlier commit) making output ports nearly unclickable — restored in `src/index.css` |
| Compare mode | working | Now supports Gemini/Groq/Claude, any 2+ |
| Spatial nearby-context | working | Memoization tightened for latency, behavior unchanged |
| Supabase `memory_events` logging | working | |
| Memory injection into prompts | working | No longer blocks the Run — see Latency |
| Team Memory sidebar (read-only, newest first) | working | |
| "SYNKAI" → "Synk AI" renamed throughout | working (fixed) | `NameGate.tsx`/`ServerGate.tsx` were the last holdouts, now fixed |
| AI Block restyled as chatbot-style popup | working | |
| Theme toggle (persisted) | working | `localStorage`-backed |
| Collapsible docs panel | working | |
| Multi-select + bulk delete | working | Marquee + shift-click, Delete/Backspace |
| Workflow/Run reliability (single run, handoff, compare) | working | |
| Latency (blocking calls, re-renders, unscoped lookups) | working (fixed) | AI Block Run no longer awaits the team-memory GET before calling the model; `nearbyByAi` no longer recomputes on every unrelated drag frame |
| Name-entry popup as modal on load | working | `role="dialog" aria-modal="true"` |
| Team Memory panel actually accessible | working | Header button toggles it |
| Live presence count | working | `PresenceBar.tsx`, Liveblocks presence API |
| Claude via OpenRouter | implemented, **not offered** | Works server-side, but OpenRouter has no free tier for Anthropic models, so the UI option only ever produced a 500. Removed from the dropdown, Compare and the review menu; re-enable by setting `OPENROUTER_API_KEY` and restoring the three UI call sites |

## Visual design pass

Styling-only pass, run after the functional work above. Direction chosen by the user:
two themes off the existing toggle — light is deep teal `#0f6156` on cool off-white,
dark is the same hue lifted to `#3fb8a2` on near-black. Typography is the IBM Plex
superfamily. Tailwind and shadcn/ui were **deliberately skipped** (the user chose this):
Tailwind's utilities land in `@layer utilities` and lose to this stylesheet's unlayered
semantic classes, so adopting it would have meant wrapping all ~1650 lines in a cascade
layer for no styling benefit; shadcn additionally requires replacing working controls
with Radix primitives, which the styling-only rule forbids.

| Design item | Status | Notes |
|---|---|---|
| Global colour/type/space/radius tokens | done | `src/index.css`; legacy Material-ish names kept as aliases so old rules re-theme |
| Two themes on the existing toggle | done | `:root` = dark, `html.light` overrides; toggle logic untouched |
| Canvas dot-grid background | done | Pre-existing, retained and re-tokenised |
| AI Block as bordered card | done | |
| Monospace AI Block prompt/output | **not done** | `--font-mono` is defined but only applied to `.setup pre/code`; the AI Block still renders sans |
| Per-model accent tint (Gemini/Groq/Claude) | **not done** | No per-model colour anywhere |
| lucide-react icon swap | **not done** | Package installed but unused; every icon is still a Material Symbols ligature |
| Panel open/close transitions (~150–200ms) | **not done** | Docs / Team Memory / Document panels still snap; no Framer Motion |
| Custom empty + loading microcopy | **not done** | Still "Connecting…", "Loading…", "No events yet. Run an AI Block." |
| Expressive connectors (pulse on handoff) | **not done** | Lines are already curved (`curvedPath`); no animation |
| Favicon de-gradiented | done | Flattened to the accent with a light/dark swap |
