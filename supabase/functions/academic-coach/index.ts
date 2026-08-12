import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { callGemini } from "../_shared/gemini.ts";
import { errorResponse, json } from "../_shared/responses.ts";
import { objectBody, uuid } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    const body = objectBody(await req.json());
    const conversationId = uuid(body.conversation_id, "conversation_id")!;
    if (
      typeof body.message !== "string" || !body.message.trim() ||
      body.message.length > 4000
    ) throw new Error("Message must contain 1-4000 characters");
    const { data: conversation } = await userClient.from("chat_conversations")
      .select("id,semester_id").eq("id", conversationId).maybeSingle();
    if (!conversation) throw new Error("Owned conversation not found");
    const semesterId = conversation.semester_id;
    const [
      { data: metrics },
      { data: signals },
      { data: courses },
      { data: history },
    ] = await Promise.all([
      semesterId
        ? userClient.rpc("get_semester_metrics", { p_semester_id: semesterId })
        : Promise.resolve({ data: null }),
      semesterId
        ? userClient.from("academic_signals").select(
          "signal_type,severity,title,explanation,evidence",
        ).eq("semester_id", semesterId).eq("status", "active").limit(15)
        : Promise.resolve({ data: [] }),
      semesterId
        ? userClient.from("v_semester_course_summary").select(
          "course_name,current_percentage,attendance_percentage,target_percentage",
        ).eq("semester_id", semesterId).limit(30)
        : Promise.resolve({ data: [] }),
      userClient.from("chat_messages").select("role,content").eq(
        "conversation_id",
        conversationId,
      ).order("created_at", { ascending: false }).limit(12),
    ]);
    const { error: userSaveError } = await adminClient.from("chat_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: body.message.trim(),
      });
    if (userSaveError) throw userSaveError;
    const prompt =
      `You are EduPulse AI, a concise academic coach. Use only the supplied student-owned context. Do not invent grades or attendance, calculate official results, diagnose health conditions, or describe Academic Pulse as an official prediction. If evidence is missing, say so. Context: ${
        JSON.stringify({ metrics, signals, courses })
      }. Recent conversation: ${
        JSON.stringify((history ?? []).reverse())
      }. Student: ${body.message.trim()}`;
    const answer = await callGemini(prompt);
    const { data: saved, error: assistantSaveError } = await adminClient.from(
      "chat_messages",
    ).insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: answer,
    }).select().single();
    if (assistantSaveError) throw assistantSaveError;
    await adminClient.from("chat_conversations").update({
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId).eq("user_id", user.id);
    return json({ message: saved });
  } catch (error) {
    return errorResponse(
      error,
      error instanceof Error && error.message.toLowerCase().includes("session")
        ? 401
        : 400,
    );
  }
});
