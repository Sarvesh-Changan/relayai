# AGENTS.md — RelayAI

(Copy this file to the repo root: `cp docs/AGENTS.md AGENTS.md`. Codex reads the root copy.)

## Project
RelayAI is an AI-powered team knowledge & work-handover platform built for a **3.5-hour assessment**. Core promise: no decision is lost, no action item forgotten, nobody asks "what did I miss?". Signature feature: **AI Context Continuity Engine** — append-only task history + grounded AI handover briefs.

## Read first (source of truth)
`docs/PRD.md` (scope) · `docs/Architecture.md` · `docs/Database.md` (schema, RPC, RLS) · `docs/API.md` (contracts, Zod shapes) · `docs/Design.md` · `docs/Coding_Standards.md`. If a doc and your idea disagree, the doc wins; if the doc is wrong, fix the doc in the same change and say so.

## Stack
Next.js 15 App Router + TypeScript strict · Tailwind + shadcn/ui · Supabase (Postgres/Auth/RLS) · Google Gemini via `@google/genai` (server only) · Zod · Pino · Vitest · Vercel. Free tiers only.

## Commands
```
npm run dev | build | start | lint | typecheck | test | seed
```
A phase is done only when `typecheck`, `lint`, `test`, `build` all pass.

## Non-negotiable rules
1. **No fake AI.** No hardcoded/mocked AI results in app code. Mocks only inside `tests/`.
2. **No fake UI.** Every button/link works or is not rendered.
3. **Persistent storage only** (Supabase). No `localStorage` for data.
4. **`task_history` is append-only.** Never update/delete it. Task changes go through the RPCs in `Database.md` (`reassign_task`, `change_task_status`, `carry_forward_task`, `commit_meeting_extraction`).
5. `action_items.meeting_id` (origin) and `original_owner_id` never change.
6. **Validate everything with Zod**: request bodies, query params, env, and all AI output. One repair retry for AI, then typed error.
7. **AI proposes, humans commit**: extraction results are reviewed in the UI before saving.
8. AI never invents people, deadlines, decisions or IDs: unknown → `null` / `gaps`. Unmatched owners become **unassigned** + `needs_review`. AI-facing prompts use request-local refs (`ACT-024`, `M1`, `D2`); the server maps refs back to UUIDs and drops unknown refs.
9. **Secrets server-side only.** Gemini key and Supabase service-role key never reach the client. `NEXT_PUBLIC_*` = Supabase URL + anon key only.
10. **Logging**: Pino JSON, request ID on every log, event names from `lib/log-events.ts`; never log raw notes, document content, prompts, AI raw output or secrets. Persist events to `app_logs` via `after()` in production.
11. Don't add features outside `PRD.md` P0/P1. No vector DB, no audio, no chat widget.

## Architecture cheat-sheet
`route.ts` → `withApiHandler` (request id, auth, Zod, error envelope, logging) → `lib/services/*` → Supabase (user-scoped client, RLS) / `lib/ai/*` (Gemini via `generateStructured`). Prompts live in `lib/ai/prompts/*.ts` and are tuned in Google AI Studio using the identical system instructions and JSON schemas from `docs/Prompts.md`.

## Working agreement for each task
1. Restate the phase goal in 2–3 lines and list files you will create/change.
2. Implement in small steps; keep functions small and typed.
3. Run the quality gates; fix failures.
4. Verify manually against the real DB/AI (not just unit tests) and report exactly what you verified and what you could not.
5. Commit with a conventional message. Update docs/README if behaviour changed.
6. If blocked or uncertain about a requirement, choose the simplest option consistent with the docs and note the assumption — don't stall.

## Env vars
See `docs/Deployment.md` §1. Validate with `lib/env.ts`; the app must boot with a clear error message if required vars are missing, and AI routes must return `AI_NOT_CONFIGURED` (not crash) if `GEMINI_API_KEY` is absent.

## Do not
- Rename tables/columns/endpoints/event names defined in docs.
- Edit applied migrations (add new ones).
- Use `any`, `console.log`, `dangerouslySetInnerHTML`, or self-HTTP calls from server components.
- Commit `.env*`, `logs/`, or keys.
- Pre-seed AI-generated outputs in the database.

## Seed / demo data
`npm run seed` creates 4 users, one prior meeting (27 Oct 2026), 3 knowledge docs, 2 prior tasks (see `Database.md` §9). Demo notes for the live walkthrough are in `Testing.md` §6.
