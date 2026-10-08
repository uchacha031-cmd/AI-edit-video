import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { SERVER_CONFIG } from './config.js';
import { EditPlan, RenderResult, EditSubtitle } from '../src/types/editor.js';
import { extractMediaMetadata } from './media.js';

// Active render processes for cancellation support
const activeRenders = new Map<string, ChildProcess>();

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Convert EditPlan subtitles into SRT file content.
 * Subtitle timestamps are mapped to the new edited timeline!
 */
export function generateSrtContent(subtitles: EditSubtitle[], keptSegments: { sourceStart: number; sourceEnd: number }[]): string {
  if (!subtitles || subtitles.length === 0) return '';

  let srt = '';
  let count = 1;

  // Map source timestamps into new concatenated timeline
  for (const sub of subtitles) {
    let mappedStart: number | null = null;
    let mappedEnd: number | null = null;
    let elapsed = 0;

    for (const seg of keptSegments) {
      const segDur = seg.sourceEnd - seg.sourceStart;
      
      // Check if subtitle overlaps with kept segment
      if (sub.end > seg.sourceStart && sub.start < seg.sourceEnd) {
        const segOverlapStart = Math.max(sub.start, seg.sourceStart);
        const segOverlapEnd = Math.min(sub.end, seg.sourceEnd);
        
        const subRelativeStart = elapsed + (segOverlapStart - seg.sourceStart);
        const subRelativeEnd = elapsed + (segOverlapEnd - seg.sourceStart);

        if (mappedStart === null || subRelativeStart < mappedStart) {
          mappedStart = subRelativeStart;
        }
        mappedEnd = subRelativeEnd;
      }
      elapsed += segDur;
    }

    if (mappedStart !== null && mappedEnd !== null && mappedEnd > mappedStart) {
      srt += `${count}\n`;
      srt += `${formatSrtTimestamp(mappedStart)} --> ${formatSrtTimestamp(mappedEnd)}\n`;
      srt += `${sub.text}\n\n`;
      count++;
    }
  }

  return srt;
}

/**
 * Cancel an ongoing render by renderId
 */
export function cancelRender(renderId: string): boolean {
  const proc = activeRenders.get(renderId);
  if (proc) {
    proc.kill('SIGKILL');
    activeRenders.delete(renderId);
    return true;
  }
  return false;
}

/**
 * Core FFmpeg Render Execution
 */
export async function renderEditPlan(
  sourceFilePath: string,
  plan: EditPlan,
  renderId: string,
  options?: {
    burnSubtitles?: boolean;
    onProgress?: (percent: number) => void;
  }
): Promise<RenderResult> {
  const startTime = Date.now();
  await fs.mkdir(SERVER_CONFIG.RENDER_DIR, { recursive: true });

  const tempJobDir = path.join(SERVER_CONFIG.RENDER_DIR, `job_${renderId}`);
  await fs.mkdir(tempJobDir, { recursive: true });

  const outputFilename = `edited_${renderId}.mp4`;
  const srtFilename = `subtitles_${renderId}.srt`;
  const outputPath = path.join(SERVER_CONFIG.RENDER_DIR, outputFilename);
  const srtPath = path.join(SERVER_CONFIG.RENDER_DIR, srtFilename);

  const warnings: string[] = [];

  try {
    const meta = await extractMediaMetadata(sourceFilePath);
    const keptSegments = plan.segments.filter((s) => s.keep);

    if (keptSegments.length === 0) {
      throw new Error('Cannot render: No segments are marked to keep.');
    }

    // 1. Determine target dimensions
    const aspect = plan.export.aspectRatio || '9:16';
    const res = plan.export.resolution || '720p';

    let targetW = 720;
    let targetH = 1280;

    if (aspect === '9:16') {
      targetW = res === '1080p' ? 1080 : 720;
      targetH = res === '1080p' ? 1920 : 1280;
    } else if (aspect === '16:9') {
      targetW = res === '1080p' ? 1920 : 1280;
      targetH = res === '1080p' ? 1080 : 720;
    } else if (aspect === '1:1') {
      targetW = res === '1080p' ? 1080 : 720;
      targetH = res === '1080p' ? 1080 : 720;
    }

    // 2. Generate SRT subtitle file
    const srtContent = generateSrtContent(
      plan.subtitles || [],
      keptSegments.map((s) => ({ sourceStart: s.sourceStart, sourceEnd: s.sourceEnd }))
    );
    await fs.writeFile(srtPath, srtContent, 'utf-8');

    // 3. Prepare FFmpeg Filter Graph
    const filterParts: string[] = [];
    const vConcatInputs: string[] = [];
    const aConcatInputs: string[] = [];

    const hasAudio = meta.hasAudio;
    const focalX = plan.crop?.focalPoint?.x ?? 0.5;
    const focalY = plan.crop?.focalPoint?.y ?? 0.5;

    for (let i = 0; i < keptSegments.length; i++) {
      const seg = keptSegments[i];
      const start = seg.sourceStart.toFixed(3);
      const end = seg.sourceEnd.toFixed(3);

      // Video trim
      const vLabel = `v_${i}`;
      filterParts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[${vLabel}]`);
      vConcatInputs.push(`[${vLabel}]`);

      // Audio trim
      if (hasAudio) {
        const aLabel = `a_${i}`;
        filterParts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[${aLabel}]`);
        aConcatInputs.push(`[${aLabel}]`);
      }
    }

    // Concat
    const numSegs = keptSegments.length;
    let currentV = 'v_cat';
    let currentA = 'a_cat';

    if (hasAudio) {
      const concatInputs = vConcatInputs.map((v, i) => `${v}${aConcatInputs[i]}`).join('');
      filterParts.push(`${concatInputs}concat=n=${numSegs}:v=1:a=1[${currentV}][${currentA}]`);
    } else {
      filterParts.push(`${vConcatInputs.join('')}concat=n=${numSegs}:v=1:a=0[${currentV}]`);
    }

    // Aspect ratio crop & scale filter
    // Smart crop using focal point (scale to cover, then crop to targetW x targetH)
    const scaleCropFilter = `scale=w=${targetW}:h=${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}:(iw-${targetW})*${focalX}:(ih-${targetH})*${focalY}`;
    filterParts.push(`[${currentV}]${scaleCropFilter}[v_cropped]`);
    currentV = 'v_cropped';

    // Color effects
    if (plan.effects?.colorFilter && plan.effects.colorFilter !== 'none') {
      let colorEq = '';
      if (plan.effects.colorFilter === 'vibrant') {
        colorEq = 'eq=saturation=1.25:contrast=1.05';
      } else if (plan.effects.colorFilter === 'warm') {
        colorEq = 'colorbalance=rs=0.1:gs=0.03:bs=-0.08';
      } else if (plan.effects.colorFilter === 'cool') {
        colorEq = 'colorbalance=rs=-0.08:gs=0.02:bs=0.12';
      } else if (plan.effects.colorFilter === 'cinematic') {
        colorEq = 'eq=contrast=1.12:saturation=0.95,curves=preset=cross_process';
      }

      if (colorEq) {
        filterParts.push(`[${currentV}]${colorEq}[v_graded]`);
        currentV = 'v_graded';
      }
    }

    // Burn subtitles if requested and srtContent exists
    const shouldBurn = options?.burnSubtitles !== false && srtContent.length > 5;
    if (shouldBurn) {
      // Escape path for ffmpeg subtitles filter (replace ':' and '\')
      const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const subStyle = `FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,MarginV=36,Alignment=2`;
      filterParts.push(`[${currentV}]subtitles='${escapedSrt}':force_style='${subStyle}'[v_subbed]`);
      currentV = 'v_subbed';
    }

    // Audio normalization
    if (hasAudio && plan.audio?.normalize) {
      filterParts.push(`[${currentA}]loudnorm=I=-16:TP=-1.5:LRA=11[a_norm]`);
      currentA = 'a_norm';
    } else if (hasAudio && plan.audio?.volumeBoost && plan.audio.volumeBoost !== 1.0) {
      filterParts.push(`[${currentA}]volume=${plan.audio.volumeBoost}[a_norm]`);
      currentA = 'a_norm';
    }

    const filterComplexStr = filterParts.join(';');

    // 4. Build safe argument list for child_process.spawn
    const ffmpegArgs = [
      '-y',
      '-i', sourceFilePath,
      '-filter_complex', filterComplexStr,
      '-map', `[${currentV}]`,
    ];

    if (hasAudio) {
      ffmpegArgs.push('-map', `[${currentA}]`);
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath
    );

    // 5. Execute render with child_process
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', ffmpegArgs);
      activeRenders.set(renderId, proc);

      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        // Progress parsing
        const timeMatch = /time=([0-9:.]+)/.exec(d.toString());
        if (timeMatch && options?.onProgress) {
          const parts = timeMatch[1].split(':');
          if (parts.length === 3) {
            const curSec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            const estTotal = plan.export.actualEstimatedDuration || 30;
            const pct = Math.min(99, Math.round((curSec / estTotal) * 100));
            options.onProgress(pct);
          }
        }
      });

      proc.on('close', (code) => {
        activeRenders.delete(renderId);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg render process failed with code ${code}: ${stderr.slice(-600)}`));
        }
      });

      proc.on('error', (err) => {
        activeRenders.delete(renderId);
        reject(err);
      });
    });

    // 6. Inspect rendered file
    const renderedMeta = await extractMediaMetadata(outputPath);
    const stat = await fs.stat(outputPath);

    return {
      success: true,
      videoUrl: `/api/media/render/${outputFilename}`,
      srtUrl: srtContent.length > 0 ? `/api/media/render/${srtFilename}` : undefined,
      filename: outputFilename,
      duration: renderedMeta.duration,
      sizeBytes: stat.size,
      warnings,
      renderTimeSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
    };
  } catch (err: any) {
    // If burn subtitles failed, try fallback without subtitles
    if (options?.burnSubtitles !== false && err.message?.includes('subtitles')) {
      warnings.push('Subtitle burn-in failed; re-rendering video without burned subtitles. SRT file is still available for download.');
      return renderEditPlan(sourceFilePath, plan, renderId, {
        burnSubtitles: false,
        onProgress: options?.onProgress,
      });
    }
    throw err;
  } finally {
    // Cleanup temporary job directory
    try {
      await fs.rm(tempJobDir, { recursive: true, force: true });
    } catch {}
  }
}
