export function showMessage(message, type = "info") {
  const element = document.querySelector("#form-message");
  if (!element) return;
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = false;
}

// Never display raw provider/database errors: they can expose constraint names,
// configuration details, and other implementation information.
export function userMessage(error, fallback = "Something went wrong. Please try again.") {
  const code = String(error?.code ?? "").toLowerCase();
  const detail = String(error?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || /invalid login credentials/.test(detail)) return "The email or password is incorrect.";
  if (code === "email_not_confirmed" || /email not confirmed/.test(detail)) return "Confirm your email address before signing in.";
  if (code === "user_already_exists" || /already registered|already exists/.test(detail)) return "An account already exists for this email address.";
  if (code === "over_email_send_rate_limit" || /rate limit|too many requests/.test(detail)) return "Too many attempts were made. Wait a little, then try again.";
  if (/failed to fetch|network|load failed/.test(detail)) return "We couldn’t connect right now. Check your internet connection and try again.";
  return fallback;
}
export function setBusy(button, busy, label) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy; button.textContent = busy ? label : button.dataset.label;
}
