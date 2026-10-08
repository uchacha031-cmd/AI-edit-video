import { EditPlan, EditSegment, EditCut, EditSubtitle, VideoMetadata } from '../src/types/editor.js';

export interface ValidationResult {
  valid: boolean;
  sanitizedPlan: EditPlan;
  errors: string[];
  warnings: string[];
}

/**
 * Deterministically validate, sanitize, and repair an EditPlan against the source metadata.
 */
export function validateAndSanitizeEditPlan(
  rawPlan: any,
  sourceMeta: VideoMetadata
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawPlan || typeof rawPlan !== 'object') {
    return {
      valid: false,
      sanitizedPlan: null as any,
      errors: ['Kế hoạch dựng không phải là đối tượng JSON hợp lệ.'],
      warnings: [],
    };
  }

  const sourceDuration = sourceMeta.duration;

  // 1. Sanitize project & source
  const project = {
    title: String(rawPlan.project?.title || 'Dự án dựng tự động').trim(),
    sourceDuration: Number(sourceDuration.toFixed(2)),
    targetDuration: Math.max(5, Number(rawPlan.project?.targetDuration || 30)),
    preset: String(rawPlan.project?.preset || 'Fast TikTok'),
    prompt: rawPlan.project?.prompt ? String(rawPlan.project.prompt) : undefined,
  };

  const source = {
    filename: sourceMeta.filename,
    duration: Number(sourceDuration.toFixed(2)),
    width: sourceMeta.width,
    height: sourceMeta.height,
    fps: sourceMeta.fps,
    codec: sourceMeta.videoCodec,
    hasAudio: sourceMeta.hasAudio,
  };

  // 2. Validate & Sanitize Segments
  const rawSegments = Array.isArray(rawPlan.segments) ? rawPlan.segments : [];
  const validSegments: EditSegment[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const s = rawSegments[i];
    let start = Number(s.sourceStart);
    let end = Number(s.sourceEnd);

    if (isNaN(start) || isNaN(end)) {
      warnings.push(`Phân đoạn #${i + 1} có mốc thời gian không hợp lệ; đã bỏ qua.`);
      continue;
    }

    // Clamp within source bounds [0, sourceDuration]
    start = Math.max(0, Math.min(start, sourceDuration));
    end = Math.max(0, Math.min(end, sourceDuration));

    // Must be positive duration
    if (end <= start) {
      warnings.push(`Phân đoạn #${i + 1} có thời điểm kết thúc trước bắt đầu (${start}s -> ${end}s); đã bỏ qua.`);
      continue;
    }

    // Min segment threshold (0.25s)
    if (end - start < 0.25) {
      warnings.push(`Phân đoạn #${i + 1} quá ngắn (<0.25s); đã bỏ qua.`);
      continue;
    }

    const keep = typeof s.keep === 'boolean' ? s.keep : true;
    const confidence = typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0.85;
    const role = ['hook', 'core', 'highlight', 'filler', 'silence', 'outro'].includes(s.role)
      ? s.role
      : 'core';
    const reason = String(s.reason || 'Đoạn nội dung được chọn').slice(0, 300);
    const label = s.label ? String(s.label).slice(0, 100) : undefined;
    const zoom = s.zoom && typeof s.zoom === 'number' ? Math.max(1.0, Math.min(1.35, s.zoom)) : 1.0;

    let focalPoint = { x: 0.5, y: 0.5 };
    if (s.focalPoint && typeof s.focalPoint === 'object') {
      const fx = Number(s.focalPoint.x);
      const fy = Number(s.focalPoint.y);
      if (!isNaN(fx) && !isNaN(fy)) {
        focalPoint = {
          x: Math.max(0, Math.min(1, fx)),
          y: Math.max(0, Math.min(1, fy)),
        };
      }
    }

    validSegments.push({
      id: s.id ? String(s.id) : `seg_${i + 1}_${Math.floor(start * 10)}`,
      sourceStart: Number(start.toFixed(2)),
      sourceEnd: Number(end.toFixed(2)),
      keep,
      confidence,
      reason,
      role,
      label,
      zoom,
      focalPoint,
    });
  }

  // If no valid segments produced by AI, create fallback whole or half clips
  if (validSegments.length === 0) {
    warnings.push('Không có phân đoạn hợp lệ; hệ thống đã tạo phân đoạn mặc định toàn video.');
    validSegments.push({
      id: 'seg_default_1',
      sourceStart: 0,
      sourceEnd: Number(sourceDuration.toFixed(2)),
      keep: true,
      confidence: 1.0,
      reason: 'Toàn bộ nội dung video gốc',
      role: 'core',
      zoom: 1.0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
  }

  // Sort segments by start time
  validSegments.sort((a, b) => a.sourceStart - b.sourceStart);

  // Resolve overlaps between consecutive kept segments
  for (let i = 0; i < validSegments.length - 1; i++) {
    const curr = validSegments[i];
    const next = validSegments[i + 1];
    if (curr.sourceEnd > next.sourceStart) {
      warnings.push(`Đã tự động điều chỉnh điểm chồng lấn giữa đoạn ${curr.id} và ${next.id}.`);
      curr.sourceEnd = Number(Math.max(curr.sourceStart + 0.2, next.sourceStart).toFixed(2));
    }
  }

  // Calculate actual kept duration
  let keptDuration = 0;
  validSegments.forEach((s) => {
    if (s.keep) {
      keptDuration += (s.sourceEnd - s.sourceStart);
    }
  });

  // 3. Compute derived Cuts
  const cuts: EditCut[] = [];
  validSegments.forEach((s) => {
    if (!s.keep) {
      cuts.push({
        sourceStart: s.sourceStart,
        sourceEnd: s.sourceEnd,
        reason: s.reason,
      });
    }
  });

  // 4. Validate & Sanitize Subtitles
  const rawSubtitles = Array.isArray(rawPlan.subtitles) ? rawPlan.subtitles : [];
  const validSubtitles: EditSubtitle[] = [];

  for (let i = 0; i < rawSubtitles.length; i++) {
    const sub = rawSubtitles[i];
    let start = Number(sub.start);
    let end = Number(sub.end);
    const text = String(sub.text || '').trim();

    if (isNaN(start) || isNaN(end) || !text) continue;

    start = Math.max(0, Math.min(start, sourceDuration));
    end = Math.max(0, Math.min(end, sourceDuration));

    if (end > start) {
      validSubtitles.push({
        id: sub.id ? String(sub.id) : `sub_${i + 1}`,
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
        text,
      });
    }
  }

  validSubtitles.sort((a, b) => a.start - b.start);

  // 5. Sanitize Crop & Effects
  const validAspectRatios = ['9:16', '16:9', '1:1'] as const;
  const rawAspect = rawPlan.crop?.aspectRatio || rawPlan.export?.aspectRatio || '9:16';
  const aspectRatio = validAspectRatios.includes(rawAspect) ? rawAspect : '9:16';

  const crop = {
    aspectRatio,
    focalPoint: {
      x: typeof rawPlan.crop?.focalPoint?.x === 'number' ? Math.max(0, Math.min(1, rawPlan.crop.focalPoint.x)) : 0.5,
      y: typeof rawPlan.crop?.focalPoint?.y === 'number' ? Math.max(0, Math.min(1, rawPlan.crop.focalPoint.y)) : 0.5,
    },
  };

  const effects = {
    zoomPunchIn: Boolean(rawPlan.effects?.zoomPunchIn),
    colorFilter: ['none', 'vibrant', 'warm', 'cool', 'cinematic'].includes(rawPlan.effects?.colorFilter)
      ? rawPlan.effects.colorFilter
      : 'none',
    transition: ['none', 'fade', 'crossfade'].includes(rawPlan.effects?.transition)
      ? rawPlan.effects.transition
      : 'none',
  };

  const audio = {
    normalize: rawPlan.audio?.normalize !== false,
    removeSilence: rawPlan.audio?.removeSilence !== false,
    silenceThresholdDb: typeof rawPlan.audio?.silenceThresholdDb === 'number'
      ? rawPlan.audio.silenceThresholdDb
      : -30,
    volumeBoost: typeof rawPlan.audio?.volumeBoost === 'number'
      ? Math.max(0.5, Math.min(2.0, rawPlan.audio.volumeBoost))
      : 1.0,
  };

  const validResolutions = ['720p', '1080p'] as const;
  const rawRes = rawPlan.export?.resolution || '720p';
  const resolution = validResolutions.includes(rawRes) ? rawRes : '720p';

  const exportConfig = {
    aspectRatio,
    resolution,
    fps: sourceMeta.fps || 30,
    targetDuration: project.targetDuration,
    actualEstimatedDuration: Number(keptDuration.toFixed(2)),
  };

  if (keptDuration <= 0) {
    errors.push('Không có phân đoạn nào được giữ; thời lượng video sau dựng bằng 0 giây.');
  }

  const sanitizedPlan: EditPlan = {
    project,
    source,
    segments: validSegments,
    cuts,
    subtitles: validSubtitles,
    crop,
    effects,
    audio,
    export: exportConfig,
    warnings: Array.from(new Set([...(rawPlan.warnings || []), ...warnings])),
  };

  return {
    valid: errors.length === 0,
    sanitizedPlan,
    errors,
    warnings,
  };
}
