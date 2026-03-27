# Storyboard Image Generator

Generates DALL-E 3 images from storyboard JSON schemas for YouTube videos. Designed for 60+ image batch generation with real-time progress streaming.

## Quick Start

### 1. Install dependencies
```bash
cd storyboard-generator
npm install
```

### 2. Add your OpenAI API key
Edit `.env.local`:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

### 3. Run locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

### Option A: Vercel CLI
```bash
npm i -g vercel
vercel
```
Then add your `OPENAI_API_KEY` in Vercel Dashboard → Settings → Environment Variables.

### Option B: GitHub
1. Push this folder to a GitHub repo
2. Import it at [vercel.com/new](https://vercel.com/new)
3. Add `OPENAI_API_KEY` as an environment variable during setup

**Important:** You need a Vercel Pro plan for the 300-second function timeout needed for large batches. On the free plan, functions timeout at 60 seconds (~5 images max per request).

## JSON Schema

The app accepts this format:

```json
{
  "title": "Video Title (optional)",
  "segments": [
    {
      "id": 1,
      "timestamp": "0:00-0:10",
      "coreIdea": "A homeowner receives a foreclosure notice",
      "prompt": "Full DALL-E prompt text here...",
      "animationNote": "Slow zoom in (optional)"
    }
  ]
}
```

Only `prompt` is required per segment. All other fields are optional.

## How It Works

1. Paste your storyboard JSON (output from Claude) into the text box
2. Click "Parse & Preview" to validate and see all segments
3. Click "Generate All Images" to start batch generation
4. Images stream in one at a time (~9 seconds apart to respect rate limits)
5. Download individual images or all at once

## Rate Limits

DALL-E 3 allows ~5-7 images per minute. For 60 segments, expect ~10-12 minutes total. The app automatically:
- Spaces requests 9 seconds apart
- Retries once on rate limit errors (with 15-second backoff)
- Streams progress in real-time so you can watch images arrive

## Cost Estimate

DALL-E 3 HD at 1792x1024: ~$0.12 per image
- 60 images ≈ $7.20
- 100 images ≈ $12.00
