# AI Auto Video Editor

React/Vite frontend and Express backend for a video editing workflow: upload, media inspection, Gemini-assisted edit planning, FFmpeg rendering and MP4 export.

## Local setup
- Install Node.js, FFmpeg and ffprobe. Install dependencies with `npm install`.
- Copy `.env.example` to `.env` and configure `GEMINI_API_KEY`. Never commit the actual `.env`.
- Run `npm run dev`, then use the preview URL supplied by the server.
- Optional static analysis: `npm run lint`.

## Fix branch — 2026-10-08
- Validates edit plans before render and preserves user-chosen segment order.
- Splits subtitle cues at cuts instead of spanning omitted footage.
- Adds browser-generated render IDs and cancellation that can stop active FFmpeg jobs.
- Restricts video IDs to app-generated filenames; validates HTTP byte ranges and upload duration.
- Adds an explicit **non-AI** editing fallback for Gemini availability failures.
- Makes sample video selection usable by touchscreens.
- Runtime videos in `temp_storage/`, secrets in `.env` and generated `public/source-code.zip` are excluded from Git.

## Safety & known limitations
- Do not deploy for other people's private videos without authentication and file-level authorization.
- Gemini HTTP 503 may be service-side; retrying or falling back does not fix an upstream outage.
- Real transitions and animated zoom effects are not fully implemented by the renderer.
- This branch is for review and testing; the `main` branch and linked AI Studio app are not modified.
