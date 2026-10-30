-- A9: the update must raise TASK_HISTORY_APPEND_ONLY. Run in the SQL editor.
do $$
declare v_history_id uuid; v_error text;
begin
  select id into v_history_id from public.task_history order by created_at limit 1;
  if v_history_id is null then raise exception 'A9 requires at least one task_history row (run npm run seed first).'; end if;
  begin
    update public.task_history set reason = 'A9 must be rejected' where id = v_history_id;
    raise exception 'A9 failed: task_history update unexpectedly succeeded.';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error not like '%TASK_HISTORY_APPEND_ONLY%' then raise; end if;
  end;
end $$;

-- A10: the update must raise ORIGIN_IMMUTABLE. Run in the SQL editor.
do $$
declare v_task_id uuid; v_error text;
begin
  select id into v_task_id from public.action_items where meeting_id is not null limit 1;
  if v_task_id is null then raise exception 'A10 requires an action item with an origin meeting (run npm run seed first).'; end if;
  begin
    update public.action_items set meeting_id = gen_random_uuid() where id = v_task_id;
    raise exception 'A10 failed: changing action_items.meeting_id unexpectedly succeeded.';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error not like '%ORIGIN_IMMUTABLE%' then raise; end if;
  end;
end $$;

-- A11: the valid first item must not persist when the second item is invalid.
-- The outer transaction is rolled back, so this check leaves no test meeting behind.
begin;
do $$
declare
  v_actor uuid;
  v_meeting_id uuid;
  v_before bigint;
  v_after bigint;
  v_failed boolean := false;
begin
  select id into v_actor from public.profiles order by created_at limit 1;
  if v_actor is null then raise exception 'A11 requires a profile (run npm run seed first).'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  insert into public.meetings(title, meeting_date, created_by)
  values ('A11 rollback verification', now(), v_actor)
  returning id into v_meeting_id;
  select count(*) into v_before from public.action_items where meeting_id = v_meeting_id;

  begin
    perform public.commit_meeting_extraction(
      v_meeting_id,
      'A11 test summary',
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('title', 'Valid first item', 'owner_id', null, 'due_date', null, 'priority', 'medium'),
        jsonb_build_object('title', 'Invalid second item', 'owner_id', null, 'due_date', null, 'priority', 'invalid')
      ),
      false
    );
  exception when others then
    v_failed := true;
  end;

  if not v_failed then raise exception 'A11 failed: invalid extraction unexpectedly succeeded.'; end if;
  select count(*) into v_after from public.action_items where meeting_id = v_meeting_id;
  if v_after <> v_before then raise exception 'A11 failed: partial action items persisted.'; end if;
  if (select extraction_status from public.meetings where id = v_meeting_id) <> 'none' then
    raise exception 'A11 failed: meeting extraction state was partially committed.';
  end if;
  raise notice 'A11 passed: invalid extraction rolled back all writes.';
end $$;
rollback;

-- RLS simulation: replace the UUID with a real authenticated profile id.
-- This checks authenticated visibility and helper behavior under the authenticated role.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<AUTHENTICATED_USER_UUID>', true);
select auth.uid() as simulated_user_id, public.is_admin() as simulated_is_admin;
select
  (select count(*) from public.profiles) as visible_profiles,
  (select count(*) from public.meetings) as visible_meetings,
  (select count(*) from public.action_items) as visible_tasks,
  (select count(*) from public.app_logs) as visible_logs;
rollback;
