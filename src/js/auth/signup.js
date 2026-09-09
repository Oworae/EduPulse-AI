import { supabase } from "../config/supabase.js";
import { showMessage } from "../utils/forms.js";

const form = document.querySelector("#signup-form");
const fullName = form.elements.full_name; const email = form.elements.email; const password = form.elements.password; const confirmation = form.elements.confirm_password;
function setBusy(button, busy, label) { button.disabled = busy; button.querySelector(".submit-label").textContent = busy ? label : "Create account"; form.setAttribute("aria-busy", String(busy)); }
function fieldError(input, message = "") { const field = input.closest(".auth-field"); field.classList.toggle("invalid", Boolean(message)); field.classList.toggle("valid", !message && Boolean(input.value.trim())); input.setAttribute("aria-invalid", String(Boolean(message))); field.querySelector(".field-error").textContent = message; }
function updateStrength() { const value = password.value; const checks = { length: value.length >= 8, letter: /[a-z]/i.test(value), number: /\d/.test(value) }; Object.entries(checks).forEach(([key, met]) => document.querySelector(`[data-requirement="${key}"]`).classList.toggle("met", met)); document.querySelector("#password-guidance").dataset.strength = String(Object.values(checks).filter(Boolean).length); if (confirmation.value) fieldError(confirmation, confirmation.value === value ? "" : "Passwords do not match."); }
function validate() { fieldError(fullName, !fullName.value.trim() ? "Enter your full name." : ""); fieldError(email, !email.value.trim() ? "Enter your email address." : !email.validity.valid ? "Enter a valid email address." : ""); fieldError(password, password.value.length < 8 ? "Use at least 8 characters." : ""); fieldError(confirmation, !confirmation.value ? "Enter your password again." : confirmation.value !== password.value ? "Passwords do not match." : ""); return form.querySelectorAll(".auth-field.invalid").length === 0; }
for (const input of [fullName, email]) input.addEventListener("input", () => fieldError(input)); password.addEventListener("input", () => { fieldError(password); updateStrength(); }); confirmation.addEventListener("input", updateStrength);
for (const button of document.querySelectorAll(".password-toggle")) button.addEventListener("click", () => { const input = button.parentElement.querySelector("input"); const visible = input.type === "text"; input.type = visible ? "password" : "text"; button.setAttribute("aria-pressed", String(!visible)); button.setAttribute("aria-label", visible ? "Show password" : "Hide password"); button.firstElementChild.textContent = visible ? "Show" : "Hide"; input.focus(); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validate()) { form.querySelector(".auth-field.invalid input")?.focus(); return; }
  const submit = form.querySelector("button[type=submit]");
  const values = new FormData(form);
  const password = values.get("password");
  if (password !== values.get("confirm_password")) return showMessage("Passwords do not match.", "error");
  setBusy(submit, true, "Creating account…");
  const { data, error } = await supabase.auth.signUp({
    email: String(values.get("email")).trim(), password: String(password),
    options: { data: { full_name: String(values.get("full_name")).trim() }, emailRedirectTo: new URL("login.html", location.href).href },
  });
  setBusy(submit, false);
  if (error) { showMessage(error.message, "error"); document.querySelector("#form-message").focus(); return; }
  if (data.session) window.location.replace("onboarding.html");
  else { form.reset(); showMessage("Account created. Check your email to confirm your address, then sign in.", "success"); }
});
