import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Negative prompt to append as instruction
const NEGATIVE_PROMPT =
  "Do NOT include: photorealistic, 3D, detailed faces, realistic proportions, cluttered, colorful, gradients, modern digital art, cartoonish, anime, thick outlines, blurry, text, watermarks, extra limbs, dark background, heavy shadows, photographic, overly detailed clothing.";

async function generateImage(prompt: string, apiKey: string) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1.5",
      prompt: `${prompt}\n\n${NEGATIVE_PROMPT}`,
      n: 1,
      size: "1536x1024",
      quality: "high",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");
  return `data:image/png;base64,${b64}`;
}

// Generate a SINGLE image per request — client loops through segments
export async function POST(req: NextRequest) {
  try {
    const { prompt, id } = (await req.json()) as { prompt: string; id: number };

    if (!prompt) {
      return Response.json({ error: "No prompt provided" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const imageUrl = await generateImage(prompt, apiKey);
    return Response.json({ id, imageUrl, status: "complete" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isRateLimit = message.includes("Rate limit") || message.includes("429");
    return Response.json(
      { error: message, retryable: isRateLimit },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
