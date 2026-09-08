import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { deleteAttendance, listAttendance, saveAttendance } from "../services/attendance.service.js";
import { getCourse } from "../services/course.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true }); bindLogout();
const courseId = new URLSearchParams(location.search).get("id");
if (!courseId || !/^[0-9a-f-]{36}$/i.test(courseId)) window.location.replace("courses.html");
const course = await getCourse(courseId);
const form = document.querySelector("#attendance-form"); const dialog = document.querySelector("#attendance-dialog"); const list = document.querySelector("#attendance-list"); const toast = document.querySelector("#attendance-toast");
let entries = []; let activeFilter = "all"; let toastTimer;
document.title = `${course.course_code} attendance — EduPulse AI`; document.querySelector("#course-name").textContent = course.course_name; document.querySelector("#course-code").textContent = course.course_code; document.querySelector("#back-course").href = `course.html?id=${encodeURIComponent(courseId)}`;

function localDateString() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function announce(message) { clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; }, 3200); }
function openForm(item = null) { form.reset(); form.elements.attendance_id.value = item?.id ?? ""; form.elements.session_date.value = item?.session_date ?? localDateString(); form.elements.session_label.value = item?.session_label ?? ""; form.elements.status.value = item?.status ?? "present"; form.elements.notes.value = item?.notes ?? ""; document.querySelector("#attendance-dialog-title").textContent = item ? "Edit session" : "Record attendance"; document.querySelector("#form-message").hidden = true; dialog.showModal(); }
function counts() { return ["present", "late", "absent", "excused"].reduce((all, status) => ({ ...all, [status]: entries.filter((item) => item.status === status).length }), {}); }
function renderSummary() {
  const total = counts(); const eligible = total.present + total.late + total.absent; const attended = total.present + total.late; const rate = eligible ? attended / eligible * 100 : null;
  const health = rate === null ? ["neutral", "Awaiting sessions"] : rate >= 85 ? ["strong", "Strong consistency"] : rate >= 75 ? ["steady", "On track"] : ["attention", "Needs attention"];
  document.querySelector("#attendance-rate").textContent = rate === null ? "—" : `${rate.toFixed(1).replace(/\.0$/, "")}%`; document.querySelector("#attendance-count").textContent = eligible ? `${attended} of ${eligible} eligible ${eligible === 1 ? "session" : "sessions"} attended` : "No eligible sessions yet";
  Object.entries(total).forEach(([status, value]) => { document.querySelector(`#${status}-count`).textContent = value; });
  const ring = document.querySelector("#attendance-ring"); ring.style.setProperty("--attendance", rate ?? 0); ring.classList.toggle("empty", rate === null); document.querySelector("#attendance-progress-bar").style.width = `${rate ?? 0}%`;
  const progress = document.querySelector(".attendance-progress"); if (rate === null) { progress.removeAttribute("aria-valuenow"); progress.setAttribute("aria-valuetext", "No eligible sessions recorded"); } else { progress.setAttribute("aria-valuenow", rate); progress.removeAttribute("aria-valuetext"); }
  const status = document.querySelector("#attendance-status"); status.textContent = health[1]; status.className = `attendance-health ${health[0]}`;
}
function matchesFilter(item) { if (activeFilter === "attended") return ["present", "late"].includes(item.status); return activeFilter === "all" || item.status === activeFilter; }
function createSessionRow(item) {
  const menu = el("details", { className: "attendance-row-menu" }); const trigger = el("summary", { "aria-label": `Actions for ${item.session_label || "class session"}`, title: "Session actions" }, [el("span", { "aria-hidden": "true", text: "•••" })]); const panel = el("div", { className: "attendance-row-menu-panel" });
  const edit = el("button", { type: "button", text: "Edit session" }); edit.addEventListener("click", () => { menu.open = false; openForm(item); });
  const remove = el("button", { type: "button", className: "danger", text: "Delete session" }); remove.addEventListener("click", async () => { menu.open = false; if (!confirm("Delete this attendance entry?")) return; await deleteAttendance(item.id); await recomputePulseQuietly(course.semester_id); announce("Attendance session deleted"); await render(); }); panel.append(edit, remove); menu.append(trigger, panel);
  const main = el("div", { className: "attendance-row-main" }, [el("div", { className: "attendance-row-title" }, [el("h3", { text: item.session_label || "Class session" }), el("span", { className: `attendance-badge ${item.status}`, text: item.status })]), el("time", { datetime: item.session_date, text: formatDate(item.session_date) })]); if (item.notes) main.append(el("p", { text: item.notes }));
  const marks = { present: "✓", late: "◷", absent: "×", excused: "—" }; return el("article", { className: `history-row ${item.status}` }, [el("div", { className: `attendance-status-mark ${item.status}`, "aria-hidden": "true", text: marks[item.status] }), main, menu]);
}
function renderHistory() {
  list.replaceChildren(); list.classList.remove("history-list-loading"); list.setAttribute("aria-busy", "false"); const filtered = entries.filter(matchesFilter); document.querySelector("#history-copy").textContent = entries.length ? `${entries.length} recorded ${entries.length === 1 ? "session" : "sessions"} · most recent first` : "Your most recent sessions will appear here.";
  if (!filtered.length) { const empty = entries.length === 0; const state = el("div", { className: "attendance-empty-state" }, [el("div", { className: "attendance-empty-mark", text: empty ? "+" : "⌕" }), el("h3", { text: empty ? "Start your attendance record." : "No sessions match this view." }), el("p", { text: empty ? "Record one class session to begin seeing your attendance rate and pattern." : "Choose another filter to see the rest of your session history." })]); const action = el("button", { className: `button${empty ? "" : " secondary"}`, type: "button", text: empty ? "Record first session" : "Show all sessions" }); action.addEventListener("click", () => empty ? openForm() : setFilter("all")); state.append(action); list.append(state); return; }
  list.append(...filtered.map(createSessionRow));
}
function setFilter(filter) { activeFilter = filter; document.querySelectorAll("[data-attendance-filter]").forEach((button) => { const active = button.dataset.attendanceFilter === filter; button.classList.toggle("active", active); button.setAttribute("aria-pressed", active); }); renderHistory(); }
async function render() { entries = await listAttendance(courseId); renderSummary(); renderHistory(); document.querySelector("#main-content").setAttribute("aria-busy", "false"); }

document.querySelector("#add-attendance").addEventListener("click", () => openForm()); document.querySelector("#close-attendance-dialog").addEventListener("click", () => dialog.close()); document.querySelector("#cancel-attendance-form").addEventListener("click", () => dialog.close()); document.querySelector("#attendance-filter").addEventListener("click", (event) => { const button = event.target.closest("[data-attendance-filter]"); if (button) setFilter(button.dataset.attendanceFilter); });
form.addEventListener("submit", async (event) => { event.preventDefault(); const submit = form.querySelector("button[type=submit]"); const values = Object.fromEntries(new FormData(form)); const attendanceId = values.attendance_id; delete values.attendance_id; values.session_label = values.session_label.trim(); values.notes = values.notes.trim() || null; setBusy(submit, true, "Saving…"); try { await saveAttendance(values, courseId, session.user.id, attendanceId); await recomputePulseQuietly(course.semester_id); dialog.close(); announce(attendanceId ? "Attendance session updated" : "Attendance session recorded"); await render(); } catch (error) { showMessage(error.message.includes("attendance_entries_course_id_session_date") ? "That session has already been recorded." : error.message, "error"); } finally { setBusy(submit, false); } });
await render();
