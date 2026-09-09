create function public.complete_onboarding(
  p_full_name text,
  p_institution_name text,
  p_programme text,
  p_level integer,
  p_timezone text,
  p_academic_year text,
  p_semester_name text,
  p_start_date date,
  p_end_date date,
  p_target_average numeric
) returns public.semesters
language plpgsql
security invoker
set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_scale public.grading_scales;
  v_semester public.semesters;
  v_onboarding_completed boolean;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if nullif(btrim(p_full_name), '') is null then raise exception 'full name is required'; end if;
  if nullif(btrim(p_academic_year), '') is null then raise exception 'academic year is required'; end if;
  if nullif(btrim(p_semester_name), '') is null then raise exception 'semester name is required'; end if;

  select onboarding_completed into v_onboarding_completed
  from public.profiles where id = v_user for update;
  if not found then raise exception 'profile not found'; end if;
  if v_onboarding_completed then raise exception 'onboarding is already complete'; end if;

  insert into public.grading_scales (owner_id, name, institution_name, max_gpa, is_system)
  values (v_user, 'Personal 4.0 scale', nullif(btrim(p_institution_name), ''), 4, false)
  returning * into v_scale;

  insert into public.grading_bands
    (grading_scale_id, min_percentage, max_percentage, letter_grade, grade_point, sort_order)
  values
    (v_scale.id, 80, 100, 'A', 4, 1),
    (v_scale.id, 70, 79.99, 'B', 3, 2),
    (v_scale.id, 60, 69.99, 'C', 2, 3),
    (v_scale.id, 50, 59.99, 'D', 1, 4),
    (v_scale.id, 0, 49.99, 'F', 0, 5);

  insert into public.semesters (
    user_id, grading_scale_id, academic_year, semester_name, start_date,
    end_date, status, target_average, is_current
  ) values (
    v_user, v_scale.id, btrim(p_academic_year), btrim(p_semester_name),
    p_start_date, p_end_date, 'active', p_target_average, true
  ) returning * into v_semester;

  update public.profiles set
    full_name = btrim(p_full_name),
    institution_name = nullif(btrim(p_institution_name), ''),
    programme = nullif(btrim(p_programme), ''),
    level = p_level,
    timezone = nullif(btrim(p_timezone), ''),
    onboarding_completed = true
  where id = v_user;

  return v_semester;
end;
$$;

create function public.update_personal_grading_scale(
  p_scale_id uuid,
  p_name text,
  p_max_gpa numeric,
  p_bands jsonb
) returns public.grading_scales
language plpgsql
security invoker
set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_scale public.grading_scales;
  v_band_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'scale name is required'; end if;
  if p_max_gpa is null or p_max_gpa <= 0 then raise exception 'maximum GPA must be greater than zero'; end if;
  if p_bands is null or jsonb_typeof(p_bands) <> 'array' then raise exception 'grading bands must be an array'; end if;

  v_band_count := jsonb_array_length(p_bands);
  if v_band_count < 2 or v_band_count > 20 then
    raise exception 'a grading scale must contain between 2 and 20 bands';
  end if;

  select * into v_scale from public.grading_scales
  where id = p_scale_id and owner_id = v_user and not is_system
  for update;
  if not found then raise exception 'owned personal grading scale not found'; end if;
  if exists (
    select 1 from public.semesters
    where grading_scale_id = p_scale_id and user_id = v_user and target_gpa > p_max_gpa
  ) then raise exception 'maximum GPA cannot be lower than an existing semester target'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_bands) as band(
      min_percentage numeric,
      max_percentage numeric,
      letter_grade text,
      grade_point numeric
    )
    where min_percentage is null or max_percentage is null
      or nullif(btrim(letter_grade), '') is null or grade_point is null
      or min_percentage < 0 or max_percentage > 100
      or max_percentage < min_percentage
      or grade_point < 0 or grade_point > p_max_gpa
  ) then raise exception 'one or more grading bands are invalid'; end if;
  if (
    select min(min_percentage) <> 0 or max(max_percentage) <> 100
    from jsonb_to_recordset(p_bands) as band(
      min_percentage numeric,
      max_percentage numeric,
      letter_grade text,
      grade_point numeric
    )
  ) then
    raise exception 'grading bands must cover 0 through 100';
  end if;
  if exists (
    select 1 from (
      select min_percentage,
        lag(max_percentage) over (order by min_percentage, max_percentage) as previous_max
      from jsonb_to_recordset(p_bands) as band(
        min_percentage numeric,
        max_percentage numeric,
        letter_grade text,
        grade_point numeric
      )
    ) ordered
    where previous_max is not null and min_percentage <> previous_max + 0.01
  ) then raise exception 'grading bands must be continuous without gaps or overlaps'; end if;

  update public.grading_scales set name = btrim(p_name), max_gpa = p_max_gpa
  where id = p_scale_id returning * into v_scale;

  delete from public.grading_bands where grading_scale_id = p_scale_id;
  insert into public.grading_bands
    (grading_scale_id, min_percentage, max_percentage, letter_grade, grade_point, sort_order)
  select p_scale_id, min_percentage, max_percentage, btrim(letter_grade), grade_point,
    row_number() over (order by min_percentage desc, max_percentage desc)::smallint
  from jsonb_to_recordset(p_bands) as band(
    min_percentage numeric,
    max_percentage numeric,
    letter_grade text,
    grade_point numeric
  )
  order by min_percentage desc, max_percentage desc;

  return v_scale;
end;
$$;

revoke all on function public.complete_onboarding(text, text, text, integer, text, text, text, date, date, numeric) from public;
revoke all on function public.update_personal_grading_scale(uuid, text, numeric, jsonb) from public;
grant execute on function public.complete_onboarding(text, text, text, integer, text, text, text, date, date, numeric) to authenticated;
grant execute on function public.update_personal_grading_scale(uuid, text, numeric, jsonb) to authenticated;
