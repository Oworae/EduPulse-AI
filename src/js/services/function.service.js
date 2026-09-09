import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "../config/supabase.js";

export async function invokeFunction(name, body) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Your session has expired. Please sign in again.");
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`Edge Function ${name} could not be reached.`, error);
    throw new Error("We couldn’t reach AI support. Check your connection and try again.");
  }
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const serverMessage = payload?.error || payload?.message || payload?.msg;
    const diagnostic = typeof serverMessage === "string" ? serverMessage.trim() : "";
    console.error(`Edge Function ${name} failed with status ${response.status}.`);
    if (response.status === 401 || /session|jwt|unauthori[sz]ed/i.test(diagnostic)) throw new Error("Your session has expired. Please sign in again.");
    if (/AI_SERVICE_BUSY|high demand|overload|\b429\b|\b503\b/i.test(diagnostic)) throw new Error("AI support is busy right now. Your academic data is safe—please try again shortly.");
    if (/AI_SERVICE_UNAVAILABLE|Gemini|model|server configuration/i.test(diagnostic) || response.status >= 500) throw new Error("AI support is temporarily unavailable. Your academic records and calculations are unaffected.");
    throw new Error("We couldn’t complete that AI request. Please review your input and try again.");
  }
  if (!payload) throw new Error("The server returned an empty response.");
  return payload;
}
