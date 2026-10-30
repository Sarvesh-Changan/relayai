create extension if not exists pgcrypto;

create type user_role as enum ('admin','manager','member');
create type attendance_status as enum ('invited','attended','absent');
create type task_status as enum ('open','in_progress','blocked','completed','cancelled');
create type task_priority as enum ('low','medium','high');
create type history_event as enum ('created','status_changed','reassigned','due_date_changed','carried_forward','links_updated','note_added');
create type doc_category as enum ('decision','architecture','policy','runbook','notes','other');
create type link_target as enum ('meeting','document');
create type link_relation as enum ('context','carried_forward');
create type link_source as enum ('ai','manual','system');
create type handover_scope as enum ('meeting','task','person');
create type handover_status as enum ('open','acknowledged');

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
  decisions jsonb not null default '[]',
  risks jsonb not null default '[]',
  open_questions jsonb not null default '[]',
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
  meeting_id uuid references meetings(id),
  title text not null check (length(title) between 1 and 200),
  description text,
  owner_id uuid references profiles(id),
  original_owner_id uuid references profiles(id),
  due_date date,
  priority task_priority not null default 'medium',
  status task_status not null default 'open',
  outcome text,
  status_reason text,
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

create table task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references action_items(id) on delete cascade,
  target_type link_target not null,
  target_id uuid not null,
  relation link_relation not null default 'context',
  reason text,
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
  brief jsonb not null,
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
  context jsonb not null default '{}'
);

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

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_meetings_touch before update on meetings for each row execute function touch_updated_at();
create trigger t_tasks_touch before update on action_items for each row execute function touch_updated_at();

create function protect_task_origin() returns trigger language plpgsql as $$
begin
  if new.meeting_id is distinct from old.meeting_id then raise exception 'ORIGIN_IMMUTABLE'; end if;
  if new.original_owner_id is distinct from old.original_owner_id then raise exception 'ORIGIN_IMMUTABLE'; end if;
  return new;
end $$;
create trigger t_tasks_protect before update on action_items for each row execute function protect_task_origin();

create function block_history_mutation() returns trigger language plpgsql as $$
begin raise exception 'TASK_HISTORY_APPEND_ONLY'; end $$;
create trigger t_history_nomod before update or delete on task_history for each row execute function block_history_mutation();

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
