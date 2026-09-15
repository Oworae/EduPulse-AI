import { expect, test } from "@playwright/test";

const USER_ID = "60000000-0000-4000-8000-000000000006";
const SESSION_ID = "66000000-0000-4000-8000-000000000006";
const STORAGE_KEY = "sb-amgzepfccrgjppimzuzv-auth-token";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
test.setTimeout(60_000);

function token(now) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER_ID, session_id: SESSION_ID, aud: "authenticated", role: "authenticated", exp: Math.floor((now + 24 * HOUR) / 1000) })}.test-signature`;
}

async function signedIn(context, page, options = {}) {
  const now = Date.now();
  const server = { now, started: now, lastActivity: now, revoked: false, activityCalls: 0, verificationCalls: 0, ...options };
  const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "security@example.test", user_metadata: {}, app_metadata: {}, created_at: new Date(now).toISOString() };
  const session = { access_token: token(now), refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 86400, expires_at: Math.floor((now + 24 * HOUR) / 1000), user };
  await context.addInitScript(({ key, session, id }) => {
    if (!/^https?:$/.test(location.protocol)) return;
    if (!sessionStorage.getItem("security-test-initialized")) {
      sessionStorage.setItem("security-test-initialized", "1");
      if (!localStorage.getItem(`edupulse:revoked-session:${id}`)) {
        localStorage.setItem(key, JSON.stringify(session));
      }
    }
  }, { key: STORAGE_KEY, session, id: SESSION_ID });
  await context.route("https://amgzepfccrgjppimzuzv.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/rpc/get_app_session")) {
      server.verificationCalls += 1;
      if (server.verificationFailure) return reply({ message: "Unavailable" }, 503);
      const reason = server.revoked ? "signed-out" : server.now >= server.started + 8 * HOUR ? "maximum" : server.now >= server.lastActivity + 15 * MINUTE ? "inactive" : null;
      if (!reason && route.request().postDataJSON()?.p_record_activity) {
        server.lastActivity = server.now;
        server.activityCalls += 1;
        if (server.activityDelayMs) await new Promise((resolve) => setTimeout(resolve, server.activityDelayMs));
      }
      if (server.verificationDelayMs) await new Promise((resolve) => setTimeout(resolve, server.verificationDelayMs));
      return reply({
        active: !reason, reason, session_id: SESSION_ID,
        server_now: new Date(server.now).toISOString(),
        started_at: new Date(server.started).toISOString(),
        last_activity_at: new Date(server.lastActivity).toISOString(),
        idle_expires_at: new Date(server.lastActivity + 15 * MINUTE).toISOString(),
        absolute_expires_at: new Date(server.started + 8 * HOUR).toISOString(),
      });
    }
    if (path.endsWith("/rpc/revoke_app_session")) {
      expect(route.request().headers().authorization).toBe(`Bearer ${session.access_token}`);
      if (server.logoutFailure) return reply({ message: "Unavailable" }, 503);
      server.revoked = true;
      return reply(null);
    }
    if (path.endsWith("/auth/v1/logout")) {
      expect(route.request().headers().authorization).toBe(`Bearer ${session.access_token}`);
      if (server.logoutFailure) return reply({ message: "Unavailable" }, 503);
      server.revoked = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/auth/v1/user")) return reply(user);
    if (path.endsWith("/profiles")) return reply({ id: USER_ID, full_name: "Security Student", onboarding_completed: true });
    if (path.endsWith("/semesters")) return reply({ id: "test-semester", user_id: USER_ID, semester_name: "Semester 1", academic_year: "2026/2027", is_current: true });
    if (path.endsWith("/v_semester_course_summary")) return reply([{
      course_id: "test-course", semester_id: "test-semester", course_code: "SEC101", course_name: "Private course", credit_hours: 3,
      completed_assessments: 0, total_assessments: 0, completed_weight: 0, current_percentage: null, letter_grade: null, grade_point: null,
      attendance_percentage: null, target_percentage: 75, difference_from_target: null,
    }]);
    throw new Error(`Unexpected security-test request: ${path}`);
  });
  await page.clock.setFixedTime(new Date(now));
  await page.goto("courses.html");
  if (options.expectSignedIn !== false) await expect(page.getByRole("heading", { name: "Private course", exact: true })).toBeVisible();
  return server;
}

async function advance(page, server, milliseconds) {
  server.now += milliseconds;
  await page.clock.setFixedTime(new Date(server.now));
}

async function signOut(page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
}

test("copied course URL requires login in a separate browser context", async ({ browser, context, page, baseURL }) => {
  await signedIn(context, page);
  const privateContext = await browser.newContext({ baseURL });
  try {
    const privatePage = await privateContext.newPage();
    await privatePage.goto(page.url());
    await expect(privatePage).toHaveURL(/login\.html$/);
    await expect(privatePage.getByRole("heading", { name: "Private course" })).toHaveCount(0);
  } finally { await privateContext.close(); }
});

test("inactivity warns, Stay signed in renews, and idle expiry clears the token", async ({ context, page }) => {
  const server = await signedIn(context, page);
  await advance(page, server, 14 * MINUTE + 1000);
  await expect(page.getByRole("dialog", { name: "Your session is about to expire" })).toBeVisible();
  await page.getByRole("button", { name: "Stay signed in" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(server.activityCalls).toBeGreaterThan(0);
  await advance(page, server, 15 * MINUTE + 1000);
  await expect(page).toHaveURL(/login\.html\?session=inactive$/);
  await expect(page.locator("#form-message")).toContainText("15 minutes of inactivity");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.goto("courses.html");
  await expect(page).toHaveURL(/login\.html$/);
});

test("logout redirects every open tab and history cannot restore courses", async ({ context, page }) => {
  await signedIn(context, page);
  const second = await context.newPage();
  await second.goto("courses.html");
  await expect(second.getByRole("heading", { name: "Private course" })).toBeVisible();
  await page.goto("./");
  await page.goto("courses.html");
  await expect(page.getByRole("heading", { name: "Private course" })).toBeVisible();
  await signOut(page);
  await expect(page).toHaveURL(/login\.html$/);
  await expect(second).toHaveURL(/login\.html$/);
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/login\.html$/);
  await page.goto("courses.html");
  await expect(page).toHaveURL(/login\.html$/);
  await expect(page.getByRole("heading", { name: "Private course" })).toHaveCount(0);
});

test("activity in another tab dismisses the inactivity warning", async ({ context, page }) => {
  const server = await signedIn(context, page);
  const second = await context.newPage();
  await second.goto("courses.html");
  await expect(second.getByRole("heading", { name: "Private course" })).toBeVisible();
  const jump = 14 * MINUTE + 1000;
  await advance(page, server, jump);
  await expect(second.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay signed in" }).click();
  await expect(second.getByRole("dialog")).not.toBeVisible();
  await expect(second).toHaveURL(/courses\.html$/);
});

test("background verification and synthetic events do not count as activity", async ({ context, page }) => {
  const server = await signedIn(context, page);
  const initialActivity = server.lastActivity;
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
  await advance(page, server, 10 * MINUTE);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(server.lastActivity).toBe(initialActivity);
  expect(server.activityCalls).toBe(0);
  await advance(page, server, 5 * MINUTE + 1000);
  await expect(page).toHaveURL(/login\.html\?session=inactive$/);
});

test("eight-hour expiry survives recent activity and refresh of the same session", async ({ context, page }) => {
  const server = await signedIn(context, page, { started: Date.now() - 8 * HOUR + 30_000 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stay signed in" })).toBeHidden();
  await page.evaluate(async () => {
    const { supabase } = await import("./src/js/config/supabase.js");
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  });
  await advance(page, server, 31_000);
  await expect(page).toHaveURL(/login\.html\?session=maximum$/);
});

test("server revocation is detected when returning to a tab", async ({ context, page }) => {
  const server = await signedIn(context, page);
  server.revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/login\.html$/);
  await expect(page.getByRole("heading", { name: "Private course" })).toHaveCount(0);
});

test("failed network logout clears local credentials and reports the failure", async ({ context, page }) => {
  await signedIn(context, page, { logoutFailure: true });
  await signOut(page);
  await expect(page).toHaveURL(/login\.html\?session=logout-incomplete$/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(page.locator("#form-message")).toContainText("couldn’t confirm server sign-out");
});

test("verification failure closes an already open protected page", async ({ context, page }) => {
  const server = await signedIn(context, page);
  server.verificationFailure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/login\.html\?session=verification-failed$/);
});

test("a saved but expired session cannot open a copied course URL", async ({ context, page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signedIn(context, page, { lastActivity: Date.now() - 16 * MINUTE, expectSignedIn: false });
  await expect(page).toHaveURL(/login\.html\?session=inactive$/);
  await expect(page.getByRole("heading", { name: "Private course" })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test("rapid interaction cannot queue a backlog of activity updates", async ({ context, page }) => {
  const server = await signedIn(context, page, { activityDelayMs: 750 });
  await page.mouse.move(60, 60, { steps: 30 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(server.activityCalls).toBe(1);
});

test("leaving during verification preserves the session in other tabs", async ({ context, page }) => {
  const server = await signedIn(context, page);
  const second = await context.newPage();
  await second.goto("courses.html");
  await expect(second.getByRole("heading", { name: "Private course" })).toBeVisible();
  server.verificationDelayMs = 2000;
  const before = server.verificationCalls;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => server.verificationCalls).toBeGreaterThan(before);
  await page.goto("./");
  await new Promise((resolve) => setTimeout(resolve, 2200));
  expect(server.revoked).toBe(false);
  expect(await second.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();
  await expect(second).toHaveURL(/courses\.html$/);
  server.verificationDelayMs = 0;
  await page.goto("courses.html");
  await expect(page.getByRole("heading", { name: "Private course" })).toBeVisible();
});
