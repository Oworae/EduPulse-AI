import { supabase } from "../config/supabase.js";
export async function listGradingScales() {
  const { data, error } = await supabase.from("grading_scales").select("id,name,max_gpa,is_system,grading_bands(*)").order("is_system", { ascending: false });
  if (error) throw error; return data;
}
