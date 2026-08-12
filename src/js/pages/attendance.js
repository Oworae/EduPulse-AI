import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { deleteAttendance, listAttendance, saveAttendance } from "../services/attendance.service.js";
import { getCourse } from "../services/course.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true }); bindLogout(); const courseId = new URLSearchParams(location.search).get("id");
if (!courseId || !/^[0-9a-f-]{36}$/i.test(courseId)) window.location.replace("courses.html");
const course = await getCourse(courseId); document.querySelector("#course-name").textContent = course.course_name; document.querySelector("#back-course").href = `course.html?id=${encodeURIComponent(courseId)}`;
const form = document.querySelector("#attendance-form"); const dialog = document.querySelector("#attendance-dialog"); document.querySelector("#add-attendance").addEventListener("click", () => openForm()); document.querySelector("#close-attendance-dialog").addEventListener("click", () => dialog.close());
function openForm(item) { form.reset(); form.elements.attendance_id.value = item?.id ?? ""; form.elements.session_date.value = item?.session_date ?? new Date().toISOString().slice(0, 10); form.elements.session_label.value = item?.session_label ?? ""; form.elements.status.value = item?.status ?? "present"; form.elements.notes.value = item?.notes ?? ""; document.querySelector("#attendance-dialog-title").textContent = item ? "Edit attendance" : "Record attendance"; dialog.showModal(); }
async function render() {
  const entries = await listAttendance(courseId); const list = document.querySelector("#attendance-list"); list.replaceChildren();
  const eligible = entries.filter((x) => x.status !== "excused"); const attended = eligible.filter((x) => ["present", "late"].includes(x.status)).length; document.querySelector("#attendance-rate").textContent = eligible.length ? `${(attended / eligible.length * 100).toFixed(1)}%` : "—"; document.querySelector("#attendance-count").textContent = `${attended} of ${eligible.length} eligible sessions`;
  if (!entries.length) return list.append(el("div", { className: "empty-list card", text: "No attendance sessions recorded yet." }));
  for (const item of entries) { const card = el("article", { className: "history-row card" }, [el("strong", { text: item.session_date }), el("span", { className: `attendance-badge ${item.status}`, text: item.status }), el("span", { text: item.session_label || "Class session" })]); const actions = el("div", { className: "row-actions" }); const edit = el("button", { className: "text-button", type: "button", text: "Edit" }); edit.addEventListener("click", () => openForm(item)); const remove = el("button", { className: "text-button danger", type: "button", text: "Delete" }); remove.addEventListener("click", async () => { if (confirm("Delete this attendance entry?")) { await deleteAttendance(item.id); await recomputePulseQuietly(course.semester_id); await render(); } }); actions.append(edit, remove); card.append(actions); list.append(card); }
}
form.addEventListener("submit", async (event) => { event.preventDefault(); const submit = form.querySelector("button[type=submit]"); const values = Object.fromEntries(new FormData(form)); const attendanceId = values.attendance_id; delete values.attendance_id; values.session_label = values.session_label.trim(); values.notes = values.notes.trim() || null; setBusy(submit, true, "Saving…"); try { await saveAttendance(values, courseId, session.user.id, attendanceId); await recomputePulseQuietly(course.semester_id); dialog.close(); await render(); } catch (error) { showMessage(error.message.includes("attendance_entries_course_id_session_date") ? "That session has already been recorded." : error.message, "error"); } finally { setBusy(submit, false); } });
await render();
