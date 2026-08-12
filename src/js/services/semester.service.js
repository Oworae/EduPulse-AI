import { supabase } from "../config/supabase.js";

export async function getCurrentSemester() {
  const { data, error } = await supabase.from("semesters").select("*").eq("is_current", true).single();
  if (error) throw error;
  return data;
}
