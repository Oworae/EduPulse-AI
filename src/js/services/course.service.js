import { supabase } from "../config/supabase.js";

export async function listCurrentCourses(semesterId) {
  const { data, error } = await supabase.from("v_semester_course_summary").select("*").eq("semester_id", semesterId).order("course_code");
  if (error) throw error;
  return data;
}
export async function getCourse(courseId) {
  const { data, error } = await supabase.from("v_semester_course_summary").select("*").eq("course_id", courseId).single();
  if (error) throw error;
  return data;
}
export async function createCourse(values, semesterId, userId) {
  const { data, error } = await supabase.from("courses").insert({ ...values, semester_id: semesterId, user_id: userId }).select().single();
  if (error) throw error;
  return data;
}
export async function updateCourse(courseId, values) {
  const { data, error } = await supabase.from("courses").update(values).eq("id", courseId).select().single();
  if (error) throw error;
  return data;
}
export async function deleteCourse(courseId) {
  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) throw error;
}
