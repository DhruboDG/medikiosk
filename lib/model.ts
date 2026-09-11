// Server-side only. GEMINI_API_KEY must never reach client code — this file
// is imported only from app/api/** route handlers.

const GEMINI_MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 8000;

export async function callGemini(prompt: string, images?: string[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (images) {
    for (const image of images) {
      parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
