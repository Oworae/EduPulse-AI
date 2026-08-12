import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { currentWeekStart, getCheckin, listCheckins, saveCheckin } from "../services/checkin.service.js";
import { getCurrentSemester } from "../services/semester.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true }); bindLogout(); const semester = await getCurrentSemester();
const form = document.querySelector("#checkin-form"); const weekStart = currentWeekStart(); form.elements.week_start.value = weekStart;
document.querySelector("#week-label").textContent = `Week of ${weekStart}`;
const existing = await getCheckin(semester.id, weekStart);
if (existing) for (const [key, value] of Object.entries(existing)) if (form.elements[key] && value != null) form.elements[key].value = value;
async function renderHistory() {
  const history = await listCheckins(semester.id); const list = document.querySelector("#checkin-history"); list.replaceChildren();
  for (const item of history) list.append(el("article", { className: "history-row card" }, [el("strong", { text: item.week_start }), el("span", { text: `${item.study_hours} study hours` }), el("span", { text: `Confidence ${item.confidence}/5` }), el("span", { text: `Focus ${item.focus}/5` })]));
}
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const submit = form.querySelector("button[type=submit]"); const values = Object.fromEntries(new FormData(form));
  for (const key of ["study_hours", "classes_attended", "classes_scheduled", "workload", "confidence", "focus"]) values[key] = Number(values[key]);
  if (values.classes_attended > values.classes_scheduled) return showMessage("Classes attended cannot exceed classes scheduled.", "error");
  setBusy(submit, true, "Saving check-in…"); try { await saveCheckin(values, semester.id, session.user.id); await recomputePulseQuietly(semester.id); showMessage("Weekly check-in saved and Academic Pulse refreshed.", "success"); await renderHistory(); }
  catch (error) { showMessage(error.message, "error"); } finally { setBusy(submit, false); }
});
await renderHistory();
