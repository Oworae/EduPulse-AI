import { supabase } from "../config/supabase.js";

export async function listCurrentCourses(semesterId) {
  const { data, error } = await supabase
    .from("v_semester_course_summary")
    .select("course_id,semester_id,course_code,course_name,credit_hours,completed_assessments,total_assessments,completed_weight,current_percentage,letter_grade,grade_point,attendance_percentage,target_percentage,difference_from_target")
    .eq("semester_id", semesterId)
    .order("course_code");
  if (error) throw error;
  return data ?? [];
}
export async function getCourse(courseId) {
  const { data, error } = await supabase
    .from("v_semester_course_summary")
    .select("course_id,semester_id,course_code,course_name,credit_hours,completed_assessments,total_assessments,completed_weight,current_percentage,letter_grade,grade_point,attendance_percentage,target_percentage,difference_from_target")
    .eq("course_id", courseId)
    .single();
  if (error) throw error;
  return data;
}
export async function createCourse(values, semesterId, userId) {
  const { data, error } = await supabase.from("courses").insert({ ...values, semester_id: semesterId, user_id: userId }).select().single();
  if (error) throw error;
  return data;
}
export async function updateCourse(courseId, values, semesterId) {
  let query = supabase.from("courses").update(values).eq("id", courseId);
  if (semesterId) query = query.eq("semester_id", semesterId);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function deleteCourse(courseId, semesterId) {
  let query = supabase.from("courses").delete().eq("id", courseId);
  if (semesterId) query = query.eq("semester_id", semesterId);
  const { error } = await query;
  if (error) throw error;
}
