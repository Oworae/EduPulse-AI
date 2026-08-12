import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { createCourse, deleteCourse, listCurrentCourses, updateCourse } from "../services/course.service.js";
import { getCurrentSemester } from "../services/semester.service.js";
import { el, formatPercent } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true });
bindLogout();
const semester = await getCurrentSemester();
document.querySelector("#semester-label").textContent = `${semester.academic_year} · ${semester.semester_name}`;
const dialog = document.querySelector("#course-dialog");
const form = document.querySelector("#course-form");
const list = document.querySelector("#course-list");
document.querySelector("#add-course").addEventListener("click", () => openForm());
document.querySelector("#close-course-dialog").addEventListener("click", () => dialog.close());

function openForm(course) {
  form.reset(); form.elements.course_id.value = course?.course_id ?? "";
  form.elements.course_code.value = course?.course_code ?? ""; form.elements.course_name.value = course?.course_name ?? "";
  form.elements.credit_hours.value = course?.credit_hours ?? 3; form.elements.target_percentage.value = course?.target_percentage ?? "";
  document.querySelector("#course-dialog-title").textContent = course ? "Edit course" : "Add a course";
  dialog.showModal();
}
async function render() {
  const courses = await listCurrentCourses(semester.id); list.replaceChildren();
  document.querySelector("#course-total").textContent = `${courses.length} ${courses.length === 1 ? "course" : "courses"}`;
  if (!courses.length) return list.append(el("div", { className: "empty-list card", text: "No courses yet. Add the first course you want to track." }));
  for (const course of courses) {
    const link = el("a", { className: "course-card card", href: `course.html?id=${encodeURIComponent(course.course_id)}` }, [
      el("div", { className: "course-code", text: course.course_code }),
      el("h2", { text: course.course_name }),
      el("p", { className: "muted", text: `${course.credit_hours} credits · Target ${course.target_percentage ?? "—"}%` }),
      el("div", { className: "course-score", text: formatPercent(course.current_percentage) }),
    ]);
    const actions = el("div", { className: "card-actions" });
    const edit = el("button", { className: "text-button", type: "button", text: "Edit" }); edit.addEventListener("click", (event) => { event.preventDefault(); openForm(course); });
    const remove = el("button", { className: "text-button danger", type: "button", text: "Delete" }); remove.addEventListener("click", async (event) => { event.preventDefault(); if (confirm(`Delete ${course.course_name} and all its records?`)) { await deleteCourse(course.course_id); await render(); } });
    actions.append(edit, remove); link.append(actions); list.append(link);
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const submit = form.querySelector("button[type=submit]"); const values = Object.fromEntries(new FormData(form)); const courseId = values.course_id; delete values.course_id;
  values.course_code = values.course_code.trim(); values.course_name = values.course_name.trim(); values.credit_hours = Number(values.credit_hours); values.target_percentage = values.target_percentage ? Number(values.target_percentage) : null;
  setBusy(submit, true, "Saving…");
  try { courseId ? await updateCourse(courseId, values) : await createCourse(values, semester.id, session.user.id); dialog.close(); await render(); }
  catch (error) { showMessage(error.message.includes("courses_semester_code_unique") ? "That course code already exists in this semester." : error.message, "error"); }
  finally { setBusy(submit, false); }
});
await render();
