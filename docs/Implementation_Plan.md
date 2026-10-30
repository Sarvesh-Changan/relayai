# RelayAI — Implementation Plan (210 minutes)

Two tools run **in parallel**: **Codex** builds the app; **Google AI Studio** tunes prompts/schemas that Codex then wires in. Both obey the same contracts (`Database.md`, `API.md`, `Prompts.md`).

## 0. Before the clock starts (only if the rules allow preparation — check the assessment brief)
Create accounts/projects: GitHub repo, Supabase project, Google AI Studio API key, Vercel account linked to GitHub. Having `/docs` ready is the plan's assumption; if planning counts against the 3.5 h, Phase 0 is the first 15 minutes and nothing else changes.

## 1. Phase table
| # | Time (min) | Phase | Tool | Dependencies | Deliverable / expected outcome |
|---|---|---|---|---|---|
| 0 | 0–15 | Bootstrap | Codex (C1) ‖ AI Studio (A1 start) | Docs in `/docs`, accounts | Repo scaffolded (Next 15, TS, Tailwind, shadcn, Zod, Pino, Vitest), env validation, `/api/health`, first commit; model chosen |
| 1 | 15–40 | Database & auth data layer | Codex (C2) ‖ A1 continues | Phase 0, Supabase keys | Migrations applied; RLS; RPCs; seed users + prior meeting/docs; typed Supabase clients; `withApiHandler`, logger, error mapping |
| 2 | 40–65 | App shell, auth, dashboard | Codex (C3) | Phase 1 | Login, middleware, sidebar layout, design tokens, dashboard with **real** stats/activity/deadlines |
| 3 | 65–95 | Meetings + AI extraction | Codex (C4) with A1 output | Phases 1–2, A1 prompt/schema | Create/list/view meeting; `/api/ai/extract`; review UI; commit RPC; manual fallback |
| 4 | 95–125 | Action items + history | Codex (C5) ‖ AI Studio A2 (handover prompt) | Phase 3 | Task table/filters, detail with timeline, reassign/status/carry-forward via RPC |
| 5 | 125–150 | **AI Handover / Continuity Engine** | Codex (C6) with A2 output | Phase 4, A2 | Context builder, ref mapping, `/api/ai/handover`, handover pages, acknowledge |
| 6 | 150–165 | Knowledge base + AI linking | Codex (C7) with A3 (A3 tuned during phase 5) | Phase 4 | Docs CRUD/search, link suggestions with reasons, accept/reject |
| 7 | 165–175 | AI insights | Codex (C8) with A4 (tuned during phase 6) | Phase 4 | Signals + AI insights on dashboard, graceful degrade |
| 8 | 175–190 | Hardening: logs, errors, tests | Codex (C9) | All features | Event catalog complete, `app_logs` via `after()`, unit tests U1–U14, manual QA pass |
| 9 | 190–205 | Deploy | Codex (C10) + you | Phase 8 | Live Vercel URL, env set, prod smoke test |
| 10 | 205–210 | README + demo rehearsal | Codex (C10) + you | Phase 9 | README, demo run-through once |

Total: 210 min. No slack is hidden — slack comes from the cut line below.

## 2. Parallel track for Google AI Studio (does not block Codex)
| Minutes | Prompt | Output saved as |
|---|---|---|
| 0–35 | A1 model + extraction tuning (E1–E5) | `lib/ai/prompts/extract.ts` (via C4) |
| 95–125 | A2 handover tuning (E6) | `lib/ai/prompts/handover.ts` |
| 125–150 | A3 link-ranking (E7) | `lib/ai/prompts/link.ts` |
| 150–165 | A4 insights (E8) | `lib/ai/prompts/insights.ts` |
Each AI Studio session ends by pasting the **final system instruction + JSON schema + temperature** into the repo (Prompts.md describes the hand-off).

## 3. Milestones (go/no-go checkpoints)
| Minute | Must be true | If not |
|---|---|---|
| 40 | DB migrated, seed works, `/api/health` ok | Stop features; fix DB now (everything depends on it) |
| 95 | Meeting → AI extract → review → commit works against real DB | Drop polish; ship manual-entry fallback first |
| 125 | Tasks + reassign + history work | Skip carry-forward |
| 150 | Handover brief generated and persisted | This is the hero feature — cut elsewhere, not here |
| 175 | All P0 complete | Start hardening immediately |
| 190 | Quality gates green | No new features |

## 4. Cut line (in order, if behind)
1. Team page, CSV export, Playwright.
2. Carry-forward (keep reassign + status).
3. AI insights → keep deterministic signals only.
4. AI link suggestions → keep manual "attach document/meeting" with reason text.
5. Never cut: extraction → commit → reassign → history → handover → logging → deploy.

## 5. Per-phase definition of done
`typecheck && lint && test && build` green · feature verified against real Supabase/Gemini · loading/empty/error states present · expected log events appear · committed with a conventional message.

## 6. Time-boxing rules
- Any bug > 10 min: choose the simplest workaround that keeps the contract, note it, move on.
- Do not restyle until Phase 8; use shadcn defaults + tokens.
- Avoid re-prompting Codex for large rewrites; give targeted fixes referencing doc sections.
- Commit at the end of every phase (`git tag phase-N`) for rollback.

## 7. Risk register
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini quota/latency during demo | Medium | High | Warm-up run, retry/backoff, manual fallback, rehearsed backup recording of a good run |
| RLS misconfig blocks reads | Medium | High | Test queries as `authenticated` early (Phase 1) |
| Supabase auth/cookie issues in App Router | Medium | High | Use `@supabase/ssr` pattern exactly; verify at Phase 2 |
| Pino file logging bundling errors | Medium | Medium | `serverExternalPackages`, multistream; stdout always on |
| Scope creep | High | High | `AGENTS.md` rule 11, cut line |
| Vercel function timeout | Low–Med | Medium | `maxDuration`, smaller context caps |

## 8. What you must be able to explain to evaluators (2-minute talk track)
1. The problem (lost context at handover) and the hero demo (notes → tasks → reassign → brief).
2. Why history is append-only and enforced in the database (triggers + RPC transactions).
3. How AI is made trustworthy: structured output, Zod, ref whitelisting, owner matching, human review, gaps field.
4. Logging design: request IDs, event catalog, AI latency, serverless-safe persistence.
5. Honest limitations and next steps (embeddings, multi-tenant orgs, integrations).
