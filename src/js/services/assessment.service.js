import { supabase } from "../config/supabase.js";

export async function listAssessments(courseId) {
  const { data, error } = await supabase
    .from("assessments")
    .select("id,course_id,title,assessment_type,status,scheduled_date,completed_date,score,max_score,weight_percentage,created_at,updated_at")
    .eq("course_id", courseId)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export async function saveAssessment(values, courseId, userId, assessmentId) {
  const query = assessmentId
    ? supabase.from("assessments").update(values).eq("id", assessmentId).eq("course_id", courseId)
    : supabase.from("assessments").insert({ ...values, course_id: courseId, user_id: userId });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function deleteAssessment(assessmentId, courseId) {
  let query = supabase.from("assessments").delete().eq("id", assessmentId);
  if (courseId) query = query.eq("course_id", courseId);
  const { error } = await query;
  if (error) throw error;
}
