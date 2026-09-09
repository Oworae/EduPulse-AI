const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
export async function callGemini(
  prompt: string,
  jsonMode = false,
): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
  if (!key) {
    console.error("Gemini API key is not configured");
    throw new Error("AI_SERVICE_UNAVAILABLE");
  }
  const response = await fetch(
    `${endpoint}/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  if (!response.ok) {
    let detail = "";
    try {
      const failure = await response.json();
      if (typeof failure?.error?.message === "string") {
        detail = failure.error.message;
      }
    } catch { /* retain the controlled fallback */ }
    const safeDetail = detail.replaceAll(key, "[redacted]").slice(0, 300);
    // Keep provider diagnostics in server logs. Browser clients receive only a
    // stable code so model names, provider wording, and infrastructure details
    // never become student-facing copy.
    console.error("Gemini request failed", {
      status: response.status,
      detail: safeDetail || "No provider detail",
    });
    throw new Error(
      response.status === 429 || response.status === 503
        ? "AI_SERVICE_BUSY"
        : "AI_SERVICE_UNAVAILABLE",
    );
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    console.error("Gemini returned no usable content");
    throw new Error("AI_SERVICE_UNAVAILABLE");
  }
  return text.trim();
}
export function modelName() {
  return Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
}
