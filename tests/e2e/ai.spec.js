import { createServer } from "node:http";
import { expect, test as base } from "@playwright/test";

const USER_ID = "70000000-0000-4000-8000-000000000007";
const SESSION_ID = "77000000-0000-4000-8000-000000000007";
const CONVERSATION_ID = "77700000-0000-4000-8000-000000000007";
const STORAGE_KEY = "sb-amgzepfccrgjppimzuzv-auth-token";
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

const test = base.extend({
  streamServer: async ({}, use) => {
    let connected;
    const response = new Promise((resolve) => { connected = resolve; });
    const sockets = new Set();
    const server = createServer((request, reply) => {
      reply.setHeader("Access-Control-Allow-Origin", "*");
      reply.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, accept");
      reply.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (request.method === "OPTIONS") { reply.writeHead(204); reply.end(); return; }
      request.resume();
      reply.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
      reply.write(event("ready", {})); connected(reply);
    });
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try { await use({ url: `http://127.0.0.1:${server.address().port}/coach`, response }); }
    finally { for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); }
  },
});
test.setTimeout(60_000);

async function openCoach(context, page, streamServer, { legacy = false } = {}) {
  const now = Date.now();
  const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "ai-test@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date(now).toISOString() };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER_ID, session_id: SESSION_ID, role: "authenticated", aud: "authenticated", exp: Math.floor(now / 1000) + 86400 })}.test`;
  await context.addInitScript(({ key, session }) => {
    if (/^https?:$/.test(location.protocol) && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
  }, { key: STORAGE_KEY, session: { access_token: accessToken, refresh_token: "fake-refresh-token", expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, token_type: "bearer", user } });
  await context.route("https://amgzepfccrgjppimzuzv.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/rpc/get_app_session")) return reply({ active: true, session_id: SESSION_ID,
      server_now: new Date().toISOString(), started_at: new Date(now).toISOString(), last_activity_at: new Date().toISOString(),
      idle_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), absolute_expires_at: new Date(now + 8 * 3600_000).toISOString() });
    if (path.endsWith("/profiles")) return reply({ id: USER_ID, onboarding_completed: true });
    if (path.endsWith("/semesters")) return reply({ id: "test-semester", is_current: true });
    if (path.endsWith("/chat_conversations")) return reply([{ id: CONVERSATION_ID, semester_id: "test-semester", title: "Academic coaching" }]);
    if (path.endsWith("/chat_messages")) return reply([]);
    if (path.endsWith("/functions/v1/academic-coach")) {
      expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
      expect(route.request().postDataJSON().stream).toBe(true);
      if (legacy) return reply({ message: { role: "assistant", content: "Complete older response", created_at: new Date().toISOString() } });
      return route.fulfill({ status: 307, headers: { Location: streamServer.url, "Access-Control-Allow-Origin": "*" } });
    }
    throw new Error(`Unexpected AI-test request: ${path}`);
  });
  await page.goto("assistant.html");
  await expect(page.getByRole("heading", { name: "Let’s make your next step clear." })).toBeVisible();
}

async function send(page) {
  await page.getByLabel("Message your academic coach").fill("Help me plan my studies");
  await page.getByRole("button", { name: "Send message" }).click();
}

test("chat displays Unicode safely before completion and formats the saved reply", async ({ context, page, streamServer }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await openCoach(context, page, streamServer); await send(page);
  const reply = await streamServer.response;
  const first = event("delta", { text: "Focus 🎓 " }); const bytes = Buffer.from(first); const split = bytes.indexOf(Buffer.from("🎓")) + 2;
  reply.write(bytes.subarray(0, split)); reply.write(bytes.subarray(split));
  const bubble = page.locator(".chat-message.assistant");
  await expect(bubble).toContainText("Focus 🎓");
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  reply.write(event("delta", { text: "on **one task**. <img src=x onerror=alert(1)>" }));
  reply.end(event("done", { message: { id: "saved", role: "assistant", content: "Focus 🎓 on **one task**. <img src=x onerror=alert(1)>", created_at: new Date().toISOString() } }));
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(bubble).toHaveCount(1); await expect(bubble.locator("strong").last()).toHaveText("one task");
  await expect(bubble.locator("img")).toHaveCount(0); expect(errors).toEqual([]);
});

test("busy provider stream shows a friendly error and restores the input", async ({ context, page, streamServer }) => {
  await openCoach(context, page, streamServer); await send(page);
  (await streamServer.response).end(event("error", { error: "AI_SERVICE_BUSY", status: 503 }));
  await expect(page.locator("#form-message")).toContainText("busy right now");
  await expect(page.locator("#form-message")).not.toContainText("AI_SERVICE_BUSY");
  await expect(page.getByLabel("Message your academic coach")).toHaveValue("Help me plan my studies");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(page.locator(".chat-message.assistant")).toHaveCount(0);
});

test("a cutoff keeps partial text and clearly marks the reply as interrupted", async ({ context, page, streamServer }) => {
  await openCoach(context, page, streamServer); await send(page);
  const reply = await streamServer.response; reply.write(event("delta", { text: "Start with your course" }));
  await expect(page.locator(".chat-message.assistant")).toContainText("Start with your course"); reply.end();
  await expect(page.locator("#form-message")).toContainText("interrupted");
  await expect(page.locator(".chat-message.assistant")).toContainText("Reply interrupted. Please try again.");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});

test("a stalled stream times out after headers have arrived", async ({ context, page, streamServer }) => {
  await openCoach(context, page, streamServer);
  const result = page.evaluate(async (conversationId) => {
    const { sendCoachMessage } = await import("./src/js/services/chat.service.js");
    try { await sendCoachMessage(conversationId, "Timeout check", { onDelta() {}, timeoutMs: 500 }); return "unexpected success"; }
    catch (error) { return error.message; }
  }, CONVERSATION_ID);
  await streamServer.response;
  expect(await result).toContain("took too long");
});

test("streaming client accepts a complete JSON response during deployment", async ({ context, page, streamServer }) => {
  await openCoach(context, page, streamServer, { legacy: true }); await send(page);
  await expect(page.locator(".chat-message.assistant")).toContainText("Complete older response");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});

test("navigation cancels an active chat connection", async ({ context, page, streamServer }) => {
  await openCoach(context, page, streamServer); await send(page);
  const reply = await streamServer.response; let closed = false; reply.on("close", () => { closed = true; });
  reply.write(event("delta", { text: "Partial guidance" }));
  await expect(page.locator(".chat-message.assistant")).toContainText("Partial guidance");
  await page.goto("./"); await expect.poll(() => closed).toBe(true);
});
