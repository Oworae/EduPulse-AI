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

insert into auth.sessions (id, user_id, created_at, updated_at) values
('13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now(),now()),
('23000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',now(),now());
insert into public.courses(id,user_id,semester_id,course_code,course_name,credit_hours) values
('14000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','A101','User A course',3),
('24000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003','B101','User B course',3);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"13000000-0000-4000-8000-000000000001"}',true);
select public.get_app_session();
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

do $$ declare n integer; begin
  if exists(select 1 from public.courses where id = '24000000-0000-4000-8000-000000000002') then raise exception 'User A read User B course'; end if;
  update public.courses set course_name = 'Intrusion' where id = '24000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'User A updated User B course'; end if;
  delete from public.courses where id = '24000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'User A deleted User B course'; end if;
  begin
    insert into public.courses(user_id,semester_id,course_code,course_name,credit_hours)
    values ('20000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003','FORGED','Forged owner',3);
    raise exception 'User A inserted User B course';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","session_id":"23000000-0000-4000-8000-000000000002"}',true);
select public.get_app_session();
do $$ begin
  if (select count(*) from public.courses) <> 1 then raise exception 'User B course isolation failed'; end if;
  if exists(select 1 from public.courses where user_id <> auth.uid()) then raise exception 'User B read User A course'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","session_id":"13000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  if public.is_app_session_active() or (public.get_app_session(true)->>'active')::boolean then raise exception 'accepted another user session ID'; end if;
  if exists(select 1 from public.courses) then raise exception 'foreign session leaked courses'; end if;
end $$;

rollback;
