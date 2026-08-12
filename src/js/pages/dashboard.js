import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { supabase } from "../config/supabase.js";
import { currentWeekStart } from "../services/checkin.service.js";
import { getProfile } from "../services/profile.service.js";
import { el } from "../utils/dom.js";

const session = await requireSession({ requireOnboarding: true });
bindLogout();

const root = document.querySelector("[data-dashboard]");
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const percent = (value) => value == null ? "—" : `${Number(value).toFixed(1).replace(/\.0$/, "")}%`;
const number = (value, digits = 1) => value == null ? "—" : Number(value).toFixed(digits).replace(/\.0$/, "");

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

async function queryData(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function loadCourses(semesterId) {
  return queryData(supabase.from("v_semester_course_summary").select("course_id,course_code,course_name,current_percentage,letter_grade,attendance_percentage,target_percentage,difference_from_target,completed_assessments,total_assessments,completed_weight").eq("semester_id", semesterId).order("course_code").limit(30));
}

function loadSnapshots(semesterId) {
  return queryData(supabase.from("academic_snapshots").select("snapshot_date,pulse_score,pulse_status,semester_average,attendance_rate").eq("semester_id", semesterId).order("snapshot_date", { ascending: false }).limit(8)).then((items) => items.reverse());
}

function loadPendingActions(semesterId) {
  return queryData(supabase.from("study_actions").select("id,course_id,title,description,priority,status,created_at").eq("semester_id", semesterId).eq("status", "pending").order("priority").order("created_at", { ascending: false }).limit(12));
}

function loadActiveSignals(semesterId) {
  return queryData(supabase.from("academic_signals").select("id,course_id,severity,title,explanation,detected_at").eq("semester_id", semesterId).eq("status", "active").order("detected_at", { ascending: false }).limit(12));
}

function loadCurrentCheckin(semesterId) {
  return queryData(supabase.from("weekly_checkins").select("week_start,study_hours,classes_attended,classes_scheduled,workload,confidence,focus").eq("semester_id", semesterId).eq("week_start", currentWeekStart()).maybeSingle());
}

function pulseLanguage(status, hasCourses, hasEvidence) {
  if (!hasCourses) return { label: "Ready to begin", headline: "Build your first academic picture.", copy: "Add a course and your first result. EduPulse will turn those records into a clear view of your semester." };
  if (!hasEvidence) return { label: "Building picture", headline: "Your courses are ready for real context.", copy: "Record a result or attendance session so EduPulse can begin showing meaningful academic signals." };
  return ({
    thriving: { label: "Thriving", headline: "Your momentum is working for you.", copy: "Your current academic signals show strong progress. Protect the habits creating it." },
    on_track: { label: "On track", headline: "Your semester is moving in the right direction.", copy: "Stay consistent and keep your records current so you can respond early to any change." },
    needs_attention: { label: "Needs attention", headline: "A focused adjustment can change the direction.", copy: "One or more academic signals need attention. Start with the priority beside this card." },
    at_risk: { label: "At risk", headline: "This is the moment to act, not panic.", copy: "Your current signals need a deliberate response. Take the next move one step at a time." },
  })[status] ?? { label: "Building picture", headline: "Your academic picture is taking shape.", copy: "Keep adding results, attendance, and weekly check-ins to make your pulse more useful." };
}

function renderPulse(summary, snapshots, courseCount) {
  const pulseValue = summary?.pulse_score;
  const hasEvidence = Number(summary?.completed_assessments ?? 0) > 0 || summary?.attendance_rate != null;
  const language = pulseLanguage(summary?.pulse_status, courseCount > 0, hasEvidence);
  const ring = document.querySelector("#pulse-ring");
  ring.style.setProperty("--pulse-value", clamp(pulseValue));
  ring.classList.toggle("empty", pulseValue == null);
  setText("#pulse", pulseValue == null ? "—" : number(pulseValue, 0));
  setText("#pulse-status", language.label);
  const status = document.querySelector("#pulse-status");
  status.className = `pulse-status ${summary?.pulse_status ?? "neutral"}`;
  setText("#pulse-headline", language.headline);
  setText("#pulse-description", language.copy);
  setText("#pulse-performance", percent(summary?.semester_average));
  setText("#pulse-attendance", percent(summary?.attendance_rate));
  setText("#pulse-date", summary?.snapshot_date ? `Updated ${new Date(`${summary.snapshot_date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}` : "Waiting for your first snapshot");
  renderTrend(snapshots);
}

function renderTrend(snapshots) {
  const chart = document.querySelector("#pulse-chart");
  chart.replaceChildren();
  if (!snapshots?.length) {
    chart.append(el("span", { className: "trend-empty", text: "No trend yet" }));
    setText("#trend-label", "Waiting for history");
    return;
  }
  const recent = snapshots.slice(-8);
  const values = recent.map((item) => Number(item.pulse_score));
  const min = Math.min(...values, 0); const max = Math.max(...values, 100);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 50 : index / (values.length - 1) * 100;
    const y = 36 - ((value - min) / Math.max(max - min, 1) * 30);
    return `${x},${y}`;
  }).join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 40"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Academic Pulse trend across ${values.length} snapshot${values.length === 1 ? "" : "s"}`);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points); svg.append(line); chart.append(svg);
  if (values.length === 1) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", "50"); dot.setAttribute("cy", points.split(",")[1]); dot.setAttribute("r", "2.7"); svg.append(dot);
  }
  const change = values.length > 1 ? values.at(-1) - values.at(-2) : null;
  setText("#trend-label", change == null ? "First snapshot" : change > 0 ? `Up ${number(change)} points` : change < 0 ? `Down ${number(Math.abs(change))} points` : "Holding steady");
}

function renderMetrics(summary) {
  setText("#average", percent(summary?.semester_average));
  setText("#gpa", number(summary?.provisional_gpa, 2));
  setText("#attendance", percent(summary?.attendance_rate));
  const completed = Number(summary?.completed_assessments ?? 0);
  const total = Number(summary?.total_assessments ?? 0);
  const completion = total ? completed / total * 100 : 0;
  setText("#assessment-progress", total ? `${completed}/${total}` : "—");
  setText("#assessment-context", total ? `${number(completion, 0)}% of assessments completed` : "No assessments recorded");
  document.querySelector("#assessment-bar").style.width = `${completion}%`;
  const courses = Number(summary?.course_count ?? 0);
  setText("#average-context", courses ? `Across ${courses} active ${courses === 1 ? "course" : "courses"}` : "Add a course to begin");
  setText("#signal-count", Number(summary?.active_signal_count ?? 0).toString());
  setText("#signal-copy", Number(summary?.active_signal_count ?? 0) ? "Active signals are ready for review." : "0 active signals from your latest refresh.");
}

function coursePriority(course) {
  if (course.current_percentage == null) return 999;
  if (course.difference_from_target == null) return 100 + Number(course.current_percentage);
  return Number(course.difference_from_target);
}

function renderCourses(courses, failed = false) {
  const list = document.querySelector("#course-overview"); list.replaceChildren();
  if (failed) {
    list.append(el("div", { className: "panel-state error-state" }, [el("strong", { text: "Course progress is unavailable." }), el("p", { text: "The rest of your dashboard is still usable. Try refreshing shortly." })]));
    return;
  }
  if (!courses.length) {
    list.append(el("div", { className: "panel-state" }, [el("div", { className: "state-mark", text: "+" }), el("strong", { text: "Add your first course" }), el("p", { text: "Start with one course, its target, and the next assessment you want to track." }), el("a", { href: "courses.html", text: "Build my course list →" })]));
    return;
  }
  const ordered = [...courses].sort((a, b) => coursePriority(a) - coursePriority(b)).slice(0, 4);
  for (const course of ordered) {
    const score = course.current_percentage;
    const difference = course.difference_from_target;
    const status = score == null ? "Awaiting results" : difference == null ? "Tracking" : Number(difference) < 0 ? `${number(Math.abs(difference))} below target` : Number(difference) === 0 ? "Target met" : `${number(difference)} above target`;
    const row = el("a", { className: "course-progress-row", href: `course.html?id=${encodeURIComponent(course.course_id)}` }, [
      el("div", { className: "course-monogram", text: course.course_code.slice(0, 2).toUpperCase() }),
      el("div", { className: "course-row-main" }, [el("div", { className: "course-row-title" }, [el("strong", { text: course.course_code }), el("span", { text: status })]), el("p", { text: course.course_name }), el("div", { className: "course-progress-track", role: "progressbar", "aria-label": `${course.course_name} current performance`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": score == null ? "0" : String(clamp(score)) }, [el("i", { style: `width:${clamp(score)}%` })])]),
      el("div", { className: "course-row-score" }, [el("strong", { text: percent(score) }), el("span", { text: course.letter_grade ?? "—" })]),
    ]);
    if (difference != null && Number(difference) < 0) row.classList.add("needs-attention");
    list.append(row);
  }
}

function renderNoSemester() {
  const list = document.querySelector("#course-overview"); list.replaceChildren();
  list.append(el("div", { className: "panel-state" }, [el("div", { className: "state-mark", text: "+" }), el("strong", { text: "Choose your current semester" }), el("p", { text: "Create or activate an academic period before adding courses and tracking progress." }), el("a", { href: "semesters.html", text: "Manage semesters →" })]));
  const week = document.querySelector("#week-content"); week.replaceChildren(el("div", { className: "week-empty" }, [el("strong", { text: "No current semester" }), el("p", { text: "Weekly reflections will become available after semester setup." })]));
}

function renderWeek(checkin, failed = false) {
  const container = document.querySelector("#week-content"); container.replaceChildren();
  if (failed) {
    container.append(el("div", { className: "week-empty" }, [el("strong", { text: "Weekly rhythm unavailable" }), el("p", { text: "Try again when your connection is stable." })])); return;
  }
  if (!checkin) {
    container.append(el("div", { className: "week-empty" }, [el("div", { className: "week-empty-icon", text: "↗" }), el("strong", { text: "Pause. Reflect. Adjust." }), el("p", { text: "Your weekly check-in connects study effort with academic results." }), el("a", { href: "checkin.html", text: "Check in for this week →" })])); return;
  }
  const attendance = checkin.classes_scheduled ? checkin.classes_attended / checkin.classes_scheduled * 100 : null;
  const stats = [
    ["Study time", `${number(checkin.study_hours)}h`],
    ["Confidence", `${checkin.confidence}/5`],
    ["Focus", `${checkin.focus}/5`],
    ["Classes", attendance == null ? "—" : percent(attendance)],
  ];
  const grid = el("div", { className: "week-stat-grid" });
  for (const [label, value] of stats) grid.append(el("div", {}, [el("span", { text: label }), el("strong", { text: value })]));
  container.append(el("div", { className: "week-complete" }, [el("span", { text: "✓ Check-in complete" }), el("small", { text: `Week of ${new Date(`${checkin.week_start}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}` })]), grid);
}

function chooseFocus(courses, actions, checkin, signals = []) {
  const severityOrder = { high: 0, attention: 1, info: 2 };
  const signal = [...signals].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))[0];
  if (signal) {
    const course = courses.find((item) => item.course_id === signal.course_id);
    return { icon: "!", kicker: `${signal.severity} signal${course ? ` · ${course.course_code}` : ""}`, title: signal.title, copy: signal.explanation, href: course ? `course.html?id=${encodeURIComponent(course.course_id)}` : "insights.html", label: course ? "Review this course" : "Review this signal" };
  }
  const action = actions.find((item) => item.status === "pending");
  if (action) return { icon: "✓", kicker: `Priority ${action.priority}`, title: action.title, copy: action.description || "A focused study action from your latest academic insight.", href: "insights.html", label: "Open study priority" };
  const belowTarget = [...courses].filter((course) => Number(course.difference_from_target) < 0).sort((a, b) => Number(a.difference_from_target) - Number(b.difference_from_target))[0];
  if (belowTarget) return { icon: "↗", kicker: `${belowTarget.course_code} · Course focus`, title: `Close the ${number(Math.abs(belowTarget.difference_from_target))}-point target gap.`, copy: `${belowTarget.course_name} is currently your clearest opportunity for improvement.`, href: `course.html?id=${encodeURIComponent(belowTarget.course_id)}`, label: "Review this course" };
  const unscored = courses.find((course) => course.current_percentage == null);
  if (unscored) return { icon: "+", kicker: `${unscored.course_code} · Add context`, title: "Record the first assessment result.", copy: `A result in ${unscored.course_name} will make your semester picture more complete.`, href: `course.html?id=${encodeURIComponent(unscored.course_id)}`, label: "Add an assessment" };
  if (!courses.length) return { icon: "+", kicker: "Start here", title: "Add the first course you want to track.", copy: "One course is enough to begin building a useful academic picture.", href: "courses.html", label: "Add a course" };
  if (!checkin) return { icon: "✓", kicker: "Weekly reflection", title: "Complete this week’s check-in.", copy: "Capture your study hours, focus, workload, and confidence while the week is still fresh.", href: "checkin.html", label: "Start check-in" };
  return { icon: "✦", kicker: "Plan ahead", title: "Turn your current momentum into a plan.", copy: "Ask your academic coach to help prioritize the week using your latest records.", href: "assistant.html", label: "Ask the coach" };
}

function renderFocus(focus) {
  setText("#focus-icon", focus.icon); setText("#focus-kicker", focus.kicker); setText("#focus-title", focus.title); setText("#focus-copy", focus.copy);
  const link = document.querySelector("#focus-link"); link.href = focus.href; link.firstChild.textContent = `${focus.label} `;
}

function showError(error) {
  document.querySelector("#dashboard-error").hidden = false;
  setText("#dashboard-error-text", error?.message || "Check your connection and try again.");
}

async function renderDashboard() {
  document.querySelector("#dashboard-error").hidden = true; root.setAttribute("aria-busy", "true"); root.classList.remove("dashboard-ready");
  try {
    const [profile, dashboardResult] = await Promise.all([getProfile(), supabase.from("v_dashboard_summary").select("semester_id,academic_year,semester_name,semester_average,provisional_gpa,attendance_rate,course_count,completed_assessments,total_assessments,pulse_score,pulse_status,snapshot_date,active_signal_count").maybeSingle()]);
    if (dashboardResult.error) throw dashboardResult.error;
    const summary = dashboardResult.data;
    const now = new Date();
    setText("#greeting", greetingForHour(now.getHours()));
    setText("#student-name", profile.full_name.trim().split(/\s+/)[0] || "Student");
    setText("#today-label", now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }));
    if (!summary) {
      setText("#welcome-summary", "Create or activate a semester to start your academic dashboard.");
      renderPulse(null, [], 0); renderMetrics(null); renderNoSemester(); renderFocus({ icon: "+", kicker: "Semester setup", title: "Create or activate your current semester.", copy: "Your dashboard needs an active academic period before it can organize your progress.", href: "semesters.html", label: "Manage semesters" });
      setText("#signal-count", "—"); setText("#signal-copy", "Academic signals begin after semester setup.");
      return;
    }
    setText("#semester-label span", `${summary.academic_year} · ${summary.semester_name}`);
    const supporting = await Promise.allSettled([
      loadCourses(summary.semester_id),
      loadPendingActions(summary.semester_id),
      loadCurrentCheckin(summary.semester_id),
      loadSnapshots(summary.semester_id),
      loadActiveSignals(summary.semester_id),
    ]);
    const [courseResult, actionResult, checkinResult, snapshotResult, signalResult] = supporting;
    const courses = courseResult.status === "fulfilled" ? courseResult.value : [];
    const actions = actionResult.status === "fulfilled" ? actionResult.value : [];
    const checkin = checkinResult.status === "fulfilled" ? checkinResult.value : null;
    const snapshots = snapshotResult.status === "fulfilled" ? snapshotResult.value : [];
    const signals = signalResult.status === "fulfilled" ? signalResult.value : [];
    const courseCount = Number(summary.course_count ?? courses.length);
    setText("#welcome-summary", courseCount ? `Here’s what matters across your ${courseCount} active ${courseCount === 1 ? "course" : "courses"} right now.` : "Start with one course and let your academic picture grow from there.");
    renderPulse(summary, snapshots, courseCount); renderMetrics(summary);
    renderCourses(courses, courseResult.status === "rejected"); renderWeek(checkin, checkinResult.status === "rejected"); renderFocus(chooseFocus(courses, actions, checkin, signals));
    if (supporting.some((result) => result.status === "rejected")) showError(new Error("Some supporting details could not be refreshed. Your main academic summary is still available."));
  } catch (error) {
    showError(new Error("We couldn’t reach your academic data. Check your connection and try again.")); renderCourses([], true); renderWeek(null, true); renderFocus({ icon: "!", kicker: "Connection issue", title: "Your dashboard needs another try.", copy: "Your records are safe. Retry when your connection is stable.", href: "dashboard.html", label: "Reload dashboard" });
  } finally {
    root.setAttribute("aria-busy", "false"); root.classList.add("dashboard-ready");
  }
}

document.querySelector("#retry-dashboard").addEventListener("click", () => renderDashboard());
if (session) await renderDashboard();
