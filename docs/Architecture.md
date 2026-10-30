# RelayAI — Architecture

## 1. Stack (all free tier)
| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript strict) | Pin to 15.x via `create-next-app@15` so `middleware.ts` and `after()` behave as documented here |
| UI | Tailwind CSS + shadcn/ui + Lucide + Recharts | |
| DB/Auth/Storage | Supabase (Postgres, Auth, RLS) | Storage not required for MVP (documents are text) |
| AI | Google Gemini via `@google/genai`, server-side only | Model name from `GEMINI_MODEL` (chosen in AI Studio) |
| Validation | Zod | Inputs, AI outputs, env |
| Logging | Pino (+ `app_logs` table) | |
| Tests | Vitest (+ optional Playwright) | |
| Hosting | Vercel Hobby | |

## 2. High-level diagram
```
Browser (React, server + client components)
   │  fetch / server actions → ONLY our /api routes for mutations & AI
   ▼
Next.js Route Handlers  ──►  withApiHandler()  (request id, auth, zod, errors, logging)
   │                               │
   ├─► services/*  (business rules) ├─► lib/ai/*  ─► Gemini API (structured JSON)
   │        │                       │        └─ zod validate → ref→UUID mapping
   │        ▼                       └─► logger ─► stdout, logs/app.log (dev), app_logs (prod)
   └─► Supabase (user-scoped client, RLS)  — RPC functions for multi-row transactions
```

## 3. Layers & responsibilities
| Layer | Location | Rule |
|---|---|---|
| Route handlers | `app/api/**/route.ts` | Thin: wrap with `withApiHandler`, parse with Zod, call a service, return envelope |
| Services | `lib/services/*.ts` | Business logic + DB calls; no `NextRequest` imports |
| AI | `lib/ai/*` | Gemini client, prompt builders, schemas, post-processing; no DB calls (services pass context in) |
| DB access | `lib/supabase/{server,browser,admin}.ts` | `server` = user-scoped (RLS). `admin` (service role) only for `app_logs` insert and seed script |
| Validation | `lib/validations/*.ts` | One Zod schema per request body/query; types inferred |
| Logging | `lib/logger.ts`, `lib/log-events.ts` | Event-name constants; redaction |
| UI | `app/(app)/**`, `components/**` | Server components fetch via services; client components for interactivity |

## 4. Folder structure
```
relayai/
├── docs/                      # these documents (+ AGENTS.md copied to repo root)
├── app/
│   ├── (auth)/login/
│   ├── (app)/                 # authenticated shell
│   │   ├── dashboard/ meetings/ [new, [id]] tasks/ [[id]] handover/ [[id]] knowledge/ team/
│   │   └── layout.tsx         # sidebar + topbar
│   ├── api/
│   │   ├── health/ dashboard/ team/ meetings/ tasks/ knowledge/ handovers/
│   │   └── ai/{extract,link-suggestions,handover,insights}/
│   ├── layout.tsx  globals.css
├── components/{ui,layout,dashboard,meetings,tasks,handover,knowledge,shared}/
├── lib/
│   ├── api/{handler.ts,errors.ts,response.ts}
│   ├── ai/{gemini.ts,schemas.ts,extract.ts,handover.ts,insights.ts,link.ts,context.ts,prompts/*.ts}
│   ├── services/{meetings,tasks,knowledge,handovers,dashboard,team}.ts
│   ├── supabase/{server,browser,admin,middleware}.ts
│   ├── validations/*.ts   env.ts   logger.ts   log-events.ts   utils.ts   constants.ts
├── supabase/{migrations/*.sql, seed.sql or scripts/seed.ts}
├── scripts/seed.ts
├── tests/
├── middleware.ts          # session refresh + redirect to /login
├── logs/                  # git-ignored; dev only
└── README.md
```

## 5. Key data flows
### 5.1 Meeting → structured knowledge
`Raw notes` → `POST /api/ai/extract` → build prompt (notes wrapped in delimiters, participants list, meeting date) → Gemini (JSON schema) → Zod parse (one repair retry) → **owner matching** against participants/profiles (exact, then unique first-name match; else `owner_id=null`, `needs_review=true`) → due-date sanity check → response to UI → **user review** → `POST /api/meetings/:id/commit` → RPC `commit_meeting_extraction` (meeting summary + tasks + `created` history, one transaction).

### 5.2 Task change (Continuity Engine write path)
`POST /api/tasks/:id/reassign | status | carry-forward` → service → Postgres RPC (`reassign_task`, `change_task_status`, `carry_forward_task`) which locks the row, validates the transition, updates `action_items`, and appends `task_history` **in one transaction**. History is append-only (trigger blocks UPDATE/DELETE).

### 5.3 Handover brief (Continuity Engine read path)
`POST /api/ai/handover {recipient_id, scope}` → `lib/ai/context.ts` gathers: tasks in scope (cap 15) + their histories + originating meetings (summary/decisions) + linked/FTS-matched documents (cap 6) → **assigns request-local refs** (tasks keep `ACT-xxx`; meetings `M1..`; docs `D1..`) → Gemini → Zod → refs mapped back to UUIDs, unknown refs dropped → stored in `handovers` → returned.

### 5.4 Knowledge linking
Candidate retrieval is **database-side** (Postgres FTS on title/summary/content + same-owner/same-meeting rules, top 12). Gemini only **ranks and explains** candidates; output refs must belong to the candidate set. Accepted links stored in `task_links` with `reason`, `relevance`, `source='ai'`.

### 5.5 Insights
Deterministic signals computed in SQL/TS (overdue, blocked, unassigned, reassigned ≥ 2×, due ≤ 3 days and not in progress). Gemini turns signals into prioritised, human-readable insights; output may only reference signal refs. If AI fails the dashboard shows the deterministic signals (this is real data, not a fake AI answer).

## 6. AI integration contract (`lib/ai/gemini.ts`)
```ts
generateStructured<T>({ operation, systemInstruction, userContent, zodSchema, jsonSchema, timeoutMs, requestId })
// → { data: T, meta: { model, latencyMs, attempts, tokensIn?, tokensOut? } }
```
- Temperature ≈ 0.2, `responseMimeType: "application/json"` with schema.
- Retry once on 429/5xx with backoff; one "repair" retry on Zod failure (error text appended). Then throw typed `AppError`.
- `AI_NOT_CONFIGURED` (no key), `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_PROVIDER_ERROR`, `AI_INVALID_RESPONSE`.
- Untrusted text (notes, documents) is wrapped in `<notes>…</notes>` and the system instruction says to treat it as data, never instructions.
- Per-user soft rate limit (in-memory, 10 AI calls/min) — best-effort on serverless; documented limitation.
- Prompts live in `lib/ai/prompts/*.ts` and are the same text tuned in Google AI Studio.

## 7. Auth & security
- Supabase Auth email/password; `middleware.ts` refreshes session cookies and redirects.
- Every API route requires a session (`withApiHandler({ auth: true })`). Service role key is server-only and used in two places.
- RLS enabled on every table (see `Database.md`). Single shared workspace for the MVP: authenticated users can read all rows; writes limited per table.
- Secrets only in env vars; `.env.local` git-ignored; `NEXT_PUBLIC_*` limited to Supabase URL + anon key.

## 8. Logging architecture
| Sink | Where | Content |
|---|---|---|
| stdout (JSON) | all envs | everything ≥ `LOG_LEVEL` (Vercel captures) |
| `logs/app.log` | local dev only (`LOG_TO_FILE=true`) | same JSON lines |
| `app_logs` table | production | business events + warnings + errors, written with `after()` so serverless doesn't drop them |

Vercel's filesystem is read-only/ephemeral, hence the table. Redaction list: `authorization`, `cookie`, `apiKey`, `raw_notes`, `content`, `password`.

## 9. Key decisions (explain these to evaluators)
| Decision | Why |
|---|---|
| Single Next.js repo, no separate backend | Fits 3.5 h; one deploy |
| Postgres RPC for multi-row changes | Atomic task + history writes; prevents history drift |
| Append-only `task_history` | The "never lose context" guarantee, enforced in DB not just app code |
| AI returns refs, server maps to IDs | Prevents hallucinated IDs |
| DB retrieval + AI re-ranking instead of vectors | Simple, explainable, fast to build; vector search listed as future work |
| Human review gate on AI extraction | AI proposes, humans commit |
