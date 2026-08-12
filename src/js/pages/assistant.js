import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { createConversation, listConversations, listMessages, sendCoachMessage } from "../services/chat.service.js";
import { getCurrentSemester } from "../services/semester.service.js";
import { el, formattedText } from "../utils/dom.js";
import { showMessage } from "../utils/forms.js";

await requireSession({ requireOnboarding: true }); bindLogout(); const semester = await getCurrentSemester(); let conversationId;
const messages = document.querySelector("#messages"); const form = document.querySelector("#coach-form"); const input = form.elements.message; const submit = form.querySelector("button[type=submit]"); const starters = document.querySelector("#coach-starters");
async function ensureConversation() { const conversations = await listConversations(); const current = conversations.find((item) => item.semester_id === semester.id) ?? await createConversation(semester.id); conversationId = current.id; document.querySelector("#conversation-title").textContent = current.title; }
function messageTime(value) { return value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now"; }
function appendMessage(message) {
  const role = message.role === "assistant" ? "assistant" : "user";
  const bubble = el("article", { className: `chat-message ${role}` }, [el("div", { className: "message-meta" }, [el("strong", { text: role === "assistant" ? "EduPulse coach" : "You" }), el("time", { text: messageTime(message.created_at) })]), formattedText(message.content)]);
  messages.append(bubble); messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
}
function showWelcome() {
  messages.append(el("section", { className: "coach-welcome" }, [el("div", { className: "welcome-mark", text: "✦" }), el("h2", { text: "Let’s make your next step clear." }), el("p", { text: "Ask me to explain your current performance, compare priorities, or turn your academic signals into a practical plan." })]));
  starters.hidden = false;
}
async function renderMessages() { messages.replaceChildren(); const history = await listMessages(conversationId); if (!history.length) showWelcome(); else { starters.hidden = true; for (const message of history) appendMessage(message); } }
function resizeInput() { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; }
function setSending(sending) { submit.disabled = sending; submit.classList.toggle("sending", sending); form.setAttribute("aria-busy", String(sending)); }
function addTypingIndicator() { const indicator = el("div", { className: "typing-indicator", role: "status", "aria-label": "EduPulse coach is thinking" }, [el("i"), el("i"), el("i")]); messages.append(indicator); messages.scrollTop = messages.scrollHeight; return indicator; }
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const text = input.value.trim(); if (!text || submit.disabled) return;
  document.querySelector("#form-message").hidden = true; starters.hidden = true; input.value = ""; resizeInput(); appendMessage({ role: "user", content: text }); setSending(true); const typing = addTypingIndicator();
  try { const response = await sendCoachMessage(conversationId, text); typing.remove(); appendMessage(response); }
  catch (error) { typing.remove(); showMessage(error.message || "The academic coach is unavailable right now. Please try again.", "error"); input.value = text; resizeInput(); }
  finally { setSending(false); input.focus(); }
});
input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
for (const starter of document.querySelectorAll("[data-prompt]")) starter.addEventListener("click", () => { input.value = starter.dataset.prompt; resizeInput(); input.focus(); });
await ensureConversation(); await renderMessages();
