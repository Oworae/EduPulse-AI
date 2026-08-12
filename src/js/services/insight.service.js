import { supabase } from "../config/supabase.js";
import { invokeFunction } from "./function.service.js";

export async function generateInsight(type = "home_summary", courseId = null) {
  const body = { type }; if (courseId) body.course_id = courseId;
  return invokeFunction("generate-insight", body);
}
export async function listInsights(semesterId) {
  const { data, error } = await supabase.from("ai_insights").select("*").eq("semester_id", semesterId).order("generated_at", { ascending: false }).limit(12);
  if (error) throw error; return data;
}
export async function listStudyActions(semesterId) {
  const { data, error } = await supabase.from("study_actions").select("*").eq("semester_id", semesterId).order("priority").order("created_at", { ascending: false });
  if (error) throw error; return data;
}
export async function updateStudyAction(actionId, status) {
  const values = { status, completed_at: status === "completed" ? new Date().toISOString() : null };
  const { data, error } = await supabase.from("study_actions").update(values).eq("id", actionId).select().single();
  if (error) throw error; return data;
}
export function insightContent(insight) {
  try { return JSON.parse(insight.body); } catch { return { title: insight.title, summary: insight.summary, observations: [], recommended_actions: [] }; }
}
