create table public.ai_insights (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, semester_id uuid not null,
  course_id uuid, snapshot_id uuid, insight_type text not null check (insight_type in ('home_summary','course_analysis','weekly_review','risk_explanation','performance_summary','semester_review','general_recommendation')),
  title text not null, summary text not null, body text not null, model_name text not null, prompt_version text not null, context_hash text,
  generated_at timestamptz not null default now(), expires_at timestamptz,
  foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete cascade,
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete set null (course_id),
  foreign key (snapshot_id, user_id) references public.academic_snapshots(id, user_id) on delete set null (snapshot_id)
);
create table public.study_actions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, semester_id uuid not null,
  course_id uuid, insight_id uuid references public.ai_insights(id) on delete set null, title text not null, description text, priority smallint not null check (priority between 1 and 3),
  status text not null default 'pending' check (status in ('pending','completed','dismissed')), due_date date, completed_at timestamptz, created_at timestamptz not null default now(),
  foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete cascade,
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete set null (course_id),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid, title text not null check (btrim(title) <> ''), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, user_id), foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete set null (semester_id)
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')), content text not null check (btrim(content) <> ''), metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), foreign key (conversation_id, user_id) references public.chat_conversations(id, user_id) on delete cascade
);
