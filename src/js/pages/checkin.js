import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { currentWeekStart, getCheckin, listCheckins, saveCheckin } from "../services/checkin.service.js";
import { getCurrentSemester } from "../services/semester.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage, userMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true }); bindLogout(); const semester = await getCurrentSemester();
const form = document.querySelector("#checkin-form"); const weekStart = currentWeekStart(); form.elements.week_start.value = weekStart;
const formatDate = (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
document.querySelector("#week-label").textContent = `Week of ${formatDate(weekStart)}`;
const existing = await getCheckin(semester.id, weekStart);
if (existing) for (const [key, value] of Object.entries(existing)) if (form.elements[key] && value != null) form.elements[key].value = value;
document.querySelector("#checkin-state").textContent = existing ? "Updating this week" : "New check-in";
function updateLiveValues() {
  document.querySelector("#confidence-value").textContent = `${form.elements.confidence.value}/5`;
  document.querySelector("#focus-value").textContent = `${form.elements.focus.value}/5`;
  document.querySelector("#reflection-count").textContent = form.elements.reflection.value.length;
  const scheduled = Number(form.elements.classes_scheduled.value); const attended = Number(form.elements.classes_attended.value); const hasValue = form.elements.classes_scheduled.value !== "" && scheduled > 0; const rate = hasValue ? Math.min(100, attended / scheduled * 100) : null;
  document.querySelector("#weekly-attendance-value").textContent = rate === null ? "—" : `${rate.toFixed(0)}%`; document.querySelector("#weekly-attendance-bar").style.width = `${rate ?? 0}%`; document.querySelector("#weekly-attendance-copy").textContent = rate === null ? "Enter scheduled and attended classes to preview." : `${attended} of ${scheduled} scheduled classes attended.`;
}
[form.elements.confidence, form.elements.focus, form.elements.reflection, form.elements.classes_attended, form.elements.classes_scheduled].forEach((input) => input.addEventListener("input", updateLiveValues)); updateLiveValues();
async function renderHistory() {
  const history = await listCheckins(semester.id); const list = document.querySelector("#checkin-history"); list.replaceChildren();
  if (!history.length) return list.append(el("div", { className: "checkin-history-empty", text: "Your saved weekly reflections will build a timeline here." }));
  for (const item of history) { const card = el("article", { className: `checkin-history-card${item.week_start === weekStart ? " current" : ""}` }, [el("header", {}, [el("time", { datetime: item.week_start, text: formatDate(item.week_start) }), el("span", { text: item.week_start === weekStart ? "This week" : `${item.workload}/5 workload` })]), el("div", { className: "checkin-history-stats" }, [el("div", {}, [el("strong", { text: `${item.study_hours}h` }), el("span", { text: "Study" })]), el("div", {}, [el("strong", { text: `${item.confidence}/5` }), el("span", { text: "Confidence" })]), el("div", {}, [el("strong", { text: `${item.focus}/5` }), el("span", { text: "Focus" })])])]); list.append(card); }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const submit = form.querySelector("button[type=submit]"); const values = Object.fromEntries(new FormData(form));
  for (const key of ["study_hours", "classes_attended", "classes_scheduled", "workload", "confidence", "focus"]) values[key] = Number(values[key]);
  if (values.classes_attended > values.classes_scheduled) return showMessage("Classes attended cannot exceed classes scheduled.", "error");
  setBusy(submit, true, "Saving check-in…"); try { await saveCheckin(values, semester.id, session.user.id); await recomputePulseQuietly(semester.id); document.querySelector("#checkin-state").textContent = "Saved this week"; showMessage("Weekly check-in saved and Academic Pulse refreshed.", "success"); await renderHistory(); }
  catch (error) { showMessage(userMessage(error, "We couldn’t save your weekly check-in. Check the details and try again."), "error"); } finally { setBusy(submit, false); }
});
await renderHistory();
