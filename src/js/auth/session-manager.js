import { supabase, SUPABASE_AUTH_STORAGE_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config/supabase.js";

const WARNING_MS = 60_000;
const ACTIVITY_BATCH_MS = 5_000;
const VERIFY_INTERVAL_MS = 60_000;
const EVENT_KEY = "edupulse:session-event";
const REVOKED_PREFIX = "edupulse:revoked-session:";
const activityEvents = ["pointerdown", "pointermove", "keydown", "input", "wheel"];
let state = null;
let checking = null;
let ending = false;
let endOperation = null;
let tickTimer;
let activityTimer;
let activityPending = false;
let recordingActivity = false;
let lastActivitySync = -Infinity;
let lastVerification = 0;
let warning;
let countdown;
let stayButton;
let channel;
let subscription;
let leaving = false;
let lifecycle = 0;

function markLeaving() {
  leaving = true;
  lifecycle += 1;
  clearTimeout(activityTimer);
  activityTimer = undefined;
  activityPending = false;
}

window.addEventListener("beforeunload", markLeaving);
window.addEventListener("pagehide", markLeaving);
window.addEventListener("pageshow", revalidate);

function storage(action, key, value) {
  try { return window.localStorage[action](key, value); } catch { return null; }
}

function sessionId(session) {
  try {
    const payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).session_id;
  } catch { return null; }
}

function persistedSession() {
  try { return JSON.parse(storage("getItem", SUPABASE_AUTH_STORAGE_KEY) || "null"); }
  catch { return null; }
}

export function isSessionEnding() { return ending; }

async function within(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Session verification timed out")), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function terminateOnServer(path, session) {
  if (!session?.access_token) return;
  // Other tabs can clear shared storage immediately after the logout event.
  // Capture the bearer token so server revocation still authenticates correctly.
  const response = await within(fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
  }), 3_000);
  if (!response.ok) throw new Error("Server sign-out could not be confirmed");
}

function publish(type, id) {
  const event = { type, session_id: id, nonce: crypto.randomUUID() };
  storage("setItem", EVENT_KEY, JSON.stringify(event));
  channel?.postMessage(event);
}

function maskPage() {
  document.body?.setAttribute("data-session-pending", "");
}

function remaining() {
  if (!state) return 0;
  // Use both clocks so a clock adjustment cannot extend the local deadline.
  // The wall clock also covers devices whose performance clock pauses in sleep.
  const elapsed = Math.max(Date.now() - state.wallAnchor, performance.now() - state.monotonicAnchor, 0);
  return state.remainingAtAnchor - elapsed;
}

function applyStatus(session, status) {
  const serverNow = Date.parse(status.server_now);
  const idleDeadline = Date.parse(status.idle_expires_at);
  const absoluteDeadline = Date.parse(status.absolute_expires_at);
  if (![serverNow, idleDeadline, absoluteDeadline].every(Number.isFinite) || status.session_id !== sessionId(session)) {
    throw new Error("Invalid session verification response");
  }
  state = {
    session, id: status.session_id, status,
    remainingAtAnchor: Math.min(idleDeadline, absoluteDeadline) - serverNow,
    wallAnchor: Date.now(), monotonicAnchor: performance.now(),
  };
  lastVerification = performance.now();
  document.body?.removeAttribute("data-session-pending");
  updateWarning();
}

function ensureWarning() {
  if (warning) return;
  warning = document.createElement("dialog");
  warning.className = "session-expiry-dialog";
  warning.setAttribute("aria-labelledby", "session-expiry-title");
  warning.setAttribute("aria-describedby", "session-expiry-description");
  const title = document.createElement("h2");
  title.id = "session-expiry-title";
  title.textContent = "Your session is about to expire";
  countdown = document.createElement("p");
  countdown.id = "session-expiry-description";
  const actions = document.createElement("div");
  actions.className = "session-expiry-actions";
  const signOut = document.createElement("button");
  signOut.type = "button";
  signOut.textContent = "Sign out";
  signOut.addEventListener("click", () => { void endSession(); });
  stayButton = document.createElement("button");
  stayButton.type = "button";
  stayButton.textContent = "Stay signed in";
  stayButton.addEventListener("click", async () => {
    stayButton.disabled = true;
    await synchronize(true);
    stayButton.disabled = false;
  });
  actions.append(signOut, stayButton);
  warning.append(title, countdown, actions);
  warning.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(warning);
}

function updateWarning() {
  const milliseconds = remaining();
  if (milliseconds <= 0 || milliseconds > WARNING_MS) {
    if (warning?.open) warning.close();
    return;
  }
  ensureWarning();
  const absolute = Date.parse(state.status.absolute_expires_at) <= Date.parse(state.status.idle_expires_at);
  countdown.textContent = absolute
    ? `Please save your work. You must sign in again in ${Math.ceil(milliseconds / 1000)} seconds.`
    : `You will be signed out after inactivity in ${Math.ceil(milliseconds / 1000)} seconds.`;
  stayButton.hidden = absolute;
  if (!warning.open) warning.showModal();
}

async function readStatus(recordActivity) {
  const { data, error } = await within(supabase.rpc("get_app_session", { p_record_activity: recordActivity }), 8_000);
  if (error) throw error;
  if (!data || typeof data.active !== "boolean") throw new Error("Session verification unavailable");
  return data;
}

async function synchronize(recordActivity = false) {
  if (ending || leaving || !state) return null;
  if (checking) {
    const previous = await checking;
    return !ending && !leaving && state && (recordActivity || !previous) ? synchronize(recordActivity) : previous;
  }
  const session = state.session;
  const id = state.id;
  const requestLifecycle = lifecycle;
  checking = (async () => {
    try {
      const status = await readStatus(recordActivity);
      if (ending || leaving || lifecycle !== requestLifecycle || state?.id !== id) return null;
      if (!status.active) { await endSession(status.reason || "inactive"); return null; }
      applyStatus(session, status);
      if (recordActivity) {
        lastActivitySync = performance.now();
        publish("activity", id);
      }
      return status;
    } catch {
      if (leaving || lifecycle !== requestLifecycle) return null;
      await endSession("verification-failed", { revoke: false });
      return null;
    }
  })();
  try { return await checking; } finally { checking = null; }
}

function recordActivity(event) {
  // Background refresh, synthetic DOM events and hidden tabs are not activity.
  if (!event.isTrusted || document.visibilityState !== "visible" || warning?.open || ending || leaving || !state) return;
  activityPending = true;
  scheduleActivity();
}

function scheduleActivity() {
  if (activityTimer || recordingActivity || ending || leaving || !state) return;
  const delay = Math.max(0, ACTIVITY_BATCH_MS - (performance.now() - lastActivitySync));
  activityTimer = setTimeout(async () => {
    activityTimer = undefined;
    activityPending = false;
    recordingActivity = true;
    try { await synchronize(true); }
    finally {
      recordingActivity = false;
      if (activityPending) scheduleActivity();
    }
  }, delay);
}

function tick() {
  if (!state || ending || leaving) return;
  if (storage("getItem", REVOKED_PREFIX + state.id)) {
    void endSession("signed-out", { remote: true, revoke: false });
    return;
  }
  // Check the server before expiring, because another tab may have been active.
  if (remaining() <= 0 || performance.now() - lastVerification >= VERIFY_INTERVAL_MS) {
    if (remaining() <= 0) maskPage();
    void synchronize(false);
  }
  updateWarning();
}

function receive(event) {
  if (!state || ending || leaving || event?.session_id !== state.id) return;
  if (event.type === "logout") void endSession("signed-out", { remote: true, revoke: false });
  else if (event.type === "activity") void synchronize(false);
}

function revalidate(event) {
  if (event.type === "pageshow") leaving = false;
  if (!state || ending || leaving || document.visibilityState === "hidden") return;
  if (storage("getItem", REVOKED_PREFIX + state.id)) {
    void endSession("signed-out", { remote: true, revoke: false });
    return;
  }
  if (remaining() <= 0 || (event.type === "pageshow" && event.persisted)) maskPage();
  void synchronize(false);
}

function startMonitor() {
  if (tickTimer) return;
  activityEvents.forEach((name) => document.addEventListener(name, recordActivity, { passive: true }));
  document.addEventListener("visibilitychange", revalidate);
  window.addEventListener("focus", revalidate);
  window.addEventListener("storage", onStorage);
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("edupulse-session");
    channel.onmessage = (event) => receive(event.data);
  }
  ({ data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // Defer client calls until the Auth callback has released its lock.
    setTimeout(() => {
      if (ending || leaving || !state) return;
      if (event === "SIGNED_OUT" || !session) {
        void endSession("signed-out", { revoke: false });
      } else if (sessionId(session) !== state.id) {
        maskPage();
        window.location.replace("login.html");
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        state.session = session;
        void synchronize(false);
      }
    }, 0);
  }));
  tickTimer = setInterval(tick, 1_000);
}

function onStorage(event) {
  if (event.key === EVENT_KEY && event.newValue) {
    try { receive(JSON.parse(event.newValue)); } catch { /* Ignore unrelated malformed storage. */ }
  } else if (state && event.key === REVOKED_PREFIX + state.id && event.newValue) {
    void endSession("signed-out", { remote: true, revoke: false });
  }
}

function stopMonitor() {
  clearInterval(tickTimer);
  clearTimeout(activityTimer);
  activityPending = false;
  activityEvents.forEach((name) => document.removeEventListener(name, recordActivity));
  document.removeEventListener("visibilitychange", revalidate);
  window.removeEventListener("focus", revalidate);
  window.removeEventListener("pageshow", revalidate);
  window.removeEventListener("beforeunload", markLeaving);
  window.removeEventListener("pagehide", markLeaving);
  window.removeEventListener("storage", onStorage);
  subscription?.unsubscribe();
  channel?.close();
  channel = undefined;
  if (warning?.open) warning.close();
}

export async function verifySession(session) {
  if (leaving) return null;
  const requestLifecycle = lifecycle;
  const id = sessionId(session);
  if (!id || storage("getItem", REVOKED_PREFIX + id)) {
    await endSession("signed-out", { session });
    return null;
  }
  try {
    const status = await readStatus(false);
    if (leaving || lifecycle !== requestLifecycle) return null;
    if (storage("getItem", REVOKED_PREFIX + id)) {
      await endSession("signed-out", { session, remote: true, revoke: false });
      return null;
    }
    if (!status.active) {
      await endSession(status.reason || "signed-out", { session });
      return null;
    }
    applyStatus(session, status);
    startMonitor();
    return session;
  } catch {
    if (leaving || lifecycle !== requestLifecycle) return null;
    await endSession("verification-failed", { session, revoke: false });
    return null;
  }
}

export function endSession(reason = "signed-out", { session = state?.session || persistedSession(), remote = false, revoke = true } = {}) {
  if (leaving && !ending) return Promise.resolve();
  if (ending) return endOperation;
  ending = true;
  const id = state?.id || sessionId(session);
  maskPage();
  // Remove student content immediately, including pages restored from history.
  document.querySelectorAll("main").forEach((main) => main.replaceChildren());
  if (id) {
    storage("setItem", REVOKED_PREFIX + id, "1");
    if (!remote) publish("logout", id);
  }
  stopMonitor();
  supabase.auth.stopAutoRefresh();
  endOperation = (async () => {
    let failed = false;
    if (revoke && !remote) {
      try { await terminateOnServer("/rest/v1/rpc/revoke_app_session", session); }
      catch { failed = true; }
    }
    if (!remote) {
      try { await terminateOnServer("/auth/v1/logout?scope=local", session); }
      catch { failed = true; }
    }
    // A failed network logout must still clear this browser's matching token.
    try {
      const stored = JSON.parse(storage("getItem", SUPABASE_AUTH_STORAGE_KEY) || "null");
      if (stored && sessionId(stored) === id) storage("removeItem", SUPABASE_AUTH_STORAGE_KEY);
    } catch { /* Auth may already have removed its storage. */ }
    state = null;
    const notice = failed ? "logout-incomplete" : reason;
    const query = notice === "signed-out" ? "" : `?session=${encodeURIComponent(notice)}`;
    window.location.replace(`login.html${query}`);
  })();
  return endOperation;
}
