import { supabase } from "../config/supabase.js";

export async function listGradingScales() {
  const { data, error } = await supabase
    .from("grading_scales")
    .select("id,name,max_gpa,is_system,grading_bands(*)")
    .order("is_system", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updatePersonalGradingScale(scaleId, values) {
  const { data, error } = await supabase.rpc("update_personal_grading_scale", {
    p_scale_id: scaleId,
    p_name: values.name,
    p_max_gpa: values.maxGpa,
    p_bands: values.bands,
  });
  if (error) throw error;
  return data;
}
