# RelayAI — Product Requirements Document

> Work moves forward. Context stays.

## 1. Problem
When someone misses a meeting, goes on leave or hands work over, context is lost: decisions are forgotten, action items stall, and the person taking over has to ask "what did I miss?". Task trackers store *status*; meeting tools store *transcripts*; nobody stores the **reasoning and history behind a task** and connects it to the people who inherit it.

## 2. Product
RelayAI is a team's shared work memory. It turns unstructured meeting notes into structured knowledge (decisions, tasks, owners, deadlines, risks), preserves the full history of every task, and generates personalised catch-up / handover briefs grounded in that history.

**Signature feature — AI Context Continuity Engine:** every task carries an append-only history (creation, progress, reassignment, carry-forward, completion), links to its originating meeting and related decisions/documents, and can produce an AI takeover brief that explains what happened, what remains and what to do next. Nothing is silently overwritten.

## 3. Personas
| Persona | Name (demo) | Need |
|---|---|---|
| Team lead | Aisha Khan | See risks, reassign work without losing context |
| Contributor | Rahul Sharma | Capture meeting outcomes fast; hand over cleanly before leave |
| Taking over | Priya Nair | Understand inherited work without asking anyone |
| Absent attendee | Dev Patel | Catch up on a missed meeting in 1 minute |

## 4. Scope
### P0 — must work end to end (the demo)
| ID | Requirement | Acceptance criteria |
|---|---|---|
| F1 | Auth | Email/password sign-in via Supabase; unauthenticated users are redirected to `/login`; API returns 401 |
| F2 | Meetings | Create meeting (title, date, agenda, participants, raw notes); list; view; edit |
| F3 | AI extraction | "Generate with AI" returns summary, decisions, action items (owner, due date, priority), risks, open questions; Zod-validated; unmatched owners are marked **unassigned**; user reviews/edits before saving |
| F4 | Commit extraction | Saving persists meeting summary/decisions/risks and creates tasks + a `created` history event per task, atomically |
| F5 | Task lifecycle | Statuses `open, in_progress, blocked, completed, cancelled`; blocked and cancelled require a reason; completed requires an outcome; invalid transitions rejected |
| F6 | Reassignment | Reassign with reason; previous owner preserved in history; original owner and originating meeting never change |
| F7 | Task history | Task detail shows chronological, append-only timeline |
| F8 | AI handover | Choose recipient + scope (missed meeting / one task / a person's workload) → brief with situation, decisions, in-progress, remaining, blockers, deadlines, risks, next steps, references, gaps; saved and listed |
| F9 | Dashboard | Real counts (meetings, active tasks, overdue, open handovers), recent activity, upcoming deadlines, AI insights |
| F10 | Knowledge base | Add/search/view documents; AI-suggested links from a task to meetings/documents, each with a visible reason; user accepts or rejects |
| F11 | Logging | Pino JSON logs with request ID, business events, AI latency, errors; local file + stdout + Supabase `app_logs` |
| F12 | Errors | AI/DB/validation failures return typed errors; UI shows useful messages and a manual fallback |

### P1 — if time allows
Carry-forward of a task to a later meeting (history event + link); AI insights card on dashboard; Team directory page; CSV export of tasks.

### P2 — explicitly out of scope
Audio/video transcription, vector search/embeddings, real-time collaboration, email/Slack integrations, multi-tenant orgs, billing, mobile app.

## 5. User journeys
**J1 Capture:** Rahul creates "Sprint Planning – Project Phoenix", pastes notes → Generate with AI → reviews decisions/tasks (an unknown owner shows "Unassigned – needs review") → Save.
**J2 Transfer:** Rahul is unavailable → Aisha opens ACT-0xx → Reassign to Priya with reason → history shows Rahul → Priya.
**J3 Takeover:** Priya opens AI Handover → recipient = Priya, scope = person's workload (from Rahul) → brief cites the 27 Oct security discussion and says "backend done, frontend integration remaining".
**J4 Missed meeting:** Dev selects the Phoenix meeting → catch-up brief of what was decided and what needs his attention.
**J5 Close:** Priya completes the task with an outcome → history, dashboard counts and activity update.

## 6. Demo script (5 minutes)
1. Dashboard (real stats + insights) → 2. Meetings → New → paste notes (see `Testing.md` §6) → Generate → review → Save → 3. Tasks → reassign Rahul's task to Priya → show history → 4. AI Handover → Priya brief with linked 27 Oct decision → 5. Complete task with outcome → dashboard updates → 6. Show Supabase `app_logs` / `logs/app.log` with request ID and AI latency.

## 7. Non-functional requirements
- Time-to-extraction under ~10 s typical; loading skeletons for all AI calls.
- No secrets, API keys or raw meeting notes in logs.
- AI output never trusted: schema validation, ID whitelisting, owner matching against real profiles.
- Works on latest Chrome; responsive down to tablet width.
- Free-tier only (Vercel Hobby, Supabase Free, Gemini free tier). Demo with synthetic data only (free-tier prompts may be used by Google to improve products).

## 8. Evaluation mapping
| Assessment area | Where demonstrated |
|---|---|
| Functionality | J1→J5 flow |
| AI | Structured extraction, grounded handover, ranked linking |
| Engineering | Layered Next.js app, Zod, RLS, RPC transactions |
| Data | Relational schema, append-only history |
| Logging | Request IDs, event catalog, AI latency, durable `app_logs` |
| Originality | Context Continuity Engine |
| UX | Linear/Notion-style light UI, complete states |

## 9. Assumptions & risks
| Risk | Mitigation |
|---|---|
| Gemini rate limit/timeouts | Retry once, typed errors, manual fallback form, demo with pre-warmed run |
| Time overrun | Cut line defined in `Implementation_Plan.md` |
| Free-tier Supabase pause | Open project 10 min before demo |
| Owner name ambiguity | Match only against real profiles; otherwise unassigned + review flag |
