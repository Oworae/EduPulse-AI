import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { deleteAssessment, listAssessments, saveAssessment } from "../services/assessment.service.js?v=20260812-course-workspace";
import { recomputePulseQuietly } from "../services/analytics.service.js";
import { getCourse } from "../services/course.service.js?v=20260812-course-workspace";
import { el } from "../utils/dom.js";
import { setBusy } from "../utils/forms.js";

let session = null;
let sessionError = null;
try { session = await requireSession({ requireOnboarding: true }); }
catch (error) { sessionError = error; }
bindLogout();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const courseId = new URLSearchParams(location.search).get("id");
const page = document.querySelector("#main-content");
const content = document.querySelector("#course-content");
const pageState = document.querySelector("#course-page-state");
const list = document.querySelector("#assessment-list");
const form = document.querySelector("#assessment-form");
const dialog = document.querySelector("#assessment-dialog");
const deleteDialog = document.querySelector("#delete-assessment-dialog");
const formMessage = document.querySelector("#form-message");
const toast = document.querySelector("#course-toast");

let course = null;
let assessments = [];
let assessmentDataAvailable = false;
let activeAssessmentFilter = "all";
let pendingDelete = null;
let editingAssessment = null;
let lastDialogTrigger = null;
let nextMoveHandler = () => openAssessmentForm();
let toastTimer;

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value) => Math.max(0, Math.min(100, finite(value) ?? 0));
const number = (value, maximumFractionDigits = 1) => finite(value) === null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(Number(value));
const percent = (value) => finite(value) === null ? "—" : `${number(value)}%`;
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "Unscheduled";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: year === new Date().getFullYear() ? undefined : "numeric" }).format(new Date(year, month - 1, day));
}

function humanType(value) {
  const labels = { quiz: "Quiz", assignment: "Assignment", midsem: "Mid-semester exam", project: "Project", presentation: "Presentation", practical: "Practical", final_exam: "Final exam", other: "Other" };
  return labels[value] ?? "Assessment";
}

function typeMark(value) {
  const marks = { quiz: "QZ", assignment: "AS", midsem: "ME", project: "PJ", presentation: "PR", practical: "PL", final_exam: "FE", other: "OT" };
  return marks[value] ?? "AS";
}

function setPageBusy(busy) {
  page.setAttribute("aria-busy", String(busy));
  page.classList.toggle("course-page-ready", !busy);
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

function showCourseState({ title, copy, canRetry = true }) {
  content.hidden = true;
  pageState.hidden = false;
  document.querySelector("#course-state-title").textContent = title;
  document.querySelector("#course-state-copy").textContent = copy;
  document.querySelector("#retry-course").hidden = !canRetry;
  setPageBusy(false);
}

function hideCourseState() {
  pageState.hidden = true;
  content.hidden = false;
}

function courseStatus() {
  const score = finite(course.current_percentage);
  const gap = finite(course.difference_from_target);
  if (score === null) return { key: "awaiting", label: "Awaiting first result" };
  if (gap !== null && gap < 0) return { key: "attention", label: "Below target pace" };
  if (gap === null) return { key: "neutral", label: "Target not set" };
  return { key: "on-track", label: "At or above target" };
}

function renderCourseSummary(items) {
  const score = finite(course.current_percentage);
  const target = finite(course.target_percentage);
  const gap = finite(course.difference_from_target);
  const attendance = finite(course.attendance_percentage);
  const completedWeight = finite(course.completed_weight) ?? 0;
  const completed = finite(course.completed_assessments) ?? 0;
  const total = finite(course.total_assessments) ?? 0;
  const status = courseStatus();

  document.title = `${course.course_code} — EduPulse AI`;
  document.querySelector("#course-code").textContent = course.course_code;
  document.querySelector("#course-name").textContent = course.course_name;
  document.querySelector("#course-meta").textContent = `${number(course.credit_hours)} credit ${Number(course.credit_hours) === 1 ? "hour" : "hours"} · ${total ? plural(total, "assessment") : "No assessments added"}`;
  document.querySelector("#performance").textContent = percent(score);
  document.querySelector("#performance-context").textContent = score === null ? "No graded work recorded" : course.letter_grade ? `Provisional ${course.letter_grade} · graded evidence only` : "Based on graded evidence only";
  document.querySelector("#course-status-pill").textContent = status.label;
  document.querySelector("#course-status-pill").className = `course-status-pill ${status.key}`;

  const ring = document.querySelector("#performance-ring");
  ring.style.setProperty("--performance", String(clamp(score)));
  ring.classList.toggle("empty", score === null);
  const track = document.querySelector("#course-performance-track");
  document.querySelector("#performance-bar").style.width = `${clamp(score)}%`;
  if (score === null) {
    track.removeAttribute("aria-valuenow");
    track.setAttribute("aria-valuetext", "No graded results yet");
  } else {
    track.setAttribute("aria-valuenow", String(clamp(score)));
    track.removeAttribute("aria-valuetext");
  }
  const targetMarker = document.querySelector("#target-marker");
  targetMarker.hidden = target === null;
  if (target !== null) {
    targetMarker.style.left = `${clamp(target)}%`;
    targetMarker.title = `Target ${percent(target)}`;
  }
  document.querySelector("#course-target-gap").textContent = score === null ? "Awaiting result" : gap === null ? "No target set" : Math.abs(gap) < 0.005 ? "Exactly on target" : gap > 0 ? `${number(gap)} pts above target` : `${number(Math.abs(gap))} pts below target`;

  document.querySelector("#target-metric").textContent = percent(target);
  document.querySelector("#target-metric-copy").textContent = target === null ? "Set from your course portfolio" : score === null ? "Waiting for a graded result" : gap >= 0 ? "Current graded work is on pace" : `${number(Math.abs(gap))}-point pace gap`;
  document.querySelector("#completed-weight").textContent = `${number(completedWeight)}%`;
  document.querySelector("#coverage-copy").textContent = completedWeight ? `Results recorded for ${number(completedWeight)}% of course weight` : "No completed weight recorded";
  document.querySelector("#attendance-metric").textContent = percent(attendance);
  document.querySelector("#attendance-copy").textContent = attendance === null ? "No eligible sessions recorded" : "Present and late count as attended";
  document.querySelector("#assessment-count").textContent = total ? `${completed}/${total}` : "0";
  document.querySelector("#assessment-count-copy").textContent = total ? `${plural(completed, "result")} recorded` : "No assessments added";

  const href = `attendance.html?id=${encodeURIComponent(courseId)}`;
  document.querySelector("#attendance-link").href = href;
  document.querySelector("#attendance-tab").href = href;

  renderAllocation(items);
  renderTargetPath();
  configureNextMove(items);
}

function renderAllocation(items) {
  const allocated = items ? items.reduce((sum, item) => sum + (finite(item.weight_percentage) ?? 0), 0) : null;
  const planned = items ? items.filter((item) => item.status === "planned").reduce((sum, item) => sum + (finite(item.weight_percentage) ?? 0), 0) : null;
  const completed = finite(course.completed_weight) ?? 0;
  const track = document.querySelector("#allocation-track");
  document.querySelector("#allocated-weight").textContent = allocated === null ? "—" : `${number(allocated)}%`;
  document.querySelector("#allocation-bar").style.width = `${clamp(allocated)}%`;
  if (allocated === null) {
    track.removeAttribute("aria-valuenow");
    track.setAttribute("aria-valuetext", "Assessment allocation unavailable");
    document.querySelector("#allocation-context").textContent = "We couldn’t load the assessment structure.";
  } else {
    track.setAttribute("aria-valuenow", String(clamp(allocated)));
    track.removeAttribute("aria-valuetext");
    const unallocated = Math.max(0, 100 - allocated);
    document.querySelector("#allocation-context").textContent = `${number(completed)}% graded · ${number(planned)}% planned · ${number(unallocated)}% not configured`;
  }
}

function renderTargetPath() {
  const target = finite(course.target_percentage);
  const score = finite(course.current_percentage);
  const completedWeight = finite(course.completed_weight) ?? 0;
  const remainingWeight = Math.max(0, 100 - completedWeight);
  const value = document.querySelector("#target-path-value");
  const title = document.querySelector("#target-path-title");
  const copy = document.querySelector("#target-path-copy");

  if (target === null) {
    value.textContent = "No target";
    title.textContent = "Give this course a finish line.";
    copy.textContent = "Add a target from the course portfolio to compare every recorded result with your own goal.";
    return;
  }

  const pointsSecured = (score ?? 0) * completedWeight / 100;
  if (remainingWeight === 0) {
    value.textContent = pointsSecured >= target ? "Achieved" : "Not reached";
    title.textContent = pointsSecured >= target ? "Your recorded total meets the target." : "The recorded course weight is complete.";
    copy.textContent = `The completed course evidence contributes ${number(pointsSecured)} points toward your ${number(target)}% target.`;
    return;
  }

  const required = (target - pointsSecured) / remainingWeight * 100;
  if (required <= 0) {
    value.textContent = "Secured";
    title.textContent = "Your target is mathematically secured.";
    copy.textContent = `Your completed work already contributes enough weighted points for the ${number(target)}% target, even before the remaining weight is recorded.`;
  } else if (required > 100) {
    value.textContent = ">100%";
    title.textContent = "The target is outside the current path.";
    copy.textContent = `Based on the results recorded, more than 100% would be needed across the remaining ${number(remainingWeight)}% course weight.`;
  } else {
    value.textContent = `${number(required)}%`;
    title.textContent = "Average needed across remaining weight";
    copy.textContent = `To finish at ${number(target)}%, this is the average needed across the remaining ${number(remainingWeight)}% of course weight, assuming the course ultimately totals 100%.`;
  }
}

function firstPlanned(items) {
  return [...(items ?? [])].filter((item) => item.status === "planned").sort((a, b) => {
    if (a.scheduled_date && b.scheduled_date) return a.scheduled_date.localeCompare(b.scheduled_date);
    if (a.scheduled_date) return -1;
    if (b.scheduled_date) return 1;
    return a.title.localeCompare(b.title);
  })[0] ?? null;
}

function setNextMove({ icon, kicker, title, copy, label, handler }) {
  document.querySelector("#next-move-icon").textContent = icon;
  document.querySelector("#next-move-kicker").textContent = kicker;
  document.querySelector("#next-move-title").textContent = title;
  document.querySelector("#next-move-copy").textContent = copy;
  const button = document.querySelector("#next-move-action");
  button.firstChild.textContent = `${label} `;
  nextMoveHandler = handler;
}

function configureNextMove(items) {
  if (!items) {
    setNextMove({ icon: "!", kicker: `${course.course_code} · Connection`, title: "Reconnect the assessment plan.", copy: "The course summary is here, but its assessment details did not load.", label: "Try assessments again", handler: loadAssessmentData });
    return;
  }
  const planned = firstPlanned(items);
  const score = finite(course.current_percentage);
  const gap = finite(course.difference_from_target);
  const attendance = finite(course.attendance_percentage);
  if (score === null && planned) {
    setNextMove({ icon: "01", kicker: `${course.course_code} · First result`, title: `Make ${planned.title} your first signal.`, copy: planned.scheduled_date ? `It is scheduled for ${formatDate(planned.scheduled_date)}. Record the result when it is complete.` : "It is planned without a date. Add the result when the work is complete.", label: "Review assessment", handler: () => openAssessmentForm(planned, document.querySelector("#next-move-action")) });
  } else if (score === null) {
    setNextMove({ icon: "+", kicker: `${course.course_code} · Start here`, title: "Add the first piece of course evidence.", copy: "Plan upcoming work or record a completed result. One assessment is enough to begin.", label: "Add an assessment", handler: () => openAssessmentForm(null, document.querySelector("#next-move-action")) });
  } else if (gap !== null && gap < 0 && planned) {
    setNextMove({ icon: "↗", kicker: `${number(Math.abs(gap))}-point target gap`, title: `${planned.title} is the next chance to move the average.`, copy: planned.scheduled_date ? `This assessment is scheduled for ${formatDate(planned.scheduled_date)} and carries ${number(planned.weight_percentage)}% of course weight.` : `This planned assessment carries ${number(planned.weight_percentage)}% of course weight.`, label: "Review next assessment", handler: () => openAssessmentForm(planned, document.querySelector("#next-move-action")) });
  } else if (gap !== null && gap < 0) {
    setNextMove({ icon: "+", kicker: `${number(Math.abs(gap))}-point target gap`, title: "Plan the next opportunity to close the gap.", copy: "Add the next assessment so your course path reflects what is still ahead.", label: "Plan an assessment", handler: () => openAssessmentForm(null, document.querySelector("#next-move-action")) });
  } else if (attendance !== null && attendance < 75) {
    setNextMove({ icon: "◷", kicker: `${course.course_code} · Attendance`, title: "Protect your course presence.", copy: `Recorded attendance is ${percent(attendance)}. Review the sessions behind that number before the pattern grows.`, label: "Review attendance", handler: () => { location.href = document.querySelector("#attendance-link").href; } });
  } else if (finite(course.target_percentage) === null) {
    setNextMove({ icon: "◎", kicker: `${course.course_code} · Goal`, title: "Give every result a reference point.", copy: "Set a target from your course portfolio so EduPulse can show whether graded work is on pace.", label: "Open course portfolio", handler: () => { location.href = "courses.html"; } });
  } else if (planned) {
    setNextMove({ icon: "↗", kicker: `${course.course_code} · On pace`, title: `Keep the momentum with ${planned.title}.`, copy: planned.scheduled_date ? `It is scheduled for ${formatDate(planned.scheduled_date)} and carries ${number(planned.weight_percentage)}% of course weight.` : "It is the next planned item in your assessment structure.", label: "Review assessment", handler: () => openAssessmentForm(planned, document.querySelector("#next-move-action")) });
  } else {
    setNextMove({ icon: "+", kicker: `${course.course_code} · Keep moving`, title: "Put the next assessment on the map.", copy: "Your graded work is on pace. Add what comes next to keep the course picture useful.", label: "Add an assessment", handler: () => openAssessmentForm(null, document.querySelector("#next-move-action")) });
  }
}

function assessmentDateLine(item) {
  if (item.status === "completed") {
    const value = item.completed_date || item.scheduled_date;
    return { prefix: item.completed_date ? "Completed" : item.scheduled_date ? "Scheduled" : "Result recorded", value };
  }
  if (!item.scheduled_date) return { prefix: "No date set", value: null };
  return { prefix: item.scheduled_date < localDateString() ? "Scheduled date passed" : "Scheduled", value: item.scheduled_date };
}

function createAssessmentRow(item) {
  const result = item.status === "completed" && finite(item.max_score) ? Number(item.score) / Number(item.max_score) * 100 : null;
  const dateLine = assessmentDateLine(item);
  const menu = el("details", { className: "assessment-row-menu" });
  const trigger = el("summary", { "aria-label": `Actions for ${item.title}`, title: "Assessment actions" }, [el("span", { "aria-hidden": "true", text: "•••" })]);
  const panel = el("div", { className: "assessment-row-menu-panel" });
  const edit = el("button", { type: "button", text: "Edit assessment" });
  edit.addEventListener("click", () => { menu.open = false; openAssessmentForm(item, trigger); });
  const remove = el("button", { type: "button", className: "danger", text: "Delete assessment" });
  remove.addEventListener("click", () => { menu.open = false; openDeleteDialog(item, trigger); });
  panel.append(edit, remove);
  menu.append(trigger, panel);

  const date = el("p", { className: "assessment-date-line" });
  date.append(document.createTextNode(`${dateLine.prefix}${dateLine.value ? " · " : ""}`));
  if (dateLine.value) date.append(el("time", { datetime: dateLine.value, text: formatDate(dateLine.value) }));

  return el("article", { className: `detail-assessment-row ${item.status}` }, [
    el("div", { className: "assessment-type-mark", text: typeMark(item.assessment_type) }),
    el("div", { className: "detail-assessment-main" }, [
      el("div", { className: "detail-assessment-meta" }, [el("span", { text: humanType(item.assessment_type) }), el("i", { className: item.status, text: item.status === "completed" ? "Result" : "Planned" })]),
      el("h3", { text: item.title }),
      date,
    ]),
    el("dl", { className: "assessment-row-facts" }, [
      el("div", {}, [el("dt", { text: "Course weight" }), el("dd", { text: `${number(item.weight_percentage)}%` })]),
      el("div", {}, [el("dt", { text: item.status === "completed" ? "Score" : "Result" }), el("dd", { text: item.status === "completed" ? `${number(item.score)} / ${number(item.max_score)}` : "Not counted" })]),
    ]),
    el("div", { className: `assessment-result ${item.status}` }, [el("strong", { text: result === null ? "Planned" : percent(result) }), el("span", { text: result === null ? "Awaiting result" : "Result percentage" })]),
    menu,
  ]);
}

function renderAssessmentGroup(title, copy, items) {
  if (!items.length) return null;
  const group = el("section", { className: "assessment-group" });
  group.append(el("header", { className: "assessment-group-head" }, [el("div", {}, [el("h3", { text: title }), el("p", { text: copy })]), el("span", { text: String(items.length) })]));
  for (const item of items) group.append(createAssessmentRow(item));
  return group;
}

function renderAssessments() {
  list.replaceChildren();
  list.classList.remove("assessment-list-loading");
  list.setAttribute("aria-busy", "false");
  document.querySelector("#assessment-filter").hidden = assessments.length === 0;

  const filtered = assessments.filter((item) => activeAssessmentFilter === "all" || item.status === activeAssessmentFilter);
  if (!filtered.length) {
    const trueEmpty = assessments.length === 0;
    const state = el("div", { className: "assessment-empty-state" }, [
      el("div", { className: "assessment-empty-mark", text: trueEmpty ? "+" : "⌕" }),
      el("h3", { text: trueEmpty ? "Build the assessment map." : "Nothing in this view yet." }),
      el("p", { text: trueEmpty ? "Plan what is ahead or record a completed result. Planned work will never be treated as zero." : "Switch back to all assessments to see the complete course plan." }),
    ]);
    if (trueEmpty) {
      const actions = el("div", { className: "assessment-empty-actions" });
      const plan = el("button", { className: "button", type: "button", text: "Plan an assessment" });
      plan.addEventListener("click", () => openAssessmentForm(null, plan));
      const result = el("button", { className: "button secondary", type: "button", text: "Record a result" });
      result.addEventListener("click", () => openAssessmentForm(null, result, "completed"));
      actions.append(plan, result);
      state.append(actions);
    } else {
      const clear = el("button", { className: "button secondary", type: "button", text: "Show all assessments" });
      clear.addEventListener("click", () => setAssessmentFilter("all"));
      state.append(clear);
    }
    list.append(state);
    return;
  }

  const scheduled = filtered.filter((item) => item.status === "planned" && item.scheduled_date).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const completed = filtered.filter((item) => item.status === "completed").sort((a, b) => (b.completed_date || b.scheduled_date || b.created_at || "").localeCompare(a.completed_date || a.scheduled_date || a.created_at || ""));
  const unscheduled = filtered.filter((item) => item.status === "planned" && !item.scheduled_date).sort((a, b) => a.title.localeCompare(b.title));
  const groups = [
    renderAssessmentGroup("Up next", "Planned work with a scheduled date", scheduled),
    renderAssessmentGroup("Results", "Completed work included in the graded average", completed),
    renderAssessmentGroup("Unscheduled", "Planned work waiting for a date", unscheduled),
  ].filter(Boolean);
  list.append(...groups);
}

function renderAssessmentFailure() {
  list.classList.remove("assessment-list-loading");
  list.setAttribute("aria-busy", "false");
  document.querySelector("#assessment-filter").hidden = true;
  const state = el("div", { className: "assessment-empty-state error" }, [
    el("div", { className: "assessment-empty-mark", text: "!" }),
    el("h3", { text: "The assessment plan didn’t load." }),
    el("p", { text: "Your course summary is still available. Reconnect this section when you’re ready." }),
  ]);
  const retry = el("button", { className: "button secondary", type: "button", text: "Try assessments again" });
  retry.addEventListener("click", loadAssessmentData);
  state.append(retry);
  list.replaceChildren(state);
}

async function loadAssessmentData() {
  if (!course) return;
  list.setAttribute("aria-busy", "true");
  try {
    const [nextAssessments, refreshedCourse] = await Promise.all([listAssessments(courseId), getCourse(courseId)]);
    if (!refreshedCourse) {
      showCourseState({ title: "This course is unavailable.", copy: "It may have been removed or may not belong to this account." });
      return;
    }
    assessments = nextAssessments;
    course = refreshedCourse;
    assessmentDataAvailable = true;
    renderCourseSummary(assessments);
    renderAssessments();
  } catch {
    assessmentDataAvailable = false;
    renderCourseSummary(null);
    renderAssessmentFailure();
  }
}

async function initialise() {
  if (!courseId || !UUID_PATTERN.test(courseId)) {
    showCourseState({ title: "This course link isn’t valid.", copy: "Return to your course portfolio and open the course again from there.", canRetry: false });
    return;
  }
  setPageBusy(true);
  hideCourseState();
  const [courseResult, assessmentResult] = await Promise.allSettled([getCourse(courseId), listAssessments(courseId)]);
  if (courseResult.status === "rejected") {
    const missing = courseResult.reason?.code === "PGRST116";
    showCourseState({ title: missing ? "This course is unavailable." : "We couldn’t open this course.", copy: missing ? "It may have been removed or may not belong to this account." : "The course may have been removed, or your connection may have dropped." });
    return;
  }
  course = courseResult.value;
  if (!course) {
    showCourseState({ title: "This course is unavailable.", copy: "It may have been removed or may not belong to this account." });
    return;
  }
  if (assessmentResult.status === "fulfilled") {
    assessments = assessmentResult.value;
    assessmentDataAvailable = true;
    renderCourseSummary(assessments);
    renderAssessments();
  } else {
    assessmentDataAvailable = false;
    renderCourseSummary(null);
    renderAssessmentFailure();
  }
  setPageBusy(false);
}

function updateWeightHelper() {
  const otherWeight = assessments.filter((item) => item.id !== editingAssessment?.id).reduce((sum, item) => sum + (finite(item.weight_percentage) ?? 0), 0);
  const available = Math.max(0, 100 - otherWeight);
  document.querySelector("#weight-helper").textContent = `${number(available)}% is available for this assessment.`;
  form.elements.weight_percentage.dataset.available = String(available);
}

function updateScorePreview() {
  const score = finite(form.elements.score.value);
  const maximum = finite(form.elements.max_score.value);
  const preview = document.querySelector("#score-preview");
  if (score === null || maximum === null || maximum <= 0) preview.textContent = "Enter the score and maximum to preview the result.";
  else if (score > maximum) preview.textContent = "The score earned cannot be greater than the maximum score.";
  else preview.textContent = `Result preview: ${percent(score / maximum * 100)}`;
}

function toggleScoreFields() {
  const complete = form.elements.status.value === "completed";
  document.querySelector("#score-fields").hidden = !complete;
  for (const name of ["score", "max_score"]) form.elements[name].required = complete;
  if (complete) updateScorePreview();
}

function openAssessmentForm(item = null, trigger = document.activeElement, initialStatus = "planned") {
  if (!assessmentDataAvailable) {
    loadAssessmentData();
    return;
  }
  editingAssessment = item;
  lastDialogTrigger = trigger;
  clearFormMessage();
  form.reset();
  form.elements.assessment_id.value = item?.id ?? "";
  form.elements.title.value = item?.title ?? "";
  form.elements.assessment_type.value = item?.assessment_type ?? "assignment";
  form.elements.status.value = item?.status ?? initialStatus;
  form.elements.scheduled_date.value = item?.scheduled_date ?? "";
  form.elements.completed_date.value = item?.completed_date ?? "";
  form.elements.score.value = item?.score ?? "";
  form.elements.max_score.value = item?.max_score ?? "";
  form.elements.weight_percentage.value = item?.weight_percentage ?? "";
  document.querySelector("#assessment-dialog-title").textContent = item ? "Edit assessment" : initialStatus === "completed" ? "Record a result" : "Add assessment";
  updateWeightHelper();
  toggleScoreFields();
  dialog.showModal();
  requestAnimationFrame(() => form.elements.title.focus());
}

function closeAssessmentForm() {
  if (dialog.dataset.busy === "true") return;
  dialog.close();
  lastDialogTrigger?.focus?.();
}

function openDeleteDialog(item, trigger) {
  pendingDelete = item;
  lastDialogTrigger = trigger;
  document.querySelector("#delete-assessment-title").textContent = `Delete ${item.title}?`;
  document.querySelector("#delete-assessment-copy").textContent = item.status === "completed" ? "This result will be removed from the graded average and the course’s academic picture. This cannot be undone." : "This planned assessment will be removed from the course structure. This cannot be undone.";
  document.querySelector("#delete-assessment-message").hidden = true;
  deleteDialog.showModal();
  requestAnimationFrame(() => document.querySelector("#cancel-assessment-delete").focus());
}

function closeDeleteDialog() {
  if (deleteDialog.dataset.busy === "true") return;
  deleteDialog.close();
  lastDialogTrigger?.focus?.();
}

function setAssessmentFilter(filter) {
  activeAssessmentFilter = filter;
  for (const button of document.querySelectorAll("[data-assessment-filter]")) {
    const active = button.dataset.assessmentFilter === filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderAssessments();
}

document.querySelector("#retry-course").addEventListener("click", initialise);
document.querySelector("#add-assessment").addEventListener("click", (event) => openAssessmentForm(null, event.currentTarget));
document.querySelector("#add-assessment-secondary").addEventListener("click", (event) => openAssessmentForm(null, event.currentTarget));
document.querySelector("#next-move-action").addEventListener("click", () => nextMoveHandler());
document.querySelector("#close-assessment-dialog").addEventListener("click", closeAssessmentForm);
document.querySelector("#cancel-assessment-form").addEventListener("click", closeAssessmentForm);
document.querySelector("#cancel-assessment-delete").addEventListener("click", closeDeleteDialog);
form.elements.status.addEventListener("change", toggleScoreFields);
form.elements.score.addEventListener("input", updateScorePreview);
form.elements.max_score.addEventListener("input", updateScorePreview);
for (const button of document.querySelectorAll("[data-assessment-filter]")) button.addEventListener("click", () => setAssessmentFilter(button.dataset.assessmentFilter));

for (const modal of [dialog, deleteDialog]) {
  modal.addEventListener("cancel", (event) => { if (modal.dataset.busy === "true") event.preventDefault(); });
  modal.addEventListener("click", (event) => { if (event.target === modal && modal.dataset.busy !== "true") modal === dialog ? closeAssessmentForm() : closeDeleteDialog(); });
}

document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll(".assessment-row-menu[open]")) if (!menu.contains(event.target)) menu.open = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage();
  const submit = form.querySelector("button[type=submit]");
  const values = Object.fromEntries(new FormData(form));
  const assessmentId = values.assessment_id;
  delete values.assessment_id;
  values.title = values.title.trim();
  values.weight_percentage = Number(values.weight_percentage);
  for (const key of ["scheduled_date", "completed_date"]) values[key] ||= null;
  const available = Number(form.elements.weight_percentage.dataset.available);
  if (!values.title) return showFormError("Add a title for this assessment.");
  if (!Number.isFinite(values.weight_percentage) || values.weight_percentage <= 0) return showFormError("Enter an assessment weight greater than 0%.");
  if (values.weight_percentage > available + 0.0001) return showFormError(`Only ${number(available)}% of the course weight is available.`);
  if (values.status === "completed") {
    values.score = Number(values.score);
    values.max_score = Number(values.max_score);
    if (!Number.isFinite(values.score) || !Number.isFinite(values.max_score) || values.max_score <= 0) return showFormError("Enter both the score earned and a maximum score greater than zero.");
    if (values.score < 0 || values.score > values.max_score) return showFormError("The score earned must be between zero and the maximum score.");
    values.completed_date ||= localDateString();
  } else {
    values.score = null;
    values.max_score = null;
    values.completed_date = null;
  }

  dialog.dataset.busy = "true";
  setBusy(submit, true, "Saving…");
  try {
    await saveAssessment(values, courseId, session.user.id, assessmentId);
    await recomputePulseQuietly(course.semester_id);
    dialog.dataset.busy = "false";
    dialog.close();
    announce(assessmentId ? "Assessment updated." : values.status === "completed" ? "Result added to the course." : "Assessment added to the plan.");
    await loadAssessmentData();
  } catch (error) {
    if (String(error?.message).includes("total assessment weight")) showFormError("Assessment weights cannot total more than 100%.");
    else showFormError("We couldn’t save this assessment. Check the details and try again.");
  } finally {
    dialog.dataset.busy = "false";
    setBusy(submit, false);
  }
});

document.querySelector("#confirm-assessment-delete").addEventListener("click", async (event) => {
  if (!pendingDelete) return;
  const button = event.currentTarget;
  const removed = pendingDelete;
  deleteDialog.dataset.busy = "true";
  setBusy(button, true, "Deleting…");
  document.querySelector("#delete-assessment-message").hidden = true;
  try {
    await deleteAssessment(removed.id, courseId);
    await recomputePulseQuietly(course.semester_id);
    pendingDelete = null;
    deleteDialog.dataset.busy = "false";
    deleteDialog.close();
    announce(`${removed.title} was deleted.`);
    await loadAssessmentData();
  } catch {
    const message = document.querySelector("#delete-assessment-message");
    message.textContent = "We couldn’t delete this assessment. Please try again.";
    message.hidden = false;
  } finally {
    deleteDialog.dataset.busy = "false";
    setBusy(button, false);
  }
});

if (sessionError) showCourseState({ title: "We couldn’t verify your session.", copy: "Check your connection and try again." });
else if (session) await initialise();
