import { supabase } from "../config/supabase.js";

async function responseMessage(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return error?.message || "The server request failed.";
  try {
    const payload = await response.clone().json();
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  } catch {
    try { const text = await response.clone().text(); if (text.trim()) return text.slice(0, 240); } catch { /* use fallback */ }
  }
  return error?.message || `The server request failed (${response.status ?? "unknown status"}).`;
}

export async function invokeFunction(name, body) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Your session has expired. Please sign in again.");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await responseMessage(error));
  return data;
}
