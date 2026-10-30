# RelayAI — Debugging & Troubleshooting

## 1. First moves (30-second triage)
1. Copy the `requestId` from the UI error (or `x-request-id` response header).
2. Local: `grep <requestId> logs/app.log` · Prod: `select * from app_logs where request_id = '<id>' order by created_at;` or Vercel → Logs → search the id.
3. Read the `event` + `code`: `AI_*` → provider/prompt; `DB_ERROR`/RPC code → schema/RLS; `VALIDATION_ERROR` → request shape.
4. Hit `GET /api/health` — shows DB reachability and whether the AI key is configured.

## 2. Common issues
| Symptom | Likely cause | Fix |
|---|---|---|
| Every API call 401 after login | Cookies not refreshed; `middleware.ts` matcher excludes `/api`; wrong Supabase URL/anon key | Fix matcher (exclude only `_next/static`, images); verify env; use `@supabase/ssr` `createServerClient` with cookie getAll/setAll |
| Query returns `[]` but rows exist | RLS blocking (no policy for role) | Test in SQL editor with `set role authenticated; select set_config('request.jwt.claims', '{"sub":"<uid>"}', true);`; add missing policy |
| `new row violates row-level security policy` | `created_by`/`changed_by`/`uploaded_by` not equal to `auth.uid()` | Set from session user, never from request body |
| RPC returns `function … does not exist` | Migration not applied, or param names/types differ (`p_status task_status`) | `supabase db push` / re-run SQL; call with exact named params; reload PostgREST schema (`notify pgrst, 'reload schema';`) |
| `TASK_HISTORY_APPEND_ONLY` raised | Code tried to update/delete history | Only INSERT; fix the service |
| Check constraint `completed_has_outcome` | Status set to completed without outcome | Route through `change_task_status` and collect outcome in UI |
| AI returns 503 `AI_NOT_CONFIGURED` | `GEMINI_API_KEY` missing in this environment | Add to `.env.local` / Vercel env, redeploy (Vercel env changes need a new deployment) |
| AI 404 / "model not found" | `GEMINI_MODEL` retired or misspelled | Pick a current model in AI Studio → update env |
| AI 429 | Free-tier quota/RPM | Wait; reduce retries; use smaller context; demo with warmed calls; switch model |
| AI `AI_INVALID_RESPONSE` | Schema too strict, model truncated output (`maxOutputTokens` too low) or wrapped JSON in markdown | Raise `maxOutputTokens`; ensure `responseMimeType: application/json`; inspect (redacted) validation issues in the log; loosen optional fields to `nullable` |
| AI invents owners / dates | Prompt lacks participants list/meeting date or "unknown → null" rule | Re-tune in AI Studio (E1–E5), update `lib/ai/prompts/extract.ts` |
| Hallucinated refs in handover | Model referencing refs not in context | Expected: server drops them and logs `AI_REF_DROPPED`; if frequent, tighten prompt ("use only refs listed") |
| Handover is generic | Context empty or too truncated | Log context sizes (counts only); verify task links/FTS candidates; check scope |
| Works locally, 500 on Vercel, `ENOENT logs/app.log` | Writing files on serverless FS | `LOG_TO_FILE=false` in prod; stdout + `app_logs` only |
| Pino crashes / "unable to determine transport target" in Next | Pino worker-thread transports don't bundle | Add `serverExternalPackages: ['pino','pino-pretty']` to `next.config`; use `pino.destination`/multistream instead of `transport` worker |
| `app_logs` rows missing in prod | Insert not awaited before function froze | Persist inside `after()` from `next/server`; verify service-role key set |
| AI route times out on Vercel | Function max duration too low | `export const maxDuration = 60`; verify your plan's limit; trim context; check `AI_TIMEOUT_MS` < max duration |
| Hydration mismatch on dates | Server/client timezone differences | Format dates with a shared util + `APP_TIMEZONE`; render relative times in client components only |
| `cookies()` / `params` must be awaited error | Next 15 async request APIs | `const { id } = await params;` and `await cookies()` |
| Supabase paused (free tier) | Inactivity | Open dashboard → Restore; do this before demos |
| Overdue count off by one | Timezone | Compare against `(now() at time zone APP_TIMEZONE)::date` |
| Duplicate tasks after commit | Double click / retry | Disable button while pending; commit is guarded by `extraction_status = 'none'` (409 on repeat) |
| Seed fails on user creation | Users already exist or service key missing | Make seed idempotent (`listUsers` first); check `SUPABASE_SERVICE_ROLE_KEY` |

## 3. Debug procedures
**AI call inspection (dev only):** set `LOG_LEVEL=debug` to log *metadata* (operation, model, token counts, attempt number, Zod issue paths). Prompts and raw outputs are never logged; to inspect output reproduce the same input in AI Studio.

**DB constraint testing:** run the A9/A10 SQL checks from `Testing.md` in the Supabase SQL editor after every migration change.

**RLS testing:** simulate a user (`set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`) then run the failing query.

**Vercel parity:** `npm run build && npm run start` locally before deploying; most prod-only bugs (static/dynamic rendering, env, bundling) reproduce there. Use `export const dynamic = 'force-dynamic'` on authenticated pages that read cookies.

**Bisecting a regression:** commits are per phase; `git bisect` between phase tags, rerun §5 manual checklist rows relevant to the failing feature.

## 4. Escalation / fallback ladder during the assessment
1. AI broken → show manual task entry + deterministic signals; keep demoing persistence/history; explain the design.
2. Deploy broken → demo from `localhost` against the same Supabase project; keep the Vercel build error log ready.
3. Supabase auth broken → last resort: temporary seeded demo login route guarded by env flag (document as limitation). Do not ship it enabled.
