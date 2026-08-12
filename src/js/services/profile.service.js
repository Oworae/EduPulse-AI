import { supabase } from "../config/supabase.js";
export async function getProfile() {
  const { data, error } = await supabase.from("profiles").select("*").single();
  if (error) throw error; return data;
}
export async function updateProfile(values) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required");
  const { data, error } = await supabase.from("profiles").update(values).eq("id", user.id).select().single();
  if (error) throw error; return data;
}
