import { supabase } from "../config/supabase.js";

export function currentWeekStart() {
  const date = new Date(); const day = date.getDay(); const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10);
}
export async function getCheckin(semesterId, weekStart) {
  const { data, error } = await supabase.from("weekly_checkins").select("*").eq("semester_id", semesterId).eq("week_start", weekStart).maybeSingle();
  if (error) throw error; return data;
}
export async function listCheckins(semesterId) {
  const { data, error } = await supabase.from("weekly_checkins").select("*").eq("semester_id", semesterId).order("week_start", { ascending: false }).limit(12);
  if (error) throw error; return data;
}
export async function saveCheckin(values, semesterId, userId) {
  const payload = { ...values, semester_id: semesterId, user_id: userId };
  const { data, error } = await supabase.from("weekly_checkins").upsert(payload, { onConflict: "user_id,semester_id,week_start" }).select().single();
  if (error) throw error; return data;
}
