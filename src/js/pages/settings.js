import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { listGradingScales, updatePersonalGradingScale } from "../services/grading.service.js?v=20260831-grading";
import { getProfile, updateProfile } from "../services/profile.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

const session = await requireSession({ requireOnboarding: true });
bindLogout();

const profileForm = document.querySelector("#settings-form");
const scaleList = document.querySelector("#grading-scales");
const scaleDialog = document.querySelector("#grading-scale-dialog");
const scaleForm = document.querySelector("#grading-scale-form");
const bandList = document.querySelector("#grading-band-list");
let scales = [];
let editingBands = [];
let lastDialogTrigger = null;

const number = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value));

function showScaleMessage(message, type = "error", target = "#scale-form-message") {
  const node = document.querySelector(target);
  node.textContent = message;
  node.className = `message ${type}`;
  node.hidden = false;
}

function clearScaleMessage(target = "#scale-form-message") {
  const node = document.querySelector(target);
  node.textContent = "";
  node.className = "message";
  node.hidden = true;
}

function sortedBands(bands) {
  return [...bands].sort((a, b) => Number(b.min_percentage) - Number(a.min_percentage));
}

function renderScales() {
  scaleList.replaceChildren();
  if (!scales.length) {
    scaleList.append(el("div", { className: "settings-empty", text: "No grading scale is available yet. Complete semester setup to create one." }));
    return;
  }

  for (const scale of scales) {
    const bands = sortedBands(scale.grading_bands ?? []);
    const bandGrid = el("div", { className: "scale-band-grid", "aria-label": `${scale.name} grade bands` });
    for (const band of bands) bandGrid.append(el("div", {}, [el("strong", { text: band.letter_grade }), el("span", { text: `${number(band.min_percentage)}–${number(band.max_percentage)}%` }), el("small", { text: `${number(band.grade_point)} pts` })]));
    const heading = el("div", { className: "scale-row-heading" }, [
      el("div", {}, [
        el("strong", { text: scale.name }),
        el("span", { className: "muted", text: `${number(scale.max_gpa)} maximum GPA · ${bands.length} ${bands.length === 1 ? "band" : "bands"}` }),
      ]),
    ]);
    if (!scale.is_system) {
      const edit = el("button", { className: "text-button", type: "button", text: "Edit" });
      edit.addEventListener("click", () => openScaleEditor(scale, edit));
      heading.append(edit);
    }
    scaleList.append(el("article", { className: "scale-row" }, [heading, el("div", { className: `scale-kind ${scale.is_system ? "system" : "personal"}`, text: scale.is_system ? "System scale · read only" : "Personal scale · editable" }), bands.length ? bandGrid : el("p", { text: "No grade bands configured." })]));
  }
}

function bandField(labelText, field, value, options = {}) {
  const label = el("label", { className: "grading-band-field" });
  label.append(el("span", { text: labelText }));
  const input = el("input", {
    type: options.type ?? "number",
    value: value ?? "",
    required: "",
    ...(options.inputmode ? { inputmode: options.inputmode } : {}),
    ...(options.step ? { step: options.step } : {}),
    ...(options.min !== undefined ? { min: options.min } : {}),
    ...(options.max !== undefined ? { max: options.max } : {}),
    ...(options.maxlength ? { maxlength: options.maxlength } : {}),
  });
  input.dataset.bandField = field;
  label.append(input);
  return label;
}

function renderBandEditor() {
  bandList.replaceChildren();
  editingBands.forEach((band, index) => {
    const row = el("section", { className: "grading-band-row" });
    const heading = el("div", { className: "grading-band-row-heading" }, [el("strong", { text: `Band ${index + 1}` })]);
    const remove = el("button", { className: "text-button danger", type: "button", text: "Remove", "aria-label": `Remove grade band ${index + 1}` });
    remove.disabled = editingBands.length <= 2;
    remove.addEventListener("click", () => {
      editingBands = collectBandDrafts();
      editingBands.splice(index, 1);
      renderBandEditor();
    });
    heading.append(remove);
    row.append(
      heading,
      el("div", { className: "grading-band-fields" }, [
        bandField("Letter", "letter_grade", band.letter_grade, { type: "text", maxlength: 12 }),
        bandField("Minimum %", "min_percentage", band.min_percentage, { step: "0.01", min: 0, max: 100, inputmode: "decimal" }),
        bandField("Maximum %", "max_percentage", band.max_percentage, { step: "0.01", min: 0, max: 100, inputmode: "decimal" }),
        bandField("Grade point", "grade_point", band.grade_point, { step: "0.01", min: 0, inputmode: "decimal" }),
      ]),
    );
    bandList.append(row);
  });
  updateCoveragePreview();
}

function updateCoveragePreview() {
  const drafts = collectBandDrafts();
  const ranges = drafts.map((band) => ({ min: Number(band.min_percentage), max: Number(band.max_percentage) })).filter((band) => Number.isFinite(band.min) && Number.isFinite(band.max));
  const covered = ranges.length ? Math.max(0, Math.min(100, Math.max(...ranges.map((band) => band.max)) - Math.min(...ranges.map((band) => band.min)))) : 0;
  const complete = ranges.length >= 2 && Math.min(...ranges.map((band) => band.min)) === 0 && Math.max(...ranges.map((band) => band.max)) === 100;
  document.querySelector("#grading-coverage-label").textContent = complete ? "0–100% covered" : `${number(covered)}% span configured`;
  document.querySelector("#grading-coverage-bar").style.width = `${complete ? 100 : covered}%`;
  document.querySelector("#grading-coverage-copy").textContent = complete ? "Check that adjacent bands have no gaps or overlaps before saving." : "Bands must begin at 0 and finish at 100.";
  document.querySelector(".grading-coverage").classList.toggle("complete", complete);
}

function openScaleEditor(scale, trigger) {
  lastDialogTrigger = trigger;
  clearScaleMessage();
  scaleForm.reset();
  scaleForm.elements.scale_id.value = scale.id;
  scaleForm.elements.name.value = scale.name;
  scaleForm.elements.max_gpa.value = scale.max_gpa;
  editingBands = sortedBands(scale.grading_bands ?? []).map((band) => ({
    letter_grade: band.letter_grade,
    min_percentage: band.min_percentage,
    max_percentage: band.max_percentage,
    grade_point: band.grade_point,
  }));
  renderBandEditor();
  scaleDialog.showModal();
  requestAnimationFrame(() => scaleForm.elements.name.focus());
}

function closeScaleEditor() {
  if (scaleDialog.dataset.busy === "true") return;
  scaleDialog.close();
  lastDialogTrigger?.focus?.();
}

function collectBandDrafts() {
  return [...bandList.querySelectorAll(".grading-band-row")].map((row) => ({
    letter_grade: row.querySelector('[data-band-field="letter_grade"]').value.trim(),
    min_percentage: row.querySelector('[data-band-field="min_percentage"]').value,
    max_percentage: row.querySelector('[data-band-field="max_percentage"]').value,
    grade_point: row.querySelector('[data-band-field="grade_point"]').value,
  }));
}

function collectBands() {
  return collectBandDrafts().map((band) => ({
    letter_grade: band.letter_grade,
    min_percentage: band.min_percentage === "" ? NaN : Number(band.min_percentage),
    max_percentage: band.max_percentage === "" ? NaN : Number(band.max_percentage),
    grade_point: band.grade_point === "" ? NaN : Number(band.grade_point),
  }));
}

function validateBands(bands, maxGpa) {
  if (bands.length < 2) return "Keep at least two grade bands.";
  if (bands.some((band) => !band.letter_grade || ![band.min_percentage, band.max_percentage, band.grade_point].every(Number.isFinite))) return "Complete every field in every grade band.";
  if (bands.some((band) => band.min_percentage < 0 || band.max_percentage > 100 || band.max_percentage < band.min_percentage)) return "Each percentage range must stay between 0 and 100.";
  if (bands.some((band) => band.grade_point < 0 || band.grade_point > maxGpa)) return `Every grade point must be between 0 and ${number(maxGpa)}.`;
  const ascending = [...bands].sort((a, b) => a.min_percentage - b.min_percentage);
  if (ascending[0].min_percentage !== 0 || ascending.at(-1).max_percentage !== 100) return "Grade bands must cover the complete range from 0% through 100%.";
  for (let index = 1; index < ascending.length; index += 1) {
    if (Math.abs(ascending[index].min_percentage - ascending[index - 1].max_percentage - 0.01) > 0.0001) return "Grade bands must be continuous without gaps or overlaps.";
  }
  return null;
}

async function loadScales() {
  scales = await listGradingScales();
  renderScales();
}

async function initialise() {
  const [profileResult, scaleResult] = await Promise.allSettled([getProfile(), listGradingScales()]);
  if (profileResult.status === "fulfilled") {
    const profile = profileResult.value;
    for (const key of ["full_name", "institution_name", "programme", "level", "timezone"]) {
      if (profileForm.elements[key]) profileForm.elements[key].value = profile[key] ?? "";
    }
  } else {
    showMessage("We couldn’t load your academic profile. Refresh and try again.", "error");
    profileForm.querySelector("button[type=submit]").disabled = true;
  }
  if (scaleResult.status === "fulfilled") {
    scales = scaleResult.value;
    renderScales();
  } else {
    scaleList.replaceChildren(el("div", { className: "settings-empty error", text: "We couldn’t load your grading scales. Refresh and try again." }));
  }
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = profileForm.querySelector("button[type=submit]");
  const values = Object.fromEntries(new FormData(profileForm));
  values.full_name = values.full_name.trim();
  values.institution_name = values.institution_name.trim() || null;
  values.programme = values.programme.trim() || null;
  values.timezone = values.timezone.trim() || null;
  values.level = values.level ? Number(values.level) : null;
  setBusy(submit, true, "Saving…");
  try {
    await updateProfile(values);
    showMessage("Profile settings saved.", "success");
  } catch {
    showMessage("We couldn’t save your profile. Check the details and try again.", "error");
  } finally {
    setBusy(submit, false);
  }
});

document.querySelector("#add-grading-band").addEventListener("click", () => {
  editingBands = collectBandDrafts();
  editingBands.push({ letter_grade: "", min_percentage: "", max_percentage: "", grade_point: "" });
  renderBandEditor();
  bandList.lastElementChild?.querySelector("input")?.focus();
});
bandList.addEventListener("input", updateCoveragePreview);
document.querySelector("#close-grading-dialog").addEventListener("click", closeScaleEditor);
document.querySelector("#cancel-grading-scale").addEventListener("click", closeScaleEditor);
scaleDialog.addEventListener("cancel", (event) => { if (scaleDialog.dataset.busy === "true") event.preventDefault(); });
scaleDialog.addEventListener("click", (event) => { if (event.target === scaleDialog) closeScaleEditor(); });

scaleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearScaleMessage();
  const submit = scaleForm.querySelector("button[type=submit]");
  const name = scaleForm.elements.name.value.trim();
  const maxGpa = Number(scaleForm.elements.max_gpa.value);
  const bands = collectBands();
  if (!name) return showScaleMessage("Give this grading scale a name.");
  if (!Number.isFinite(maxGpa) || maxGpa <= 0) return showScaleMessage("Maximum GPA must be greater than zero.");
  const validationError = validateBands(bands, maxGpa);
  if (validationError) return showScaleMessage(validationError);

  scaleDialog.dataset.busy = "true";
  setBusy(submit, true, "Saving…");
  try {
    await updatePersonalGradingScale(scaleForm.elements.scale_id.value, { name, maxGpa, bands });
    await loadScales();
    scaleDialog.dataset.busy = "false";
    scaleDialog.close();
    showScaleMessage("Grading scale saved. Provisional grades now use the updated bands.", "success", "#scale-status");
  } catch (error) {
    const message = String(error?.message ?? "");
    showScaleMessage(message.includes("continuous") || message.includes("cover 0") ? message : "We couldn’t save this grading scale. Review the bands and try again.");
  } finally {
    scaleDialog.dataset.busy = "false";
    setBusy(submit, false);
  }
});

if (session) await initialise();
