import { supabase } from "../config/supabase.js";
import { setBusy, showMessage } from "../utils/forms.js";

const form = document.querySelector("#signup-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
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
  if (error) return showMessage(error.message, "error");
  if (data.session) window.location.replace("onboarding.html");
  else { form.reset(); showMessage("Account created. Check your email to confirm your address, then sign in.", "success"); }
});
