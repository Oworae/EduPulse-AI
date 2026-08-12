begin;
do $$ begin
  if current_setting('server_version_num')::int < 150000 then raise exception 'security_invoker views require PostgreSQL 15+'; end if;
  if not exists (select 1 from pg_views where schemaname='public' and viewname='v_course_performance') then raise exception 'course performance view missing'; end if;
  if not exists (select 1 from pg_views where schemaname='public' and viewname='v_dashboard_summary') then raise exception 'dashboard summary view missing'; end if;
end $$;
rollback;
