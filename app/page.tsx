"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────
interface Segment {
  id: number;
  timestamp: string;
  coreIdea: string;
  prompt: string;
  animationNote?: string;
}

interface GeneratedImage {
  id: number;
  timestamp: string;
  coreIdea: string;
  status: "pending" | "generating" | "complete" | "error";
  imageUrl?: string;
  revisedPrompt?: string;
  error?: string;
}

// ─── Sample JSON Schema ──────────────────────────────────────────────
const SAMPLE_JSON = JSON.stringify(
  {
    title: "How Foreclosure Surplus Funds Work",
    segments: [
      {
        id: 1,
        timestamp: "0:00-0:10",
        coreIdea: "A homeowner receives a foreclosure notice",
        prompt:
          'Minimalist hand-drawn black ink stick figure illustration in the signature style of premium wealth creation YouTube videos, extremely clean and simple line art, bald circular heads with minimal facial features (simple dot eyes and basic mouth lines for emotion), stick bodies with subtle hatching for clothing and shading. Clean spacious composition with plenty of negative space, bold confident black lines, subtle drop shadows. Rendered on a solid white #FFF background, faint scratches, specks, and vintage grain. Timeless sketchbook aesthetic, monochrome black and white with occasional soft light blue accents for water or liquid only. High contrast, professional illustration quality. Scene: A worried stick figure standing at their front door holding an envelope marked with an X, a small house beside them with a storm cloud above --ar 16:9',
        animationNote: "Slow zoom in on the central figure",
      },
      {
        id: 2,
        timestamp: "0:10-0:20",
        coreIdea: "The property goes to auction",
        prompt:
          'Minimalist hand-drawn black ink stick figure illustration in the signature style of premium wealth creation YouTube videos, extremely clean and simple line art, bald circular heads with minimal facial features (simple dot eyes and basic mouth lines for emotion), stick bodies with subtle hatching for clothing and shading. Clean spacious composition with plenty of negative space, bold confident black lines, subtle drop shadows. Rendered on a solid white #FFF background, faint scratches, specks, and vintage grain. Timeless sketchbook aesthetic, monochrome black and white with occasional soft light blue accents for water or liquid only. High contrast, professional illustration quality. Scene: An auctioneer stick figure at a podium with a gavel, three bidder stick figures raising numbered paddles, a small house icon between them --ar 16:9',
        animationNote: "Gentle pan left to right across the bidders",
      },
    ],
  },
  null,
  2
);

// ─── Main Component ──────────────────────────────────────────────────
export default function Home() {
  const [jsonInput, setJsonInput] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsed, setIsParsed] = useState(false);
  const [parseError, setParseError] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  // ─── Parse JSON ──────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    setParseError("");
    try {
      const data = JSON.parse(jsonInput);
      const segs: Segment[] = data.segments || data;
      if (!Array.isArray(segs) || segs.length === 0) {
        throw new Error("JSON must contain a 'segments' array with at least one segment.");
      }
      // Validate each segment
      for (let i = 0; i < segs.length; i++) {
        if (!segs[i].prompt) {
          throw new Error(`Segment ${i + 1} is missing a 'prompt' field.`);
        }
        if (!segs[i].id) segs[i].id = i + 1;
        if (!segs[i].timestamp) segs[i].timestamp = "";
        if (!segs[i].coreIdea) segs[i].coreIdea = "";
      }
      setSegments(segs);
      setImages(
        segs.map((s) => ({
          id: s.id,
          timestamp: s.timestamp,
          coreIdea: s.coreIdea,
          status: "pending",
        }))
      );
      setIsParsed(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON";
      setParseError(msg);
    }
  }, [jsonInput]);

  // ─── Generate Images ─────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (segments.length === 0) return;
    setIsGenerating(true);
    setProgress({ current: 0, total: segments.length });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.done) break;

            if (data.status === "complete" || data.status === "error") {
              setProgress((p) => ({ ...p, current: (data.index ?? p.current) + 1 }));
            }

            setImages((prev) =>
              prev.map((img) =>
                img.id === data.id
                  ? {
                      ...img,
                      status: data.status,
                      imageUrl: data.imageUrl || img.imageUrl,
                      revisedPrompt: data.revisedPrompt || img.revisedPrompt,
                      error: data.error || img.error,
                    }
                  : img
              )
            );
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setParseError(msg);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [segments]);

  // ─── Stop Generation ─────────────────────────────────────────────
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  // ─── Download Single Image ───────────────────────────────────────
  const handleDownload = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(`/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert("Download failed — the image URL may have expired. Re-generate to get a fresh link.");
    }
  }, []);

  // ─── Download All Images ─────────────────────────────────────────
  const handleDownloadAll = useCallback(async () => {
    const completed = images.filter((img) => img.status === "complete" && img.imageUrl);
    for (const img of completed) {
      const filename = `segment_${String(img.id).padStart(3, "0")}_${img.timestamp.replace(/[:/]/g, "-")}.png`;
      await handleDownload(img.imageUrl!, filename);
      // Small delay so browser doesn't block multiple downloads
      await new Promise((r) => setTimeout(r, 500));
    }
  }, [images, handleDownload]);

  // ─── Reset ───────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setJsonInput("");
    setSegments([]);
    setImages([]);
    setIsParsed(false);
    setParseError("");
    setProgress({ current: 0, total: 0 });
  }, []);

  // ─── Stats ───────────────────────────────────────────────────────
  const completedCount = images.filter((i) => i.status === "complete").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const pendingCount = images.filter((i) => i.status === "pending" || i.status === "generating").length;

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Storyboard Image Generator</h1>
        <p className="text-gray-400 text-sm">
          Paste your storyboard JSON schema → generate DALL-E 3 images for every segment
        </p>
      </div>

      {/* ─── JSON Input Phase ─────────────────────────────────────── */}
      {!isParsed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Storyboard JSON</label>
            <button
              onClick={() => setJsonInput(SAMPLE_JSON)}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              Load sample
            </button>
          </div>

          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='{\n  "title": "Video Title",\n  "segments": [\n    {\n      "id": 1,\n      "timestamp": "0:00-0:10",\n      "coreIdea": "...",\n      "prompt": "Full DALL-E prompt here..."\n    }\n  ]\n}'
            className="w-full h-96 bg-[#111] border border-gray-700 rounded-lg p-4 font-mono text-sm text-gray-200 resize-y focus:outline-none focus:border-blue-500 transition"
            spellCheck={false}
          />

          {parseError && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {parseError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleParse}
              disabled={!jsonInput.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition"
            >
              Parse & Preview ({jsonInput ? "..." : "0"} segments)
            </button>
          </div>

          {/* Schema Reference */}
          <details className="mt-6">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-300 transition">
              JSON Schema Reference
            </summary>
            <pre className="mt-2 bg-[#111] border border-gray-800 rounded-lg p-4 text-xs text-gray-400 overflow-x-auto">
{`{
  "title": "string (optional)",
  "segments": [
    {
      "id": number,           // Segment number (auto-assigned if missing)
      "timestamp": "string",  // e.g. "0:00-0:10"
      "coreIdea": "string",   // One-sentence description
      "prompt": "string",     // Full DALL-E prompt (REQUIRED)
      "animationNote": "string" // Ken Burns note (optional)
    }
  ]
}`}
            </pre>
          </details>
        </div>
      )}

      {/* ─── Generation Phase ─────────────────────────────────────── */}
      {isParsed && (
        <div className="space-y-6">
          {/* Control Bar */}
          <div className="flex items-center justify-between bg-[#111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                <strong className="text-white">{segments.length}</strong> segments loaded
              </span>
              {isGenerating && (
                <span className="text-sm text-blue-400">
                  Generating {progress.current}/{progress.total}...
                </span>
              )}
              {!isGenerating && completedCount > 0 && (
                <span className="text-sm text-green-400">
                  {completedCount} complete
                  {errorCount > 0 && <span className="text-red-400 ml-2">· {errorCount} failed</span>}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {!isGenerating && pendingCount > 0 && (
                <button
                  onClick={handleGenerate}
                  className="px-5 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition"
                >
                  {completedCount > 0 ? "Resume Generation" : "Generate All Images"}
                </button>
              )}
              {isGenerating && (
                <button
                  onClick={handleStop}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition"
                >
                  Stop
                </button>
              )}
              {completedCount > 0 && !isGenerating && (
                <button
                  onClick={handleDownloadAll}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition"
                >
                  Download All ({completedCount})
                </button>
              )}
              <button
                onClick={handleReset}
                disabled={isGenerating}
                className="px-5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-sm font-medium transition"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {(isGenerating || completedCount > 0) && (
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / segments.length) * 100}%` }}
              />
            </div>
          )}

          {/* Image Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {images.map((img) => (
              <div
                key={img.id}
                className={`bg-[#111] border rounded-lg overflow-hidden transition-all ${
                  img.status === "generating"
                    ? "generating border-blue-500/50"
                    : img.status === "complete"
                    ? "border-green-800/50"
                    : img.status === "error"
                    ? "border-red-800/50"
                    : "border-gray-800"
                }`}
              >
                {/* Image Area */}
                <div className="aspect-video bg-[#0a0a0a] flex items-center justify-center relative">
                  {img.status === "pending" && (
                    <span className="text-gray-600 text-sm">Waiting...</span>
                  )}
                  {img.status === "generating" && (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-blue-400 text-xs">Generating...</span>
                    </div>
                  )}
                  {img.status === "complete" && img.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.imageUrl}
                      alt={img.coreIdea}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {img.status === "error" && (
                    <div className="text-center p-4">
                      <span className="text-red-400 text-sm block mb-1">Failed</span>
                      <span className="text-red-500/70 text-xs">{img.error}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-500">
                      #{img.id} · {img.timestamp}
                    </span>
                    {img.status === "complete" && img.imageUrl && (
                      <button
                        onClick={() =>
                          handleDownload(
                            img.imageUrl!,
                            `segment_${String(img.id).padStart(3, "0")}.png`
                          )
                        }
                        className="text-xs text-blue-400 hover:text-blue-300 transition"
                      >
                        Download
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 line-clamp-2">{img.coreIdea}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Estimated Time */}
          {!isGenerating && pendingCount > 0 && completedCount === 0 && (
            <p className="text-center text-sm text-gray-500">
              Estimated time: ~{Math.ceil((segments.length * 12) / 60)} minutes for {segments.length} images
              (DALL-E 3 rate limit: ~5-7 images/min)
            </p>
          )}
        </div>
      )}
    </main>
  );
}
