const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
export async function callGemini(
  prompt: string,
  jsonMode = false,
): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
  if (!key) throw new Error("Gemini is not configured");
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
    throw new Error(
      `Gemini request failed (${response.status})${
        safeDetail ? `: ${safeDetail}` : ""
      }`,
    );
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned no usable content");
  }
  return text.trim();
}
export function modelName() {
  return Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
}
