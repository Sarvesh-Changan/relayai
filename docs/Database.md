# RelayAI — Database (Supabase Postgres)

Single shared workspace. All timestamps `timestamptz` (UTC); due dates are `date`; "overdue" is computed against `APP_TIMEZONE` (default `Asia/Kolkata`). Codex must turn this file into `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`.

## 1. Entity overview
```
profiles ─┬─< meeting_participants >─┬─ meetings ─┬─< action_items ─┬─< task_history   (append-only)
          │                          │            │                 └─< task_links ──► meetings | knowledge_documents
          ├─< action_items (owner, original_owner)                    
          ├─< handovers (recipient, from_user) ──► meetings/action_items (scope)
          └─< knowledge_documents (uploaded_by)        app_logs (service-role writes)
```
Original six tables from the brief + `task_links`, `handovers`, `app_logs`. Decisions/risks/open questions are JSONB on `meetings`.

## 2. Enums
```sql
create type user_role         as enum ('admin','manager','member');
create type attendance_status as enum ('invited','attended','absent');
create type task_status       as enum ('open','in_progress','blocked','completed','cancelled');
create type task_priority     as enum ('low','medium','high');
create type history_event     as enum ('created','status_changed','reassigned','due_date_changed','carried_forward','links_updated','note_added');
create type doc_category      as enum ('decision','architecture','policy','runbook','notes','other');
create type link_target       as enum ('meeting','document');
create type link_relation     as enum ('context','carried_forward');
create type link_source       as enum ('ai','manual','system');
create type handover_scope    as enum ('meeting','task','person');
create type handover_status   as enum ('open','acknowledged');
```

## 3. Tables
```sql
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'member',
  created_at timestamptz not null default now()
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  meeting_date timestamptz not null,
  agenda text,
  raw_notes text,
  summary text,
  decisions jsonb not null default '[]',      -- [{text, rationale|null}]
  risks jsonb not null default '[]',          -- [{text, severity}]
  open_questions jsonb not null default '[]', -- [string]
  extraction_status text not null default 'none' check (extraction_status in ('none','committed')),
  ai_generated boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('english', coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(raw_notes,''))) stored
);

create table meeting_participants (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references profiles(id),
  attendance_status attendance_status not null default 'attended',
  primary key (meeting_id, user_id)
);

create sequence action_item_seq start 1;
create table action_items (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique default ('ACT-' || lpad(nextval('action_item_seq')::text, 3, '0')),
  meeting_id uuid references meetings(id),               -- ORIGIN meeting, immutable (trigger)
  title text not null check (length(title) between 1 and 200),
  description text,
  owner_id uuid references profiles(id),                 -- null = unassigned
  original_owner_id uuid references profiles(id),        -- immutable (trigger)
  due_date date,
  priority task_priority not null default 'medium',
  status task_status not null default 'open',
  outcome text,                                          -- required when completed
  status_reason text,                                    -- required when blocked / cancelled
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_has_outcome check (status <> 'completed' or length(coalesce(outcome,'')) > 0),
  constraint blocked_cancelled_has_reason check (status not in ('blocked','cancelled') or length(coalesce(status_reason,'')) > 0)
);

create table task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references action_items(id) on delete restrict,
  event_type history_event not null,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  changed_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  content text not null,
  category doc_category not null default 'notes',
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', title||' '||content)) stored
);

create table task_links (                     -- polymorphic target: validated in RPC/service, no FK by design
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references action_items(id) on delete cascade,
  target_type link_target not null,
  target_id uuid not null,
  relation link_relation not null default 'context',
  reason text,                                -- shown in UI
  relevance numeric(3,2) check (relevance between 0 and 1),
  source link_source not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (task_id, target_type, target_id, relation)
);

create table handovers (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id),
  from_user_id uuid references profiles(id),
  scope_type handover_scope not null,
  meeting_id uuid references meetings(id),
  task_id uuid references action_items(id),
  brief jsonb not null,                       -- validated HandoverBrief with real UUIDs
  model text not null,
  latency_ms integer,
  status handover_status not null default 'open',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table app_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null,
  event text not null,
  request_id text,
  user_id uuid,
  message text,
  duration_ms integer,
  context jsonb not null default '{}'        -- NEVER raw notes/content/secrets
);
```

## 4. Indexes
```sql
create index on meetings (meeting_date desc);
create index meetings_search_idx on meetings using gin (search);
create index on meeting_participants (user_id);
create index on action_items (owner_id, status);
create index on action_items (meeting_id);
create index on action_items (due_date) where status in ('open','in_progress','blocked');
create index on task_history (task_id, created_at desc);
create index on task_links (task_id);
create index on task_links (target_type, target_id);
create index knowledge_search_idx on knowledge_documents using gin (search);
create index on handovers (recipient_id, status);
create index on app_logs (created_at desc);
create index on app_logs (request_id);
create index on app_logs (event);
```

## 5. Triggers (integrity enforced in the DB)
```sql
-- updated_at
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_meetings_touch before update on meetings for each row execute function touch_updated_at();
create trigger t_tasks_touch    before update on action_items for each row execute function touch_updated_at();

-- origin meeting and original owner never change
create function protect_task_origin() returns trigger language plpgsql as $$
begin
  if new.meeting_id is distinct from old.meeting_id then raise exception 'ORIGIN_IMMUTABLE'; end if;
  if new.original_owner_id is distinct from old.original_owner_id then raise exception 'ORIGIN_IMMUTABLE'; end if;
  return new;
end $$;
create trigger t_tasks_protect before update on action_items for each row execute function protect_task_origin();

-- history is append-only
create function block_history_mutation() returns trigger language plpgsql as $$
begin raise exception 'TASK_HISTORY_APPEND_ONLY'; end $$;
create trigger t_history_nomod before update or delete on task_history for each row execute function block_history_mutation();

-- new auth user -> profile (name from raw_user_meta_data->>'name')
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
```

## 6. RPC functions (all `security invoker`, so RLS still applies)
Errors use `raise exception '<CODE>'` where the API maps codes → HTTP: `TASK_NOT_FOUND`→404, `NO_CHANGE`/`INVALID_TRANSITION`/`REASON_REQUIRED`/`OUTCOME_REQUIRED`→422.

```sql
create function reassign_task(p_task_id uuid, p_new_owner uuid, p_reason text)
returns action_items language plpgsql as $$
declare v_old uuid; v_task action_items;
begin
  if length(coalesce(trim(p_reason),'')) = 0 then raise exception 'REASON_REQUIRED'; end if;
  select owner_id into v_old from action_items where id = p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if v_old is not distinct from p_new_owner then raise exception 'NO_CHANGE'; end if;
  update action_items set owner_id = p_new_owner where id = p_task_id returning * into v_task;
  insert into task_history(task_id,event_type,previous_value,new_value,reason,changed_by)
  values (p_task_id,'reassigned', jsonb_build_object('owner_id',v_old), jsonb_build_object('owner_id',p_new_owner), p_reason, auth.uid());
  return v_task;
end $$;

create function change_task_status(p_task_id uuid, p_status task_status, p_reason text default null, p_outcome text default null)
returns action_items language plpgsql as $$
declare v_old task_status; v_task action_items; v_ok boolean;
begin
  select status into v_old from action_items where id = p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if v_old = p_status then raise exception 'NO_CHANGE'; end if;
  v_ok := case v_old
    when 'open'        then p_status in ('in_progress','blocked','completed','cancelled')
    when 'in_progress' then p_status in ('open','blocked','completed','cancelled')
    when 'blocked'     then p_status in ('open','in_progress','cancelled')
    when 'completed'   then p_status in ('in_progress')          -- reopen
    when 'cancelled'   then p_status in ('open')                 -- reopen
  end;
  if not v_ok then raise exception 'INVALID_TRANSITION'; end if;
  if p_status in ('blocked','cancelled') and length(coalesce(trim(p_reason),'')) = 0 then raise exception 'REASON_REQUIRED'; end if;
  if p_status = 'completed' and length(coalesce(trim(p_outcome),'')) = 0 then raise exception 'OUTCOME_REQUIRED'; end if;
  if v_old in ('completed','cancelled') and length(coalesce(trim(p_reason),'')) = 0 then raise exception 'REASON_REQUIRED'; end if; -- reopen needs reason
  update action_items set
    status = p_status,
    outcome = case when p_status = 'completed' then p_outcome else outcome end,   -- keep prior outcome on reopen
    status_reason = case when p_status in ('blocked','cancelled') then p_reason else null end
  where id = p_task_id returning * into v_task;
  insert into task_history(task_id,event_type,previous_value,new_value,reason,changed_by)
  values (p_task_id,'status_changed', jsonb_build_object('status',v_old),
          jsonb_build_object('status',p_status,'outcome',p_outcome), coalesce(p_reason,p_outcome), auth.uid());
  return v_task;
end $$;
-- NOTE for implementer: the completed_has_outcome CHECK is satisfied on reopen because outcome is kept.

create function carry_forward_task(p_task_id uuid, p_meeting_id uuid, p_new_due date, p_reason text)
returns action_items language plpgsql as $$
declare v_task action_items; v_old_due date;
begin
  if not exists (select 1 from meetings where id = p_meeting_id) then raise exception 'MEETING_NOT_FOUND'; end if;
  select due_date into v_old_due from action_items where id = p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  update action_items set due_date = coalesce(p_new_due, due_date) where id = p_task_id returning * into v_task;
  insert into task_links(task_id,target_type,target_id,relation,reason,source,created_by)
  values (p_task_id,'meeting',p_meeting_id,'carried_forward',p_reason,'system',auth.uid())
  on conflict do nothing;
  insert into task_history(task_id,event_type,previous_value,new_value,reason,changed_by)
  values (p_task_id,'carried_forward', jsonb_build_object('due_date',v_old_due),
          jsonb_build_object('meeting_id',p_meeting_id,'due_date',coalesce(p_new_due,v_old_due)), p_reason, auth.uid());
  return v_task;
end $$;

-- Saves a reviewed extraction atomically. p_items: [{title,description,owner_id,due_date,priority}]
create function commit_meeting_extraction(p_meeting_id uuid, p_summary text, p_decisions jsonb, p_risks jsonb,
                                          p_open_questions jsonb, p_items jsonb, p_ai_generated boolean)
returns jsonb language plpgsql as $$
declare v_item jsonb; v_id uuid; v_ids uuid[] := '{}';
begin
  update meetings set summary = p_summary, decisions = p_decisions, risks = p_risks,
         open_questions = p_open_questions, ai_generated = p_ai_generated, extraction_status = 'committed'
  where id = p_meeting_id and extraction_status = 'none';
  if not found then raise exception 'ALREADY_COMMITTED_OR_NOT_FOUND'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into action_items(meeting_id,title,description,owner_id,original_owner_id,due_date,priority,created_by)
    values (p_meeting_id, v_item->>'title', v_item->>'description',
            nullif(v_item->>'owner_id','')::uuid, nullif(v_item->>'owner_id','')::uuid,
            nullif(v_item->>'due_date','')::date, coalesce(v_item->>'priority','medium')::task_priority, auth.uid())
    returning id into v_id;
    insert into task_history(task_id,event_type,new_value,reason,changed_by)
    values (v_id,'created', jsonb_build_object('owner_id', nullif(v_item->>'owner_id',''), 'due_date', v_item->>'due_date',
            'meeting_id', p_meeting_id, 'ai_generated', p_ai_generated), 'Created from meeting notes', auth.uid());
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('task_ids', to_jsonb(v_ids));
end $$;
```
Manual single-task creation (`POST /api/tasks`) uses the same insert + `created` history inside a small RPC `create_task(...)` (Codex: mirror the loop body).

## 7. Row Level Security
Enable RLS on **all** tables. Helper: `create function is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'admin') $$;`

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | authenticated | — (trigger) | own row (`id = auth.uid()`), cannot change `role` unless admin | — |
| meetings | authenticated | `created_by = auth.uid()` | authenticated | — |
| meeting_participants | authenticated | authenticated | authenticated | authenticated |
| action_items | authenticated | `created_by = auth.uid()` | authenticated | — |
| task_history | authenticated | `changed_by = auth.uid()` | **none** | **none** (plus trigger) |
| knowledge_documents | authenticated | `uploaded_by = auth.uid()` | uploader or admin | uploader or admin |
| task_links | authenticated | authenticated | authenticated | authenticated |
| handovers | authenticated | `created_by = auth.uid()` | `recipient_id = auth.uid()` (acknowledge) | — |
| app_logs | admin only | **service role only** (bypasses RLS) | — | — |

Policy template:
```sql
alter table action_items enable row level security;
create policy "tasks_select" on action_items for select to authenticated using (true);
create policy "tasks_insert" on action_items for insert to authenticated with check (created_by = auth.uid());
create policy "tasks_update" on action_items for update to authenticated using (true) with check (true);
```
Limitation to state honestly: single-workspace trust model; multi-tenant isolation (an `org_id` column on every table) is future work.

## 8. Retrieval queries used by AI features
- Documents/meetings for a task: `websearch_to_tsquery('english', :task_title || ' ' || :task_description)` against `search`, ordered by `ts_rank`, limit 6/6; plus meetings already linked or the origin meeting.
- Overdue: `due_date < (now() at time zone :tz)::date and status in ('open','in_progress','blocked')`.
- Reassignment count: `count(*) from task_history where task_id = t.id and event_type = 'reassigned'`.

## 9. Seed data (`scripts/seed.ts`, service role; idempotent)
- Auth users (email confirmed, password = `SEED_PASSWORD`): Aisha Khan (manager), Rahul Sharma, Priya Nair, Dev Patel (members).
- Meeting **"Security Review – Project Phoenix"** (27 Oct 2026): participants Aisha, Rahul, Priya; hand-written notes, summary and decisions ("Use JWT with 15-min access tokens + refresh rotation", "Security testing before every release"); tasks: *Implement backend authentication* (Rahul, completed, outcome written) and *Payment integration* (Dev, due 29 Oct, open → appears overdue).
- Knowledge documents: "Auth Security Guidelines", "Project Phoenix Architecture Overview", "Release Checklist".
- Seeded rows are ordinary persisted data created by humans; **no pre-generated AI output** is seeded.
