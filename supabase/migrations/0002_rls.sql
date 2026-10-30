create function is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

alter table profiles enable row level security;
alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table action_items enable row level security;
alter table task_history enable row level security;
alter table knowledge_documents enable row level security;
alter table task_links enable row level security;
alter table handovers enable row level security;
alter table app_logs enable row level security;

create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update" on profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create function protect_profile_role() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(),'') <> 'service_role' and not is_admin() then
    raise exception 'PROFILE_ROLE_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger t_profiles_protect_role before update on profiles for each row execute function protect_profile_role();

create policy "meetings_select" on meetings for select to authenticated using (true);
create policy "meetings_insert" on meetings for insert to authenticated with check (created_by = auth.uid());
create policy "meetings_update" on meetings for update to authenticated using (true) with check (true);

create policy "participants_select" on meeting_participants for select to authenticated using (true);
create policy "participants_insert" on meeting_participants for insert to authenticated with check (true);
create policy "participants_update" on meeting_participants for update to authenticated using (true) with check (true);
create policy "participants_delete" on meeting_participants for delete to authenticated using (true);

create policy "tasks_select" on action_items for select to authenticated using (true);
create policy "tasks_insert" on action_items for insert to authenticated with check (created_by = auth.uid());
create policy "tasks_update" on action_items for update to authenticated using (true) with check (true);

create policy "history_select" on task_history for select to authenticated using (true);
create policy "history_insert" on task_history for insert to authenticated with check (changed_by = auth.uid());

create policy "knowledge_select" on knowledge_documents for select to authenticated using (true);
create policy "knowledge_insert" on knowledge_documents for insert to authenticated with check (uploaded_by = auth.uid());
create policy "knowledge_update" on knowledge_documents for update to authenticated
  using (uploaded_by = auth.uid() or is_admin()) with check (uploaded_by = auth.uid() or is_admin());
create policy "knowledge_delete" on knowledge_documents for delete to authenticated
  using (uploaded_by = auth.uid() or is_admin());

create policy "task_links_select" on task_links for select to authenticated using (true);
create policy "task_links_insert" on task_links for insert to authenticated with check (true);
create policy "task_links_update" on task_links for update to authenticated using (true) with check (true);
create policy "task_links_delete" on task_links for delete to authenticated using (true);

create policy "handovers_select" on handovers for select to authenticated using (true);
create policy "handovers_insert" on handovers for insert to authenticated with check (created_by = auth.uid());
create policy "handovers_update" on handovers for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "app_logs_select" on app_logs for select to authenticated using (is_admin());
