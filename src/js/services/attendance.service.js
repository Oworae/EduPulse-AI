import { supabase } from "../config/supabase.js";

export async function listAttendance(courseId) {
  const { data, error } = await supabase.from("attendance_entries").select("*").eq("course_id", courseId).order("session_date", { ascending: false });
  if (error) throw error; return data;
}
export async function saveAttendance(values, courseId, userId, attendanceId) {
  const payload = { ...values, course_id: courseId, user_id: userId };
  const query = attendanceId ? supabase.from("attendance_entries").update(payload).eq("id", attendanceId) : supabase.from("attendance_entries").insert(payload);
  const { data, error } = await query.select().single(); if (error) throw error; return data;
}
export async function deleteAttendance(attendanceId) {
  const { error } = await supabase.from("attendance_entries").delete().eq("id", attendanceId); if (error) throw error;
}
