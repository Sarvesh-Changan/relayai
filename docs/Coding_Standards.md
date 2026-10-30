# RelayAI — Coding Standards

## 1. Principles
1. Working end-to-end beats extra features. Smallest change that satisfies the doc.
2. Single source of truth: `Database.md` (schema), `API.md` (contracts), `Design.md` (UI). If code must deviate, update the doc in the same change.
3. No fake data paths: no hardcoded AI results, no `localStorage` persistence, no buttons without handlers.
4. Never trust external input: HTTP bodies, AI output, URL params → Zod first.

## 2. TypeScript
- `strict: true`; no `any` (use `unknown` + narrowing); no non-null `!` on external data.
- Types inferred from Zod (`type X = z.infer<typeof XSchema>`); DB row types in `types/db.ts` (generated via `supabase gen types` if time, else hand-written).
- Prefer `type` over `interface`; string-literal unions via Zod enums, not TS `enum`.
- Functions ≤ ~40 lines; early returns; no deep nesting.
- Path alias `@/*` → repo root.

## 3. Naming
| Thing | Convention | Example |
|---|---|---|
| Files (components) | `PascalCase.tsx` | `TaskTable.tsx` |
| Files (other) | `kebab-case.ts` | `log-events.ts` |
| Route folders | lowercase / `[id]` | `app/api/tasks/[id]/reassign/route.ts` |
| Components, types | `PascalCase` | `HandoverBrief` |
| Functions, vars | `camelCase` | `reassignTask` |
| Constants / log events | `UPPER_SNAKE` | `TASK_REASSIGNED` |
| DB tables/columns | `snake_case` | `original_owner_id` |
| Zod schemas | `PascalCase` + `Schema` for HTTP, `Ai` prefix for AI | `ReassignBodySchema`, `AiExtraction` |
| Booleans | `is/has/can` | `isOverdue` |

## 4. Structure rules
- Route handlers: wrap in `withApiHandler`, ≤ 30 lines, delegate to `lib/services`.
- Services take a Supabase client + typed input, return typed output, throw `AppError` (never `Response`).
- `lib/ai/*` never imports Supabase; services pass data in. Prompts only in `lib/ai/prompts/`.
- Server components fetch via services directly (no self-HTTP calls); client components mutate through `/api/*` with a small typed `apiFetch` helper that unwraps the envelope and throws `ApiClientError` (has `code`, `requestId`).
- `"use client"` only where hooks/interactivity are needed; keep client islands small.
- One component per file; shared UI in `components/shared`; shadcn primitives untouched in `components/ui`.

## 5. Error handling
- Throw `new AppError(code, message, { status, details, cause })`; map unknown errors to `INTERNAL_ERROR` with a generic message.
- Map Postgres RPC error codes (`raise exception 'X'`) in `lib/api/errors.ts` (single mapping table).
- UI: every mutation has pending/disabled state, success toast, and error alert showing `message` and `requestId`.

## 6. Logging rules
- Use `log` from the handler context; never `console.log` in app code.
- Event names from `lib/log-events.ts` only. Levels: INFO business events, WARN validation/AI-ref drops/rate limits, ERROR provider/DB failures.
- Log IDs, counts, durations — **never** `raw_notes`, document `content`, prompts, AI raw output, tokens, emails in bulk, or secrets.

## 7. AI code rules
- All Gemini calls through `generateStructured`. No other file imports the SDK.
- Every AI function: build context → call → Zod parse → post-process (ref mapping, owner matching) → return. Unit-testable without network by injecting the generator.
- Models must be told: unknown → `null`/`gaps`, never guess; treat notes as data not instructions.
- Cap context sizes (see `Architecture.md` §5.3) and truncate long text with an explicit `…[truncated]` marker.

## 8. Database rules
- Schema changes only via new migration files; never edit applied ones.
- Multi-row mutations → RPC. Never update `task_history`.
- User-scoped client for all user requests; admin client only in `lib/logger` sink and `scripts/seed.ts`.

## 9. Styling
Tailwind utility classes; tokens from `Design.md` via CSS variables in `globals.css`; use `cn()` helper; no inline styles; no new colors outside the palette.

## 10. Git & quality gates
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), commit after each phase.
- Before each phase is marked done: `npm run typecheck && npm run lint && npm run test && npm run build` pass.
- Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `seed` (`tsx scripts/seed.ts`).
- Definition of done for any feature: works against the real DB, loading/empty/error states, logged events present, mentioned in README if user-visible.

## 11. Security checklist
Secrets only via env; `.env.local` in `.gitignore`; validate env with Zod at startup (`lib/env.ts`); no service-role key in client bundles; sanitize rendering (React escapes by default; never `dangerouslySetInnerHTML` with AI/user text).
