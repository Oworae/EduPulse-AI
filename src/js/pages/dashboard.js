import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { supabase } from "../config/supabase.js";
import { getProfile } from "../services/profile.service.js";

await requireSession({ requireOnboarding: true });
bindLogout();
const [profile, dashboardResult] = await Promise.all([getProfile(), supabase.from("v_dashboard_summary").select("*").maybeSingle()]);
document.querySelector("#student-name").textContent = profile.full_name.split(" ")[0];
const summary = dashboardResult.data;
document.querySelector("#semester-label").textContent = summary ? `${summary.academic_year} · ${summary.semester_name}` : "Current semester";
document.querySelector("#course-count").textContent = summary?.course_count ?? 0;
document.querySelector("#average").textContent = summary?.semester_average == null ? "—" : `${summary.semester_average}%`;
document.querySelector("#attendance").textContent = summary?.attendance_rate == null ? "—" : `${summary.attendance_rate}%`;
document.querySelector("#pulse").textContent = summary?.pulse_score ?? "—";
