import { corsHeaders } from "./cors.ts";
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export function errorResponse(error: unknown, status = 400) {
  const message = typeof error === "string"
    ? error
    : error instanceof Error
    ? error.message
    : "Request failed";
  return json({ error: message }, status);
}

export function aiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (/session|authentication/i.test(message)) {
    return {
      error: "Authentication required: invalid or expired session",
      status: 401,
    };
  }
  if (
    message === "AI_SERVICE_TIMEOUT" ||
    (error instanceof DOMException && error.name === "TimeoutError")
  ) return { error: "AI_SERVICE_TIMEOUT", status: 504 };
  if (message === "AI_SERVICE_BUSY") return { error: message, status: 503 };
  if (/^AI_SERVICE_/.test(message)) return { error: message, status: 502 };
  return { error: "AI_SERVICE_UNAVAILABLE", status: 500 };
}
