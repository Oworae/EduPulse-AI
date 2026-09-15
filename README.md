# EduPulse AI backend

Supabase/PostgreSQL foundation for the student-owned EduPulse AI academic tracker. Raw academic calculations are deterministic; Gemini only explains computed context through authenticated Edge Functions.

## Frontend

The first vanilla JavaScript slice includes the landing page, self-service email/password registration, login, guarded onboarding, personal grading-scale setup, first-semester creation, and an initial dashboard. Serve the repository root over HTTP because browser ES modules do not run reliably from `file://` URLs:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The browser contains only the Supabase project URL and publishable key; RLS remains the authorization boundary.

Production frontend: `https://oworae.github.io/EduPulse-AI/`. GitHub Actions publishes only HTML and `src/` frontend assets; migrations, tests, and backend code are excluded from the Pages artifact.

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

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` as Supabase project secrets. Set `ANTHROPIC_API_KEY` to enable Claude as an independent backup for chat and insights; `CLAUDE_MODEL` defaults to `claude-haiku-4-5-20251001`. Claude API billing and credits are separate from Claude chat subscriptions. Provider keys and the service-role key must never be placed in frontend files, committed, or logged. All functions verify the bearer token and derive the user ID from the verified session.

The production default is `gemini-3.6-flash`, a generally available model supported by Gemini's GenerateContent API.

## AI response behaviour

Routine Gemini 3 guidance uses low thinking. Chat streams text as it is generated, with an explicit completion event only after both conversation messages are saved in one database insert. A partial or interrupted reply is marked for retry. JSON insight responses retain their structured validation and existing cache.

Generation has one 45-second deadline covering at most three attempts. With Claude configured, Gemini gets up to 25 seconds and two attempts, leaving the remaining time for one Claude attempt. Temporary 429/500/502/503/504 failures, connection errors and primary-provider timeouts can trigger fallback; permanent request/authentication errors, refusals and incomplete output cannot. Short Gemini retry waits use exponential backoff; long `Retry-After` waits trigger fallback immediately. Once chat text has appeared, generation is never retried or switched automatically. Without a Claude key, Gemini retains its original three-attempt behaviour. The full AI request has a 60-second server deadline and a 70-second browser deadline. Leaving the page cancels either provider. Sessions are checked again before saving generated content.

Both providers receive the same academic context and instructions. Claude insights request a static JSON schema and still pass the application's existing validation before persistence. Insights record the model that actually produced the answer. Removing `ANTHROPIC_API_KEY` disables fallback. A backup improves resilience but can also be unavailable, rate limited or out of credits; in that case the app returns a controlled failure without saving an incomplete exchange.

Server timing logs include authentication, context loading, generation, persistence and first-text durations, without prompts, answers, student identifiers or credentials. `AI provider fallback` records the switch and its controlled reason; `Gemini request timing` and `Claude request timing` distinguish provider delays. Run `deno test --allow-env --node-modules-dir=none --no-lock supabase/functions/_shared/gemini.test.ts` and `npm run test:e2e -- tests/e2e/ai.spec.js` to verify fallback, retries, streaming, timeouts, cancellation, persistence and revocation. Deploy updated Edge Functions before publishing the frontend; the chat endpoint retains JSON support for older clients.

## Security decisions

- Student API access requires an active app session as well as row ownership. Migration `011_enforce_app_sessions.sql` enforces 15 minutes without recorded interaction, an eight-hour lifetime and immediate app-session revocation; refreshed JWTs cannot restart those limits.
- Browser activity is batched within five seconds, with a warning one minute before expiry. Logout clears student content and credentials and redirects tabs sharing that session.
- Deploy the session migration and updated Edge Functions before publishing the updated frontend. No paid Supabase session feature is required for these application checks. Existing sessions already beyond either deadline must sign in again.
- `supabase/config.toml` sets a 15-minute JWT lifetime and an eight-character password minimum for local Auth. Apply the equivalent values separately in hosted Auth settings; the file does not configure the hosted project automatically.
- Run `tests/database/sessions.test.sql` alongside the existing database checks and `tests/e2e/security.spec.js` for desktop and mobile session behavior.

- Every public table has RLS enabled.
- Views use `security_invoker` so underlying table policies remain effective.
- Composite foreign keys prevent a child row from claiming one user while referencing another user's parent.
- Academic snapshots, signals, AI insights, assistant messages, and action creation are backend-managed.
- No official institutional grading scale is seeded without verified boundaries.
- Account deletion cascades from `auth.users`; production backup, recovery, and export policies remain deployment responsibilities.
