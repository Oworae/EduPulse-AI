-- Supabase grants broad table privileges to API roles by default. RLS still
-- blocks operations without a matching policy, but backend-managed tables
-- should also deny those operations at the PostgreSQL privilege layer.

revoke insert, update, delete, truncate, references, trigger
  on public.academic_snapshots,
     public.academic_signals,
     public.ai_insights,
     public.chat_messages
  from authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.study_actions
  from authenticated;

-- Students may manage only the lifecycle of an action. Its generated content
-- remains backend-managed.
grant update (status, completed_at)
  on public.study_actions
  to authenticated;

-- Profiles are created by the auth trigger and deleted through auth.users.
revoke insert, delete, truncate, references, trigger
  on public.profiles
  from authenticated;

