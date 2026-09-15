import { supabase } from "../config/supabase.js";
import { verifySession, endSession } from "./session-manager.js";

export async function currentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) { await endSession("verification-failed", { revoke: false }); return null; }
  return data.session ? verifySession(data.session) : null;
}

export async function routeSignedInUser() {
  const session = await currentSession();
  if (!session) return false;
  const { data: profile, error } = await supabase.from("profiles").select("onboarding_completed").single();
  if (error) throw error;
  window.location.replace(profile.onboarding_completed ? "dashboard.html" : "onboarding.html");
  return true;
}
