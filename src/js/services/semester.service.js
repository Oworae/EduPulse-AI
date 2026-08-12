import { supabase } from "../config/supabase.js";

export async function getCurrentSemester() {
  const { data, error } = await supabase.from("semesters").select("*").eq("is_current", true).single();
  if (error) throw error;
  return data;
}
export async function listSemesters() {
  const { data, error } = await supabase.from("semesters").select("*").order("created_at", { ascending: false });
  if (error) throw error; return data;
}
export async function createSemester(values, userId) {
  const { data, error } = await supabase.from("semesters").insert({ ...values, user_id: userId }).select().single();
  if (error) throw error; return data;
}
export async function setCurrentSemester(semesterId) {
  const { data, error } = await supabase.rpc("set_current_semester", { p_semester_id: semesterId });
  if (error) throw error; return data;
}
export async function updateSemester(semesterId, values) {
  const { data, error } = await supabase.from("semesters").update(values).eq("id", semesterId).select().single();
  if (error) throw error; return data;
}
export async function listSnapshots(semesterId) {
  const { data, error } = await supabase.from("academic_snapshots").select("snapshot_date,pulse_score,semester_average,attendance_rate,pulse_status").eq("semester_id", semesterId).order("snapshot_date");
  if (error) throw error; return data;
}
