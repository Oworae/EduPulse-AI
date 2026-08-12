import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { createCourse, deleteCourse, listCurrentCourses, updateCourse } from "../services/course.service.js?v=20260812-course-workspace";
import { getCurrentSemester } from "../services/semester.service.js";
import { el } from "../utils/dom.js";
import { setBusy } from "../utils/forms.js";

let session = null;
let sessionError = null;
try { session = await requireSession({ requireOnboarding: true }); }
catch (error) { sessionError = error; }
bindLogout();

const page = document.querySelector("#main-content");
const list = document.querySelector("#course-list");
const toolbar = document.querySelector("#course-toolbar");
const dialog = document.querySelector("#course-dialog");
const form = document.querySelector("#course-form");
const deleteDialog = document.querySelector("#delete-course-dialog");
const addButton = document.querySelector("#add-course");
const formMessage = document.querySelector("#form-message");
const toast = document.querySelector("#course-toast");

let semester = null;
let courses = [];
let activeFilter = "all";
let pendingDelete = null;
let lastDialogTrigger = null;
let toastTimer;

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value) => Math.max(0, Math.min(100, finite(value) ?? 0));
const number = (value, maximumFractionDigits = 1) => finite(value) === null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(Number(value));
const percent = (value) => finite(value) === null ? "—" : `${number(value)}%`;
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function setPageBusy(busy) {
  page.setAttribute("aria-busy", String(busy));
  page.classList.toggle("course-page-ready", !busy);
  addButton.disabled = busy || !semester;
}

function announce(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function clearFormMessage() {
  formMessage.hidden = true;
  formMessage.textContent = "";
  formMessage.className = "message";
}

function showFormError(message) {
  formMessage.textContent = message;
  formMessage.className = "message error";
  formMessage.hidden = false;
}

function courseStatus(course) {
  const score = finite(course.current_percentage);
  const gap = finite(course.difference_from_target);
  const attendance = finite(course.attendance_percentage);
  if (score === null) return { key: "awaiting", label: "Awaiting first result" };
  if (gap !== null && gap < 0) return { key: "attention", label: `${number(Math.abs(gap))} pts below target` };
  if (attendance !== null && attendance < 75) return { key: "attention", label: "Attendance needs attention" };
  if (gap === null) return { key: "neutral", label: "No target set" };
  if (Math.abs(gap) < 0.005) return { key: "on-track", label: "Meeting target" };
  return { key: "on-track", label: `${number(gap)} pts above target` };
}

function priorityRank(course) {
  const score = finite(course.current_percentage);
  const gap = finite(course.difference_from_target);
  const attendance = finite(course.attendance_percentage);
  if (gap !== null && gap < 0) return [0, gap];
  if (score === null) return [1, 0];
  if (attendance !== null && attendance < 75) return [2, attendance];
  if (finite(course.target_percentage) === null) return [3, 0];
  return [4, -(gap ?? 0)];
}

function comparePriority(a, b) {
  const left = priorityRank(a);
  const right = priorityRank(b);
  return left[0] - right[0] || left[1] - right[1] || a.course_code.localeCompare(b.course_code);
}

function sortedCourses(items) {
  const sort = document.querySelector("#course-sort").value;
  return [...items].sort((a, b) => {
    if (sort === "code") return a.course_code.localeCompare(b.course_code);
    if (sort === "performance") return (finite(b.current_percentage) ?? -1) - (finite(a.current_percentage) ?? -1) || a.course_code.localeCompare(b.course_code);
    if (sort === "attendance") return (finite(b.attendance_percentage) ?? -1) - (finite(a.attendance_percentage) ?? -1) || a.course_code.localeCompare(b.course_code);
    return comparePriority(a, b);
  });
}

function visibleCourses() {
  const query = document.querySelector("#course-search").value.trim().toLocaleLowerCase();
  return sortedCourses(courses.filter((course) => {
    const matchesSearch = !query || `${course.course_code} ${course.course_name}`.toLocaleLowerCase().includes(query);
    const status = courseStatus(course);
    const matchesFilter = activeFilter === "all" || (activeFilter === "attention" && status.key === "attention") || (activeFilter === "on-track" && status.key === "on-track") || (activeFilter === "awaiting" && status.key === "awaiting");
    return matchesSearch && matchesFilter;
  }));
}

function renderPortfolio() {
  const scored = courses.filter((course) => finite(course.current_percentage) !== null && finite(course.credit_hours) !== null);
  const scoredCredits = scored.reduce((sum, course) => sum + Number(course.credit_hours), 0);
  const weightedAverage = scoredCredits ? scored.reduce((sum, course) => sum + Number(course.current_percentage) * Number(course.credit_hours), 0) / scoredCredits : null;
  const completed = courses.reduce((sum, course) => sum + (finite(course.completed_assessments) ?? 0), 0);
  const total = courses.reduce((sum, course) => sum + (finite(course.total_assessments) ?? 0), 0);
  const attendanceValues = courses.map((course) => finite(course.attendance_percentage)).filter((value) => value !== null);
  const averageAttendance = attendanceValues.length ? attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length : null;
  const comparable = courses.filter((course) => finite(course.difference_from_target) !== null);
  const atTarget = comparable.filter((course) => Number(course.difference_from_target) >= 0).length;
  const credits = courses.reduce((sum, course) => sum + (finite(course.credit_hours) ?? 0), 0);

  document.querySelector("#course-total").textContent = `${plural(courses.length, "course")} · ${number(credits)} credits`;
  document.querySelector("#portfolio-average").textContent = percent(weightedAverage);
  document.querySelector("#portfolio-average-context").textContent = scored.length ? `Credit-weighted across ${plural(scored.length, "course")} with results.` : "No graded work has been recorded yet.";
  document.querySelector("#portfolio-results").textContent = total ? `${completed}/${total}` : "0";
  document.querySelector("#portfolio-results-context").textContent = total ? `${number(completed / total * 100, 0)}% of assessments completed` : "No assessments added yet";
  document.querySelector("#portfolio-attendance").textContent = percent(averageAttendance);
  document.querySelector("#portfolio-attendance-context").textContent = attendanceValues.length ? `Across ${plural(attendanceValues.length, "course")}` : "No sessions recorded";
  document.querySelector("#portfolio-targets").textContent = comparable.length ? `${atTarget}/${comparable.length}` : "—";
  document.querySelector("#portfolio-targets-context").textContent = comparable.length ? "Among scored courses with targets" : "Add targets and results to compare";

  renderFocus();
}

function renderFocus() {
  const focus = [...courses].sort(comparePriority)[0];
  const link = document.querySelector("#focus-link");
  if (!focus) return;
  const score = finite(focus.current_percentage);
  const gap = finite(focus.difference_from_target);
  const attendance = finite(focus.attendance_percentage);
  document.querySelector("#focus-monogram").textContent = focus.course_code.slice(0, 2).toUpperCase();
  link.href = `course.html?id=${encodeURIComponent(focus.course_id)}`;
  if (gap !== null && gap < 0) {
    document.querySelector("#focus-kicker").textContent = `${focus.course_code} · Target gap`;
    document.querySelector("#focus-title").textContent = `Close the ${number(Math.abs(gap))}-point gap.`;
    document.querySelector("#focus-copy").textContent = `${focus.course_name} is your clearest course-level opportunity based on recorded graded work.`;
    link.firstChild.textContent = "Review target path ";
  } else if (score === null) {
    document.querySelector("#focus-kicker").textContent = `${focus.course_code} · Add evidence`;
    document.querySelector("#focus-title").textContent = "Record the first result.";
    document.querySelector("#focus-copy").textContent = `A completed assessment in ${focus.course_name} will replace the blank with a real performance picture.`;
    link.firstChild.textContent = "Open assessment plan ";
  } else if (attendance !== null && attendance < 75) {
    document.querySelector("#focus-kicker").textContent = `${focus.course_code} · Attendance`;
    document.querySelector("#focus-title").textContent = "Protect your course presence.";
    document.querySelector("#focus-copy").textContent = `${focus.course_name} has the clearest attendance concern among the evidence currently recorded.`;
    link.firstChild.textContent = "Review this course ";
  } else if (finite(focus.target_percentage) === null) {
    document.querySelector("#focus-kicker").textContent = `${focus.course_code} · Sharpen the goal`;
    document.querySelector("#focus-title").textContent = "Give this course a target.";
    document.querySelector("#focus-copy").textContent = `Set a goal for ${focus.course_name} so every new result has a clear reference point.`;
    link.firstChild.textContent = "Open this course ";
  } else {
    document.querySelector("#focus-kicker").textContent = `${focus.course_code} · On pace`;
    document.querySelector("#focus-title").textContent = "Keep the evidence moving.";
    document.querySelector("#focus-copy").textContent = `${focus.course_name} is at or above its target on the graded work recorded so far.`;
    link.firstChild.textContent = "Keep the momentum ";
  }
}

function createCourseCard(course) {
  const score = finite(course.current_percentage);
  const target = finite(course.target_percentage);
  const attendance = finite(course.attendance_percentage);
  const completed = finite(course.completed_assessments) ?? 0;
  const total = finite(course.total_assessments) ?? 0;
  const completedWeight = finite(course.completed_weight) ?? 0;
  const status = courseStatus(course);
  const href = `course.html?id=${encodeURIComponent(course.course_id)}`;

  const menu = el("details", { className: "course-card-menu" });
  const menuTrigger = el("summary", { "aria-label": `Actions for ${course.course_code}`, title: "Course actions" }, [el("span", { "aria-hidden": "true", text: "•••" })]);
  const menuPanel = el("div", { className: "course-card-menu-panel" });
  const edit = el("button", { type: "button", text: "Edit course" });
  edit.addEventListener("click", () => { menu.open = false; openForm(course, menuTrigger); });
  const remove = el("button", { type: "button", className: "danger", text: "Delete course" });
  remove.addEventListener("click", () => { menu.open = false; openDeleteDialog(course, menuTrigger); });
  menuPanel.append(edit, remove);
  menu.append(menuTrigger, menuPanel);

  const targetTrack = el("div", { className: "portfolio-card-track", role: "progressbar", "aria-label": `${course.course_name} average on graded work`, "aria-valuemin": "0", "aria-valuemax": "100" }, [
    el("span", { style: `width:${clamp(score)}%` }),
  ]);
  if (score !== null) targetTrack.setAttribute("aria-valuenow", String(clamp(score)));
  else targetTrack.setAttribute("aria-valuetext", "No graded results yet");
  if (target !== null) targetTrack.append(el("i", { style: `left:${clamp(target)}%`, title: `Target ${percent(target)}` }));

  const main = el("a", { className: "portfolio-card-main", href }, [
    el("div", { className: "portfolio-card-heading" }, [
      el("div", { className: "portfolio-course-mark", text: course.course_code.slice(0, 2).toUpperCase() }),
      el("div", { className: "portfolio-course-identity" }, [el("span", { text: course.course_code }), el("h3", { text: course.course_name })]),
    ]),
    el("div", { className: "portfolio-card-score" }, [
      el("div", { className: `portfolio-score-ring${score === null ? " empty" : ""}`, style: `--course-score:${clamp(score)}` }, [el("strong", { text: percent(score) })]),
      el("div", {}, [el("span", { text: "Average on graded work" }), el("strong", { text: course.letter_grade ? `Provisional ${course.letter_grade}` : score === null ? "No grade yet" : "Grade band unavailable" })]),
    ]),
    el("div", { className: `portfolio-status ${status.key}` }, [el("i", { "aria-hidden": "true" }), el("span", { text: status.label })]),
    targetTrack,
    el("dl", { className: "portfolio-card-facts" }, [
      el("div", {}, [el("dt", { text: "Assessments" }), el("dd", { text: total ? `${completed}/${total}` : "None yet" })]),
      el("div", {}, [el("dt", { text: "Graded weight" }), el("dd", { text: `${number(completedWeight)}%` })]),
      el("div", {}, [el("dt", { text: "Attendance" }), el("dd", { text: attendance === null ? "Not recorded" : percent(attendance) })]),
    ]),
    el("span", { className: "portfolio-open-label", text: "Open course →" }),
  ]);

  return el("article", { className: `portfolio-course-card ${status.key}` }, [main, menu]);
}

function renderCards() {
  const visible = visibleCourses();
  list.replaceChildren();
  list.classList.remove("course-grid-loading");
  const resultCount = document.querySelector("#course-result-count");
  resultCount.textContent = visible.length === courses.length ? plural(courses.length, "course") : `${plural(visible.length, "match")} of ${courses.length}`;

  if (!visible.length) {
    const noCourses = courses.length === 0;
    const state = el("div", { className: "course-library-empty" }, [
      el("div", { className: "course-empty-mark", text: noCourses ? "+" : "⌕" }),
      el("p", { className: "eyebrow", text: noCourses ? "Build your portfolio" : "No matches" }),
      el("h2", { text: noCourses ? "Start with the course you care about most." : "No course matches these filters." }),
      el("p", { text: noCourses ? "Add its target, then plan or record assessments to turn scattered marks into a clear academic picture." : "Try another search or return to the full portfolio." }),
    ]);
    const action = el("button", { className: "button", type: "button", text: noCourses ? "Add my first course" : "Clear filters" });
    action.addEventListener("click", () => noCourses ? openForm(null, action) : clearFilters());
    state.append(action);
    list.append(state);
    return;
  }
  for (const course of visible) list.append(createCourseCard(course));
}

function renderNoSemester() {
  document.querySelector("#portfolio-overview").hidden = true;
  toolbar.hidden = true;
  document.querySelector("#semester-label").textContent = "No current semester";
  document.querySelector("#course-total").textContent = "No active portfolio";
  document.querySelector("#course-result-count").textContent = "Semester setup required";
  list.replaceChildren(el("div", { className: "course-library-empty" }, [
    el("div", { className: "course-empty-mark", text: "01" }),
    el("p", { className: "eyebrow", text: "First things first" }),
    el("h2", { text: "Choose a current semester." }),
    el("p", { text: "Your course portfolio belongs to a semester. Create one or mark an existing semester as current to continue." }),
    el("a", { className: "button", href: "semesters.html", text: "Manage semesters" }),
  ]));
  list.classList.remove("course-grid-loading");
  setPageBusy(false);
}

function renderLoadFailure(copy = "We couldn’t reach your course portfolio just now. Try the connection again.") {
  toolbar.hidden = true;
  document.querySelector("#portfolio-overview").hidden = true;
  document.querySelector("#course-result-count").textContent = "Portfolio unavailable";
  const state = el("div", { className: "course-library-empty error", role: "alert" }, [
    el("div", { className: "course-empty-mark", text: "!" }),
    el("p", { className: "eyebrow", text: "Connection interrupted" }),
    el("h2", { text: "Your course data is still safe." }),
    el("p", { text: copy }),
  ]);
  const retry = el("button", { className: "button", type: "button", text: "Try again" });
  retry.addEventListener("click", initialise);
  state.append(retry);
  list.replaceChildren(state);
  list.classList.remove("course-grid-loading");
}

async function loadCourses() {
  if (!semester) return;
  setPageBusy(true);
  try {
    courses = await listCurrentCourses(semester.id);
    document.querySelector("#portfolio-overview").hidden = courses.length === 0;
    toolbar.hidden = courses.length === 0;
    renderPortfolio();
    renderCards();
  } catch (error) {
    console.warn("Course portfolio load failed:", error?.message ?? error);
    renderLoadFailure();
  } finally {
    setPageBusy(false);
  }
}

async function initialise() {
  setPageBusy(true);
  try {
    semester = await getCurrentSemester();
    document.querySelector("#semester-label").textContent = `${semester.academic_year} · ${semester.semester_name}`;
    await loadCourses();
  } catch (error) {
    if (error?.code === "PGRST116") renderNoSemester();
    else {
      renderLoadFailure();
      setPageBusy(false);
    }
  }
}

function openForm(course, trigger = document.activeElement) {
  if (!semester) return;
  lastDialogTrigger = trigger;
  clearFormMessage();
  form.reset();
  form.elements.course_id.value = course?.course_id ?? "";
  form.elements.course_code.value = course?.course_code ?? "";
  form.elements.course_name.value = course?.course_name ?? "";
  form.elements.credit_hours.value = course?.credit_hours ?? 3;
  form.elements.target_percentage.value = course?.target_percentage ?? "";
  document.querySelector("#course-dialog-title").textContent = course ? "Edit course" : "Add a course";
  document.querySelector("#course-dialog-copy").textContent = course ? "Keep the course details and your personal target aligned with this semester." : "Set a target so EduPulse can show whether your graded work is moving in the right direction.";
  dialog.showModal();
  requestAnimationFrame(() => form.elements.course_code.focus());
}

function closeForm() {
  if (dialog.dataset.busy === "true") return;
  dialog.close();
  lastDialogTrigger?.focus?.();
}

function openDeleteDialog(course, trigger) {
  pendingDelete = course;
  lastDialogTrigger = trigger;
  document.querySelector("#delete-course-title").textContent = `Delete ${course.course_code}?`;
  document.querySelector("#delete-course-copy").textContent = `${course.course_name}, its assessments, attendance entries, and course signals will be removed. This cannot be undone.`;
  document.querySelector("#delete-course-message").hidden = true;
  deleteDialog.showModal();
  requestAnimationFrame(() => document.querySelector("#cancel-course-delete").focus());
}

function closeDeleteDialog() {
  if (deleteDialog.dataset.busy === "true") return;
  deleteDialog.close();
  lastDialogTrigger?.focus?.();
}

function clearFilters() {
  activeFilter = "all";
  document.querySelector("#course-search").value = "";
  document.querySelector("#course-sort").value = "priority";
  for (const button of document.querySelectorAll("[data-course-filter]")) {
    const active = button.dataset.courseFilter === "all";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderCards();
}

addButton.addEventListener("click", (event) => openForm(null, event.currentTarget));
document.querySelector("#close-course-dialog").addEventListener("click", closeForm);
document.querySelector("#cancel-course-form").addEventListener("click", closeForm);
document.querySelector("#cancel-course-delete").addEventListener("click", closeDeleteDialog);
document.querySelector("#course-search").addEventListener("input", renderCards);
document.querySelector("#course-sort").addEventListener("change", renderCards);
for (const button of document.querySelectorAll("[data-course-filter]")) button.addEventListener("click", () => {
  activeFilter = button.dataset.courseFilter;
  for (const option of document.querySelectorAll("[data-course-filter]")) {
    const active = option === button;
    option.classList.toggle("active", active);
    option.setAttribute("aria-pressed", String(active));
  }
  renderCards();
});

for (const modal of [dialog, deleteDialog]) {
  modal.addEventListener("cancel", (event) => { if (modal.dataset.busy === "true") event.preventDefault(); });
  modal.addEventListener("click", (event) => { if (event.target === modal && modal.dataset.busy !== "true") modal === dialog ? closeForm() : closeDeleteDialog(); });
}

document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll(".course-card-menu[open]")) if (!menu.contains(event.target)) menu.open = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage();
  const submit = form.querySelector("button[type=submit]");
  const values = Object.fromEntries(new FormData(form));
  const courseId = values.course_id;
  delete values.course_id;
  values.course_code = values.course_code.trim();
  values.course_name = values.course_name.trim();
  values.credit_hours = Number(values.credit_hours);
  values.target_percentage = values.target_percentage === "" ? null : Number(values.target_percentage);
  if (!values.course_code || !values.course_name) return showFormError("Add both a course code and course name.");
  dialog.dataset.busy = "true";
  setBusy(submit, true, "Saving…");
  try {
    if (courseId) await updateCourse(courseId, values, semester.id);
    else await createCourse(values, semester.id, session.user.id);
    await recomputePulseQuietly(semester.id);
    dialog.dataset.busy = "false";
    dialog.close();
    announce(courseId ? "Course updated." : "Course added to your portfolio.");
    await loadCourses();
  } catch (error) {
    if (String(error?.message).includes("courses_semester_code_unique")) showFormError("That course code already exists in this semester.");
    else showFormError("We couldn’t save this course. Check the details and try again.");
  } finally {
    dialog.dataset.busy = "false";
    setBusy(submit, false);
  }
});

document.querySelector("#confirm-course-delete").addEventListener("click", async (event) => {
  if (!pendingDelete) return;
  const button = event.currentTarget;
  const removed = pendingDelete;
  deleteDialog.dataset.busy = "true";
  setBusy(button, true, "Deleting…");
  document.querySelector("#delete-course-message").hidden = true;
  try {
    await deleteCourse(removed.course_id, removed.semester_id);
    await recomputePulseQuietly(removed.semester_id);
    pendingDelete = null;
    deleteDialog.dataset.busy = "false";
    deleteDialog.close();
    announce(`${removed.course_code} was deleted.`);
    await loadCourses();
  } catch {
    const message = document.querySelector("#delete-course-message");
    message.textContent = "We couldn’t delete this course. Please try again.";
    message.hidden = false;
  } finally {
    deleteDialog.dataset.busy = "false";
    setBusy(button, false);
  }
});

if (sessionError) {
  renderLoadFailure("We couldn’t verify your session. Check your connection and try again.");
  setPageBusy(false);
} else if (session) await initialise();
