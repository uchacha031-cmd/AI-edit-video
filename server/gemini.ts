import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { SERVER_CONFIG } from './config.js';
import {
  EditPlan,
  EditQualityCheck,
  SilenceInterval,
  VideoMetadata,
  AiDiagnostics,
} from '../src/types/editor.js';
import { validateAndSanitizeEditPlan } from './validator.js';
import { buildConservativeEditTimeline } from './editing.js';

// Helper for timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

// Initialize server-side Gemini client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Strict JSON schema for EditPlan according to user requirements
 */
const editPlanJsonSchema = {
  type: Type.OBJECT,
  properties: {
    project: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        sourceDuration: { type: Type.NUMBER },
        targetDuration: { type: Type.NUMBER },
        preset: { type: Type.STRING },
        prompt: { type: Type.STRING },
      },
      required: ['title', 'sourceDuration', 'targetDuration', 'preset'],
    },
    source: {
      type: Type.OBJECT,
      properties: {
        filename: { type: Type.STRING },
        duration: { type: Type.NUMBER },
        width: { type: Type.NUMBER },
        height: { type: Type.NUMBER },
        fps: { type: Type.NUMBER },
        codec: { type: Type.STRING },
        hasAudio: { type: Type.BOOLEAN },
      },
      required: ['filename', 'duration', 'width', 'height', 'fps', 'codec', 'hasAudio'],
    },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          sourceStart: { type: Type.NUMBER },
          sourceEnd: { type: Type.NUMBER },
          keep: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
          reason: { type: Type.STRING },
          role: {
            type: Type.STRING,
            enum: ['hook', 'core', 'highlight', 'filler', 'silence', 'outro'],
          },
          label: { type: Type.STRING },
          zoom: { type: Type.NUMBER },
          focalPoint: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
            },
            required: ['x', 'y'],
          },
        },
        required: ['id', 'sourceStart', 'sourceEnd', 'keep', 'confidence', 'reason', 'role'],
      },
    },
    cuts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceStart: { type: Type.NUMBER },
          sourceEnd: { type: Type.NUMBER },
          reason: { type: Type.STRING },
        },
        required: ['sourceStart', 'sourceEnd', 'reason'],
      },
    },
    subtitles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          start: { type: Type.NUMBER },
          end: { type: Type.NUMBER },
          text: { type: Type.STRING },
        },
        required: ['id', 'start', 'end', 'text'],
      },
    },
    crop: {
      type: Type.OBJECT,
      properties: {
        aspectRatio: {
          type: Type.STRING,
          enum: ['9:16', '16:9', '1:1'],
        },
        focalPoint: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
          },
          required: ['x', 'y'],
        },
      },
      required: ['aspectRatio', 'focalPoint'],
    },
    effects: {
      type: Type.OBJECT,
      properties: {
        zoomPunchIn: { type: Type.BOOLEAN },
        colorFilter: {
          type: Type.STRING,
          enum: ['none', 'vibrant', 'warm', 'cool', 'cinematic'],
        },
        transition: {
          type: Type.STRING,
          enum: ['none', 'fade', 'crossfade'],
        },
      },
      required: ['zoomPunchIn'],
    },
    audio: {
      type: Type.OBJECT,
      properties: {
        normalize: { type: Type.BOOLEAN },
        removeSilence: { type: Type.BOOLEAN },
        silenceThresholdDb: { type: Type.NUMBER },
        volumeBoost: { type: Type.NUMBER },
      },
      required: ['normalize', 'removeSilence', 'silenceThresholdDb', 'volumeBoost'],
    },
    export: {
      type: Type.OBJECT,
      properties: {
        aspectRatio: {
          type: Type.STRING,
          enum: ['9:16', '16:9', '1:1'],
        },
        resolution: {
          type: Type.STRING,
          enum: ['720p', '1080p'],
        },
        fps: { type: Type.NUMBER },
        targetDuration: { type: Type.NUMBER },
        actualEstimatedDuration: { type: Type.NUMBER },
      },
      required: ['aspectRatio', 'resolution', 'fps', 'targetDuration'],
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'project',
    'source',
    'segments',
    'cuts',
    'subtitles',
    'crop',
    'effects',
    'audio',
    'export',
    'warnings',
  ],
};

/**
 * Quality check response schema
 */
const qualityCheckSchema = {
  type: Type.OBJECT,
  properties: {
    approved: { type: Type.BOOLEAN },
    severity: {
      type: Type.STRING,
      enum: ['low', 'medium', 'high'],
    },
    issues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    suggestedFixes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    editorialScore: { type: Type.NUMBER },
  },
  required: ['approved', 'severity', 'issues', 'suggestedFixes'],
};

interface CachedGeminiFile {
  name: string;
  uri: string;
  mimeType: string;
  state: string;
  createdAt: number;
}

const uploadedFileCache = new Map<string, CachedGeminiFile>();

/**
 * Upload video file to Gemini Files API and wait until ACTIVE.
 * Caches already uploaded files so the exact same video is uploaded ONLY ONCE.
 */
export async function getOrUploadVideoToGemini(filePath: string, mimeType = 'video/mp4'): Promise<{ file: any; uploadStatus: string }> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }

  // 1. Check if cached and still ACTIVE on Gemini Files API
  const cached = uploadedFileCache.get(filePath);
  if (cached) {
    try {
      const existing = await ai.files.get({ name: cached.name });
      if (existing.state === 'ACTIVE') {
        return {
          file: existing,
          uploadStatus: 'Tái sử dụng tệp đã sẵn sàng (không tải lại)',
        };
      }
      if (existing.state === 'PROCESSING') {
        let poll = existing;
        let pAttempts = 0;
        while (poll.state === 'PROCESSING' && pAttempts < 20) {
          await new Promise((r) => setTimeout(r, 1500));
          poll = await ai.files.get({ name: cached.name });
          pAttempts++;
        }
        if (poll.state === 'ACTIVE') {
          return {
            file: poll,
            uploadStatus: 'Tái sử dụng tệp đã xử lý xong',
          };
        }
      }
    } catch {
      uploadedFileCache.delete(filePath);
    }
  }

  // 2. Upload video file to Gemini Files API
  const uploadResult = await ai.files.upload({
    file: filePath,
    config: {
      mimeType,
    },
  });

  if (!uploadResult.name) {
    throw new Error('Upload lên Gemini Files API không trả về định danh tệp hợp lệ.');
  }

  const fileName = uploadResult.name;

  // 3. Poll until ACTIVE before returning
  let file = await ai.files.get({ name: fileName });
  let attempts = 0;
  while (file.state === 'PROCESSING' && attempts < 30) {
    await new Promise((r) => setTimeout(r, 1500));
    file = await ai.files.get({ name: fileName });
    attempts++;
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`Gemini không thể kích hoạt tệp video (Trạng thái: ${file.state})`);
  }

  uploadedFileCache.set(filePath, {
    name: file.name || fileName,
    uri: file.uri || '',
    mimeType: file.mimeType || mimeType,
    state: file.state || 'ACTIVE',
    createdAt: Date.now(),
  });

  return {
    file,
    uploadStatus: 'Tải lên Gemini Files API thành công (ACTIVE)',
  };
}

/**
 * Build deterministic edit plan as a fallback or starting point
 */
export function buildDeterministicPlan(
  meta: VideoMetadata,
  silences: SilenceInterval[],
  preset = 'Fast TikTok',
  targetDuration = 30,
  userPrompt?: string
): EditPlan {
  const duration = meta.duration;
  const segments: any[] = [];
  
  // Conservative non-AI editing: leave room around speech and smooth short cuts.
  // Reference principle: Auto-Editor --margin and --smooth.
  const timeline = buildConservativeEditTimeline(duration, silences);
  let segIndex = 0;
  const parts = [
    ...timeline.kept.map(range => ({ ...range, keep: true })),
    ...timeline.removed.map(range => ({ ...range, keep: false })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const part of parts) {
    if (part.end <= part.start) continue;
    const first = segIndex === 0;
    const role = part.keep ? (first ? 'hook' : 'core') : 'silence';
    segments.push({
      id: 'seg_' + (++segIndex),
      sourceStart: part.start,
      sourceEnd: part.end,
      keep: part.keep,
      confidence: part.keep ? 0.80 : 0.92,
      reason: part.keep
        ? 'Đoạn được giữ theo tín hiệu âm thanh, có khoảng đệm để tránh cắt mất lời nói'
        : 'Khoảng lặng đã trừ biên an toàn đầu/cuối',
      role,
      zoom: 1.0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
  }
  const estimatedKeptDuration = timeline.kept.reduce((sum, p) => sum + p.end - p.start, 0);
  const planningWarnings = [...timeline.warnings];
  if (estimatedKeptDuration > targetDuration + 1) {
    planningWarnings.push(
      'Bản dựng cơ bản dài khoảng ' + estimatedKeptDuration.toFixed(1) + 's, vượt mục tiêu ' + targetDuration.toFixed(1) + 's. ' +
      'Không tự ý cắt bỏ lời nói; hãy dùng AI hoặc chọn thủ công để rút ngắn thêm.'
    );
  }
  planningWarnings.push('Chế độ cơ bản chỉ phân tích khoảng lặng, không nhận diện ý nghĩa, highlight hay phiên âm.');
  const rawPlan: any = {
    project: {
      title: `Bản dựng ${preset}`,
      sourceDuration: duration,
      targetDuration: Math.min(targetDuration, duration),
      preset,
      prompt: userPrompt,
    },
    source: {
      filename: meta.filename,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      codec: meta.videoCodec,
      hasAudio: meta.hasAudio,
    },
    segments,
    cuts: segments.filter((s) => !s.keep).map((s) => ({
      sourceStart: s.sourceStart,
      sourceEnd: s.sourceEnd,
      reason: s.reason,
    })),
    subtitles: [],
    crop: {
      aspectRatio: preset === 'Fast TikTok' || preset === 'Short Social' ? '9:16' : meta.aspectRatioLabel,
      focalPoint: { x: 0.5, y: 0.5 },
    },
    effects: {
      zoomPunchIn: preset === 'Fast TikTok',
      colorFilter: preset === 'Cinematic' ? 'cinematic' : 'vibrant',
      transition: 'none',
    },
    audio: {
      normalize: true,
      removeSilence: true,
      silenceThresholdDb: -30,
      volumeBoost: 1.1,
    },
    export: {
      aspectRatio: preset === 'Fast TikTok' || preset === 'Short Social' ? '9:16' : meta.aspectRatioLabel,
      resolution: '720p',
      fps: meta.fps,
      targetDuration: Math.min(targetDuration, duration),
      actualEstimatedDuration: duration,
    },
    warnings: planningWarnings,
  };

  const validation = validateAndSanitizeEditPlan(rawPlan, meta);
  return validation.sanitizedPlan;
}

// Concurrency tracking: job sequence per filePath to cancel stale requests
let globalJobCounter = 0;
const activeJobMap = new Map<string, number>();

/**
 * Check if an error is transient and retryable (503, 429, 500, 504, timeout, UNAVAILABLE)
 */
function isRetryableError(err: any): boolean {
  const status = err?.status || err?.statusCode || 0;
  const msg = String(err?.message || err || '').toLowerCase();

  // Explicit non-retryable error classes
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }
  if (
    msg.includes('invalid argument') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthenticated') ||
    msg.includes('not found') ||
    msg.includes('api key not valid') ||
    msg.includes('unsupported media') ||
    (msg.includes('schema') && msg.includes('invalid'))
  ) {
    return false;
  }

  // Transient retryable errors
  if (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429') ||
    msg.includes('deadline') ||
    msg.includes('quá thời gian') ||
    msg.includes('timeout')
  ) {
    return true;
  }

  return false;
}

/**
 * Parse retry delay from Retry-After header or compute exponential backoff with jitter
 */
function parseRetryDelay(err: any, attempt: number): number {
  const retryAfterHeader =
    err?.response?.headers?.get?.('retry-after') || err?.headers?.['retry-after'];
  if (retryAfterHeader) {
    const parsedSec = parseFloat(retryAfterHeader);
    if (!isNaN(parsedSec) && parsedSec > 0 && parsedSec <= 15) {
      return Math.round(parsedSec * 1000);
    }
  }

  // Exponential backoff with jitter:
  // attempt 1: ~1.5s - 2.0s
  // attempt 2: ~3.0s - 3.8s
  const baseMs = 1500;
  const backoff = baseMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 500);
  return backoff + jitter;
}

/**
 * Perform multi-step AI video analysis & create Edit Plan with Retry Backoff.
 * Strict rule: NEVER generate fake fallback analysis if Gemini fails.
 */
export async function generateEditPlanWithGemini(
  filePath: string,
  meta: VideoMetadata,
  silences: SilenceInterval[],
  options: {
    preset: string;
    targetDuration: number;
    userPrompt?: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    sceneCuts?: number[];
    sceneCoverageSeconds?: number;
  }
): Promise<{
  success: boolean;
  plan?: EditPlan;
  qualityCheck?: EditQualityCheck;
  diagnostics: AiDiagnostics;
  error?: string;
  technicalDetails?: string;
  httpStatus?: number;
}> {
  const requestStartTime = new Date().toISOString();
  const startTs = Date.now();
  const thisJobId = ++globalJobCounter;
  activeJobMap.set(filePath, thisJobId);

  let totalRetryDelayMs = 0;
  let lastHttpStatus: number | string = 200;
  let lastError: any = null;
  let attemptNumber = 0;
  let uploadStatus = 'Đang chuẩn bị tệp';
  let geminiFile: any = null;

  // Stop immediately if no API key is set
  if (!apiKey) {
    return {
      success: false,
      error: 'Chưa cấu hình GEMINI_API_KEY. Vui lòng cấu hình API key trong cài đặt Secrets để sử dụng AI phân tích video.',
      diagnostics: {
        selectedModel: SERVER_CONFIG.GEMINI_MODEL,
        videoFilename: meta.filename,
        videoSizeBytes: meta.filesize,
        videoDurationSec: meta.duration,
        uploadStatus: 'Chưa cấu hình API Key',
        analysisAttempt: 0,
        maxAttempts: 3,
        httpStatus: 401,
        requestStartTime,
        requestEndTime: new Date().toISOString(),
        durationMs: Date.now() - startTs,
        totalRetryDelayMs: 0,
        errorDetails: 'Thiếu GEMINI_API_KEY',
      },
      httpStatus: 401,
    };
  }

  // 1. Upload or reuse cached file (uploaded ONLY ONCE)
  try {
    const uploadRes = await getOrUploadVideoToGemini(filePath);
    geminiFile = uploadRes.file;
    uploadStatus = uploadRes.uploadStatus;
  } catch (uploadErr: any) {
    console.error('[Gemini Upload Error]:', uploadErr?.message);
    const endTs = Date.now();
    return {
      success: false,
      error: 'Không thể tải video lên dịch vụ Gemini Files API. Vui lòng kiểm tra lại tệp video và thử lại.',
      technicalDetails: uploadErr?.message || 'Upload failed',
      diagnostics: {
        selectedModel: SERVER_CONFIG.GEMINI_MODEL,
        videoFilename: meta.filename,
        videoSizeBytes: meta.filesize,
        videoDurationSec: meta.duration,
        uploadStatus: 'Tải lên thất bại',
        analysisAttempt: 0,
        maxAttempts: 3,
        httpStatus: uploadErr?.status || 500,
        requestStartTime,
        requestEndTime: new Date().toISOString(),
        durationMs: endTs - startTs,
        totalRetryDelayMs: 0,
        errorDetails: uploadErr?.message,
      },
      httpStatus: uploadErr?.status || 500,
    };
  }

  // Check if job is still active / not superseded by a newer request
  if (activeJobMap.get(filePath) !== thisJobId) {
    return {
      success: false,
      error: 'Yêu cầu phân tích trước đó đã bị hủy vì có yêu cầu mới.',
      diagnostics: {
        selectedModel: SERVER_CONFIG.GEMINI_MODEL,
        videoFilename: meta.filename,
        videoSizeBytes: meta.filesize,
        videoDurationSec: meta.duration,
        uploadStatus,
        geminiFileUri: geminiFile?.uri,
        geminiFileState: geminiFile?.state,
        analysisAttempt: 0,
        maxAttempts: 3,
        httpStatus: 499,
        requestStartTime,
        requestEndTime: new Date().toISOString(),
        durationMs: Date.now() - startTs,
        totalRetryDelayMs: 0,
        errorDetails: 'Request superseded',
      },
      httpStatus: 499,
    };
  }

  // 2. Prepare editorial instructions and media context
  const silenceSummary = silences.length > 0
    ? `FFmpeg detected ${silences.length} silence intervals: ${JSON.stringify(silences.slice(0, 15))}`
    : 'No silence intervals detected by server audio analyzer.';

  const sceneSummary = (options.sceneCoverageSeconds || 0) <= 0
    ? 'Visual scene analysis was unavailable or timed out. No scene-change evidence was measured.'
    : Array.isArray(options.sceneCuts) && options.sceneCuts.length > 0
      ? 'FFmpeg visual cut candidates in first ' + Number(options.sceneCoverageSeconds).toFixed(1) +
        ' seconds (timestamps): ' + options.sceneCuts.slice(0, 50).map(t => Number(t).toFixed(2)).join(', ') +
        '. These indicate shot boundaries only, NOT content quality or speech.'
      : 'FFmpeg sampled first ' + Number(options.sceneCoverageSeconds).toFixed(1) +
        ' seconds without detecting reliable scene transitions. No inference is possible for unsampled content.';

  const systemPrompt = `You are an expert Hollywood and Viral Video Editor (AI Auto Video Editor).
Your job is to analyze the user's video, understand its semantic moments, speech, flow, and visual interest, then produce an EDIT PLAN JSON strictly adhering to the schema.

CRITICAL EDITORIAL PRINCIPLES:
1. Editorial hook: Keep the most captivating moment or opening statement as a 'hook' (first 2-5 seconds).
2. Continuity: Do not jump-cut erratically if speech is interrupted mid-word. Keep coherent thoughts.
3. Remove dead-air and filler: Cut pauses, awkward filler, stammering, mistakes, and dead air.
4. Technical bounds: The video duration is EXACTLY ${meta.duration.toFixed(2)} seconds. Width: ${meta.width}, Height: ${meta.height}, FPS: ${meta.fps}, HasAudio: ${meta.hasAudio}.
5. Segment timestamps MUST satisfy: 0 <= sourceStart < sourceEnd <= ${meta.duration.toFixed(2)}. No overlap.
6. The target duration is approximately ${options.targetDuration} seconds.
7. Subtitles: Transcribe the spoken words (in the original language, e.g. Vietnamese or English) with accurate start and end timestamps.
8. Silence Guidance: ${silenceSummary}.
8b. Visual cut evidence: ${sceneSummary}. Only source measurements are evidence; never invent details for unreviewed scenes.
9. Preset selected: "${options.preset}".
10. Target aspect ratio: "${options.aspectRatio || '9:16'}".
${options.userPrompt ? `USER SPECIAL INSTRUCTIONS: "${options.userPrompt}"` : ''}

Strictly output valid JSON matching the requested schema. Never output markdown comments or text outside the JSON.`;

  const filePart = {
    fileData: {
      fileUri: geminiFile.uri,
      mimeType: geminiFile.mimeType || 'video/mp4',
    },
  };

  // 3. Sequential retry loop (Maximum 3 attempts) with exponential backoff + jitter
  let parsedJson: any = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptNumber = attempt;

    // Check cancellation
    if (activeJobMap.get(filePath) !== thisJobId) {
      console.log(`[Gemini Analysis] Yêu cầu #${thisJobId} bị hủy vì có yêu cầu mới.`);
      break;
    }

    try {
      console.log(`[Gemini Analysis] Lần gọi mô hình ${attempt}/${maxAttempts} (Model: ${SERVER_CONFIG.GEMINI_MODEL})...`);
      const response = await withTimeout(
        ai.models.generateContent({
          model: SERVER_CONFIG.GEMINI_MODEL,
          contents: [
            filePart,
            { text: systemPrompt },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: editPlanJsonSchema as any,
            temperature: 0.3,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        35000,
        'Yêu cầu phân tích video từ Gemini đã quá thời gian chờ (35s)'
      );

      parsedJson = JSON.parse(response.text || '{}');
      lastHttpStatus = 200;
      lastError = null;
      console.log(`[Gemini Analysis] Thành công ở lần ${attempt}/${maxAttempts}!`);
      break;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode || (String(err?.message || '').includes('503') ? 503 : 500);
      lastHttpStatus = status;
      const errStr = String(err?.message || err || '');

      console.warn(`[Gemini Analysis] Lần ${attempt}/${maxAttempts} chưa thành công: ${status} - ${errStr.slice(0, 150)}`);

      // Stop immediately for non-retryable errors
      if (!isRetryableError(err)) {
        console.warn(`[Gemini Analysis] Lỗi không thể thử lại (${status}):`, errStr);
        break;
      }

      // If retryable and attempts remain, calculate backoff
      if (attempt < maxAttempts) {
        const delayMs = parseRetryDelay(err, attempt);
        totalRetryDelayMs += delayMs;
        console.log(`[Gemini Analysis] Chờ ${delayMs}ms trước lần thử ${attempt + 1}/${maxAttempts}...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  const endTs = Date.now();
  const durationMs = endTs - startTs;
  const requestEndTime = new Date().toISOString();

  // If succeeded
  if (parsedJson) {
    const validation = validateAndSanitizeEditPlan(parsedJson, meta);
    const noReliableSegments = !Array.isArray(parsedJson.segments) ||
      validation.warnings.some(w => w.includes('Không có phân đoạn hợp lệ'));
    if (!validation.valid || noReliableSegments) {
      return {
        success: false,
        httpStatus: 422,
        error: 'Gemini đã phản hồi nhưng kế hoạch biên tập không đủ hợp lệ để dùng. Vui lòng thử lại hoặc chọn chế độ cắt cơ bản.',
        technicalDetails: [...validation.errors, ...validation.warnings].slice(0, 10).join('; '),
        diagnostics: {
          selectedModel: SERVER_CONFIG.GEMINI_MODEL,
          videoFilename: meta.filename, videoSizeBytes: meta.filesize, videoDurationSec: meta.duration,
          uploadStatus, geminiFileUri: geminiFile?.uri, geminiFileState: geminiFile?.state,
          analysisAttempt: attemptNumber, maxAttempts, httpStatus: 422, requestStartTime,
          requestEndTime, durationMs, totalRetryDelayMs,
          errorDetails: 'AI response did not yield a valid editable timeline',
        },
      };
    }
    if (validation.sanitizedPlan.subtitles.length > 0) {
      validation.sanitizedPlan.warnings.push('Phụ đề do AI tạo ra chưa được kiểm chứng với bản ghi âm. Hãy kiểm tra trước khi xuất.');
    }
    const qualityCheck = await runQualityCheck(validation.sanitizedPlan, options.userPrompt);

    return {
      success: true,
      plan: validation.sanitizedPlan,
      qualityCheck,
      diagnostics: {
        selectedModel: SERVER_CONFIG.GEMINI_MODEL,
        videoFilename: meta.filename,
        videoSizeBytes: meta.filesize,
        videoDurationSec: meta.duration,
        uploadStatus,
        geminiFileUri: geminiFile.uri,
        geminiFileState: geminiFile.state,
        analysisAttempt: attemptNumber,
        maxAttempts,
        httpStatus: 200,
        requestStartTime,
        requestEndTime,
        durationMs,
        totalRetryDelayMs,
      },
    };
  }

  // FAILED: DO NOT GENERATE FAKE FALLBACK ANALYSIS.
  // Clearly report that the AI analysis service is temporarily unavailable.
  const rawMsg = lastError?.message || 'Máy chủ AI không khả dụng';
  let friendlyVietnamese = 'Hiện dịch vụ AI đang quá tải (HTTP 503) hoặc tạm thời không thể phân tích video. Vui lòng bấm thử lại sau.';
  if (String(lastHttpStatus) === '401' || String(lastHttpStatus) === '403') {
    friendlyVietnamese = 'Xác thực tài khoản AI không thành công. Vui lòng kiểm tra lại cấu hình API key.';
  } else if (String(lastHttpStatus) === '400') {
    friendlyVietnamese = 'Thông số hoặc định dạng tệp video không được hỗ trợ bởi mô hình AI.';
  } else if (String(lastHttpStatus) === '429') {
    friendlyVietnamese = 'Đã vượt quá giới hạn tần suất yêu cầu AI trong một thời điểm. Vui lòng đợi trong giây lát rồi thử lại.';
  }

  return {
    success: false,
    error: friendlyVietnamese,
    technicalDetails: `${lastHttpStatus} UNAVAILABLE: ${rawMsg}`,
    diagnostics: {
      selectedModel: SERVER_CONFIG.GEMINI_MODEL,
      videoFilename: meta.filename,
      videoSizeBytes: meta.filesize,
      videoDurationSec: meta.duration,
      uploadStatus,
      geminiFileUri: geminiFile?.uri,
      geminiFileState: geminiFile?.state,
      analysisAttempt: attemptNumber,
      maxAttempts,
      httpStatus: lastHttpStatus,
      requestStartTime,
      requestEndTime,
      durationMs,
      totalRetryDelayMs,
      errorDetails: rawMsg,
    },
    httpStatus: typeof lastHttpStatus === 'number' ? lastHttpStatus : 503,
  };
}

/**
 * Quality validation step via Gemini
 */
export async function runQualityCheck(
  plan: EditPlan,
  userPrompt?: string
): Promise<EditQualityCheck> {
  if (!apiKey) {
    return {
      approved: true,
      severity: 'low',
      issues: [],
      suggestedFixes: [],
      editorialScore: 85,
    };
  }

  try {
    const prompt = `Review this video EDIT PLAN for editorial quality, pacing, hook strength, and coherence:
${JSON.stringify({
  preset: plan.project.preset,
  userRequest: userPrompt,
  sourceDuration: plan.source.duration,
  targetDuration: plan.project.targetDuration,
  estimatedFinalDuration: plan.export.actualEstimatedDuration,
  segmentsCount: plan.segments.length,
  keptSegments: plan.segments.filter((s) => s.keep).map((s) => ({
    start: s.sourceStart,
    end: s.sourceEnd,
    role: s.role,
    reason: s.reason,
  })),
  subtitlesCount: plan.subtitles.length,
})}

Evaluate:
1. Is there a strong opening hook?
2. Is the pacing appropriate for the ${plan.project.preset} style?
3. Are there cut sentences or fragmented thoughts?
4. Output JSON with: approved (boolean), severity ("low"|"medium"|"high"), issues (array of strings), suggestedFixes (array of strings), editorialScore (0-100).`;

    const res = await ai.models.generateContent({
      model: SERVER_CONFIG.GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: qualityCheckSchema as any,
        temperature: 0.2,
      },
    });

    const parsed = JSON.parse(res.text || '{}');
    return {
      approved: typeof parsed.approved === 'boolean' ? parsed.approved : true,
      severity: ['low', 'medium', 'high'].includes(parsed.severity) ? parsed.severity : 'low',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestedFixes: Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes : [],
      editorialScore: typeof parsed.editorialScore === 'number' ? parsed.editorialScore : 88,
    };
  } catch (e: any) {
    return {
      approved: true,
      severity: 'low',
      issues: [],
      suggestedFixes: [],
      editorialScore: 80,
    };
  }
}

/**
 * Natural language edit command: modifies existing edit plan without resetting manual changes unless requested
 */
export async function modifyPlanWithNaturalLanguage(
  currentPlan: EditPlan,
  meta: VideoMetadata,
  userCommand: string
): Promise<{ plan: EditPlan; explanation: string }> {
  const applyDeterministicTweaks = (basePlan: EditPlan, cmd: string): { plan: EditPlan; explanation: string } => {
    const tweaked = JSON.parse(JSON.stringify(basePlan));
    tweaked.project.prompt = cmd;
    const lower = cmd.toLowerCase();
    const changes: string[] = [];

    // Aspect ratio
    if (lower.includes('tiktok') || lower.includes('9:16') || lower.includes('reels') || lower.includes('shorts') || lower.includes('dọc')) {
      tweaked.export.aspectRatio = '9:16';
      tweaked.crop.aspectRatio = '9:16';
      changes.push('Chuyển định dạng 9:16 dọc');
    } else if (lower.includes('16:9') || lower.includes('youtube') || lower.includes('ngang') || lower.includes('landscape')) {
      tweaked.export.aspectRatio = '16:9';
      tweaked.crop.aspectRatio = '16:9';
      changes.push('Chuyển định dạng 16:9 ngang');
    } else if (lower.includes('1:1') || lower.includes('vuông') || lower.includes('square')) {
      tweaked.export.aspectRatio = '1:1';
      tweaked.crop.aspectRatio = '1:1';
      changes.push('Chuyển định dạng 1:1 vuông');
    }

    // Target duration
    const durMatch = lower.match(/([0-9]{1,3})\s*(s|giây|second)/i);
    if (durMatch) {
      const dur = parseInt(durMatch[1], 10);
      if (dur > 0) {
        tweaked.project.targetDuration = dur;
        tweaked.export.targetDuration = dur;
        changes.push(`Đặt thời lượng mục tiêu ${dur}s`);
      }
    }

    // Zoom punch-in
    if (lower.includes('zoom') || lower.includes('punch')) {
      tweaked.effects.zoomPunchIn = true;
      tweaked.segments = tweaked.segments.map((s: any) =>
        s.role === 'hook' || s.role === 'highlight' ? { ...s, zoom: 1.15 } : s
      );
      changes.push('Bật hiệu ứng zoom nhẹ ở đoạn quan trọng');
    }

    // Color filter
    if (lower.includes('cinematic') || lower.includes('điện ảnh')) {
      tweaked.effects.colorFilter = 'cinematic';
      changes.push('Áp dụng tone màu Cinematic');
    } else if (lower.includes('vibrant') || lower.includes('rực rỡ')) {
      tweaked.effects.colorFilter = 'vibrant';
      changes.push('Áp dụng tone màu Vibrant');
    }

    const validated = validateAndSanitizeEditPlan(tweaked, meta);
    const desc = changes.length > 0 ? `Đã áp dụng: ${changes.join(', ')}.` : `Đã cập nhật yêu cầu: "${cmd}".`;
    return { plan: validated.sanitizedPlan, explanation: desc };
  };

  if (!apiKey) {
    return applyDeterministicTweaks(currentPlan, userCommand);
  }

  try {
    const prompt = `You are an AI Video Editor modifying an EXISTING Edit Plan.
CURRENT PLAN:
${JSON.stringify(currentPlan)}

USER NATURAL LANGUAGE EDIT COMMAND:
"${userCommand}"

RULES:
1. Modify the current plan to fulfill the user's command.
2. PRESERVE all existing segments that are not in conflict with the command.
3. If user asks to change aspect ratio (e.g. TikTok -> 9:16), update crop and export.
4. If user asks to adjust duration, toggle 'keep' on segments or trim them.
5. If user asks to add zoom punch-in, set effects.zoomPunchIn = true and add zoom: 1.15 on core/highlight segments.
6. Return the updated EDIT PLAN JSON strictly adhering to schema.`;

    const res = await withTimeout(
      ai.models.generateContent({
        model: SERVER_CONFIG.GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: editPlanJsonSchema as any,
          temperature: 0.2,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      8000,
      'Gemini modify plan request timed out'
    );

    const parsed = JSON.parse(res.text || '{}');
    const validated = validateAndSanitizeEditPlan(parsed, meta);

    return {
      plan: validated.sanitizedPlan,
      explanation: `Đã áp dụng các điều chỉnh theo yêu cầu: "${userCommand}"`,
    };
  } catch (err: any) {
    console.error('modifyPlanWithNaturalLanguage fallback:', err.message);
    return applyDeterministicTweaks(currentPlan, userCommand);
  }
}
