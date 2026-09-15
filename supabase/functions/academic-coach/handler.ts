import { corsHeaders } from "../_shared/cors.ts";
import { requireActiveSession, requireAuth } from "../_shared/auth.ts";
import { callAI, streamAI } from "../_shared/ai.ts";
import { aiError, errorResponse, json } from "../_shared/responses.ts";
import { requestTiming } from "../_shared/timing.ts";
import { objectBody, uuid } from "../_shared/validation.ts";

export async function handleCoachRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  const timing = requestTiming(req, "academic-coach");
  const userMessageTime = new Date().toISOString();
  try {
    const { user, userClient, adminClient } = await timing.measure(
      "auth",
      () => requireAuth(req, timing.signal),
    );
    const body = objectBody(await req.json());
    const conversationId = uuid(body.conversation_id, "conversation_id")!;
    if (
      typeof body.message !== "string" || !body.message.trim() ||
      body.message.length > 4000
    ) {
      throw new Error("Message must contain 1-4000 characters");
    }
    const message = body.message.trim();
    const context = await timing.measure("context", async () => {
      const { data: conversation, error } = await userClient.from(
        "chat_conversations",
      )
        .select("id,semester_id").eq("id", conversationId).maybeSingle();
      if (error || !conversation) {
        throw new Error("Owned conversation not found");
      }
      const semesterId = conversation.semester_id;
      const results = await Promise.all([
        semesterId
          ? userClient.rpc("get_semester_metrics", {
            p_semester_id: semesterId,
          })
          : Promise.resolve({ data: null, error: null }),
        semesterId
          ? userClient.from("academic_signals").select(
            "signal_type,severity,title,explanation,evidence",
          )
            .eq("semester_id", semesterId).eq("status", "active").limit(15)
          : Promise.resolve({ data: [], error: null }),
        semesterId
          ? userClient.from("v_semester_course_summary").select(
            "course_name,current_percentage,attendance_percentage,target_percentage",
          )
            .eq("semester_id", semesterId).limit(30)
          : Promise.resolve({ data: [], error: null }),
        userClient.from("chat_messages").select("role,content").eq(
          "conversation_id",
          conversationId,
        )
          .order("created_at", { ascending: false }).limit(12),
      ]);
      if (results.some((result) => result.error)) {
        throw new Error("AI_SERVICE_UNAVAILABLE");
      }
      return {
        metrics: results[0].data,
        signals: results[1].data,
        courses: results[2].data,
        history: results[3].data,
      };
    });
    const prompt =
      `You are EduPulse AI, a concise academic coach. Use only the supplied student-owned context. Do not invent grades or attendance, calculate official results, diagnose health conditions, or describe Academic Pulse as an official prediction. If evidence is missing, say so. Keep routine guidance under 250 words unless more detail is requested. Context: ${
        JSON.stringify({
          metrics: context.metrics,
          signals: context.signals,
          courses: context.courses,
        })
      }. Recent conversation: ${
        JSON.stringify((context.history ?? []).reverse())
      }. Student: ${message}`;

    async function generateAndSave(onText?: (text: string) => void) {
      const answer = await timing.measure(
        "generation",
        () =>
          onText
            ? streamAI(prompt, (text) => {
              timing.firstText();
              onText(text);
            }, { signal: timing.signal })
            : callAI(prompt, false, { signal: timing.signal }),
      );
      return await timing.measure("persist", async () => {
        // Revocation or expiry during generation must block admin writes.
        await requireActiveSession(userClient);
        const { error: conversationError } = await adminClient.from(
          "chat_conversations",
        )
          .update({ updated_at: new Date().toISOString() }).eq(
            "id",
            conversationId,
          ).eq("user_id", user.id);
        if (conversationError) throw new Error("AI_SERVICE_SAVE_FAILED");
        const { data: rows, error } = await adminClient.from("chat_messages")
          .insert([
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "user",
              content: message,
              created_at: userMessageTime,
            },
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: answer.text,
              created_at: new Date(
                Math.max(Date.now(), Date.parse(userMessageTime) + 1),
              ).toISOString(),
            },
          ]).select("id,role,content,created_at");
        if (error) throw new Error("AI_SERVICE_SAVE_FAILED");
        const saved = rows?.find((row) => row.role === "assistant");
        if (!saved) throw new Error("AI_SERVICE_SAVE_FAILED");
        // Both messages are committed by one INSERT; failures leave no orphan.
        return saved;
      });
    }

    if (body.stream !== true) {
      const saved = await generateAndSave();
      timing.finish("completed");
      return json({ message: saved });
    }
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (!closed) {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          }
        };
        send("ready", {});
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": waiting\n\n"));
        }, 10_000);
        void (async () => {
          try {
            const saved = await generateAndSave((text) =>
              send("delta", { text })
            );
            send("done", { message: saved });
            timing.finish("completed");
          } catch (error) {
            const failure = aiError(error);
            send("error", failure);
            timing.finish(failure.error);
          } finally {
            clearInterval(heartbeat);
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        })();
      },
      cancel() {
        closed = true;
        timing.cancel();
        timing.finish("cancelled");
      },
    });
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const failure = aiError(error);
    timing.finish(failure.error);
    const validation = failure.status === 500;
    return errorResponse(
      validation ? error : failure.error,
      validation ? 400 : failure.status,
    );
  }
}
