import { callGemini, streamGemini } from "./gemini.ts";
import { handleCoachRequest } from "../academic-coach/handler.ts";
import { readSseEvents } from "../../../src/js/utils/sse.js";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(operation: () => Promise<unknown>, message: string) {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof Error && error.message === message,
      "Unexpected failure code",
    );
    return;
  }
  throw new Error("Expected operation to fail");
}
const encoder = new TextEncoder();
const frame = (text: string, finish = false) =>
  `data: ${
    JSON.stringify({
      candidates: [{
        content: { parts: [{ text }] },
        ...(finish ? { finishReason: "STOP" } : {}),
      }],
    })
  }\n\n`;
const answer = () =>
  new Response(
    JSON.stringify({
      candidates: [{
        content: { parts: [{ text: "Useful advice" }] },
        finishReason: "STOP",
      }],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
type Logs = unknown[][];
async function mocked(
  mockFetch: typeof fetch,
  operation: (logs: Logs) => Promise<void>,
) {
  const values = {
    GEMINI_API_KEY: "fake-provider-key",
    GEMINI_MODEL: "gemini-3.6-flash",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "fake-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, Deno.env.get(key)]),
  );
  const original = {
    fetch: globalThis.fetch,
    info: console.info,
    warn: console.warn,
  };
  const logs: Logs = [];
  globalThis.fetch = mockFetch;
  console.info = (...args) => logs.push(args);
  console.warn = (...args) => logs.push(args);
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  try {
    await operation(logs);
  } finally {
    globalThis.fetch = original.fetch;
    console.info = original.info;
    console.warn = original.warn;
    for (const [key, value] of Object.entries(previous)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
}

Deno.test("Gemini retries temporary overload within one generation and uses low thinking", async () => {
  let calls = 0;
  await mocked(async (input, init) => {
    calls++;
    assert(
      !String(input).includes("fake-provider-key"),
      "Key must not appear in URL",
    );
    const config = JSON.parse(String(init?.body)).generationConfig;
    assert(config.thinkingConfig.thinkingLevel === "LOW");
    return calls < 3 ? new Response("Overloaded", { status: 503 }) : answer();
  }, async (logs) => {
    assert(await callGemini("private student prompt") === "Useful advice");
    assert(calls === 3);
    const logged = JSON.stringify(logs);
    assert(
      !logged.includes("fake-provider-key") &&
        !logged.includes("private student prompt"),
      "Timing logs must contain no credentials or prompts",
    );
  });
});

Deno.test("Permanent provider failure is controlled and is not retried", async () => {
  let calls = 0;
  await mocked(async () => {
    calls++;
    return new Response("private provider diagnostics", { status: 400 });
  }, async () => {
    await rejects(() => callGemini("prompt"), "AI_SERVICE_UNAVAILABLE");
    assert(calls === 1);
  });
});

Deno.test("Long Retry-After is respected without extending the deadline", async () => {
  let calls = 0;
  await mocked(async () => {
    calls++;
    return new Response("Quota", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }, async () => {
    await rejects(() => callGemini("prompt"), "AI_SERVICE_BUSY");
    assert(calls === 1);
  });
});

Deno.test("A stalled generation header request times out", async () => {
  await mocked((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    }), async () => {
    await rejects(
      () => callGemini("prompt", false, { timeoutMs: 30 }),
      "AI_SERVICE_TIMEOUT",
    );
  });
});

Deno.test("Streaming handles split Unicode and skips thoughts", async () => {
  const payload = `data: ${
    JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: "private reasoning", thought: true }, {
            text: "Focus 🎓",
          }, { text: " today" }],
        },
        finishReason: "STOP",
      }],
    })
  }\r\n\r\n`;
  const bytes = encoder.encode(payload);
  let cancelled = false;
  await mocked(async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 3) {
            controller.enqueue(bytes.slice(i, i + 3));
          }
        },
        cancel() {
          cancelled = true;
        },
      }),
    ), async () => {
    const deltas: string[] = [];
    assert(
      await streamGemini("prompt", (text) => deltas.push(text)) ===
        "Focus 🎓 today",
    );
    assert(
      deltas.join("") === "Focus 🎓 today" && cancelled,
      "STOP completes without waiting for connection closure",
    );
  });
});

Deno.test("A cutoff after visible text is not retried or presented as completed", async () => {
  let calls = 0;
  await mocked(async () => {
    calls++;
    return new Response(frame("Partial answer"));
  }, async () => {
    const deltas: string[] = [];
    await rejects(
      () => streamGemini("prompt", (text) => deltas.push(text)),
      "AI_SERVICE_INTERRUPTED",
    );
    assert(calls === 1 && deltas.join("") === "Partial answer");
  });
});

Deno.test("A stalled response body is cancelled at the generation deadline", async () => {
  let cancelled = false;
  await mocked(async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(frame("Partial")));
        },
        cancel() {
          cancelled = true;
        },
      }),
    ), async () => {
    await rejects(
      () => streamGemini("prompt", () => {}, { timeoutMs: 30 }),
      "AI_SERVICE_TIMEOUT",
    );
    assert(cancelled);
  });
});

Deno.test("Token-truncated output is rejected before it can be saved", async () => {
  await mocked(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{
            content: { parts: [{ text: "Truncated" }] },
            finishReason: "MAX_TOKENS",
          }],
        }),
      ),
    async () => {
      await rejects(() => callGemini("prompt"), "AI_SERVICE_INCOMPLETE");
    },
  );
});

function coachMock(
  provider: () => Response,
  options: { revokeBeforeSave?: boolean; failSave?: boolean } = {},
) {
  const state = {
    inserts: 0,
    activeChecks: 0,
    saved: [] as Record<string, unknown>[],
  };
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.hostname === "generativelanguage.googleapis.com") return provider();
    if (url.pathname.endsWith("/auth/v1/user")) {
      return reply({
        id: "60000000-0000-4000-8000-000000000006",
        aud: "authenticated",
        role: "authenticated",
        user_metadata: {},
        app_metadata: {},
      });
    }
    if (url.pathname.endsWith("/rpc/is_app_session_active")) {
      state.activeChecks++;
      return reply(!options.revokeBeforeSave || state.activeChecks === 1);
    }
    if (url.pathname.endsWith("/chat_conversations")) {
      return reply(
        init?.method === "PATCH"
          ? []
          : { id: "66000000-0000-4000-8000-000000000006", semester_id: null },
      );
    }
    if (url.pathname.endsWith("/chat_messages")) {
      if (init?.method === "POST") {
        state.inserts++;
        state.saved = JSON.parse(String(init.body));
        return options.failSave
          ? reply(
            { code: "TEST", message: "private database diagnostics" },
            400,
          )
          : reply(state.saved.map((row, i) => ({ ...row, id: String(i) })));
      }
      return reply([]);
    }
    throw new Error("Unexpected mock request");
  };
  return { mockFetch, state };
}
const coachRequest = () =>
  new Request("https://example.test/coach", {
    method: "POST",
    headers: {
      Authorization: "Bearer fake-user-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversation_id: "66000000-0000-4000-8000-000000000006",
      message: "private question",
      stream: true,
    }),
  });

Deno.test("Coach emits text before saving and commits both messages in one insert", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { mockFetch, state } = coachMock(() =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(frame("First words")));
          void gate.then(() => {
            controller.enqueue(
              encoder.encode(frame(" and final advice", true)),
            );
            controller.close();
          });
        },
      }),
    )
  );
  await mocked(mockFetch, async (logs) => {
    const response = await handleCoachRequest(coachRequest());
    assert(response.status === 200 && response.body);
    const events = readSseEvents(response.body);
    assert((await events.next()).value?.event === "ready");
    const first = (await events.next()).value;
    assert(first?.event === "delta" && Number(state.inserts) === 0);
    release();
    const remaining = [];
    for await (const event of events) remaining.push(event);
    assert(remaining.some((event) => event.event === "done"));
    assert(state.inserts === 1 && state.saved.length === 2);
    assert(
      state.saved[0].role === "user" && state.saved[1].role === "assistant",
    );
    assert(state.saved[1].content === "First words and final advice");
    assert(
      String(state.saved[0].created_at) < String(state.saved[1].created_at),
    );
    const text = JSON.stringify(logs);
    assert(
      text.includes("auth_ms") && text.includes("context_ms") &&
        text.includes("persist_ms"),
    );
    assert(
      !text.includes("private question") && !text.includes("fake-user-token"),
    );
  });
});

for (
  const [name, options, code] of [
    [
      "revocation during generation",
      { revokeBeforeSave: true },
      "Authentication required: invalid or expired session",
    ],
    ["database save failure", { failSave: true }, "AI_SERVICE_SAVE_FAILED"],
  ] as const
) {
  Deno.test(`Coach reports ${name} after partial text without a done event`, async () => {
    const { mockFetch, state } = coachMock(
      () => new Response(frame("Advice", true)),
      options,
    );
    await mocked(mockFetch, async () => {
      const response = await handleCoachRequest(coachRequest());
      assert(response.body);
      const events = [];
      for await (const event of readSseEvents(response.body)) {
        events.push(event);
      }
      const error = events.find((event) => event.event === "error");
      assert(
        error && JSON.parse(error.data).error === code &&
          !events.some((event) => event.event === "done"),
      );
      if ("revokeBeforeSave" in options) assert(state.inserts === 0);
    });
  });
}

Deno.test("Request deadline is reported as a timeout when authentication is still pending", async () => {
  await mocked((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    }), async () => {
    const req = new Request(coachRequest(), {
      signal: AbortSignal.timeout(30),
    });
    const response = await handleCoachRequest(req);
    assert(
      response.status === 504 &&
        (await response.json()).error === "AI_SERVICE_TIMEOUT",
    );
  });
});

Deno.test("Cancelling a coach stream stops generation and prevents message writes", async () => {
  let cancelled = false;
  const { mockFetch, state } = coachMock(() =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(frame("Partial")));
        },
        cancel() {
          cancelled = true;
        },
      }),
    )
  );
  await mocked(mockFetch, async () => {
    const response = await handleCoachRequest(coachRequest());
    assert(response.body);
    const reader = response.body.getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert(cancelled && state.inserts === 0);
  });
});
