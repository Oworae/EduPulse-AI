import { supabase } from "../config/supabase.js";

export async function listConversations() {
  const { data, error } = await supabase.from("chat_conversations").select("*").order("updated_at", { ascending: false });
  if (error) throw error; return data;
}
export async function createConversation(semesterId, title = "Academic coaching") {
  const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Authentication required");
  const { data, error } = await supabase.from("chat_conversations").insert({ user_id: user.id, semester_id: semesterId, title }).select().single();
  if (error) throw error; return data;
}
export async function listMessages(conversationId) {
  const { data, error } = await supabase.from("chat_messages").select("*").eq("conversation_id", conversationId).order("created_at");
  if (error) throw error; return data;
}
export async function sendCoachMessage(conversationId, message) {
  const { data, error } = await supabase.functions.invoke("academic-coach", { body: { conversation_id: conversationId, message } });
  if (error) throw error; return data.message;
}
