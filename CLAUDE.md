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
  room per 6-digit "server" code; canvas contents are one `LiveMap<string, LiveObject<BoxData>>`.
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
api/orchestrate.ts       Also serves /api/rooms (create/join 6-digit server codes) —
                          folded in to stay under Vercel Hobby's serverless function count
api/agents*, api/workflows*   Multi-agent orchestration + saved workflow graphs
server/runAi.ts          Shared Gemini/Groq/Claude(OpenRouter) HTTP calls, used by api/run.ts
backend/                 Standalone Express app (port 3001) for orchestration/memory —
                          separate from the Vercel API, NOT what the deployed canvas uses
                          for its /api/run path
supabase/migrations/     Postgres schema, run in order 001 → 005
```

`vercel.json` rewrites `/api/rooms` → `/api/orchestrate` and everything else (non-`/api`) → `index.html`.

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
`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` (powers the AI Block's Claude option),
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
`backend/.env`: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
`GEMINI_MODEL` (optional), `ANTHROPIC_API_KEY`, `DEMO_WORKSPACE_ID`.
Both `.env` files are gitignored; only the `.example` files are tracked.

**`OPENROUTER_API_KEY` still needs to be added to Vercel's project env vars** — the
integration is implemented (see checklist) but no key has been generated/added yet, so
the deployed Claude option will 500 with "OPENROUTER_API_KEY is missing" until it's set.

## Canvas item model

Everything on the canvas is a `LiveObject<BoxData>` in one `LiveMap` (`storage.boxes`),
typed in `src/liveblocks.config.ts`. `kind` discriminates: `ai`, `sticky`, `image`,
`shape`, `text`, `stroke` (pen), `connection`, plus workflow nodes `trigger` /
`condition` / `transform` / `output`. Multi-select, group-drag, marquee select, and
trash-bin delete (drag onto the corner bin, or Delete/Backspace) all operate over this
same map in `src/Canvas.tsx`.

## AI Blocks

- `AiModel` (`src/liveblocks.config.ts`) is `"gemini" | "groq" | "claude"`. Midjourney
  is the only remaining dropdown option that's UI-only and triggers a "coming soon"
  popup (`src/AiBlock.tsx`, `src/ComparePanel.tsx`) — it never reaches the type system
  or the API, since it's image generation and there's no equivalent text endpoint yet.
- Nearby context: `Canvas.tsx`'s `nearbyByAi` scans sticky notes and text boxes within
  `CONTEXT_RANGE` px and prepends their text to the prompt (`buildPromptFor`). Memoized
  off a cheap positional key so unrelated drags elsewhere on the canvas don't force a
  full rescan every pointer-move frame.
- Team memory: every successful Run POSTs to `/api/memory/:workspaceId`
  (`memory_events` table — `workspace_id, block_id, event_type, model_provider, prompt,
  content, created_at, metadata`); each Run also uses whatever recent-memory is already
  cached (refreshed in the background, never blocks the model call) and prepends it to
  the prompt. `TeamMemoryPanel.tsx` is the read-only sidebar (newest first).
- Block-to-block handoff: dragging from a block's output port to another's input port
  creates a `connection` object; on a successful Run, `feedConnectedPrompts` appends the
  source's output into **every** connected target's prompt via `upsertLinkedContext`
  (fan-out to multiple targets from one source works — verified against real
  `LiveMap`/`LiveObject` instances) — each target still requires a manual Send/Run,
  there is no auto-chaining.
- Compare mode: `ComparePanel.tsx` fires one prompt at any 2+ of Gemini/Groq/Claude
  simultaneously via `addCompareBlocks`, laying out one AI Block per model;
  `DisagreementPanel.tsx` then surfaces where the answers diverge.

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
| Claude activated via OpenRouter (replacing "coming soon") | working (needs key) | Implemented in `server/runAi.ts` + `api/run.ts` + `vite.config.ts` dev middleware; **`OPENROUTER_API_KEY` still needs to be added to Vercel** (and to `.env.local` for local use) — not invented here |

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
