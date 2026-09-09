import { supabase } from "../config/supabase.js";
import { routeSignedInUser } from "./session.js";
import { showMessage } from "../utils/forms.js";

await routeSignedInUser().catch(() => false);
const form = document.querySelector("#login-form");
const email = form.elements.email; const password = form.elements.password;
function setBusy(button, busy, label) { button.disabled = busy; button.querySelector(".submit-label").textContent = busy ? label : "Sign in"; form.setAttribute("aria-busy", String(busy)); }
function fieldError(input, message = "") { const field = input.closest(".auth-field"); field.classList.toggle("invalid", Boolean(message)); field.classList.toggle("valid", !message && Boolean(input.value.trim())); input.setAttribute("aria-invalid", String(Boolean(message))); field.querySelector(".field-error").textContent = message; }
function validate() { fieldError(email, !email.value.trim() ? "Enter your email address." : !email.validity.valid ? "Enter a valid email address." : ""); fieldError(password, !password.value ? "Enter your password." : password.value.length < 8 ? "Your password must contain at least 8 characters." : ""); return form.querySelectorAll(".auth-field.invalid").length === 0; }
for (const input of [email, password]) input.addEventListener("input", () => fieldError(input));
document.querySelector(".password-toggle").addEventListener("click", (event) => { const button = event.currentTarget; const visible = password.type === "text"; password.type = visible ? "password" : "text"; button.setAttribute("aria-pressed", String(!visible)); button.setAttribute("aria-label", visible ? "Show password" : "Hide password"); button.firstElementChild.textContent = visible ? "Show" : "Hide"; password.focus(); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validate()) { form.querySelector(".auth-field.invalid input")?.focus(); return; }
  const submit = form.querySelector("button[type=submit]");
  const values = new FormData(form);
  setBusy(submit, true, "Signing in…");
  const { error } = await supabase.auth.signInWithPassword({ email: String(values.get("email")).trim(), password: String(values.get("password")) });
  if (error) { setBusy(submit, false); showMessage(error.message, "error"); document.querySelector("#form-message").focus(); return; }
  await routeSignedInUser();
});
