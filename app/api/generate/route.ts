import { NextRequest } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function POST(req: NextRequest) {
  try {
    const { segments } = (await req.json()) as { segments: Segment[] };

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return Response.json({ error: "No segments provided" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
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
            const response = await openai.images.generate({
              model: "dall-e-3",
              prompt: `${segment.prompt}\n\n${NEGATIVE_PROMPT}`,
              n: 1,
              size: "1792x1024",
              quality: "hd",
              style: "natural",
            });

            result.status = "complete";
            result.imageUrl = response.data[0]?.url;
            result.revisedPrompt = response.data[0]?.revised_prompt;
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            result.status = "error";
            result.error = errorMessage;

            // If rate-limited, wait and retry once
            if (errorMessage.includes("Rate limit") || errorMessage.includes("429")) {
              await new Promise((r) => setTimeout(r, 15000));
              try {
                const retry = await openai.images.generate({
                  model: "dall-e-3",
                  prompt: `${segment.prompt}\n\n${NEGATIVE_PROMPT}`,
                  n: 1,
                  size: "1792x1024",
                  quality: "hd",
                  style: "natural",
                });
                result.status = "complete";
                result.imageUrl = retry.data[0]?.url;
                result.revisedPrompt = retry.data[0]?.revised_prompt;
                delete result.error;
              } catch (retryErr: unknown) {
                const retryMsg = retryErr instanceof Error ? retryErr.message : "Retry failed";
                result.status = "error";
                result.error = retryMsg;
              }
            }
          }

          controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));

          // Small delay between requests to avoid rate limits (DALL-E 3: ~7 img/min)
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
        "Connection": "keep-alive",
      },
    });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
