import { requireSession } from "../auth/guards.js";
import { getProfile } from "../services/profile.service.js";
import { completeOnboarding } from "../services/onboarding.service.js";
import { setBusy, showMessage } from "../utils/forms.js";

await requireSession({ requireOnboarding: false });
const form = document.querySelector("#onboarding-form");
const profile = await getProfile();
form.elements.full_name.value = profile.full_name === "Student" ? "" : profile.full_name;
const year = new Date().getFullYear();
form.elements.academic_year.value = `${year}/${year + 1}`;
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button[type=submit]");
  const data = Object.fromEntries(new FormData(form));
  data.level = data.level ? Number(data.level) : null;
  data.target_average = data.target_average ? Number(data.target_average) : null;
  setBusy(submit, true, "Setting up your workspace…");
  try { await completeOnboarding(data); window.location.replace("dashboard.html"); }
  catch (error) { setBusy(submit, false); showMessage(error.message, "error"); }
});
