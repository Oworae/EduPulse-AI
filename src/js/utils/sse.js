/**
 * Read SSE events across chunks, including split UTF-8 and CRLF lines.
 * @param {ReadableStream<Uint8Array>} body
 * @param {{signal?: AbortSignal}} options
 */
export async function* readSseEvents(body, { signal } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data = [];
  let eventSize = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length + eventSize > 1_048_576) {
        throw new Error("Stream event is too large");
      }
      while (true) {
        const end = buffer.search(/[\r\n]/);
        if (
          end < 0 ||
          (!done && buffer[end] === "\r" && end === buffer.length - 1)
        ) break;
        const line = buffer.slice(0, end);
        const size = buffer[end] === "\r" && buffer[end + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(end + size);
        if (!line) {
          if (data.length) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
          eventSize = 0;
        } else if (!line.startsWith(":")) {
          const separator = line.indexOf(":");
          const field = separator < 0 ? line : line.slice(0, separator);
          let content = separator < 0 ? "" : line.slice(separator + 1);
          if (content.startsWith(" ")) content = content.slice(1);
          if (field === "event") event = content || "message";
          if (field === "data") {
            data.push(content);
            eventSize += content.length;
          }
        }
      }
      if (done) break;
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
