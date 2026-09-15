begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('50000000-0000-4000-8000-000000000005','authenticated','authenticated','sessions@example.test','',now(),'{}','{}',now(),now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('55000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000005',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000005","session_id":"55000000-0000-4000-8000-000000000005"}',true);
do $$ declare v_first jsonb; v_poll jsonb; begin
  v_first := public.get_app_session();
  if not (v_first->>'active')::boolean or not public.is_app_session_active() then raise exception 'fresh session rejected'; end if;
  v_poll := public.get_app_session(false);
  if v_first->>'last_activity_at' <> v_poll->>'last_activity_at' then raise exception 'background polling extended inactivity'; end if;
  if v_first->>'started_at' <> v_poll->>'started_at' then raise exception 'polling restarted absolute lifetime'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'fresh session cannot read own profile'; end if;
  if has_schema_privilege('authenticated','edupulse_private','USAGE') then raise exception 'private session schema exposed'; end if;
  if has_function_privilege('anon','public.get_app_session(boolean)','EXECUTE') then raise exception 'anonymous session RPC exposed'; end if;
end $$;

reset role;
do $$ begin
  if has_table_privilege('authenticated','edupulse_private.app_sessions','UPDATE') then raise exception 'client can forge activity timestamps'; end if;
end $$;
update edupulse_private.app_sessions set last_activity_at = statement_timestamp() - interval '5 minutes';
set local role authenticated;
do $$ declare v_before jsonb; v_after jsonb; begin
  v_before := public.get_app_session(false);
  v_after := public.get_app_session(true);
  if (v_after->>'last_activity_at')::timestamptz <= (v_before->>'last_activity_at')::timestamptz then raise exception 'interaction did not renew idle deadline'; end if;
  if v_after->>'absolute_expires_at' <> v_before->>'absolute_expires_at' then raise exception 'interaction extended maximum lifetime'; end if;
end $$;

-- A still-valid JWT cannot revive an idle session, including on token refresh.
reset role;
update edupulse_private.app_sessions set last_activity_at = statement_timestamp() - interval '15 minutes';
set local role authenticated;
do $$ declare v_status jsonb; v_count integer; begin
  v_status := public.get_app_session(true);
  if (v_status->>'active')::boolean or v_status->>'reason' <> 'inactive' then raise exception 'expired idle session revived'; end if;
  if public.is_app_session_active() then raise exception 'expired idle session authenticated'; end if;
  select count(*) into v_count from public.profiles;
  if v_count <> 0 then raise exception 'expired session leaked profile data'; end if;
  update public.profiles set full_name = 'Unauthorized';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'expired session updated data'; end if;
  begin
    insert into public.grading_scales(owner_id,name,max_gpa) values(auth.uid(),'Expired',4);
    raise exception 'expired session inserted data';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.v_dashboard_summary) then raise exception 'expired session leaked view data'; end if;
end $$;

-- Recent interaction does not override the original eight-hour deadline.
reset role;
update auth.sessions set created_at = statement_timestamp() - interval '8 hours';
update edupulse_private.app_sessions set last_activity_at = statement_timestamp();
set local role authenticated;
do $$ declare v_status jsonb; begin
  v_status := public.get_app_session(true);
  if (v_status->>'active')::boolean or v_status->>'reason' <> 'maximum' then raise exception 'maximum lifetime extended'; end if;
  if public.is_app_session_active() then raise exception 'maximum lifetime bypassed by recent activity'; end if;
end $$;

reset role;
update auth.sessions set created_at = statement_timestamp(), not_after = statement_timestamp() - interval '1 second';
set local role authenticated;
do $$ begin
  if public.is_app_session_active() or (public.get_app_session(true)->>'active')::boolean then raise exception 'Auth not_after ignored'; end if;
end $$;

reset role;
update auth.sessions set not_after = null;
set local role authenticated;
select public.revoke_app_session();
do $$ begin
  if public.is_app_session_active() or (public.get_app_session(true)->>'active')::boolean then raise exception 'revoked session revived'; end if;
  if exists(select 1 from public.profiles) then raise exception 'revoked session leaked profile'; end if;
end $$;

-- Missing/malformed session claims and removed Auth sessions deny access.
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000005","session_id":"malformed"}',true);
do $$ begin
  if public.is_app_session_active() or (public.get_app_session(true)->>'active')::boolean then raise exception 'malformed session claim accepted'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000005"}',true);
do $$ begin
  if public.is_app_session_active() or (public.get_app_session(true)->>'active')::boolean then raise exception 'missing session claim accepted'; end if;
end $$;
reset role;
delete from auth.sessions;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000005","session_id":"55000000-0000-4000-8000-000000000005"}',true);
do $$ begin
  if public.is_app_session_active() or (public.get_app_session(true)->>'active')::boolean then raise exception 'deleted Auth session accepted'; end if;
end $$;

rollback;
