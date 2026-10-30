# RelayAI — Deployment

## 1. Environment variables
| Variable | Scope | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | yes | The anon / publishable key (new projects may label it "publishable") |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | yes | Service-role / secret key. Used for `app_logs` inserts and seed. Never `NEXT_PUBLIC_` |
| `GEMINI_API_KEY` | **server only** | yes for AI | Google AI Studio → Get API key |
| `GEMINI_MODEL` | server | yes | Model chosen in AI Studio (Prompts.md A1); verify current free-tier availability |
| `AI_TIMEOUT_MS` | server | no (25000) | Must be < route `maxDuration` |
| `AI_RATE_LIMIT_PER_MIN` | server | no (10) | Per-user soft limit |
| `APP_TIMEZONE` | server | no (`Asia/Kolkata`) | Overdue calculation + date display |
| `LOG_LEVEL` | server | no (`info`) | `debug` only in dev |
| `LOG_TO_FILE` | server | no (`true` dev / `false` prod) | Writes `logs/app.log` |
| `NEXT_PUBLIC_APP_URL` | client+server | yes | `http://localhost:3000` / production URL |
| `NEXT_PUBLIC_DEMO_HINTS` | client | no | `true` shows demo account emails on login page — set `false` after demo if URL is public |
| `SEED_PASSWORD` | local only | seed | Password for seeded users; never commit |

Provide `.env.example` with all keys (no values) and keep `.env.local` git-ignored. `lib/env.ts` validates at boot.

## 2. One-time setup
### Supabase (≈ 10 min)
1. Create project (free) → note URL, anon key, service-role key.
2. Run migrations: Option A `supabase link` + `supabase db push`; Option B paste `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql` into the SQL editor in order.
3. Authentication → Providers: Email enabled. For the demo, disable "Confirm email" (seeded users are created pre-confirmed anyway). Authentication → URL Configuration: Site URL = production URL; add `http://localhost:3000` to redirect URLs.
4. Run `npm run seed` locally against this project.
5. Verify: tables exist, RLS enabled (green shield) on every table, `select proname from pg_proc where proname in ('reassign_task','change_task_status','carry_forward_task','commit_meeting_extraction')` returns 4 rows.

### Google AI Studio / Gemini
1. aistudio.google.com → Get API key (free tier). Use the API key only server-side.
2. Finalise model + prompts (Prompts.md A1–A4); set `GEMINI_MODEL`.
3. Use synthetic data only: free-tier prompts may be used by Google to improve its products.

### GitHub
Push repo (no secrets). Protect `main` loosely; one commit per phase.

## 3. Vercel deployment
1. vercel.com → Add New → Project → import GitHub repo (framework auto-detected: Next.js).
2. Add **all** env vars from §1 for *Production* (and *Preview* if used). Do not set `LOG_TO_FILE=true`.
3. Deploy. Copy the production URL → set `NEXT_PUBLIC_APP_URL` (redeploy) and Supabase Site URL/redirects.
4. Region: pick the Vercel function region closest to the Supabase region (Project → Settings → Functions) to cut latency.
5. Confirm AI routes use `export const maxDuration = 60` (check what your plan permits; lower and trim context if capped).
6. Smoke test (below). Keep the previous deployment available for instant rollback (Vercel → Deployments → Promote).

## 4. Production checklist
**Security**
- [ ] `.env*` and `logs/` ignored; no secrets in repo history (`git log -p | grep -i "service_role\|AIza"` returns nothing)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` not prefixed `NEXT_PUBLIC_`; not present in client bundle (`.next/static` grep)
- [ ] RLS enabled on all 9 tables; anonymous request to REST API returns nothing
- [ ] Demo passwords are not reused elsewhere; consider changing after the assessment

**Functionality**
- [ ] `/api/health` → `{status:'ok', db:'ok', ai:'configured'}`
- [ ] Login works with seeded user; unauthenticated redirects
- [ ] Full demo script (`PRD.md` §6) passes on the production URL
- [ ] AI extract latency acceptable (record the number for the README)
- [ ] Data survives redeploy

**Observability**
- [ ] Vercel logs show JSON lines with `requestId`
- [ ] `app_logs` receives `MEETING_CREATED`, `TASK_REASSIGNED`, `AI_REQUEST_COMPLETED` (with `latencyMs`)
- [ ] No raw notes in logs or `app_logs.context`

**Docs**
- [ ] README: overview, architecture diagram, setup, env table, AI configuration (model, schema validation, fallbacks), logging explanation (file vs Vercel vs table), Continuity Engine explanation, demo credentials, assumptions & limitations
- [ ] Submission links: repo URL, live URL, demo credentials, 3-line summary

## 5. Pre-demo routine (T-15 min)
Open Supabase dashboard (wakes a paused project) → hit `/api/health` → log in → run one extraction to warm the model → leave the dashboard open. Have localhost running as backup.

## 6. Rollback & recovery
- Bad deploy: Vercel → Deployments → previous → Promote to Production.
- Bad migration: write a new corrective migration; for demo data only, re-run `npm run seed` (idempotent).
- Key leaked: rotate in Supabase/AI Studio, update Vercel env, redeploy.

## 7. Known limitations to state in the README
Single-workspace trust model (no org isolation); in-memory AI rate limit is per instance; free-tier quotas and Supabase pausing; no audio transcription; retrieval is Postgres FTS + AI re-ranking (no embeddings); AI output must be reviewed by humans before it is committed.
