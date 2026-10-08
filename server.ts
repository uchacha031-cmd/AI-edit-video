import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { createServer as createViteServer } from 'vite';
import { SERVER_CONFIG, ensureStorageDirectories } from './server/config.js';
import { extractMediaMetadata, detectSilence, extractThumbnails } from './server/media.js';
import { generateEditPlanWithGemini, modifyPlanWithNaturalLanguage, buildDeterministicPlan } from './server/gemini.js';
import { renderEditPlan, cancelRender } from './server/renderer.js';
import { getOrCreateSampleVideo } from './server/sampleVideo.js';
import { validateAndSanitizeEditPlan } from './server/validator.js';

const app = express();
const PORT = 3000;

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Ensure all temp storage directories exist and are writable
await ensureStorageDirectories();

// Setup multer storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SERVER_CONFIG.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = /^\.[a-z0-9]{2,6}$/.test(rawExt) ? rawExt : '.mp4';
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `upload_${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: SERVER_CONFIG.MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (SERVER_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported video mime type: ${file.mimetype}`));
    }
  },
});

/**
 * Helper to stream video file with Range support
 */
function streamMediaFile(req: Request, res: Response, filePath: string, contentType = 'video/mp4') {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    const stat = fsSync.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : NaN;
      const end = match && match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || stat.size === 0) {
        res.status(416).setHeader('Content-Range', 'bytes */' + stat.size).end();
        return;
      }
      const safeEnd = Math.min(end, stat.size - 1);

      if (start >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }

      const chunksize = safeEnd - start + 1;
      const file = fsSync.createReadStream(filePath, { start, end: safeEnd });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
      });
      fsSync.createReadStream(filePath).pipe(res);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send('Unable to stream media');
    }
  }
}

// Accept only app-generated IDs, never arbitrary file paths.
function resolveSourceFile(videoId: unknown): string | null {
  if (typeof videoId !== 'string' ||
      !/^(upload_\d+_[a-z0-9]{5,12}\.[a-z0-9]{2,6}|sample_(talking_head|landscape_demo|no_audio)\.mp4)$/i.test(videoId)) {
    return null;
  }
  const dir = videoId.startsWith('sample_') ? SERVER_CONFIG.SAMPLES_DIR : SERVER_CONFIG.UPLOAD_DIR;
  const resolved = path.resolve(dir, videoId);
  return fsSync.existsSync(resolved) ? resolved : null;
}

// Non-sensitive readiness information for testing the AI Studio preview.
app.get('/api/health', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    app: 'AI Auto Video Editor',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    note: 'This endpoint checks the web server, not Gemini or FFmpeg availability.',
  });
});

// ================= API ENDPOINTS ================= //

/**
 * POST /api/upload - Handle video upload, extract metadata, silence & thumbnails
 */
app.post('/api/upload', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const filePath = req.file.path;
    const filename = path.basename(filePath);

    // 1. Technical metadata via ffprobe
    const metadata = await extractMediaMetadata(filePath);
    if (metadata.duration > SERVER_CONFIG.MAX_SOURCE_DURATION_SEC) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(413).json({ success: false, error: 'Video dài hơn giới hạn 10 phút của ứng dụng.' });
    }

    // 2. Silence detection via ffmpeg
    const silences = metadata.hasAudio ? await detectSilence(filePath) : [];

    // 3. Thumbnails
    const thumbnails = await extractThumbnails(filePath, metadata.duration);

    res.json({
      success: true,
      videoId: filename,
      mediaUrl: `/api/media/upload/${filename}`,
      metadata,
      silences,
      thumbnails,
    });
  } catch (err: any) {
    console.error('Upload handling error:', err);
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Video không hợp lệ hoặc không thể xử lý. Hãy thử tệp video khác.' });
  }
});

/**
 * POST /api/sample - Load/generate sample testing video
 */
app.post('/api/sample', async (req: Request, res: Response) => {
  try {
    const rawType = req.body?.type || 'talking_head';
    if (!['talking_head', 'landscape_demo', 'no_audio'].includes(rawType)) {
      return res.status(400).json({ success: false, error: 'Loại video mẫu không hợp lệ.' });
    }
    const type = rawType as 'talking_head' | 'landscape_demo' | 'no_audio';
    const filePath = await getOrCreateSampleVideo(type);
    const filename = path.basename(filePath);

    const metadata = await extractMediaMetadata(filePath);
    const silences = metadata.hasAudio ? await detectSilence(filePath) : [];
    const thumbnails = await extractThumbnails(filePath, metadata.duration);

    res.json({
      success: true,
      videoId: filename,
      mediaUrl: `/api/media/sample/${filename}`,
      metadata,
      silences,
      thumbnails,
    });
  } catch (err: any) {
    console.error('Sample generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to load sample video' });
  }
});

/**
 * POST /api/offline-plan - Rule-based edit plan, not Gemini analysis.
 */
app.post('/api/offline-plan', async (req: Request, res: Response) => {
  try {
    const filePath = resolveSourceFile(req.body?.videoId);
    if (!filePath) return res.status(404).json({ success: false, error: 'Video nguồn không tồn tại' });
    const metadata = await extractMediaMetadata(filePath);
    const silences = metadata.hasAudio ? await detectSilence(filePath) : [];
    const preset = typeof req.body.preset === 'string' ? req.body.preset.slice(0, 60) : 'Clean Minimal';
    const duration = Math.min(metadata.duration, Math.max(1, Number(req.body.targetDuration) || 30));
    const plan = buildDeterministicPlan(metadata, silences, preset, duration);
    const validation = validateAndSanitizeEditPlan(plan, metadata);
    if (!validation.valid) return res.status(422).json({ success: false, error: validation.errors.join('; ') });
    res.json({ success: true, plan: validation.sanitizedPlan, mode: 'offline-rule-based' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Không tạo được kế hoạch offline' });
  }
});

/**
 * POST /api/analyze - Multi-step AI analysis and Edit Plan generation
 */
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { videoId, preset, targetDuration, userPrompt, aspectRatio } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const filePath = resolveSourceFile(videoId);
    if (!filePath) {
      return res.status(404).json({ error: 'Source video file not found' });
    }

    const metadata = await extractMediaMetadata(filePath);
    const silences = metadata.hasAudio ? await detectSilence(filePath) : [];

    const result = await generateEditPlanWithGemini(filePath, metadata, silences, {
      preset: preset || 'Fast TikTok',
      targetDuration: Number(targetDuration) || 30,
      userPrompt,
      aspectRatio,
    });

    if (!result.success) {
      // Return 200 with success: false so reverse proxies (like Cloud Run / GFE)
      // do not intercept 503 with an HTML '<!doctype ...' error page
      return res.json({
        success: false,
        httpStatus: result.httpStatus || 503,
        error: result.error,
        technicalDetails: result.technicalDetails,
        diagnostics: result.diagnostics,
      });
    }

    res.json({
      success: true,
      plan: result.plan,
      qualityCheck: result.qualityCheck,
      diagnostics: result.diagnostics,
    });
  } catch (err: any) {
    console.error('Analyze error:', err);
    res.status(500).json({
      success: false,
      error: 'Phân tích video thất bại. Vui lòng thử lại sau.',
      technicalDetails: err.message,
    });
  }
});

/**
 * POST /api/modify-plan - Natural language edit command
 */
app.post('/api/modify-plan', async (req: Request, res: Response) => {
  try {
    const { plan, videoId, command } = req.body;
    if (!plan || !command) {
      return res.status(400).json({ error: 'Missing plan or command' });
    }

    const filePath = resolveSourceFile(videoId || plan.source?.filename);
    if (!filePath) return res.status(404).json({ error: 'Source video file not found' });
    const metadata = await extractMediaMetadata(filePath);

    const result = await modifyPlanWithNaturalLanguage(plan, metadata, command);
    const validation = validateAndSanitizeEditPlan(result.plan, metadata);
    if (!validation.valid) return res.status(422).json({ error: validation.errors.join('; ') });
    res.json({
      success: true,
      plan: validation.sanitizedPlan,
      explanation: result.explanation,
    });
  } catch (err: any) {
    console.error('Modify plan error:', err);
    res.status(500).json({ error: err.message || 'Failed to modify edit plan' });
  }
});

/**
 * POST /api/validate-plan - Deterministic client plan validation
 */
app.post('/api/validate-plan', async (req: Request, res: Response) => {
  try {
    const { plan, videoId } = req.body;
    const filePath = resolveSourceFile(videoId || plan?.source?.filename);
    if (!filePath) return res.status(404).json({ valid: false, errors: ['Source video file not found'] });
    const metadata = await extractMediaMetadata(filePath);

    const result = validateAndSanitizeEditPlan(plan, metadata);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ valid: false, errors: [err.message] });
  }
});

/**
 * POST /api/render - Execute FFmpeg video rendering
 */
app.post('/api/render', async (req: Request, res: Response) => {
  try {
    const { plan, videoId, burnSubtitles, renderId } = req.body;
    if (!plan || !videoId) {
      return res.status(400).json({ error: 'Missing plan or videoId' });
    }

    const filePath = resolveSourceFile(videoId);
    if (!filePath) {
      return res.status(404).json({ error: 'Source video file not found for render' });
    }

    const validation = validateAndSanitizeEditPlan(plan, await extractMediaMetadata(filePath));
    if (!validation.valid) return res.status(422).json({ success: false, error: validation.errors.join('; ') });
    if (typeof renderId !== 'string' || !/^render_[0-9a-z_-]{12,80}$/i.test(renderId)) {
      return res.status(400).json({ success: false, error: 'Invalid render ID' });
    }
    const result = await renderEditPlan(filePath, validation.sanitizedPlan, renderId, {
      burnSubtitles: burnSubtitles !== false,
    });

    res.json({
      success: true,
      renderId,
      result,
    });
  } catch (err: any) {
    console.error('Render error:', err);
    res.status(500).json({ error: err.message || 'Render process failed' });
  }
});

/**
 * POST /api/cancel-render - Cancel active rendering job
 */
app.post('/api/cancel-render', (req: Request, res: Response) => {
  const { renderId } = req.body;
  if (typeof renderId !== 'string' || !/^render_[0-9a-z_-]{12,80}$/i.test(renderId)) {
    return res.status(400).json({ error: 'Invalid renderId' });
  }
  const cancelled = cancelRender(renderId);
  res.json({ success: cancelled });
});

// ================= MEDIA STREAMING & DOWNLOADS ================= //

// Restrict media serving to filenames generated by this application.
const uploadFilenamePattern = /^upload_\d+_[a-z0-9]{5,12}\.[a-z0-9]{2,6}$/i;
const sampleFilenamePattern = /^sample_(talking_head|landscape_demo|no_audio)\.mp4$/;
const renderFilenamePattern = /^(edited_render_[0-9a-z_-]{12,80}\.mp4|subtitles_render_[0-9a-z_-]{12,80}\.srt)$/i;
const thumbnailFilenamePattern = /^[a-z0-9_-]{3,120}\.(jpe?g|png|webp)$/i;
function safeMediaFilename(name: unknown, pattern: RegExp): string | null {
  return typeof name === 'string' && pattern.test(name) ? name : null;
}


app.get('/api/media/upload/:file', (req: Request, res: Response) => {
  const safeFilename = safeMediaFilename(req.params.file, uploadFilenamePattern);
  if (!safeFilename) return res.status(404).send('Media not found');
  const p = path.join(SERVER_CONFIG.UPLOAD_DIR, safeFilename);
  streamMediaFile(req, res, p);
});

app.get('/api/media/render/:file', (req: Request, res: Response) => {
  const safeFilename = safeMediaFilename(req.params.file, renderFilenamePattern);
  if (!safeFilename) return res.status(404).send('Media not found');
  const p = path.join(SERVER_CONFIG.RENDER_DIR, safeFilename);
  const isSrt = safeFilename.endsWith('.srt');
  streamMediaFile(req, res, p, isSrt ? 'text/plain; charset=utf-8' : 'video/mp4');
});

app.get('/api/media/sample/:file', (req: Request, res: Response) => {
  const safeFilename = safeMediaFilename(req.params.file, sampleFilenamePattern);
  if (!safeFilename) return res.status(404).send('Media not found');
  const p = path.join(SERVER_CONFIG.SAMPLES_DIR, safeFilename);
  streamMediaFile(req, res, p);
});

app.get('/api/media/thumb/:file', (req: Request, res: Response) => {
  const safeFilename = safeMediaFilename(req.params.file, thumbnailFilenamePattern);
  if (!safeFilename) return res.status(404).send('Media not found');
  const p = path.join(SERVER_CONFIG.THUMB_DIR, safeFilename);
  res.sendFile(p);
});

app.get('/api/download-source', (req: Request, res: Response) => {
  const zipPath = path.resolve(process.cwd(), 'public/source-code.zip');
  res.download(zipPath, 'ai-video-editor-source.zip', (err) => {
    if (err && !res.headersSent) {
      console.error('Download source error:', err);
      res.status(500).json({ error: 'Không thể tải xuống tệp zip mã nguồn' });
    }
  });
});

app.get('/api/download/:type/:file', (req: Request, res: Response) => {
  const type = req.params.type;
  if (type !== 'render' && type !== 'upload') return res.status(404).json({ error: 'Invalid download type' });
  const safeFilename = safeMediaFilename(req.params.file, type === 'render' ? renderFilenamePattern : uploadFilenamePattern);
  if (!safeFilename) return res.status(404).json({ error: 'Invalid filename' });
  const dir = type === 'render' ? SERVER_CONFIG.RENDER_DIR : SERVER_CONFIG.UPLOAD_DIR;
  const p = path.join(dir, safeFilename);
  res.download(p, safeFilename);
});

// Explicit 404 for unmatched API routes to prevent falling through to HTML index.html
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Đường dẫn API không tồn tại: ${req.method} ${req.path}`,
  });
});

// Global Express error handler returning JSON (preventing default HTML error pages)
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('[Server Error]:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Lỗi xử lý nội bộ trên máy chủ',
    technicalDetails: process.env.NODE_ENV === 'production' ? undefined : String(err.message || err),
  });
});

// ================= VITE DEV MIDDLEWARE OR PRODUCTION SERVE ================= //

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Auto Video Editor running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
