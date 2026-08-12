import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js";
import { listGradingScales } from "../services/grading.service.js";
import { getProfile, updateProfile } from "../services/profile.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";
await requireSession({ requireOnboarding: true }); bindLogout(); const form = document.querySelector("#settings-form"); const profile = await getProfile(); for (const key of ["full_name", "institution_name", "programme", "level", "timezone"]) if (form.elements[key]) form.elements[key].value = profile[key] ?? "";
const scales = await listGradingScales(); const list = document.querySelector("#grading-scales"); for (const scale of scales) { const bands = [...scale.grading_bands].sort((a,b) => b.min_percentage-a.min_percentage).map((b) => `${b.letter_grade} ${b.min_percentage}–${b.max_percentage}%`).join(" · "); list.append(el("article", { className: "scale-row card" }, [el("strong", { text: scale.name }), el("span", { className: "muted", text: `${scale.max_gpa} max GPA` }), el("p", { text: bands })])); }
form.addEventListener("submit", async (event) => { event.preventDefault(); const submit = form.querySelector("button"); const values = Object.fromEntries(new FormData(form)); values.level = values.level ? Number(values.level) : null; setBusy(submit, true, "Saving…"); try { await updateProfile(values); showMessage("Profile settings saved.", "success"); } catch (error) { showMessage(error.message, "error"); } finally { setBusy(submit, false); } });
