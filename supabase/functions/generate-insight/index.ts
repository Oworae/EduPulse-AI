import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { callGemini, modelName } from "../_shared/gemini.ts";
import { errorResponse, json } from "../_shared/responses.ts";
import { objectBody, uuid } from "../_shared/validation.ts";

const allowedTypes = new Set([
  "home_summary",
  "course_analysis",
  "weekly_review",
  "risk_explanation",
  "performance_summary",
  "semester_review",
  "general_recommendation",
]);
const promptVersion = "academic-insight-v1";
async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((
    b,
  ) => b.toString(16).padStart(2, "0")).join("");
}
function validateInsight(value: unknown) {
  const v = objectBody(value);
  if (
    !["title", "summary"].every((k) =>
      typeof v[k] === "string" && (v[k] as string).trim()
    )
  ) throw new Error("Gemini response has an invalid shape");
  if (!Array.isArray(v.observations) || !Array.isArray(v.recommended_actions)) {
    throw new Error("Gemini response has an invalid shape");
  }
  const actions = v.recommended_actions.map((a) => {
    const x = objectBody(a);
    if (
      typeof x.title !== "string" || typeof x.reason !== "string" ||
      ![1, 2, 3].includes(Number(x.priority))
    ) throw new Error("Gemini action is invalid");
    return { title: x.title, reason: x.reason, priority: Number(x.priority) };
  });
  return {
    title: v.title as string,
    summary: v.summary as string,
    observations: (v.observations as unknown[]).filter((x): x is string =>
      typeof x === "string"
    ).slice(0, 6),
    recommended_actions: actions.slice(0, 5),
  };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    const body = objectBody(await req.json());
    if (typeof body.type !== "string" || !allowedTypes.has(body.type)) {
      throw new Error("Unsupported insight type");
    }
    const courseId = uuid(body.course_id, "course_id", true);
    const { data: semester, error: semesterError } = await userClient.from(
      "semesters",
    ).select("id").eq("is_current", true).single();
    if (semesterError || !semester) {
      throw new Error("Current semester not found");
    }
    if (courseId) {
      const { data } = await userClient.from("courses").select("id").eq(
        "id",
        courseId,
      ).eq("semester_id", semester.id).maybeSingle();
      if (!data) throw new Error("Owned course not found");
    }
    const [
      { data: metrics },
      { data: courses },
      { data: signals },
      { data: checkins },
    ] = await Promise.all([
      userClient.rpc("get_semester_metrics", { p_semester_id: semester.id }),
      userClient.from("v_semester_course_summary").select(
        "course_id,course_name,current_percentage,attendance_percentage,target_percentage,difference_from_target",
      ).eq("semester_id", semester.id).limit(30),
      userClient.from("academic_signals").select(
        "signal_type,severity,title,explanation,evidence",
      ).eq("semester_id", semester.id).eq("status", "active").limit(20),
      userClient.from("weekly_checkins").select(
        "week_start,study_hours,workload,confidence,focus",
      ).eq("semester_id", semester.id).order("week_start", { ascending: false })
        .limit(4),
    ]);
    const context = {
      type: body.type,
      course_id: courseId,
      metrics,
      courses: courseId
        ? courses?.filter((c) => c.course_id === courseId)
        : courses,
      signals: courseId ? signals : signals,
      checkins,
    };
    const contextHash = await sha256(context);
    let cachedQuery = userClient.from("ai_insights").select("*").eq(
      "semester_id",
      semester.id,
    ).eq("insight_type", body.type).eq("context_hash", contextHash).order(
      "generated_at",
      { ascending: false },
    ).limit(1);
    cachedQuery = courseId
      ? cachedQuery.eq("course_id", courseId)
      : cachedQuery.is("course_id", null);
    const { data: cached } = await cachedQuery.maybeSingle();
    if (
      cached && (!cached.expires_at || new Date(cached.expires_at) > new Date())
    ) return json({ insight: cached, cached: true });
    const prompt =
      `You are EduPulse AI. Explain only the deterministic academic context supplied below. Do not invent scores, attendance, grades, diagnoses, or official predictions. Academic Pulse is an informal EduPulse indicator. Return strict JSON with title, summary, observations (string array), and recommended_actions (array of {title, priority 1-3, reason}). Context: ${
        JSON.stringify(context)
      }`;
    const generated = validateInsight(
      JSON.parse(await callGemini(prompt, true)),
    );
    const insightRow = {
      user_id: user.id,
      semester_id: semester.id,
      course_id: courseId,
      insight_type: body.type,
      title: generated.title,
      summary: generated.summary,
      body: JSON.stringify(generated),
      model_name: modelName(),
      prompt_version: promptVersion,
      context_hash: contextHash,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    const { data: insight, error: saveError } = await adminClient.from(
      "ai_insights",
    ).insert(insightRow).select().single();
    if (saveError) throw saveError;
    const actions = generated.recommended_actions.map((a) => ({
      user_id: user.id,
      semester_id: semester.id,
      course_id: courseId,
      insight_id: insight.id,
      title: a.title,
      description: a.reason,
      priority: a.priority,
    }));
    if (actions.length) {
      const { error } = await adminClient.from("study_actions").insert(actions);
      if (error) throw error;
    }
    return json({ insight: { ...insight, ...generated }, cached: false });
  } catch (error) {
    return errorResponse(
      error,
      error instanceof Error && error.message.toLowerCase().includes("session")
        ? 401
        : 400,
    );
  }
});
