export function showMessage(message, type = "info") {
  const element = document.querySelector("#form-message");
  if (!element) return;
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = false;
}
export function setBusy(button, busy, label) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy; button.textContent = busy ? label : button.dataset.label;
}
