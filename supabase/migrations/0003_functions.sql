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
    when 'completed'   then p_status in ('in_progress')
    when 'cancelled'   then p_status in ('open')
  end;
  if not v_ok then raise exception 'INVALID_TRANSITION'; end if;
  if p_status in ('blocked','cancelled') and length(coalesce(trim(p_reason),'')) = 0 then raise exception 'REASON_REQUIRED'; end if;
  if p_status = 'completed' and length(coalesce(trim(p_outcome),'')) = 0 then raise exception 'OUTCOME_REQUIRED'; end if;
  if v_old in ('completed','cancelled') and length(coalesce(trim(p_reason),'')) = 0 then raise exception 'REASON_REQUIRED'; end if;
  update action_items set
    status = p_status,
    outcome = case when p_status = 'completed' then p_outcome else outcome end,
    status_reason = case when p_status in ('blocked','cancelled') then p_reason else null end
  where id = p_task_id returning * into v_task;
  insert into task_history(task_id,event_type,previous_value,new_value,reason,changed_by)
  values (p_task_id,'status_changed', jsonb_build_object('status',v_old),
          jsonb_build_object('status',p_status,'outcome',p_outcome), coalesce(p_reason,p_outcome), auth.uid());
  return v_task;
end $$;

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

create function create_task(p_meeting_id uuid, p_title text, p_description text, p_owner_id uuid,
                            p_due_date date, p_priority task_priority)
returns action_items language plpgsql as $$
declare v_task action_items;
begin
  insert into action_items(meeting_id,title,description,owner_id,original_owner_id,due_date,priority,created_by)
  values (p_meeting_id,p_title,p_description,p_owner_id,p_owner_id,p_due_date,coalesce(p_priority,'medium'),auth.uid())
  returning * into v_task;
  insert into task_history(task_id,event_type,new_value,reason,changed_by)
  values (v_task.id,'created',jsonb_build_object('owner_id',p_owner_id,'due_date',p_due_date,'meeting_id',p_meeting_id),
          'Task created manually',auth.uid());
  return v_task;
end $$;

notify pgrst, 'reload schema';
