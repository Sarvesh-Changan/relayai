# RelayAI

**Work moves forward. Context stays.** RelayAI is a shared workspace for capturing meeting decisions and action items, then keeping the history behind that work.

## Overview and problem

When a teammate misses a meeting or hands work over, the reason behind a task can get lost. RelayAI connects meeting notes to decisions, owners, deadlines, and task history so teammates can see what was agreed and how work changed.

The current app includes Supabase email/password sign-in, a live dashboard and team directory, and meeting capture with an AI extraction review and commit flow. Tasks, handovers, and the knowledge base currently have placeholder pages; their database tables do not mean those product flows are complete.

## Live URL

**Not deployed yet:** `https://<your-relayai-deployment-url>`

Replace this placeholder after deploying the app.

## Approach and architecture

- **Next.js 15 App Router and TypeScript** serve the UI and authenticated API routes from one app.
- **Supabase** provides email/password authentication and PostgreSQL. Server routes use the session-scoped client and database policies; the service-role client stays server-side.
- **Gemini** is called from the server through `@google/genai`. Meeting notes are validated and processed on the server and are not sent to the browser as an AI credential.
- **Zod** validates request bodies and model responses. Services hold meeting and dashboard queries; PostgreSQL functions handle multi-row task commits.

```text
Browser
  ├─ Supabase session ──> Next.js middleware
  └─ UI ──> authenticated /api routes ──> services ──> Supabase/Postgres
                                             └───────> Gemini (AI routes only)
```

## AI configuration

Meeting extraction is configured for **`gemini-3.8-flash`**, temperature **0.2**, medium thinking, JSON structured output, and a 2,048-token output limit. `GEMINI_MODEL` selects the model; `AI_TIMEOUT_MS` controls the request timeout.

The server validates model output with Zod and allows one repair attempt. It matches suggested owners only to real team profiles, removes due dates earlier than the meeting date, and flags uncertain or incomplete tasks for review. The user can edit the summary, decisions, action items, risks, and questions before committing them. If AI is unavailable, the UI preserves the notes and provides a manual task entry path. Prompt instructions and the extraction schema are in [`docs/ai/extract.md`](docs/ai/extract.md).

**Live provider status:** the extraction code is implemented, but a successful live extraction has not yet been verified. During the latest check, the app request timed out and a minimal direct Gemini request received HTTP 503. A working Gemini API key, model access, and provider availability are needed to complete the live AI flow.

## Data source

The seed script creates synthetic demo data only: four confirmed demo accounts, a prior security review meeting, two action items, and three knowledge documents. It does not seed AI-generated output. Do not use real or sensitive meeting notes with the demo project.

## Logging setup

- Pino writes structured JSON logs with request IDs and ISO timestamps.
- Set `LOG_TO_FILE=true` to write local logs to `logs/app.log`; stdout is also used.
- AI request start, success, failure, elapsed time, attempt count, and available token counts are logged. Prompts, generated output, raw notes, passwords, cookies, and keys are not intentionally logged.
- The database includes an `app_logs` table, but automatic application writes to that table are **not wired up yet**. Production logs are currently available through the hosting platform's captured stdout.

## Special feature: AI Context Continuity Engine

The database protects task history as append-only: triggers reject task-history updates and deletes, and protect a task's original owner and originating meeting. The task lifecycle RPCs append history as they change status, reassign work, carry tasks forward, or commit meeting action items. Meeting extraction commits its meeting data, tasks, and `created` history entries in one database transaction.

Grounded handover briefs are part of the product design: the intended AI flow uses request-local references and drops references that are outside the retrieved context. **Handover generation and reference whitelisting are not implemented in the current app yet**; `/handover` is a placeholder page.

## Assumptions

- This deployment is a single shared workspace. It does not isolate multiple organizations.
- Demo records and notes are synthetic. The seed password is supplied locally through `SEED_PASSWORD` and is shared by the four demo accounts.
- Gemini and Supabase availability, free-tier quotas, and service pausing can affect the demo.
- The in-memory AI rate limit is best-effort and resets when a server instance restarts.

## Known limitations and next steps

- Complete a successful Gemini extraction and database commit against the configured project; the provider returned 503 during the most recent live check.
- Build the task list/detail experience, handover generation and reference mapping, and knowledge search/edit flows. These routes currently show placeholders.
- Wire production business logs to `app_logs`; the table exists, but application persistence is not active.
- Add organization-level isolation before using this as a multi-team service.
- Add live end-to-end coverage for login, AI fallback, meeting commit, and task history.
- Audio/video transcription and vector search are out of scope for the current version.

## Setup

### Requirements

- Node.js 20 or later and npm
- A Supabase project
- A Google AI Studio API key for live extraction

### Configure Supabase

Create a Supabase project and copy its project URL, anon/publishable key, and service-role key from Project Settings → API. Apply the migrations in order using the SQL editor:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_functions.sql`

Alternatively, if the Supabase CLI is installed and the project is linked:

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

### Configure environment

Create `.env.local` in the project root. Keep it out of version control.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
AI_TIMEOUT_MS=25000
AI_RATE_LIMIT_PER_MIN=10
APP_TIMEZONE=Asia/Kolkata
LOG_LEVEL=info
LOG_TO_FILE=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_HINTS=false
SEED_PASSWORD=
```

`GEMINI_API_KEY` may be omitted to start the app without AI. The Supabase variables, `GEMINI_MODEL`, and `NEXT_PUBLIC_APP_URL` are required by environment validation. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` through a `NEXT_PUBLIC_` variable.

### Install, seed, and run

```bash
npm install
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The seed script requires `SEED_PASSWORD` and is idempotent. All four seeded users share that password:

| Name | Role | Email |
|---|---|---|
| Aisha Khan | Manager | `aisha.khan@relayai.demo` |
| Rahul Sharma | Member | `rahul.sharma@relayai.demo` |
| Priya Nair | Member | `priya.nair@relayai.demo` |
| Dev Patel | Member | `dev.patel@relayai.demo` |

The password is intentionally not included in this repository; use the value you set for `SEED_PASSWORD`.

### Quality checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
