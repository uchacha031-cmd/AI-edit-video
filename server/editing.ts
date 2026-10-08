import type { SilenceInterval } from '../src/types/editor.js';

export interface TimeRange { start: number; end: number }
export interface ConservativeEditTimeline {
  kept: TimeRange[];
  removed: TimeRange[];
  warnings: string[];
}

/**
 * Adapted editorial PRINCIPLES (not copied code) from Auto-Editor's --margin
 * and --smooth: leave speech breathers around each pause and do not create
 * extremely short clips or cuts. This is deterministic, non-AI editing.
 */
export function buildConservativeEditTimeline(
  sourceDuration: number,
  rawSilences: SilenceInterval[],
  config: { afterSpeech?: number; beforeSpeech?: number; minSilence?: number; minCut?: number; minKeep?: number } = {}
): ConservativeEditTimeline {
  const warnings: string[] = [];
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return { kept: [], removed: [], warnings: ['Thời lượng video nguồn không hợp lệ.'] };
  }
  const afterSpeech = bounded(config.afterSpeech, 0.18, 0, 1);
  const beforeSpeech = bounded(config.beforeSpeech, 0.25, 0, 1);
  const minSilence = bounded(config.minSilence, 0.70, 0.2, 3);
  const minCut = bounded(config.minCut, 0.30, 0.15, 2);
  const minKeep = bounded(config.minKeep, 0.25, 0.15, 2);

  const normalized = (Array.isArray(rawSilences) ? rawSilences : [])
    .filter(s => s && Number.isFinite(s.start) && Number.isFinite(s.end))
    .map(s => ({
      start: Math.max(0, Math.min(sourceDuration, s.start)),
      end: Math.max(0, Math.min(sourceDuration, s.end)),
    }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Merge overlapping / adjacent detector intervals before deciding cuts.
  const merged: TimeRange[] = [];
  for (const interval of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end + 0.06) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  const removed: TimeRange[] = [];
  let cursor = 0;
  for (const pause of merged) {
    if (pause.end - pause.start < minSilence) continue;
    const leading = pause.start <= 0.08;
    const trailing = pause.end >= sourceDuration - 0.08;
    const proposedStart = leading ? 0 : pause.start + afterSpeech;
    const proposedEnd = trailing ? sourceDuration : pause.end - beforeSpeech;
    const cutStart = round(Math.max(cursor, proposedStart));
    const cutEnd = round(Math.min(sourceDuration, proposedEnd));
    if (cutEnd - cutStart < minCut) continue;
    // Never chop a tiny island of spoken content between adjacent removals.
    if (cutStart > cursor && cutStart - cursor < minKeep) continue;
    removed.push({ start: cutStart, end: cutEnd });
    cursor = cutEnd;
    if (removed.length >= 120) {
      warnings.push('Video có quá nhiều khoảng lặng; giới hạn 120 đoạn cắt để tránh render quá tải.');
      break;
    }
  }

  // A completely silent video should never result in an empty timeline.
  if (removed.length === 1 && removed[0].start === 0 && removed[0].end >= sourceDuration) {
    return {
      kept: [{ start: 0, end: round(sourceDuration) }],
      removed: [],
      warnings: [...warnings, 'Video không có đoạn lời nói rõ ràng; giữ lại toàn bộ video để người dùng tự lựa chọn.'],
    };
  }

  const kept: TimeRange[] = [];
  cursor = 0;
  for (const cut of removed) {
    if (cut.start > cursor + 0.001) kept.push({ start: round(cursor), end: cut.start });
    cursor = cut.end;
  }
  if (sourceDuration > cursor + 0.001) kept.push({ start: round(cursor), end: round(sourceDuration) });

  // Avoid a <minKeep tail by cancelling the last removal, preserving speech.
  if (kept.length > 0 && kept[kept.length - 1].end - kept[kept.length - 1].start < minKeep) {
    const last = removed[removed.length - 1];
    const tail = kept.pop()!;
    if (last && last.end <= tail.start + 0.001) {
      removed.pop();
      const previous = kept[kept.length - 1];
      if (previous) previous.end = tail.end;
      else kept.push({ start: 0, end: tail.end });
      warnings.push('Đã giữ lại một đoạn quá ngắn ở cuối để tránh mất lời nói.');
    } else {
      kept.push(tail);
    }
  }

  if (kept.length === 0) {
    return { kept: [{ start: 0, end: round(sourceDuration) }], removed: [], warnings };
  }
  return { kept, removed, warnings };
}

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
}
function round(n: number): number { return Math.round(n * 1000) / 1000; }

/** Scene evidence is advisory; leave enough room between scene boundaries. */
export function cleanSceneCuts(raw: number[], duration: number, minScene = 0.65, maxCuts = 80): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const result: number[] = [];
  for (const t of (Array.isArray(raw) ? raw : []).filter(Number.isFinite).sort((a, b) => a - b)) {
    if (t <= minScene || t >= duration - minScene) continue;
    if (!result.length || t - result[result.length - 1] >= minScene) result.push(round(t));
    if (result.length === maxCuts) break;
  }
  return result;
}
