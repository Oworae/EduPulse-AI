import { callGemini, canFallback, modelName, streamGemini } from "./gemini.ts";
import { callClaude, claudeModelName } from "./claude.ts";

type Options = { signal?: AbortSignal; timeoutMs?: number };
export type AiResult = {
  text: string;
  model: string;
  provider: "gemini" | "claude";
};

async function generate(
  prompt: string,
  jsonMode: boolean,
  onText: ((text: string) => void) | undefined,
  { signal: parentSignal, timeoutMs = 45_000 }: Options,
): Promise<AiResult> {
  const backupEnabled = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
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
  const emit = onText
    ? (text: string) => {
      deliveredText = true;
      onText(text);
    }
    : undefined;
  try {
    const options = {
      signal,
      timeoutMs: backupEnabled ? Math.min(25_000, timeoutMs * 0.55) : timeoutMs,
      maxAttempts: backupEnabled ? 2 : 3,
    };
    try {
      const text = emit
        ? await streamGemini(prompt, emit, options)
        : await callGemini(prompt, jsonMode, options);
      return { text, model: modelName(), provider: "gemini" };
    } catch (error) {
      signal.throwIfAborted();
      if (!backupEnabled || deliveredText || !canFallback(error)) throw error;
      console.info("AI provider fallback", {
        from: "gemini",
        to: "claude",
        reason: error instanceof Error
          ? error.message
          : "AI_SERVICE_UNAVAILABLE",
        elapsed_ms: Math.round(performance.now() - started),
      });
      const text = await callClaude(prompt, jsonMode, emit, {
        signal,
        timeoutMs: Math.max(1, timeoutMs - (performance.now() - started)),
      });
      return { text, model: claudeModelName(), provider: "claude" };
    }
  } catch (error) {
    if (signal.aborted) {
      if (
        signal.reason instanceof DOMException &&
        signal.reason.name === "TimeoutError"
      ) {
        throw new Error("AI_SERVICE_TIMEOUT");
      }
      throw signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

export function callAI(
  prompt: string,
  jsonMode = false,
  options: Options = {},
) {
  return generate(prompt, jsonMode, undefined, options);
}
export function streamAI(
  prompt: string,
  onText: (text: string) => void,
  options: Options = {},
) {
  return generate(prompt, false, onText, options);
}
