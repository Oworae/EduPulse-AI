import { readSseEvents } from "../../../src/js/utils/sse.js";

const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
const GENERATION_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
type Options = { signal?: AbortSignal; timeoutMs?: number };
type Candidate = {
  content?: { parts?: { text?: string; thought?: boolean }[] };
  finishReason?: string;
};
type GeminiResponse = { candidates?: Candidate[]; error?: { code?: number } };

class ProviderError extends Error {
  constructor(readonly status: number, readonly retryAfterMs = 0) {
    super(RETRYABLE.has(status) ? "AI_SERVICE_BUSY" : "AI_SERVICE_UNAVAILABLE");
  }
}

function textParts(candidate?: Candidate) {
  return (candidate?.content?.parts ?? []).filter((part) => !part.thought)
    .map((part) => typeof part.text === "string" ? part.text : "").join("");
}
function ensureComplete(candidate?: Candidate) {
  if (candidate?.finishReason !== "STOP") {
    throw new Error("AI_SERVICE_INCOMPLETE");
  }
}
function retryAfter(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - Date.now()) || 0;
}
function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function generate(
  prompt: string,
  jsonMode: boolean,
  onText: ((text: string) => void) | undefined,
  { signal: parentSignal, timeoutMs = GENERATION_TIMEOUT_MS }: Options,
): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  const model = modelName();
  if (!key) throw new Error("AI_SERVICE_UNAVAILABLE");
  const controller = new AbortController();
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, controller.signal])
    : controller.signal;
  const started = performance.now();
  const deadline = setTimeout(
    () =>
      controller.abort(
        new DOMException("Generation timed out", "TimeoutError"),
      ),
    timeoutMs,
  );
  let deliveredText = false;
  let attempts = 0;
  let firstTextMs: number | undefined;
  let outcome = "failed";
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      signal.throwIfAborted();
      attempts++;
      try {
        const method = onText
          ? "streamGenerateContent?alt=sse"
          : "generateContent";
        const response = await fetch(
          `${endpoint}/${encodeURIComponent(model)}:${method}`,
          {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: jsonMode ? 8192 : 4096,
                ...(/^gemini-3[.\-]/.test(model)
                  ? {
                    thinkingConfig: {
                      thinkingLevel: "LOW",
                      includeThoughts: false,
                    },
                  }
                  : {}),
                ...(jsonMode ? { responseMimeType: "application/json" } : {}),
              },
            }),
          },
        );
        if (!response.ok) {
          const delay = retryAfter(response);
          await response.body?.cancel();
          console.warn("Gemini request failed", {
            status: response.status,
            attempt: attempts,
          });
          throw new ProviderError(response.status, delay);
        }
        let text = "";
        if (onText) {
          if (!response.body) throw new Error("AI_SERVICE_UNAVAILABLE");
          let completed = false;
          for await (const event of readSseEvents(response.body, { signal })) {
            if (event.data === "[DONE]") continue;
            const data: GeminiResponse = JSON.parse(event.data);
            if (data.error) throw new ProviderError(data.error.code ?? 500);
            const candidate = data.candidates?.[0];
            if (candidate?.finishReason && candidate.finishReason !== "STOP") {
              ensureComplete(candidate);
            }
            const delta = textParts(candidate);
            if (delta) {
              firstTextMs ??= Math.round(performance.now() - started);
              deliveredText = true;
              text += delta;
              onText(delta);
            }
            if (candidate?.finishReason === "STOP") {
              completed = true;
              break;
            }
          }
          if (!completed) throw new Error("AI_SERVICE_INCOMPLETE");
        } else {
          const data: GeminiResponse = await response.json();
          ensureComplete(data.candidates?.[0]);
          text = textParts(data.candidates?.[0]);
        }
        signal.throwIfAborted();
        if (!text.trim()) throw new Error("AI_SERVICE_UNAVAILABLE");
        outcome = "completed";
        return text.trim();
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        const transient = error instanceof ProviderError
          ? RETRYABLE.has(error.status)
          : error instanceof TypeError;
        if (!transient || deliveredText || attempt === MAX_ATTEMPTS - 1) {
          throw error;
        }
        const delay = Math.max(
          500 * 2 ** attempt + Math.floor(Math.random() * 250),
          error instanceof ProviderError ? error.retryAfterMs : 0,
        );
        if (delay > 5000 || performance.now() - started + delay >= timeoutMs) {
          throw error;
        }
        await pause(delay, signal);
      }
    }
    throw new Error("AI_SERVICE_BUSY");
  } catch (error) {
    if (signal.aborted) {
      if (
        signal.reason instanceof DOMException &&
        signal.reason.name === "TimeoutError"
      ) {
        outcome = "timeout";
        throw new Error("AI_SERVICE_TIMEOUT");
      }
      outcome = "cancelled";
      throw signal.reason;
    }
    if (deliveredText) throw new Error("AI_SERVICE_INTERRUPTED");
    if (error instanceof Error && error.message.startsWith("AI_SERVICE_")) {
      throw error;
    }
    throw new Error("AI_SERVICE_UNAVAILABLE");
  } finally {
    clearTimeout(deadline);
    console.info("Gemini request timing", {
      outcome,
      attempts,
      total_ms: Math.round(performance.now() - started),
      first_text_ms: firstTextMs,
    });
  }
}

export function callGemini(
  prompt: string,
  jsonMode = false,
  options: Options = {},
) {
  return generate(prompt, jsonMode, undefined, options);
}
export function streamGemini(
  prompt: string,
  onText: (text: string) => void,
  options: Options = {},
) {
  return generate(prompt, false, onText, options);
}
export function modelName() {
  return Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
}
