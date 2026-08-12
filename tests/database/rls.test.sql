begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
(null,'10000000-0000-4000-8000-000000000001','authenticated','authenticated','a@example.test','',now(),'{}','{"full_name":"User A"}',now(),now()),
(null,'20000000-0000-4000-8000-000000000002','authenticated','authenticated','b@example.test','',now(),'{}','{"full_name":"User B"}',now(),now());

insert into public.grading_scales (id, owner_id, name, max_gpa) values
('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A scale',4),
('22000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','B scale',4);
insert into public.semesters (id,user_id,grading_scale_id,academic_year,semester_name) values
('12000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','2026/2027','Semester 1'),
('22000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','2026/2027','Semester 1');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare n integer; begin
  if not has_table_privilege('authenticated', 'public.semesters', 'SELECT') then raise exception 'authenticated lacks semester SELECT privilege'; end if;
  if not has_table_privilege('authenticated', 'public.courses', 'INSERT') then raise exception 'authenticated lacks course INSERT privilege'; end if;
  if has_table_privilege('authenticated', 'public.academic_snapshots', 'INSERT') then raise exception 'authenticated can forge snapshots'; end if;
  if has_table_privilege('authenticated', 'public.ai_insights', 'INSERT') then raise exception 'authenticated can forge AI insights'; end if;
  if has_column_privilege('authenticated', 'public.study_actions', 'title', 'UPDATE') then raise exception 'authenticated can rewrite action content'; end if;
  if not has_column_privilege('authenticated', 'public.study_actions', 'status', 'UPDATE') then raise exception 'authenticated cannot update action status'; end if;
  select count(*) into n from public.semesters;
  if n <> 1 then raise exception 'RLS isolation failed: User A saw % semesters', n; end if;
  if exists (select 1 from public.profiles where id = '20000000-0000-4000-8000-000000000002') then raise exception 'profile RLS leaked User B'; end if;
end $$;

do $$ begin
  begin
    insert into public.courses(user_id,semester_id,course_code,course_name,credit_hours)
    values ('10000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000003','BAD','Cross owner',3);
    raise exception 'ownership-safe FK accepted a cross-user parent';
  exception when foreign_key_violation then null; end;
end $$;

rollback;
