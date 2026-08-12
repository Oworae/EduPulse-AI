import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { errorResponse, json } from "../_shared/responses.ts";
import { objectBody, uuid } from "../_shared/validation.ts";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    const body = objectBody(await req.json().catch(() => ({})));
    let semesterId = uuid(body.semester_id, "semester_id", true);
    let semesterQuery = userClient.from("semesters").select("id").eq(
      "user_id",
      user.id,
    );
    semesterQuery = semesterId
      ? semesterQuery.eq("id", semesterId)
      : semesterQuery.eq("is_current", true);
    const { data: semester, error: semesterError } = await semesterQuery
      .single();
    if (semesterError || !semester) throw new Error("Owned semester not found");
    semesterId = semester.id;
    const [
      { data: metrics, error: metricsError },
      { data: courses },
      { data: checkins },
      { data: previous },
    ] = await Promise.all([
      userClient.rpc("get_semester_metrics", { p_semester_id: semesterId }),
      userClient.from("v_semester_course_summary").select(
        "course_id,course_name,current_percentage,attendance_percentage,target_percentage",
      ).eq("semester_id", semesterId),
      userClient.from("weekly_checkins").select(
        "study_hours,classes_attended,classes_scheduled,confidence,focus,workload",
      ).eq("semester_id", semesterId).order("week_start", { ascending: false })
        .limit(4),
      userClient.from("academic_snapshots").select("semester_average").eq(
        "semester_id",
        semesterId,
      ).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (metricsError) throw metricsError;
    const performance = clamp(Number(metrics.semester_average ?? 50));
    const attendance = clamp(Number(metrics.attendance_rate ?? 50));
    const prior = Number(previous?.semester_average ?? performance);
    const trend = clamp(50 + (performance - prior) * 5);
    const percentages = (courses ?? []).map((c) => Number(c.current_percentage))
      .filter(Number.isFinite);
    const mean = percentages.length
      ? percentages.reduce((a, b) => a + b, 0) / percentages.length
      : 50;
    const variance = percentages.length
      ? percentages.reduce((a, b) => a + (b - mean) ** 2, 0) /
        percentages.length
      : 0;
    const consistency = clamp(100 - Math.sqrt(variance) * 2);
    const engagementParts = (checkins ?? []).map((c) =>
      clamp(
        (Number(c.confidence) + Number(c.focus)) * 10 +
          (Number(c.classes_scheduled)
            ? Number(c.classes_attended) / Number(c.classes_scheduled) * 20
            : 10) -
          (Number(c.workload) - 3) * 3,
      )
    );
    const engagement = engagementParts.length
      ? engagementParts.reduce((a, b) => a + b, 0) / engagementParts.length
      : 50;
    const pulse = clamp(
      performance * .5 + trend * .2 + attendance * .15 + consistency * .1 +
        engagement * .05,
    );
    const status = pulse >= 80
      ? "thriving"
      : pulse >= 65
      ? "on_track"
      : pulse >= 45
      ? "needs_attention"
      : "at_risk";
    const snapshot = {
      user_id: user.id,
      semester_id: semesterId,
      snapshot_date: new Date().toISOString().slice(0, 10),
      semester_average: metrics.semester_average,
      current_gpa: metrics.provisional_gpa,
      attendance_rate: metrics.attendance_rate,
      performance_score: performance,
      trend_score: trend,
      attendance_score: attendance,
      consistency_score: consistency,
      engagement_score: engagement,
      pulse_score: pulse,
      pulse_status: status,
      metrics,
    };
    const { data: saved, error: saveError } = await adminClient.from(
      "academic_snapshots",
    ).upsert(snapshot, { onConflict: "user_id,semester_id,snapshot_date" })
      .select().single();
    if (saveError) throw saveError;
    const signals = (courses ?? []).flatMap((course) => {
      const out: Record<string, unknown>[] = [];
      if (
        course.current_percentage !== null &&
        Number(course.current_percentage) < 50
      ) {
        out.push({
          signal_type: "low_assessment_score",
          severity: "high",
          title: `${course.course_name} needs attention`,
          explanation: "Current completed assessment performance is below 50%.",
          evidence: { current_percentage: course.current_percentage },
        });
      }
      if (
        course.attendance_percentage !== null &&
        Number(course.attendance_percentage) < 75
      ) {
        out.push({
          signal_type: "low_attendance",
          severity: "attention",
          title: `${course.course_name} attendance is low`,
          explanation: "Eligible attendance is below 75%.",
          evidence: { attendance_percentage: course.attendance_percentage },
        });
      }
      return out.map((s) => ({
        ...s,
        user_id: user.id,
        semester_id: semesterId,
        course_id: course.course_id,
        status: "active",
      }));
    });
    await adminClient.from("academic_signals").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("semester_id", semesterId).eq(
      "status",
      "active",
    );
    if (signals.length) {
      const { error } = await adminClient.from("academic_signals").insert(
        signals,
      );
      if (error) throw error;
    }
    return json({
      semester_id: semesterId,
      pulse_score: pulse,
      pulse_status: status,
      components: {
        performance_score: performance,
        trend_score: trend,
        attendance_score: attendance,
        consistency_score: consistency,
        engagement_score: engagement,
      },
      signals,
      snapshot_id: saved.id,
    });
  } catch (error) {
    return errorResponse(
      error,
      error instanceof Error && error.message.toLowerCase().includes("auth")
        ? 401
        : 400,
    );
  }
});
