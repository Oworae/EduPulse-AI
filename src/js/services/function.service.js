import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "../config/supabase.js";
import { readSseEvents } from "../utils/sse.js";
import { aiRequestError } from "../utils/forms.js?v=20260915-ai";

function requestError(status, payload) {
  const diagnostic = String(payload?.error || payload?.message || payload?.msg || "");
  if (status === 401 || /session|jwt|unauthori[sz]ed/i.test(diagnostic)) return aiRequestError("ai_session_expired");
  if (/AI_SERVICE_TIMEOUT/.test(diagnostic) || status === 504) return aiRequestError("ai_timeout");
  if (/AI_SERVICE_INTERRUPTED|AI_SERVICE_INCOMPLETE/.test(diagnostic)) return aiRequestError("ai_interrupted");
  if (/AI_SERVICE_BUSY|high demand|overload|\b429\b|\b503\b/i.test(diagnostic)) return aiRequestError("ai_busy");
  if (/AI_SERVICE_|Gemini|model|server configuration/i.test(diagnostic) || status >= 500) return aiRequestError("ai_unavailable");
  return aiRequestError("ai_invalid");
}

export async function invokeFunction(name, body, { onDelta, signal, timeoutMs = 70_000 } = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Your session has expired. Please sign in again.");
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException("Request cancelled", "AbortError"));
  const deadline = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  window.addEventListener("pagehide", abort, { once: true });
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
      method: "POST",
      signal: requestSignal,
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        ...(onDelta ? { "Accept": "text/event-stream" } : {}),
      },
      body: JSON.stringify(body),
    });
    if (response.ok && response.headers.get("content-type")?.includes("text/event-stream")) {
      if (!response.body) throw requestError(502, { error: "AI_SERVICE_INTERRUPTED" });
      for await (const event of readSseEvents(response.body, { signal: requestSignal })) {
        let data;
        try { data = JSON.parse(event.data); }
        catch { throw requestError(502, { error: "AI_SERVICE_INTERRUPTED" }); }
        if (!data || typeof data !== "object") throw requestError(502, { error: "AI_SERVICE_INTERRUPTED" });
        if (event.event === "delta" && typeof data.text === "string") onDelta?.(data.text);
        if (event.event === "error") throw requestError(data.status ?? 502, data);
        if (event.event === "done") {
          if (data.message?.role !== "assistant" || typeof data.message.content !== "string" || !data.message.content.trim()) throw requestError(502, { error: "AI_SERVICE_INTERRUPTED" });
          return data;
        }
      }
      throw requestError(502, { error: "AI_SERVICE_INTERRUPTED" });
    }
    const text = await response.text(); let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) throw requestError(response.status, payload);
    if (!payload) throw new Error("The server returned an empty response.");
    return payload;
  } catch (error) {
    if (requestSignal.aborted && requestSignal.reason?.name === "TimeoutError") throw requestError(504, { error: "AI_SERVICE_TIMEOUT" });
    if (error instanceof TypeError) throw aiRequestError("ai_network");
    throw error;
  } finally {
    clearTimeout(deadline); window.removeEventListener("pagehide", abort);
  }
}
