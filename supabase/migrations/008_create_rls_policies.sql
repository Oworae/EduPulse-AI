alter table public.profiles enable row level security;
alter table public.grading_scales enable row level security;
alter table public.grading_bands enable row level security;
alter table public.semesters enable row level security;
alter table public.courses enable row level security;
alter table public.assessments enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.academic_snapshots enable row level security;
alter table public.academic_signals enable row level security;
alter table public.ai_insights enable row level security;
alter table public.study_actions enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy grading_scales_select_available on public.grading_scales for select to authenticated using (is_system or owner_id = (select auth.uid()));
create policy grading_scales_insert_own on public.grading_scales for insert to authenticated with check (owner_id = (select auth.uid()) and not is_system);
create policy grading_scales_update_own on public.grading_scales for update to authenticated using (owner_id = (select auth.uid()) and not is_system) with check (owner_id = (select auth.uid()) and not is_system);
create policy grading_scales_delete_own on public.grading_scales for delete to authenticated using (owner_id = (select auth.uid()) and not is_system);
create policy grading_bands_select_available on public.grading_bands for select to authenticated using (exists (select 1 from public.grading_scales s where s.id = grading_scale_id and (s.is_system or s.owner_id = (select auth.uid()))));
create policy grading_bands_insert_own on public.grading_bands for insert to authenticated with check (exists (select 1 from public.grading_scales s where s.id = grading_scale_id and s.owner_id = (select auth.uid()) and not s.is_system));
create policy grading_bands_update_own on public.grading_bands for update to authenticated using (exists (select 1 from public.grading_scales s where s.id = grading_scale_id and s.owner_id = (select auth.uid()) and not s.is_system)) with check (exists (select 1 from public.grading_scales s where s.id = grading_scale_id and s.owner_id = (select auth.uid()) and not s.is_system));
create policy grading_bands_delete_own on public.grading_bands for delete to authenticated using (exists (select 1 from public.grading_scales s where s.id = grading_scale_id and s.owner_id = (select auth.uid()) and not s.is_system));

create policy semesters_own on public.semesters for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy courses_own on public.courses for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy assessments_own on public.assessments for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy attendance_own on public.attendance_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy checkins_own on public.weekly_checkins for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy snapshots_select_own on public.academic_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy signals_select_own on public.academic_signals for select to authenticated using ((select auth.uid()) = user_id);
create policy insights_select_own on public.ai_insights for select to authenticated using ((select auth.uid()) = user_id);
create policy actions_select_own on public.study_actions for select to authenticated using ((select auth.uid()) = user_id);
create policy actions_update_own on public.study_actions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy conversations_own on public.chat_conversations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy messages_select_own on public.chat_messages for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.academic_snapshots, public.academic_signals, public.ai_insights, public.chat_messages from authenticated;
revoke insert, delete on public.study_actions from authenticated;
revoke update on public.study_actions from authenticated;
grant update (status, completed_at) on public.study_actions to authenticated;
