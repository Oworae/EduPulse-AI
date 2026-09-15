-- Browser timers are a UX control. Enforce the same limits on direct API calls.
create schema if not exists edupulse_private;
revoke all on schema edupulse_private from public, anon, authenticated;

create table edupulse_private.app_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  last_activity_at timestamptz not null,
  revoked_at timestamptz
);
alter table edupulse_private.app_sessions enable row level security;
revoke all on edupulse_private.app_sessions from public, anon, authenticated;

create function public.is_app_session_active() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_session_id uuid;
begin
  v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  return exists (
    select 1 from auth.sessions s
    join edupulse_private.app_sessions a on a.session_id = s.id
    where s.id = v_session_id and s.user_id = auth.uid()
      and a.revoked_at is null
      and s.created_at + interval '8 hours' > statement_timestamp()
      and a.last_activity_at + interval '15 minutes' > statement_timestamp()
      and (s.not_after is null or s.not_after > statement_timestamp())
  );
exception when invalid_text_representation then return false;
end;
$$;

create function public.get_app_session(p_record_activity boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session_id uuid;
  v_started_at timestamptz;
  v_not_after timestamptz;
  v_activity edupulse_private.app_sessions;
  v_now timestamptz;
  v_absolute_expires_at timestamptz;
  v_reason text;
begin
  v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  select created_at, not_after into v_started_at, v_not_after
  from auth.sessions where id = v_session_id and user_id = auth.uid();
  if not found then
    return jsonb_build_object('active', false, 'reason', 'signed-out');
  end if;

  -- Registration is anchored to the Auth session's original creation time.
  -- Refreshing a JWT or opening a new page cannot restart either deadline.
  insert into edupulse_private.app_sessions(session_id, last_activity_at)
  values (v_session_id, v_started_at) on conflict (session_id) do nothing;
  select * into v_activity from edupulse_private.app_sessions
  where session_id = v_session_id for update;
  v_now := clock_timestamp();
  v_absolute_expires_at := least(v_started_at + interval '8 hours', v_not_after);

  if v_activity.revoked_at is not null then v_reason := 'signed-out';
  elsif v_absolute_expires_at <= v_now then v_reason := 'maximum';
  elsif v_activity.last_activity_at + interval '15 minutes' <= v_now then v_reason := 'inactive';
  end if;

  -- No caller-provided timestamp, and an expired session can never be revived.
  if v_reason is null and p_record_activity then
    update edupulse_private.app_sessions set last_activity_at = v_now
    where session_id = v_session_id returning * into v_activity;
  end if;
  return jsonb_build_object(
    'active', v_reason is null, 'reason', v_reason, 'session_id', v_session_id,
    'server_now', v_now, 'started_at', v_started_at,
    'last_activity_at', v_activity.last_activity_at,
    'idle_expires_at', v_activity.last_activity_at + interval '15 minutes',
    'absolute_expires_at', v_absolute_expires_at
  );
exception when invalid_text_representation then
  return jsonb_build_object('active', false, 'reason', 'signed-out');
end;
$$;

create function public.revoke_app_session() returns void
language plpgsql security definer set search_path = '' as $$
declare v_session_id uuid;
begin
  v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  insert into edupulse_private.app_sessions(session_id, last_activity_at, revoked_at)
  select id, created_at, clock_timestamp() from auth.sessions
  where id = v_session_id and user_id = auth.uid()
  on conflict (session_id) do update set revoked_at = excluded.revoked_at;
exception when invalid_text_representation then return;
end;
$$;

revoke all on function public.is_app_session_active(), public.get_app_session(boolean), public.revoke_app_session() from public, anon;
grant execute on function public.is_app_session_active(), public.get_app_session(boolean), public.revoke_app_session() to authenticated;

-- Restrictive policies combine with existing ownership policies using AND.
-- Views use security_invoker, so their underlying tables enforce this too.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'profiles', 'grading_scales', 'grading_bands', 'semesters', 'courses',
    'assessments', 'attendance_entries', 'weekly_checkins', 'academic_snapshots',
    'academic_signals', 'ai_insights', 'study_actions', 'chat_conversations', 'chat_messages'
  ] loop
    execute format(
      'create policy require_active_app_session on public.%I as restrictive for all to authenticated using ((select public.is_app_session_active())) with check ((select public.is_app_session_active()))',
      v_table
    );
  end loop;
end;
$$;
