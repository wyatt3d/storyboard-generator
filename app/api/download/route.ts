import { NextRequest } from "next/server";

// Proxy endpoint to download DALL-E images (they expire after ~1hr)
// This fetches the image and returns it as a downloadable file
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "image.png";

  if (!url) {
    return Response.json({ error: "No URL provided" }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");

    const blob = await response.blob();

    return new Response(blob, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return Response.json({ error: "Failed to download image" }, { status: 500 });
  }
}
