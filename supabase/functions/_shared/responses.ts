import { corsHeaders } from "./cors.ts";
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
