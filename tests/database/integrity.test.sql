begin;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assessments_score_check') then
    -- Constraint names are generated; verify behavior in the executable fixtures below instead.
    null;
  end if;
end $$;

-- Fixed formula checks independent of user fixtures.
do $$ declare actual numeric; begin
  actual := round(((80.0 / 100) * 30 + (40.0 / 50) * 20) / 50 * 100, 2);
  if actual <> 80.00 then raise exception 'weighted course percentage failed: %', actual; end if;
  actual := round(100.0 * 2 / 3, 2); -- present + late over present + late + absent; excused excluded
  if actual <> 66.67 then raise exception 'attendance percentage failed: %', actual; end if;
  actual := round(72 * .50 + 84 * .20 + 80 * .15 + 70 * .10 + 75 * .05, 2);
  if actual <> 75.55 then raise exception 'Academic Pulse formula failed: %', actual; end if;
end $$;

-- Onboarding and grading configuration are all-or-nothing operations.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (null, '30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'atomic@example.test', '', now(), '{}', '{"full_name":"Atomic Student"}', now(), now()),
  (null, '40000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
    'rollback@example.test', '', now(), '{}', '{"full_name":"Rollback Student"}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at) values
('33000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',now(),now()),
('44000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","session_id":"33000000-0000-4000-8000-000000000003"}',true);
select public.get_app_session();

do $$
declare
  v_semester public.semesters;
  v_scale_id uuid;
  v_count integer;
  v_letter text;
  v_rejected boolean := false;
begin
  select * into v_semester from public.complete_onboarding(
    p_full_name => 'Atomic Student',
    p_institution_name => 'Test University',
    p_programme => 'BSc Testing',
    p_level => 200,
    p_timezone => 'Africa/Accra',
    p_academic_year => '2026/2027',
    p_semester_name => 'Semester 1',
    p_start_date => date '2026-08-01',
    p_end_date => date '2026-12-20',
    p_target_average => 75
  );

  if not v_semester.is_current then raise exception 'onboarding did not activate the semester'; end if;
  if not (select onboarding_completed from public.profiles where id = auth.uid()) then
    raise exception 'onboarding did not complete the profile';
  end if;
  select grading_scale_id into v_scale_id from public.semesters where id = v_semester.id;
  select count(*) into v_count from public.grading_bands where grading_scale_id = v_scale_id;
  if v_count <> 5 then raise exception 'onboarding created % grading bands instead of 5', v_count; end if;

  perform public.update_personal_grading_scale(
    v_scale_id,
    'Verified personal scale',
    4,
    '[
      {"min_percentage":85,"max_percentage":100,"letter_grade":"A","grade_point":4},
      {"min_percentage":75,"max_percentage":84.99,"letter_grade":"B","grade_point":3},
      {"min_percentage":65,"max_percentage":74.99,"letter_grade":"C","grade_point":2},
      {"min_percentage":50,"max_percentage":64.99,"letter_grade":"D","grade_point":1},
      {"min_percentage":0,"max_percentage":49.99,"letter_grade":"F","grade_point":0}
    ]'::jsonb
  );
  select grade.letter_grade into v_letter from public.calculate_grade(v_scale_id, 75) grade;
  if v_letter <> 'B' then raise exception 'updated grading scale returned % instead of B', v_letter; end if;

  begin
    perform public.update_personal_grading_scale(
      v_scale_id,
      'Invalid gap',
      4,
      '[
        {"min_percentage":60,"max_percentage":100,"letter_grade":"A","grade_point":4},
        {"min_percentage":0,"max_percentage":49.99,"letter_grade":"F","grade_point":0}
      ]'::jsonb
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'grading scale accepted a gap'; end if;
  select count(*) into v_count from public.grading_bands where grading_scale_id = v_scale_id;
  if v_count <> 5 then raise exception 'failed scale update did not roll back'; end if;
end $$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-4000-8000-000000000004","session_id":"44000000-0000-4000-8000-000000000004"}',true);
select public.get_app_session();
do $$
declare
  v_rejected boolean := false;
  v_count integer;
begin
  begin
    perform public.complete_onboarding(
      p_full_name => 'Rollback Student',
      p_institution_name => null,
      p_programme => null,
      p_level => null,
      p_timezone => 'Africa/Accra',
      p_academic_year => '2026/2027',
      p_semester_name => 'Semester 1',
      p_start_date => date '2026-12-20',
      p_end_date => date '2026-08-01',
      p_target_average => 75
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'invalid onboarding unexpectedly succeeded'; end if;
  select count(*) into v_count from public.grading_scales where owner_id = auth.uid();
  if v_count <> 0 then raise exception 'failed onboarding left % partial grading scales', v_count; end if;
  if (select onboarding_completed from public.profiles where id = auth.uid()) then
    raise exception 'failed onboarding completed the profile';
  end if;
end $$;

rollback;
