# EduPulse AI backend

Supabase/PostgreSQL foundation for the student-owned EduPulse AI academic tracker. Raw academic calculations are deterministic; Gemini only explains computed context through authenticated Edge Functions.

## Local verification

Requirements: Supabase CLI and Docker Desktop.

```sh
npx supabase start
npx supabase db reset
npx supabase db lint --level error
```

Run the SQL tests against the local database using `psql` and the local connection string printed by `supabase status`:

```sh
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/integrity.test.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/analytics.test.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/rls.test.sql
```

If Docker is unavailable locally, [Backend CI](.github/workflows/backend-ci.yml) runs the same clean migration rebuild, database lint, deterministic checks, and two-user RLS isolation tests on every pull request and push to `main`. It never connects to or mutates the linked Supabase project.

## Edge Function secrets

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` as Supabase project secrets. The service-role key and Gemini key must never be placed in frontend files. All functions verify the bearer token and derive the user ID from the verified session.

## Security decisions

- Every public table has RLS enabled.
- Views use `security_invoker` so underlying table policies remain effective.
- Composite foreign keys prevent a child row from claiming one user while referencing another user's parent.
- Academic snapshots, signals, AI insights, assistant messages, and action creation are backend-managed.
- No official institutional grading scale is seeded without verified boundaries.
- Account deletion cascades from `auth.users`; production backup, recovery, and export policies remain deployment responsibilities.
