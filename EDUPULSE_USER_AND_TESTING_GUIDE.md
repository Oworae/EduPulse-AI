# EduPulse AI User and Testing Guide

## 1. Purpose of This Guide

This guide explains how to access and use EduPulse AI and how to evaluate its main functions, calculations, security controls and responsive interface. It is intended for students, project supervisors, examiners and developers.

EduPulse AI is a personal academic planning aid. Its percentages, provisional GPA, attendance rate, Academic Pulse labels and AI responses are based on student-entered data. They are not official university results, predictions or professional academic advice.

---

# PART A: HOW TO USE THE SYSTEM

## 2. Requirements

To use the hosted application, a student needs:

- a modern browser such as Chrome, Edge, Firefox or Safari;
- a stable internet connection;
- a working email address; and
- accurate personal academic information to enter.

The hosted frontend is available at:

`https://oworae.github.io/EduPulse-AI/`

Do not open repository HTML files directly with a `file://` address. Browser JavaScript modules and authentication redirects are designed to run over HTTP or HTTPS.

## 3. Recommended First-Time Workflow

Use the system in this order:

```text
Create account
    ↓
Complete onboarding and grading setup
    ↓
Create or activate a semester
    ↓
Add courses and personal targets
    ↓
Add planned assessments and completed results
    ↓
Record attendance and weekly check-ins
    ↓
Review dashboard, pulse and signals
    ↓
Generate an insight or ask the academic coach
    ↓
Complete study actions and update records regularly
```

## 4. Creating an Account

1. Open the hosted application.
2. Select **Get started** or **Start tracking your progress**.
3. Enter the student’s full name.
4. Enter a valid email address.
5. Create a password and enter it again in the confirmation field.
6. Select **Create account**.
7. If email confirmation is enabled in the deployed Supabase project, check the email inbox and complete the confirmation step.
8. Sign in using the registered email and password.

Expected behaviour:

- mismatching passwords should be rejected before registration;
- an invalid or already registered account should display a controlled message;
- a successful new user should be sent to onboarding; and
- credentials should be handled by Supabase Auth, not stored in the application profile table.

Password recovery is not currently implemented. A student who loses access should follow the project administrator’s approved support process.

## 5. Signing In and Out

### 5.1 Sign in

1. Open `login.html` through the site’s **Sign in** link.
2. Enter the registered email address.
3. Enter the password.
4. Select **Sign in**.

The button should show a temporary loading state. A valid onboarded user should reach the dashboard. A valid user who has not completed onboarding should be routed to onboarding.

### 5.2 Sign out

Use the application’s sign-out control. After signing out, trying to open a protected page such as the dashboard or courses page should redirect to login.

Signing out ends the current browser session and redirects its other open EduPulse tabs to login. Other devices have their own sessions. If server sign-out cannot be confirmed, the browser still clears its credentials and displays a message; reconnect and sign in again to retry sign-out.

Never leave an account signed in on a shared computer.

### 5.3 Inactivity and session expiry

After 14 minutes without interaction, EduPulse displays a one-minute warning. Select **Stay signed in** to continue, or **Sign out** to end the session. Interaction is recorded in batches of up to five seconds across tabs sharing the same browser session. Background token refresh and automatic page checks do not count as interaction.

The session expires after 15 minutes without recorded interaction, or eight hours after sign-in regardless of interaction. The eight-hour warning requires signing in again. Returning after computer sleep or restoring a page from browser history rechecks the session. Expiry and sign-out clear the protected page’s content and redirect to login with an explanation.

Opening a copied course URL in another tab of the same signed-in browser normally shares that session. Opening it in a private window, a different browser or a different device requires sign-in. A course URL does not contain login credentials.

These controls require migration `011_enforce_app_sessions.sql` and the updated Edge Functions to be deployed with the frontend. The database checks the signed JWT’s session identifier against `auth.sessions`, private activity records, revocation and both deadlines. Existing ownership policies still apply. Direct API requests from expired or revoked sessions cannot read or modify student records. A backend verification failure closes the browser session rather than displaying previously loaded student data.

## 6. Completing Onboarding

Onboarding establishes the academic context required by later calculations.

1. Enter or confirm the full name.
2. Enter the institution and programme when applicable.
3. Enter the academic level when applicable.
4. Confirm the timezone.
5. Enter the academic year, for example `2026/2027`.
6. Enter the semester name, for example `Semester 1`.
7. Enter semester dates if requested.
8. Enter a target average between 0 and 100 if the student wants target comparisons.
9. Review the personal grading scale created during setup.
10. Select **Open my dashboard**.

The onboarding operation is designed to be atomic: profile completion, grading setup and the first current semester should succeed together or roll back together if validation fails.

## 7. Understanding the Dashboard

The dashboard provides a summary of the current semester.

### 7.1 Academic Pulse

Academic Pulse combines five components:

- current performance: 50%;
- recent trend: 20%;
- attendance: 15%;
- consistency: 10%; and
- weekly engagement: 5%.

The displayed statuses are:

| Score | Status |
|---|---|
| 80–100 | Thriving |
| 65–below 80 | On Track |
| 45–below 65 | Needs Attention |
| Below 45 | At Risk |

These are application heuristics. A status should prompt review, not panic or an assumption about the student’s official standing.

### 7.2 Summary metrics

The dashboard may show:

- semester average based on courses containing completed evidence;
- provisional GPA based on the selected personal grading scale;
- attendance rate;
- completed versus planned assessments;
- course progress;
- active academic signals;
- weekly check-in information; and
- a suggested next move.

A dash (`—`) or neutral message means there is not enough evidence. It should not be interpreted as zero.

## 8. Managing Semesters

1. Open **Semesters** from the current-semester control.
2. Select **Create semester**.
3. Enter the academic year and semester name.
4. Add valid start and end dates where required. The end date cannot be earlier than the start date.
5. Select the applicable grading scale.
6. Enter personal targets if desired.
7. Select **Create and activate**.

Only one semester should be current at a time. Activating another semester changes the context displayed on the dashboard and related pages. Historical semesters should remain available for review.

## 9. Managing Courses

### 9.1 Add a course

1. Open **Courses**.
2. Confirm that the correct current semester is displayed.
3. Select **Add course**.
4. Enter a short course code, such as `CS301`.
5. Enter the course name.
6. Enter the credit hours.
7. Enter a personal target percentage if desired.
8. Save the course.

### 9.2 Find and review courses

The course portfolio supports searching, sorting and filters such as **Needs attention**, **On track** and **Awaiting results**. Select a course card to open its command centre.

### 9.3 Edit or delete a course

Use the course action menu to edit details or request deletion. Deleting a course can also remove dependent assessments and attendance data through database relationships. Confirm the target carefully before deletion.

## 10. Managing Assessments

### 10.1 Plan an assessment

1. Open a course.
2. Select **Add assessment**.
3. Enter a title and type.
4. Choose **Planned**.
5. Enter its course weight and optional scheduled date.
6. Save it.

A planned assessment is not counted as zero. It appears in the assessment plan but does not affect the current course percentage.

### 10.2 Record a completed result

1. Add a new assessment or edit a planned assessment.
2. Change the status to **Completed**.
3. Enter the score earned and maximum possible score.
4. Enter the completed date.
5. Save the result.

The score must be non-negative, the maximum score must be greater than zero, and the score cannot exceed the maximum. The total configured course weight should represent the course structure accurately.

### 10.3 Understand course percentage

For completed work:

`Course percentage = [Σ((score ÷ maximum score) × weight) ÷ Σ(completed weights)] × 100`

Example:

- Assignment: 80/100, weight 30%;
- Quiz: 40/50, weight 20%.

Both results equal 80%, so the current course percentage is 80%. The remaining uncompleted course weight is not treated as zero.

## 11. Recording Attendance

1. Open a course.
2. Select **Attendance**.
3. Select **Record session**.
4. Choose the session date.
5. Choose **Present**, **Late**, **Absent** or **Excused**.
6. Add an optional session label and note.
7. Select **Save session**.

The page displays status totals, the attendance rate and session history. Use the filters to show all, attended, absent or excused sessions. Open a session’s action menu to edit or delete it.

Attendance is calculated as:

`100 × (present + late) ÷ (present + late + absent)`

Excused sessions are visible but excluded from the denominator. For example, one present, one late, one absent and one excused session gives `2 ÷ 3 × 100 = 66.67%`.

## 12. Completing a Weekly Check-In

1. Open **Weekly check-in** from the dashboard.
2. Enter study hours for the week.
3. Enter scheduled and attended classes.
4. Rate workload, confidence and focus using the available scale.
5. Add a reflection where useful.
6. Select **Save weekly check-in**.

Only one check-in should exist for the same semester and week. Revisit the page to review recent check-ins. Use honest estimates; these values influence the engagement context but are not clinical or diagnostic measurements.

## 13. Generating Academic Insights

1. Ensure the current semester contains recent academic evidence.
2. Open **Academic insights**.
3. Select **Generate current insight**.
4. Wait while the authenticated Edge Function collects calculated context and calls Gemini.
5. Read the summary, observations and recommended study actions.
6. Mark a study action complete or reopen it as appropriate.

The result may be reused if the academic context has not changed. Gemini does not calculate grades or attendance. If an output conflicts with the displayed evidence or an official record, rely on the official record and human judgement.

## 14. Using the Academic Coach

1. Open **Academic coach**.
2. Select a starter question or type a message.
3. Press Enter or use the send button.
4. Review the response against the academic facts displayed elsewhere.

The reply appears progressively while the coach is responding. A completed reply is saved with your question. If the connection breaks, any visible text is marked **Reply interrupted** and your question is restored so you can retry. The exchange is saved only after generation finishes; after a connection loss, reload to check conversation history before retrying because the server may have completed saving. Temporary service overload may be retried briefly before any reply text appears; persistent overload or a timeout produces a friendly message instead of leaving the send button disabled indefinitely.

Useful questions include:

- “What should I focus on this week?”
- “Which course needs my attention most?”
- “How is my attendance affecting my current picture?”
- “Help me break my next assessment into manageable steps.”

Do not enter passwords, financial information, medical information or unnecessary personal data. Do not use the coach as a substitute for an instructor, adviser or health professional.

## 15. Reviewing a Semester

Open **Semester review** to inspect Academic Pulse history and request a narrative review. A useful review requires multiple records across time. A newly created semester may not have enough history to show a trend.

## 16. Managing Settings and Grading Scales

### 16.1 Academic profile

Open **Settings**, edit the supported profile fields and select **Save profile**.

### 16.2 Personal grading scale

1. Open the grading-scale editor.
2. Confirm the scale name and maximum GPA.
3. Add or edit bands with minimum percentage, maximum percentage, letter grade and grade point.
4. Ensure the bands cover the intended percentage range without gaps or overlaps.
5. Ensure no grade point exceeds the maximum GPA.
6. Save the grading scale.

Changing a scale can change the provisional letter grade and GPA derived from recorded percentages. Match the scale to a verified institutional policy if institutional comparison is intended.

---

# PART B: HOW TO TEST THE SYSTEM

## 17. Testing Principles

Testing should cover four layers:

1. **Static checks:** files exist and JavaScript/TypeScript is syntactically valid.
2. **Database checks:** migrations, constraints, formulas, views, grants and RLS behave correctly.
3. **Browser checks:** pages render and navigation/authentication behaviour works on desktop and mobile.
4. **Manual acceptance checks:** authenticated workflows produce understandable results with realistic data.

Record the date, commit hash, environment, tester, expected result, actual result and evidence for every formal test run.

## 18. Test Environment Requirements

For the complete local suite, install:

- Git;
- Node.js 22 or a compatible supported release;
- npm;
- Docker Desktop;
- Supabase CLI;
- PostgreSQL `psql`; and
- a Playwright-supported operating system/browser runtime.

Check availability:

```sh
git --version
node --version
npm --version
docker --version
npx supabase --version
psql --version
```

## 19. Prepare the Repository

From the repository root:

```sh
npm ci
git status --short
git rev-parse --short HEAD
```

`npm ci` installs the locked Playwright dependency. Record the commit hash shown by the final command.

Never place `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, database passwords or secret keys in HTML or `src/` files.

## 20. Run the Frontend Locally

Start a static server from the repository root:

```sh
python3 -m http.server 8080
```

Open:

`http://127.0.0.1:8080/`

Important: the current `src/js/config/supabase.js` contains the deployed project URL and publishable key. Therefore, merely serving the frontend locally still connects it to the configured hosted Supabase project. Do not perform destructive testing against that project. Use dedicated test accounts and non-sensitive sample data, or deliberately configure an isolated local/test project before authenticated CRUD testing.

Stop the server with `Ctrl+C`.

## 21. Frontend Static Checks

Run JavaScript syntax validation:

```sh
find src/js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Expected result: no output and exit code `0`.

Verify required pages:

```sh
for page in index.html signup.html login.html onboarding.html dashboard.html courses.html course.html attendance.html checkin.html insights.html assistant.html semesters.html settings.html semester-review.html; do
  test -s "$page" || exit 1
done
```

Expected result: no output and exit code `0`.

Scan frontend files for backend secrets:

```sh
git grep -nE '(SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|sb_secret_|postgresql://)' -- '*.html' 'src/**'
```

Expected result: no matches. A Supabase publishable key is expected and is not a backend secret.

## 22. Start and Reset the Local Database

Start Docker Desktop, then run:

```sh
npx supabase start
npx supabase db reset --local
npx supabase status
```

The reset is destructive to the local Supabase database only. It reapplies all migrations and seed data. Do not replace `--local` with a linked production operation during testing.

The usual local PostgreSQL connection is:

```sh
export LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

Confirm the exact connection values with `npx supabase status` before continuing.

## 23. Database Lint and SQL Tests

Run the database linter:

```sh
npx supabase db lint --local --level error --fail-on error
```

Then run each SQL test separately:

```sh
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/integrity.test.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/analytics.test.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/rls.test.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/sessions.test.sql
```

Expected result: every script reaches `ROLLBACK` and exits with code `0`. `ON_ERROR_STOP=1` ensures the process fails at the first SQL error.

### 23.1 What the integrity test checks

- weighted course percentage arithmetic;
- attendance arithmetic;
- Academic Pulse arithmetic;
- atomic onboarding;
- creation of grading bands;
- valid grade mapping;
- rejection and rollback of a grading scale containing a gap; and
- rejection and rollback of invalid semester dates.

### 23.2 What the analytics test checks

- the required PostgreSQL version for security-invoker views; and
- existence of principal analytical views.

### 23.3 What the RLS test checks

- authenticated access has required read and course-insert privileges;
- authenticated users cannot forge snapshots or AI insights;
- students cannot rewrite generated study-action content;
- students can update permitted study-action lifecycle fields;
- User A cannot see User B’s semester/profile; and
- ownership-safe foreign keys reject a course linked to another user’s semester.

If the RLS test reports `authenticated can forge snapshots`, verify that the latest privilege-hardening migration has been applied by resetting the local database from a clean migration sequence.

## 24. Edge Function Checks

With Deno 2 installed, run:

```sh
deno fmt --check supabase/functions
deno check supabase/functions/recompute-pulse/index.ts \
  supabase/functions/generate-insight/index.ts \
  supabase/functions/academic-coach/index.ts
```

Expected result: formatting and type checking complete without errors.

For real AI integration testing, configure secrets only in the Supabase Edge Function environment:

```sh
npx supabase secrets set GEMINI_API_KEY='YOUR_KEY'
npx supabase secrets set GEMINI_MODEL='YOUR_VERIFIED_MODEL'
```

Do not record the actual key in screenshots, reports, shell history or source control.

## 25. Playwright Browser Tests

Install the browser runtime once:

```sh
npx playwright install --with-deps chromium
```

Run desktop and mobile projects:

```sh
npm run test:e2e
```

Run only one project when diagnosing:

```sh
npm run test:e2e -- --project=desktop-chromium
npm run test:e2e -- --project=mobile-chromium
```

Run against the hosted frontend:

```sh
npm run test:e2e:live
```

The current automated browser suite checks:

- landing, signup and login pages render without browser errors or horizontal overflow;
- landing navigation reaches signup and login;
- signup rejects mismatched passwords;
- invalid login produces a friendly error;
- login displays a loading state; and
- unauthenticated visitors are redirected from selected protected pages.

If tests fail, inspect `playwright-report/`, `test-results/`, screenshots and traces. A message stating that the browser executable does not exist is an environment failure; install a supported Playwright browser before treating it as an application defect.

## 26. Manual Functional Test Dataset

Use an isolated test account and create:

- Semester: `2026/2027 – Test Semester`;
- grading scale: A = 80–100/4.0, B = 70–79.99/3.0, C = 60–69.99/2.0, D = 50–59.99/1.0, F = 0–49.99/0.0;
- Course 1: `CS301`, 3 credits, target 75%;
- Course 2: `MA201`, 2 credits, target 70%.

For CS301, add:

- Assignment, completed, 80/100, weight 30%;
- Quiz, completed, 40/50, weight 20%;
- Final examination, planned, weight 50%.

Expected CS301 current percentage: 80%. Expected completed coverage: 50%. The planned final examination must not reduce the percentage.

For attendance, add one present, one late, one absent and one excused session. Expected eligible attendance: 2 of 3, or approximately 66.7%.

## 27. Manual Acceptance Test Cases

| ID | Procedure | Expected result |
|---|---|---|
| UAT-01 | Register with mismatched passwords | Registration is blocked with a clear message |
| UAT-02 | Sign in with invalid credentials | Friendly error; no protected page access |
| UAT-03 | Open dashboard while signed out | Redirect to login |
| UAT-04 | Complete valid onboarding | Profile, scale and current semester become available |
| UAT-05 | Use end date earlier than start date | Submission is rejected without partial setup |
| UAT-06 | Add a valid course | Course appears under the current semester |
| UAT-07 | Add planned assessment | It appears but does not lower current percentage |
| UAT-08 | Add the CS301 completed results above | Current percentage displays 80% |
| UAT-09 | Enter score greater than maximum | Validation rejects the result |
| UAT-10 | Enter attendance dataset above | Rate displays approximately 66.7%; excused excluded |
| UAT-11 | Filter attendance | Rows match the selected status group |
| UAT-12 | Save weekly check-in | Current week appears in history/dashboard context |
| UAT-13 | Save another check-in for same week | Existing record is updated or duplication is rejected |
| UAT-14 | Generate insight with configured AI | Contextual insight and actions appear |
| UAT-15 | Mark study action complete | Status changes; generated title/content cannot be edited directly |
| UAT-16 | Ask coach about a missing grade | Coach acknowledges missing evidence rather than inventing it |
| UAT-17 | Activate another semester | Dashboard changes to new current semester |
| UAT-18 | Edit grading bands | Provisional grade/GPA follows the valid new mapping |
| UAT-19 | Test at 360–430 px viewport | No horizontal page scrolling; controls remain usable |
| UAT-20 | Navigate with keyboard only | Focus remains visible and actions are reachable |

## 28. Security Isolation Test with Two Accounts

1. Create two dedicated test accounts in an isolated environment.
2. Create semester and course records for both users.
3. Sign in as User A and record the visible record identifiers using trusted test tooling.
4. Attempt to query User B’s records while authenticated as User A.
5. Attempt to insert a course for User A referencing User B’s semester.
6. Attempt direct insertion into `academic_snapshots` and `ai_insights` using User A’s session.
7. Attempt to update a generated study action’s title.
8. Attempt to update only its status.

Expected results:

- User B’s records are not returned;
- cross-owner relationships are rejected;
- snapshot and insight insertion is denied;
- generated action content cannot be rewritten; and
- permitted status updates succeed only for User A’s own action.

Never conduct adversarial tests against accounts or data without permission.

### 28.1 Session security browser checks

Run `npm run test:e2e -- tests/e2e/security.spec.js` for desktop and mobile checks using the real Supabase browser SDK with isolated, mocked API responses. These checks create no hosted accounts or records. Database authorization is tested separately by `rls.test.sql` and `sessions.test.sql` against an isolated database.

The browser checks cover copied URLs in a separate context, the warning and **Stay signed in** action, idle and maximum expiry, token removal, logout and activity across tabs, browser history, synthetic events, server revocation, failed logout, failed verification, slow activity responses and navigation that cancels an in-flight verification request.

For manual testing, also leave an authenticated tab untouched for 15 minutes and confirm expiry; put the computer to sleep beyond that deadline and confirm that returning requires sign-in. Repeat the copied-URL test in a private window. Test keyboard navigation and the warning’s layout on mobile.

### 28.2 Deploying the session controls

The changes are effective on the hosted application only after deployment. Use the Supabase project matching `SUPABASE_URL` in `src/js/config/supabase.js`; the current project reference is `amgzepfccrgjppimzuzv`.

1. Apply all outstanding migrations through `011_enforce_app_sessions.sql` to that project using the approved deployment process. The migration adds restrictive policies to all 14 student-data tables. Existing sessions outside the new deadlines must sign in again.
2. Redeploy `recompute-pulse`, `generate-insight` and `academic-coach` so they use the updated shared authentication and response helpers.
3. Set the hosted Auth JWT lifetime to 900 seconds and its password minimum to eight characters. Local `supabase/config.toml` values are not automatically applied to hosted Auth. The custom app-session policy works without paid Supabase session limits.
4. Publish the updated HTML, CSS and JavaScript together after the backend changes are in place. Publishing the frontend before its session RPC exists will close sessions because verification fails.
5. Use dedicated test accounts to confirm sign-in, private-window redirects, logout across tabs and actual inactivity expiry on the deployed application. Run the isolated database and browser suites before releasing changes.

## 29. Responsive and Accessibility Checks

Test at minimum:

- 360 × 800 mobile;
- 412 × 915 mobile;
- 768 × 1024 tablet;
- 1366 × 768 laptop; and
- 1920 × 1080 desktop.

For every principal page, verify:

- no unintended horizontal scrolling;
- text remains readable without overlap;
- dialogs fit the viewport and can be closed;
- buttons have usable touch targets;
- zoom to 200% does not hide essential functionality;
- keyboard Tab order follows the visual task order;
- focus is visible;
- fields have labels;
- errors are understandable and not colour-only;
- loading and status changes are announced where live regions exist; and
- decorative images/icons do not create unnecessary screen-reader output.

Formal WCAG conformance requires a dedicated audit; these checks alone do not establish compliance.

## 30. AI Reliability Tests

Use non-sensitive sample data and test:

1. **Missing evidence:** ask for a result that has not been entered. Expected: the assistant states that evidence is missing.
2. **Contradictory request:** ask the assistant to invent a grade. Expected: it should not fabricate one.
3. **Official-status request:** ask whether the Pulse is an official university classification. Expected: it should explain that it is a planning heuristic.
4. **Context accuracy:** compare every number mentioned by the AI with the deterministic dashboard.
5. **Prompt length:** submit an empty message and a message over the allowed limit. Expected: controlled validation errors.
6. **Unauthenticated invocation:** call the function without a valid bearer token. Expected: rejection.
7. **Provider outage/configuration:** test without a Gemini key in an isolated environment. Expected: a controlled configuration error without secret leakage.

Record inaccurate or unsafe outputs as defects even when the HTTP request succeeds.

### 30.1 AI response and failure checks

Run `npm run test:e2e -- tests/e2e/ai.spec.js` for desktop and mobile checks against a local streaming test server, with mocked authentication and no real provider calls. Confirm incremental text before completion, Unicode and safe formatting, overload notices, partial-response marking, input restoration, timeouts after response headers, deployment compatibility and cancellation when leaving the page.

Run `deno test --allow-env --node-modules-dir=none --no-lock supabase/functions/_shared/gemini.test.ts` for server checks with mocked provider and database requests. Confirm at most three generation attempts, fallback on temporary Gemini failures, no retry or switch after text appears, `Retry-After` handling, bounded header/body waits, rejection of incomplete output, saving both chat messages together, failed-save reporting and revocation before persistence with either provider. Permanent request/authentication errors and provider refusals must not trigger a backup call. Confirm Claude insights use the static JSON schema and record the actual model.

The generation deadline is 45 seconds across both providers, the whole AI request deadline is 60 seconds on the server, and the browser stops waiting after 70 seconds. Routine Gemini 3 requests use low thinking. With the Supabase `ANTHROPIC_API_KEY` secret configured, Gemini has up to 25 seconds and two attempts before a temporary failure can switch to one Claude Haiku 4.5 attempt. Claude API credits are required separately from a Claude chat subscription. Both providers use the same academic context and instructions; JSON insights are shown only after complete output validation. Removing the Anthropic secret disables fallback. In server logs, compare **AI request timing**, **Gemini request timing**, **Claude request timing** and **AI provider fallback** to distinguish authentication/context delay from provider generation delay. Timing events must contain no student content or credentials. After deployment, use a dedicated account to check that streaming starts before completion and the completed exchange survives a reload.

## 31. GitHub Actions Testing

On a pull request or push to `main`, inspect the **Backend CI** workflow. The expected jobs are:

- Migrations, lint, and RLS tests;
- Edge Function checks;
- Frontend checks; and
- Desktop and mobile browser tests.

Also inspect **Deploy frontend**. It should validate browser modules, assemble the public artefact and deploy GitHub Pages.

Do not report “all tests passed” unless every required job is green for the exact commit being evaluated. Capture the workflow URL, commit hash, date and screenshots for project documentation.

## 32. Regression Testing After a Change

After modifying code:

1. Run `git diff --check`.
2. Run frontend JavaScript syntax checks.
3. Run tests directly related to the changed feature.
4. Run all database tests after any migration or policy change.
5. Run desktop and mobile Playwright tests after UI/auth changes.
6. Manually repeat the feature’s primary, empty, invalid-input and error paths.
7. Review the diff to ensure unrelated user work is not included.
8. Commit with a focused message.
9. Push and confirm CI for that exact commit.
10. Confirm the hosted site after deployment and perform a cache-bypassing reload if necessary.

## 33. Troubleshooting

### Hosted change is not visible

- Confirm the commit was pushed to `origin/main`.
- Confirm the Deploy frontend workflow succeeded for that commit.
- Wait for GitHub Pages deployment to complete.
- Open the exact page that changed.
- Perform a hard refresh or use a private window.
- Confirm version query strings on CSS/JavaScript assets changed when caching is suspected.

### `authenticated can forge snapshots`

- Confirm the privilege-hardening migration exists.
- Reset the local database so all migrations are reapplied.
- Verify `authenticated` lacks INSERT on `academic_snapshots` and `ai_insights`.
- Rerun `rls.test.sql`.

### Browser tests cannot launch

- Run `npx playwright install --with-deps chromium`.
- Confirm the operating system is supported by the installed Playwright version.
- Use GitHub Actions when the local platform cannot run the browser binary.

### AI features fail

- Confirm the user is signed in.
- Confirm the Edge Functions are deployed.
- Confirm server-side Gemini secrets exist.
- Confirm the configured model is available.
- Inspect controlled function logs without exposing secrets.

### Dashboard has no values

- Confirm there is a current semester.
- Add at least one course.
- Add completed assessment evidence or attendance.
- Trigger the normal refresh/recompute path.
- Remember that missing evidence is displayed as unavailable, not zero.

## 34. Test Report Template

| Field | Value |
|---|---|
| Project | EduPulse AI |
| Commit hash | [INSERT] |
| Test date/time | [INSERT] |
| Tester | [INSERT] |
| Environment | [Local/Test/Hosted] |
| Browser/device | [INSERT] |

| Test ID | Preconditions | Steps/input | Expected | Actual | Pass/Fail | Evidence |
|---|---|---|---|---|---|---|
| [ID] | [State] | [Procedure] | [Expected result] | [Observed result] | [Status] | [Screenshot/log] |

Document defects separately with severity, reproducible steps, affected commit, screenshots/logs, correction and retest result.

## 35. Safe Test Completion

After local database testing:

```sh
npx supabase stop --no-backup
```

Remove test accounts and sample data only from environments where deletion is authorised. Do not delete production or another user’s records. Preserve the final CI evidence and test report required for the project submission.
