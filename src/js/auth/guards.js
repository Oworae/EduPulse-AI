import { supabase } from "../config/supabase.js";
import { currentSession } from "./session.js";

export async function requireSession({ requireOnboarding } = {}) {
  const session = await currentSession();
  if (!session) {
    window.location.replace("login.html");
    return null;
  }
  if (typeof requireOnboarding === "boolean") {
    const { data: profile, error } = await supabase.from("profiles").select("onboarding_completed").single();
    if (error) throw error;
    if (requireOnboarding && !profile.onboarding_completed) window.location.replace("onboarding.html");
    if (!requireOnboarding && profile.onboarding_completed) window.location.replace("dashboard.html");
  }
  return session;
}
