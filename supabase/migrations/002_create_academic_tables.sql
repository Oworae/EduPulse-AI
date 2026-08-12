create table public.courses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null, course_code text not null check (btrim(course_code) <> ''), course_name text not null check (btrim(course_name) <> ''),
  credit_hours numeric(3,1) not null check (credit_hours > 0), target_percentage numeric(5,2) check (target_percentage between 0 and 100),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, user_id), foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete cascade
);
create table public.assessments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, course_id uuid not null,
  title text not null check (btrim(title) <> ''), assessment_type text not null check (assessment_type in ('quiz','assignment','midsem','project','presentation','practical','final_exam','other')),
  status text not null default 'planned' check (status in ('planned','completed')), scheduled_date date, completed_date date,
  score numeric(7,2), max_score numeric(7,2), weight_percentage numeric(5,2) not null check (weight_percentage > 0 and weight_percentage <= 100),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (score is null or score >= 0), check (max_score is null or max_score > 0), check (score is null or max_score is null or score <= max_score),
  check (status <> 'completed' or (score is not null and max_score is not null)), check (status <> 'planned' or (score is null and max_score is null and completed_date is null)),
  unique (id, user_id), foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade
);
create table public.attendance_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, course_id uuid not null,
  session_date date not null, session_label text not null default '', status text not null check (status in ('present','absent','late','excused')),
  notes text, created_at timestamptz not null default now(), unique (course_id, session_date, session_label),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade
);
create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, semester_id uuid not null,
  week_start date not null, study_hours numeric(5,2) not null check (study_hours between 0 and 168), classes_attended smallint not null check (classes_attended >= 0),
  classes_scheduled smallint not null check (classes_scheduled >= classes_attended), workload smallint not null check (workload between 1 and 5),
  confidence smallint not null check (confidence between 1 and 5), focus smallint not null check (focus between 1 and 5), reflection text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, semester_id, week_start),
  foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete cascade
);
create table public.academic_snapshots (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, semester_id uuid not null,
  snapshot_date date not null default current_date, semester_average numeric(5,2) check (semester_average between 0 and 100), current_gpa numeric(4,2) check (current_gpa >= 0),
  attendance_rate numeric(5,2) check (attendance_rate between 0 and 100), performance_score numeric(5,2) not null check (performance_score between 0 and 100),
  trend_score numeric(5,2) not null check (trend_score between 0 and 100), attendance_score numeric(5,2) not null check (attendance_score between 0 and 100),
  consistency_score numeric(5,2) not null check (consistency_score between 0 and 100), engagement_score numeric(5,2) not null check (engagement_score between 0 and 100),
  pulse_score numeric(5,2) not null check (pulse_score between 0 and 100), pulse_status text not null check (pulse_status in ('thriving','on_track','needs_attention','at_risk')),
  metrics jsonb not null default '{}'::jsonb, generated_at timestamptz not null default now(), unique (user_id, semester_id, snapshot_date),
  unique (id, user_id), foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete cascade
);
create table public.academic_signals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, semester_id uuid not null, course_id uuid,
  signal_type text not null, severity text not null check (severity in ('info','attention','high')), title text not null, explanation text not null,
  evidence jsonb not null default '{}'::jsonb, status text not null default 'active' check (status in ('active','resolved','dismissed')),
  detected_at timestamptz not null default now(), resolved_at timestamptz,
  foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete cascade,
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade,
  check ((status = 'active' and resolved_at is null) or status <> 'active')
);
