import { requireSession } from "../auth/guards.js";
import { getProfile } from "../services/profile.service.js";
import { completeOnboarding } from "../services/onboarding.service.js?v=20260831-atomic";
import { setBusy, showMessage, userMessage } from "../utils/forms.js";

await requireSession({ requireOnboarding: false });
const form = document.querySelector("#onboarding-form");
const profile = await getProfile();
form.elements.full_name.value = profile.full_name === "Student" ? "" : profile.full_name;
const year = new Date().getFullYear();
form.elements.academic_year.value = `${year}/${year + 1}`;
const startDate = form.elements.start_date;
const endDate = form.elements.end_date;
const dateHelp = document.querySelector("#semester-date-help");
startDate.setAttribute("aria-describedby", dateHelp.id);
endDate.setAttribute("aria-describedby", dateHelp.id);
function syncDates() {
  endDate.min = startDate.value;
  const invalidOrder = Boolean(startDate.value && endDate.value && endDate.value < startDate.value);
  endDate.setCustomValidity(invalidOrder ? "End date must be on or after the start date." : "");
}
startDate.addEventListener("change", syncDates);
endDate.addEventListener("change", syncDates);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncDates();
  if (!form.reportValidity()) return;
  const submit = form.querySelector("button[type=submit]");
  const data = Object.fromEntries(new FormData(form));
  data.level = data.level ? Number(data.level) : null;
  data.target_average = data.target_average ? Number(data.target_average) : null;
  setBusy(submit, true, "Setting up your workspace…");
  try { await completeOnboarding(data); window.location.replace("dashboard.html"); }
  catch (error) { setBusy(submit, false); showMessage(userMessage(error, "We couldn’t finish setting up your account. Check the details and try again."), "error"); document.querySelector("#form-message").focus(); }
});
