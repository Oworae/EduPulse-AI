create function public.set_current_semester(p_semester_id uuid) returns public.semesters
language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result public.semesters;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.semesters where id = p_semester_id and user_id = v_user) then raise exception 'semester not found'; end if;
  update public.semesters set is_current = false where user_id = v_user and is_current;
  update public.semesters set is_current = true where id = p_semester_id and user_id = v_user returning * into v_result;
  return v_result;
end;
$$;

create function public.calculate_grade(p_grading_scale_id uuid, p_percentage numeric)
returns table(letter_grade text, grade_point numeric) language sql stable security invoker set search_path = '' as $$
  select b.letter_grade, b.grade_point from public.grading_bands b join public.grading_scales s on s.id = b.grading_scale_id
  where b.grading_scale_id = p_grading_scale_id and p_percentage between b.min_percentage and b.max_percentage
    and (s.is_system or s.owner_id = auth.uid()) order by b.min_percentage desc limit 1;
$$;

create function public.get_semester_metrics(p_semester_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_user uuid := auth.uid(); v_metrics jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.semesters where id = p_semester_id and user_id = v_user) then raise exception 'semester not found'; end if;
  select jsonb_build_object(
    'semester_average', p.semester_average, 'provisional_gpa', p.provisional_gpa, 'attendance_rate', p.attendance_rate,
    'completed_assessments', coalesce(p.completed_assessments, 0), 'total_assessments', coalesce(p.total_assessments, 0),
    'course_count', coalesce(p.course_count, 0), 'completed_weight_total', coalesce(p.completed_weight_total, 0),
    'strongest_course_id', (select course_id from public.v_semester_course_summary where semester_id = p_semester_id and user_id = v_user and current_percentage is not null order by current_percentage desc limit 1),
    'weakest_course_id', (select course_id from public.v_semester_course_summary where semester_id = p_semester_id and user_id = v_user and current_percentage is not null order by current_percentage asc limit 1)
  ) into v_metrics from public.v_semester_performance p where p.semester_id = p_semester_id and p.user_id = v_user;
  return coalesce(v_metrics, jsonb_build_object('semester_average', null, 'provisional_gpa', null, 'attendance_rate', null,
    'completed_assessments', 0, 'total_assessments', 0, 'course_count', 0, 'completed_weight_total', 0,
    'strongest_course_id', null, 'weakest_course_id', null));
end;
$$;

revoke all on function public.set_current_semester(uuid) from public;
revoke all on function public.get_semester_metrics(uuid) from public;
revoke all on function public.calculate_grade(uuid, numeric) from public;
grant execute on function public.set_current_semester(uuid), public.get_semester_metrics(uuid), public.calculate_grade(uuid, numeric) to authenticated;
