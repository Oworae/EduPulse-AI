import { supabase } from "../config/supabase.js";

export async function recomputePulse(semesterId) {
  const { data, error } = await supabase.functions.invoke("recompute-pulse", { body: { semester_id: semesterId } });
  if (error) throw error;
  return data;
}

export async function recomputePulseQuietly(semesterId) {
  try { return await recomputePulse(semesterId); }
  catch (error) { console.warn("Academic Pulse refresh deferred:", error.message); return null; }
}
