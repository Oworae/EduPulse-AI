create view public.v_course_performance with (security_invoker = true) as
select c.id as course_id, c.user_id, c.semester_id, c.course_code, c.course_name, c.credit_hours,
  count(a.id) as total_assessments,
  count(a.id) filter (where a.status = 'completed') as completed_assessments,
  coalesce(sum(a.weight_percentage) filter (where a.status = 'completed'), 0)::numeric(7,2) as completed_weight,
  coalesce(sum((a.score / nullif(a.max_score, 0)) * a.weight_percentage) filter (where a.status = 'completed'), 0)::numeric(7,2) as weighted_points_earned,
  case when coalesce(sum(a.weight_percentage) filter (where a.status = 'completed'), 0) = 0 then null
    else round((sum((a.score / nullif(a.max_score, 0)) * a.weight_percentage) filter (where a.status = 'completed') /
      sum(a.weight_percentage) filter (where a.status = 'completed')) * 100, 2) end as current_percentage,
  (100 - coalesce(sum(a.weight_percentage) filter (where a.status = 'completed'), 0))::numeric(7,2) as remaining_weight
from public.courses c left join public.assessments a on a.course_id = c.id and a.user_id = c.user_id
group by c.id;

create view public.v_course_attendance with (security_invoker = true) as
select c.id as course_id, c.user_id,
  count(a.id) as total_sessions,
  count(a.id) filter (where a.status in ('present','late')) as attended_sessions,
  count(a.id) filter (where a.status = 'excused') as excused_sessions,
  case when count(a.id) filter (where a.status in ('present','late','absent')) = 0 then null
    else round(100.0 * count(a.id) filter (where a.status in ('present','late')) /
      count(a.id) filter (where a.status in ('present','late','absent')), 2) end as attendance_percentage
from public.courses c left join public.attendance_entries a on a.course_id = c.id and a.user_id = c.user_id
group by c.id;

create view public.v_semester_course_summary with (security_invoker = true) as
select p.course_id, p.user_id, p.semester_id, p.course_code, p.course_name, p.credit_hours,
  p.completed_assessments, p.total_assessments, p.completed_weight, p.current_percentage,
  gb.letter_grade, gb.grade_point, att.attendance_percentage, c.target_percentage,
  case when p.current_percentage is null or c.target_percentage is null then null else p.current_percentage - c.target_percentage end as difference_from_target
from public.v_course_performance p
join public.courses c on c.id = p.course_id and c.user_id = p.user_id
join public.semesters s on s.id = p.semester_id and s.user_id = p.user_id
left join public.v_course_attendance att on att.course_id = p.course_id and att.user_id = p.user_id
left join lateral (
  select b.letter_grade, b.grade_point from public.grading_bands b
  where b.grading_scale_id = s.grading_scale_id and p.current_percentage between b.min_percentage and b.max_percentage
  order by b.min_percentage desc limit 1
) gb on true;

create view public.v_semester_performance with (security_invoker = true) as
select semester_id, user_id, count(*) as course_count,
  round(sum(current_percentage * credit_hours) / nullif(sum(credit_hours) filter (where current_percentage is not null), 0), 2) as semester_average,
  round(sum(grade_point * credit_hours) / nullif(sum(credit_hours) filter (where grade_point is not null), 0), 2) as provisional_gpa,
  round(avg(attendance_percentage), 2) as attendance_rate,
  sum(completed_assessments) as completed_assessments, sum(total_assessments) as total_assessments,
  sum(completed_weight) as completed_weight_total
from public.v_semester_course_summary group by semester_id, user_id;

create view public.v_dashboard_summary with (security_invoker = true) as
select s.id as semester_id, s.user_id, s.academic_year, s.semester_name,
  p.semester_average, p.provisional_gpa, p.attendance_rate, p.course_count, p.completed_assessments, p.total_assessments,
  snap.pulse_score, snap.pulse_status, snap.snapshot_date,
  (select count(*) from public.academic_signals sig where sig.semester_id = s.id and sig.user_id = s.user_id and sig.status = 'active') as active_signal_count
from public.semesters s left join public.v_semester_performance p on p.semester_id = s.id and p.user_id = s.user_id
left join lateral (select x.pulse_score, x.pulse_status, x.snapshot_date from public.academic_snapshots x
  where x.semester_id = s.id and x.user_id = s.user_id order by x.snapshot_date desc limit 1) snap on true
where s.is_current;
