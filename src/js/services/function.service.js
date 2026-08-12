import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "../config/supabase.js";

export async function invokeFunction(name, body) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const serverMessage = payload?.error || payload?.message || payload?.msg;
    throw new Error(typeof serverMessage === "string" && serverMessage.trim() ? serverMessage : `Server request failed (${response.status}).`);
  }
  if (!payload) throw new Error("The server returned an empty response.");
  return payload;
}
