import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Negative prompt to append as instruction
const NEGATIVE_PROMPT =
  "Do NOT include: photorealistic, 3D, detailed faces, realistic proportions, cluttered, colorful, gradients, modern digital art, cartoonish, anime, thick outlines, blurry, text, watermarks, extra limbs, dark background, heavy shadows, photographic, overly detailed clothing.";

export const maxDuration = 300; // 5 min timeout for Vercel Pro

interface Segment {
  id: number;
  timestamp: string;
  coreIdea: string;
  prompt: string;
  animationNote?: string;
}

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
  return { dataUrl: `data:image/png;base64,${b64}` };
}

export async function POST(req: NextRequest) {
  try {
    const { segments } = (await req.json()) as { segments: Segment[] };

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return Response.json({ error: "No segments provided" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    // Stream results back as newline-delimited JSON
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          const result: Record<string, unknown> = {
            id: segment.id,
            timestamp: segment.timestamp,
            coreIdea: segment.coreIdea,
            status: "generating",
            index: i,
            total: segments.length,
          };

          // Send "generating" status
          controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));

          try {
            const image = await generateImage(segment.prompt, apiKey);
            result.status = "complete";
            result.imageUrl = image.dataUrl;
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            result.status = "error";
            result.error = errorMessage;

            // If rate-limited, wait and retry once
            if (errorMessage.includes("Rate limit") || errorMessage.includes("429")) {
              await new Promise((r) => setTimeout(r, 15000));
              try {
                const image = await generateImage(segment.prompt, apiKey);
                result.status = "complete";
                result.imageUrl = image.dataUrl;
                delete result.error;
              } catch (retryErr: unknown) {
                const retryMsg = retryErr instanceof Error ? retryErr.message : "Retry failed";
                result.status = "error";
                result.error = retryMsg;
              }
            }
          }

          controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));

          // Small delay between requests to avoid rate limits
          if (i < segments.length - 1) {
            await new Promise((r) => setTimeout(r, 9000));
          }
        }

        // Signal completion
        controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + "\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
