import { readSseEvents } from "../../../src/js/utils/sse.js";
import { insightSchema } from "./insight-schema.ts";

type Options = { signal?: AbortSignal; timeoutMs?: number };
type ClaudeEvent = {
  type?: string;
  content_block?: { type?: string; text?: string };
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  error?: { type?: string };
};

export function claudeModelName() {
  return Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-4-5-20251001";
}

function providerFailure(status: number) {
  return new Error(
    [429, 500, 502, 503, 504, 529].includes(status)
      ? "AI_SERVICE_BUSY"
      : "AI_SERVICE_UNAVAILABLE",
  );
}

// One backup attempt; the caller owns the deadline shared with Gemini.
export async function callClaude(
  prompt: string,
  jsonMode = false,
  onText?: (text: string) => void,
  { signal: parentSignal, timeoutMs = 20_000 }: Options = {},
): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("AI_SERVICE_UNAVAILABLE");
  const controller = new AbortController();
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, controller.signal])
    : controller.signal;
  const deadline = setTimeout(
    () =>
      controller.abort(
        new DOMException("Generation timed out", "TimeoutError"),
      ),
    timeoutMs,
  );
  const started = performance.now();
  let deliveredText = false;
  let firstTextMs: number | undefined;
  let outcome = "failed";
  try {
    signal.throwIfAborted();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: claudeModelName(),
        max_tokens: jsonMode ? 8192 : 4096,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
        stream: Boolean(onText),
        ...(jsonMode
          ? {
            output_config: {
              format: { type: "json_schema", schema: insightSchema },
            },
          }
          : {}),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.warn("Claude request failed", { status: response.status });
      throw providerFailure(response.status);
    }
    let text = "";
    if (onText) {
      if (!response.body) throw new Error("AI_SERVICE_UNAVAILABLE");
      let stopReason: string | null | undefined;
      let completed = false;
      for await (const event of readSseEvents(response.body, { signal })) {
        const data: ClaudeEvent = JSON.parse(event.data);
        if (data.type === "error") {
          const status = data.error?.type === "overloaded_error"
            ? 529
            : data.error?.type === "rate_limit_error"
            ? 429
            : data.error?.type === "api_error"
            ? 500
            : 502;
          console.warn("Claude stream failed", { status });
          throw providerFailure(status);
        }
        if (data.type === "message_delta" && data.delta?.stop_reason) {
          stopReason = data.delta.stop_reason;
          if (stopReason !== "end_turn") {
            throw new Error("AI_SERVICE_INCOMPLETE");
          }
        }
        const delta = data.type === "content_block_start" &&
            data.content_block?.type === "text"
          ? data.content_block.text
          : data.type === "content_block_delta" &&
              data.delta?.type === "text_delta"
          ? data.delta.text
          : undefined;
        if (typeof delta === "string" && delta) {
          firstTextMs ??= Math.round(performance.now() - started);
          deliveredText = true;
          text += delta;
          onText(delta);
        }
        if (data.type === "message_stop") {
          if (stopReason !== "end_turn") {
            throw new Error("AI_SERVICE_INCOMPLETE");
          }
          completed = true;
          break;
        }
      }
      if (!completed) throw new Error("AI_SERVICE_INCOMPLETE");
    } else {
      const data: {
        stop_reason?: string;
        content?: { type?: string; text?: string }[];
      } = await response.json();
      if (data.stop_reason !== "end_turn") {
        throw new Error("AI_SERVICE_INCOMPLETE");
      }
      text = (data.content ?? []).filter((part) => part.type === "text")
        .map((part) => typeof part.text === "string" ? part.text : "").join("");
    }
    signal.throwIfAborted();
    if (!text.trim()) throw new Error("AI_SERVICE_UNAVAILABLE");
    outcome = "completed";
    return text.trim();
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
    console.info("Claude request timing", {
      outcome,
      total_ms: Math.round(performance.now() - started),
      first_text_ms: firstTextMs,
    });
  }
}
