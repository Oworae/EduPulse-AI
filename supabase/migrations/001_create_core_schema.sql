create extension if not exists pgcrypto;

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', institution_name text, programme text,
  level smallint check (level between 1 and 1000), onboarding_completed boolean not null default false,
  timezone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.grading_scales (
  id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''), institution_name text,
  max_gpa numeric(4,2) not null check (max_gpa > 0), is_system boolean not null default false,
  created_at timestamptz not null default now(),
  check ((is_system and owner_id is null) or (not is_system and owner_id is not null)),
  unique (id, owner_id)
);

create table public.grading_bands (
  id uuid primary key default gen_random_uuid(), grading_scale_id uuid not null references public.grading_scales(id) on delete cascade,
  min_percentage numeric(5,2) not null check (min_percentage between 0 and 100),
  max_percentage numeric(5,2) not null check (max_percentage between 0 and 100 and max_percentage >= min_percentage),
  letter_grade text not null check (btrim(letter_grade) <> ''), grade_point numeric(4,2) not null check (grade_point >= 0),
  sort_order smallint not null, unique (grading_scale_id, sort_order)
);

create table public.semesters (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  grading_scale_id uuid not null references public.grading_scales(id), academic_year text not null check (btrim(academic_year) <> ''),
  semester_name text not null check (btrim(semester_name) <> ''), start_date date, end_date date,
  is_current boolean not null default false, status text not null default 'active' check (status in ('active','completed','archived')),
  target_average numeric(5,2) check (target_average between 0 and 100), target_gpa numeric(4,2) check (target_gpa >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date), unique (id, user_id)
);
