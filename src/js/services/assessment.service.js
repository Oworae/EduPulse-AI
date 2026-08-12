import { supabase } from "../config/supabase.js";

export async function listAssessments(courseId) {
  const { data, error } = await supabase.from("assessments").select("*").eq("course_id", courseId).order("scheduled_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}
export async function saveAssessment(values, courseId, userId, assessmentId) {
  const payload = { ...values, course_id: courseId, user_id: userId };
  const query = assessmentId ? supabase.from("assessments").update(payload).eq("id", assessmentId) : supabase.from("assessments").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function deleteAssessment(assessmentId) {
  const { error } = await supabase.from("assessments").delete().eq("id", assessmentId);
  if (error) throw error;
}
