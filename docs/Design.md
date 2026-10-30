# RelayAI — Design System & UX

Direction: minimal, light, enterprise SaaS (Linear / Notion feel). Violet is reserved for **AI** so users always know what is machine-generated.

## 1. Tokens
| Token | Value | Use |
|---|---|---|
| `--background` | `#FFFFFF` | App canvas |
| `--surface` | `#F8FAFC` (slate-50) | Sidebar, table headers, cards on white |
| `--border` | `#E2E8F0` (slate-200) | All borders |
| `--foreground` | `#0F172A` (navy/slate-900) | Primary text, primary buttons |
| `--muted` | `#64748B` (slate-500) | Secondary text |
| `--ai` | `#7C3AED` (violet-600) / bg `#F5F3FF` | AI badges, AI cards, "Generate with AI" |
| Status colors | open `slate`, in_progress `blue`, blocked `amber`, completed `emerald`, cancelled `zinc`, overdue `red` | Badges (soft bg + dark text) |

Typography: Inter via `next/font`; base 14 px; page title 20/600; section title 14/600 uppercase-muted for sidebar groups; mono for IDs (`ACT-024`). Radius 8 px; shadows only on dialogs/popovers; spacing scale 4/8/12/16/24. No gradients, no decorative animation (only skeleton shimmer and 150 ms transitions).

shadcn components to install: `button card input textarea select badge table dialog sheet tabs dropdown-menu popover command calendar skeleton sonner separator avatar tooltip form label checkbox`.

## 2. Layout & navigation
```
┌────────────┬──────────────────────────────────────────────┐
│ relayai    │  Page title                     [🔍] [Avatar ▾] │
│ WORKSPACE  ├──────────────────────────────────────────────┤
│ Overview   │                                              │
│ Meetings   │   content (max-w 1200, 24 px padding)        │
│ Action Items│                                              │
│ AI Handover│                                              │
│ Knowledge  │                                              │
│ MANAGEMENT │                                              │
│ Team       │                                              │
└────────────┴──────────────────────────────────────────────┘
```
Sidebar 240 px, `--surface` bg, active item has white bg + border + navy text; collapses into a `Sheet` below `lg`. Top bar: page title, global search (optional), user menu (name, role, sign out).

| Route | Page |
|---|---|
| `/login` | Centered card, email + password, error state |
| `/dashboard` | Overview |
| `/meetings`, `/meetings/new`, `/meetings/[id]` | List, create + AI review, detail |
| `/tasks`, `/tasks/[id]` | Table with filters; detail page with timeline |
| `/handover`, `/handover/[id]` | Generator + history list; brief viewer |
| `/knowledge` | Search + list + add dialog |
| `/team` | Read-only directory (P1) |

## 3. Page specs
### Dashboard
- Row of 4 stat cards: Active tasks, Overdue (red number when > 0), Meetings, Open handovers.
- **AI Workspace Insights** card (violet border-left, "AI" badge): headline + up to 4 insights, each with severity dot, text, linked task chips, "Refresh". Loading skeleton; error → shows deterministic signals with note "AI summary unavailable".
- Two columns: Recent activity (task history + meetings, relative time) / Upcoming deadlines (next 7 days, overdue first).

### Meetings → New (two-step)
1. **Details**: title, date-time, agenda, participants (multi-select with avatars), raw notes (large textarea, char counter, "Load sample" only in demo env). Buttons: *Save draft*, **✦ Generate with AI**.
2. **Review** (split view): left = notes; right = editable results: summary textarea, decisions list (add/remove), tasks table (title, owner select, due date, priority; rows with `needs_review` show amber "Needs review: owner not found"), risks. Footer: *Back*, **Save meeting & create N tasks**. Banner: "AI-generated — review before saving". If AI fails: red alert + "Add tasks manually" (same table, empty).

### Action Items
- Toolbar: search, status multi-filter, owner filter, "Overdue only" toggle, sort (due date, updated, priority).
- Table columns: ID (mono), Title, Owner (avatar+name), Due (red if overdue), Priority, Status badge, Updated. Row click → detail page.
- Detail: header (ID, title, status, owner, due, priority, origin meeting link); actions **Reassign**, **Change status**, **Carry forward**; tabs: *Timeline* (default), *Context* (linked meetings/docs with reason + AI "Suggest links"), *Handover* (**✦ Generate takeover brief** — opens `/handover` prefilled).
- Timeline item: icon by event, actor, relative + absolute time, from→to chips, reason text. Original owner & origin meeting pinned at top of the timeline ("Originally assigned to Rahul · Sprint Planning, 27 Oct").
- Dialogs: Reassign (new owner, reason required), Status (status, reason/outcome per rules), Carry forward (meeting select, optional new due date, reason).

### AI Handover
- Left panel (form): Recipient, Scope (tabs: *Missed meeting* / *One task* / *Person's workload* + from-user), **✦ Generate brief**. Below: previous briefs list with status (open/acknowledged).
- Brief viewer (right or `/handover/[id]`): headline, situation, sections (Decisions, In progress, Remaining, Blockers, Deadlines, Risks, **Recommended next steps** numbered), References as chips linking to meetings/docs/tasks, "Gaps / not known" callout (amber) when AI lists gaps. Buttons: Copy as text, **Acknowledge** (recipient only).

### Knowledge Base
Search input (debounced), category filter, document cards/rows (title, category, snippet, author, date), Add dialog (title, category, content), detail drawer. Task context tab reuses link cards: icon, title, **reason** sentence, relevance bar, Accept/Reject.

## 4. States (mandatory on every data view)
| State | Pattern |
|---|---|
| Loading | Skeletons matching final layout; AI actions show spinner + "Analysing notes… usually under 10 s" |
| Empty | Icon + one-line explanation + primary action |
| Error | Inline alert with message from API envelope, `requestId` in small mono text, Retry |
| Success | `sonner` toast |
| Disabled | Buttons disabled while pending; no double submit |

## 5. Content & microcopy
Sentence case, action verbs ("Reassign task", "Generate brief"). AI features always labelled with the ✦ icon + "AI". Never present AI output as fact: "Suggested", "AI-generated — review".

## 6. Accessibility & responsiveness
Contrast ≥ 4.5:1; focus rings visible; all icon buttons have `aria-label`; dialogs trap focus (shadcn default); table scrolls horizontally in a container < 768 px; status never conveyed by color alone (badge includes text).
