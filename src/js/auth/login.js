import { supabase } from "../config/supabase.js";
import { routeSignedInUser } from "./session.js";
import { setBusy, showMessage } from "../utils/forms.js";

await routeSignedInUser().catch(() => false);
const form = document.querySelector("#login-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button[type=submit]");
  const values = new FormData(form);
  setBusy(submit, true, "Signing in…");
  const { error } = await supabase.auth.signInWithPassword({ email: String(values.get("email")).trim(), password: String(values.get("password")) });
  if (error) { setBusy(submit, false); return showMessage(error.message, "error"); }
  await routeSignedInUser();
});
