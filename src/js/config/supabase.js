import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://amgzepfccrgjppimzuzv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_i-MAHRXY-Z4GrwnUm3jdqA_Ln22v4-3";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
