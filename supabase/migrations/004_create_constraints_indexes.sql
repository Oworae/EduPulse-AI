create unique index one_current_semester_per_user on public.semesters(user_id) where is_current;
create unique index courses_semester_code_unique on public.courses(semester_id, lower(course_code));
create index semesters_user_created_idx on public.semesters(user_id, created_at desc);
create index courses_user_semester_idx on public.courses(user_id, semester_id);
create index assessments_user_course_idx on public.assessments(user_id, course_id);
create index assessments_recent_idx on public.assessments(course_id, completed_date desc);
create index assessments_upcoming_idx on public.assessments(course_id, scheduled_date) where status = 'planned';
create index attendance_user_course_idx on public.attendance_entries(user_id, course_id);
create index attendance_recent_idx on public.attendance_entries(course_id, session_date desc);
create index checkins_recent_idx on public.weekly_checkins(user_id, semester_id, week_start desc);
create index snapshots_recent_idx on public.academic_snapshots(user_id, semester_id, snapshot_date desc);
create index signals_active_idx on public.academic_signals(user_id, status, detected_at desc);
create index signals_course_idx on public.academic_signals(user_id, course_id, status);
create index insights_recent_idx on public.ai_insights(user_id, generated_at desc);
create index insights_cache_idx on public.ai_insights(user_id, semester_id, insight_type, generated_at desc);
create index actions_focus_idx on public.study_actions(user_id, status, priority);
create index conversations_recent_idx on public.chat_conversations(user_id, updated_at desc);
create index messages_chronological_idx on public.chat_messages(conversation_id, created_at);

create function public.validate_grading_band() returns trigger language plpgsql set search_path = '' as $$
declare v_max numeric; begin
  select max_gpa into v_max from public.grading_scales where id = new.grading_scale_id;
  if new.grade_point > v_max then raise exception 'grade_point exceeds grading scale maximum'; end if;
  if exists (select 1 from public.grading_bands b where b.grading_scale_id = new.grading_scale_id and b.id <> new.id
    and numrange(b.min_percentage, b.max_percentage, '[]') && numrange(new.min_percentage, new.max_percentage, '[]')) then
    raise exception 'grading bands may not overlap'; end if;
  return new;
end $$;
create trigger validate_grading_band before insert or update on public.grading_bands for each row execute function public.validate_grading_band();

create function public.validate_semester_scale() returns trigger language plpgsql set search_path = '' as $$
declare v_owner uuid; v_system boolean; v_max numeric; begin
  select owner_id, is_system, max_gpa into v_owner, v_system, v_max from public.grading_scales where id = new.grading_scale_id;
  if not found or (not v_system and v_owner <> new.user_id) then raise exception 'grading scale is not available to this user'; end if;
  if new.target_gpa is not null and new.target_gpa > v_max then raise exception 'target_gpa exceeds grading scale maximum'; end if;
  return new;
end $$;
create trigger validate_semester_scale before insert or update of grading_scale_id, user_id, target_gpa on public.semesters for each row execute function public.validate_semester_scale();

create function public.validate_assessment_weight() returns trigger language plpgsql set search_path = '' as $$
declare v_total numeric; begin
  select coalesce(sum(weight_percentage), 0) into v_total from public.assessments where course_id = new.course_id and id <> new.id;
  if v_total + new.weight_percentage > 100 then raise exception 'total assessment weight cannot exceed 100%%'; end if;
  return new;
end $$;
create trigger validate_assessment_weight before insert or update of course_id, weight_percentage on public.assessments for each row execute function public.validate_assessment_weight();
