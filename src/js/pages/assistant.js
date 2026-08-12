import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { createConversation, listConversations, listMessages, sendCoachMessage } from "../services/chat.service.js";
import { getCurrentSemester } from "../services/semester.service.js";
import { el, formattedText } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

await requireSession({ requireOnboarding: true }); bindLogout(); const semester = await getCurrentSemester(); let conversationId;
const messages = document.querySelector("#messages"); const form = document.querySelector("#coach-form");
async function ensureConversation() { const conversations = await listConversations(); const current = conversations.find((item) => item.semester_id === semester.id) ?? await createConversation(semester.id); conversationId = current.id; document.querySelector("#conversation-title").textContent = current.title; }
function appendMessage(message) { const bubble = el("article", { className: `chat-message ${message.role}` }, [el("span", { text: message.role === "assistant" ? "EduPulse coach" : "You" }), formattedText(message.content)]); messages.append(bubble); messages.scrollTop = messages.scrollHeight; }
async function renderMessages() { messages.replaceChildren(); const history = await listMessages(conversationId); if (!history.length) messages.append(el("div", { className: "coach-welcome card", text: "Ask which course needs attention, how your attendance relates to performance, or what to prioritize this week." })); else for (const message of history) appendMessage(message); }
form.addEventListener("submit", async (event) => { event.preventDefault(); const input = form.elements.message; const text = input.value.trim(); if (!text) return; const submit = form.querySelector("button"); input.value = ""; appendMessage({ role: "user", content: text }); setBusy(submit, true, "Thinking…"); try { appendMessage(await sendCoachMessage(conversationId, text)); } catch (error) { showMessage(error.message || "The academic coach is unavailable right now.", "error"); input.value = text; } finally { setBusy(submit, false); } });
await ensureConversation(); await renderMessages();
