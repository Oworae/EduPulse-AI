import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { deleteAssessment, listAssessments, saveAssessment } from "../services/assessment.service.js";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { getCourse } from "../services/course.service.js";
import { el, formatPercent } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true }); bindLogout();
const courseId = new URLSearchParams(location.search).get("id");
if (!courseId || !/^[0-9a-f-]{36}$/i.test(courseId)) window.location.replace("courses.html");
let course = await getCourse(courseId);
const form = document.querySelector("#assessment-form"); const dialog = document.querySelector("#assessment-dialog"); const list = document.querySelector("#assessment-list");
document.querySelector("#course-code").textContent = course.course_code; document.querySelector("#course-name").textContent = course.course_name;
document.querySelector("#course-meta").textContent = `${course.credit_hours} credits · Target ${course.target_percentage ?? "—"}%`;
document.querySelector("#add-assessment").addEventListener("click", () => openForm()); document.querySelector("#close-assessment-dialog").addEventListener("click", () => dialog.close());
form.elements.status.addEventListener("change", toggleScoreFields);
function toggleScoreFields() { const complete = form.elements.status.value === "completed"; document.querySelector("#score-fields").hidden = !complete; for (const name of ["score", "max_score"]) form.elements[name].required = complete; }
function openForm(item) {
  form.reset(); form.elements.assessment_id.value = item?.id ?? ""; form.elements.title.value = item?.title ?? ""; form.elements.assessment_type.value = item?.assessment_type ?? "assignment"; form.elements.status.value = item?.status ?? "planned"; form.elements.scheduled_date.value = item?.scheduled_date ?? ""; form.elements.completed_date.value = item?.completed_date ?? ""; form.elements.score.value = item?.score ?? ""; form.elements.max_score.value = item?.max_score ?? ""; form.elements.weight_percentage.value = item?.weight_percentage ?? ""; document.querySelector("#assessment-dialog-title").textContent = item ? "Edit assessment" : "Add assessment"; toggleScoreFields(); dialog.showModal();
}
async function render() {
  const assessments = await listAssessments(courseId); course = await getCourse(courseId); list.replaceChildren();
  document.querySelector("#performance").textContent = formatPercent(course.current_percentage); document.querySelector("#completed-weight").textContent = `${Number(course.completed_weight).toFixed(0)}% completed weight`;
  if (!assessments.length) return list.append(el("div", { className: "empty-list card", text: "No assessments yet. Add a planned task or record a completed result." }));
  for (const item of assessments) {
    const percent = item.status === "completed" ? `${(Number(item.score) / Number(item.max_score) * 100).toFixed(1)}%` : "Planned";
    const card = el("article", { className: "assessment-row card" }, [el("div", { className: `status-dot ${item.status}` }), el("div", { className: "assessment-main" }, [el("span", { className: "assessment-type", text: item.assessment_type.replace("_", " ") }), el("h3", { text: item.title }), el("p", { className: "muted", text: `${item.weight_percentage}% weight${item.scheduled_date ? ` · ${item.scheduled_date}` : ""}` })]), el("strong", { className: "assessment-score", text: percent })]);
    const actions = el("div", { className: "row-actions" }); const edit = el("button", { className: "text-button", type: "button", text: "Edit" }); edit.addEventListener("click", () => openForm(item)); const remove = el("button", { className: "text-button danger", type: "button", text: "Delete" }); remove.addEventListener("click", async () => { if (confirm(`Delete ${item.title}?`)) { await deleteAssessment(item.id); await recomputePulseQuietly(course.semester_id); await render(); } }); actions.append(edit, remove); card.append(actions); list.append(card);
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const submit = form.querySelector("button[type=submit]"); const values = Object.fromEntries(new FormData(form)); const assessmentId = values.assessment_id; delete values.assessment_id;
  values.weight_percentage = Number(values.weight_percentage); for (const key of ["scheduled_date", "completed_date"]) values[key] ||= null;
  if (values.status === "completed") { values.score = Number(values.score); values.max_score = Number(values.max_score); values.completed_date ||= new Date().toISOString().slice(0, 10); } else { values.score = null; values.max_score = null; values.completed_date = null; }
  setBusy(submit, true, "Saving…"); try { await saveAssessment(values, courseId, session.user.id, assessmentId); await recomputePulseQuietly(course.semester_id); dialog.close(); await render(); }
  catch (error) { showMessage(error.message.includes("total assessment weight") ? "Assessment weights cannot total more than 100%." : error.message, "error"); } finally { setBusy(submit, false); }
});
await render();
