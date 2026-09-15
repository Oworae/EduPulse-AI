import { supabase } from "../config/supabase.js";
import { currentSession } from "./session.js";
import { endSession } from "./session-manager.js";

export async function requireSession({ requireOnboarding } = {}) {
  let session;
  try { session = await currentSession(); }
  catch { await endSession("verification-failed", { revoke: false }); return null; }
  if (!session) {
    await endSession("signed-out", { remote: true, revoke: false });
    return null;
  }
  if (typeof requireOnboarding === "boolean") {
    const { data: profile, error } = await supabase.from("profiles").select("onboarding_completed").single();
    if (error || !profile) {
      await endSession("verification-failed", { revoke: false });
      return null;
    }
    if (requireOnboarding && !profile.onboarding_completed) { window.location.replace("onboarding.html"); return null; }
    if (!requireOnboarding && profile.onboarding_completed) { window.location.replace("dashboard.html"); return null; }
  }
  return session;
}
