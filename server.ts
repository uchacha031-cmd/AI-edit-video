import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { createServer as createViteServer } from 'vite';
import { SERVER_CONFIG, ensureStorageDirectories } from './server/config.js';
import { extractMediaMetadata, detectSilence, extractThumbnails } from './server/media.js';
import { generateEditPlanWithGemini, modifyPlanWithNaturalLanguage } from './server/gemini.js';
import { renderEditPlan, cancelRender } from './server/renderer.js';
import { getOrCreateSampleVideo } from './server/sampleVideo.js';
import { validateAndSanitizeEditPlan } from './server/validator.js';

const app = express();
const PORT = 3000;

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure all temp storage directories exist and are writable
await ensureStorageDirectories();

// Setup multer storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SERVER_CONFIG.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `upload_${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: SERVER_CONFIG.MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (SERVER_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype) || file.mimetype.startsWith('video/')) {
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
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    const stat = fsSync.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (start >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }

      const chunksize = end - start + 1;
      const file = fsSync.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
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
      res.status(500).send(`Streaming error: ${err.message}`);
    }
  }
}

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

    // 2. Silence detection via ffmpeg
    const silences = metadata.hasAudio ? await detectSilence(filePath) : [];

    // 3. Thumbnails
    const thumbnails = await extractThumbnails(filePath, metadata.duration);

    res.json({
      success: true,
      videoId: filename,
      mediaUrl: `/api/media/upload/${filename}`,
      filePath,
      metadata,
      silences,
      thumbnails,
    });
  } catch (err: any) {
    console.error('Upload handling error:', err);
    res.status(500).json({ error: err.message || 'Failed to process uploaded video' });
  }
});

/**
 * POST /api/sample - Load/generate sample testing video
 */
app.post('/api/sample', async (req: Request, res: Response) => {
  try {
    const type = (req.body.type || 'talking_head') as 'talking_head' | 'landscape_demo' | 'no_audio';
    const filePath = await getOrCreateSampleVideo(type);
    const filename = path.basename(filePath);

    const metadata = await extractMediaMetadata(filePath);
    const silences = metadata.hasAudio ? await detectSilence(filePath) : [];
    const thumbnails = await extractThumbnails(filePath, metadata.duration);

    res.json({
      success: true,
      videoId: filename,
      mediaUrl: `/api/media/sample/${filename}`,
      filePath,
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
 * POST /api/analyze - Multi-step AI analysis and Edit Plan generation
 */
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { videoId, preset, targetDuration, userPrompt, aspectRatio } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    // Determine path
    let filePath = path.join(SERVER_CONFIG.UPLOAD_DIR, videoId);
    if (!fsSync.existsSync(filePath)) {
      filePath = path.join(SERVER_CONFIG.SAMPLES_DIR, videoId);
    }
    if (!fsSync.existsSync(filePath)) {
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

    let filePath = path.join(SERVER_CONFIG.UPLOAD_DIR, videoId || plan.source?.filename);
    if (!fsSync.existsSync(filePath)) {
      filePath = path.join(SERVER_CONFIG.SAMPLES_DIR, videoId || plan.source?.filename);
    }

    const metadata = fsSync.existsSync(filePath)
      ? await extractMediaMetadata(filePath)
      : (plan.source as any);

    const result = await modifyPlanWithNaturalLanguage(plan, metadata, command);
    res.json({
      success: true,
      plan: result.plan,
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
    let filePath = path.join(SERVER_CONFIG.UPLOAD_DIR, videoId || plan.source?.filename);
    if (!fsSync.existsSync(filePath)) {
      filePath = path.join(SERVER_CONFIG.SAMPLES_DIR, videoId || plan.source?.filename);
    }
    const metadata = fsSync.existsSync(filePath)
      ? await extractMediaMetadata(filePath)
      : (plan.source as any);

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
    const { plan, videoId, burnSubtitles } = req.body;
    if (!plan || !videoId) {
      return res.status(400).json({ error: 'Missing plan or videoId' });
    }

    let filePath = path.join(SERVER_CONFIG.UPLOAD_DIR, videoId);
    if (!fsSync.existsSync(filePath)) {
      filePath = path.join(SERVER_CONFIG.SAMPLES_DIR, videoId);
    }
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: 'Source video file not found for render' });
    }

    const renderId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const result = await renderEditPlan(filePath, plan, renderId, {
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
  if (!renderId) return res.status(400).json({ error: 'Missing renderId' });
  const cancelled = cancelRender(renderId);
  res.json({ success: cancelled });
});

// ================= MEDIA STREAMING & DOWNLOADS ================= //

app.get('/api/media/upload/:file', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.file);
  const p = path.join(SERVER_CONFIG.UPLOAD_DIR, safeFilename);
  streamMediaFile(req, res, p);
});

app.get('/api/media/render/:file', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.file);
  const p = path.join(SERVER_CONFIG.RENDER_DIR, safeFilename);
  const isSrt = safeFilename.endsWith('.srt');
  streamMediaFile(req, res, p, isSrt ? 'text/plain; charset=utf-8' : 'video/mp4');
});

app.get('/api/media/sample/:file', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.file);
  const p = path.join(SERVER_CONFIG.SAMPLES_DIR, safeFilename);
  streamMediaFile(req, res, p);
});

app.get('/api/media/thumb/:file', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.file);
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
  const safeFilename = path.basename(req.params.file);
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
    technicalDetails: String(err.stack || err),
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
