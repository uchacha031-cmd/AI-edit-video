import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { VideoMetadata, SilenceInterval } from '../src/types/editor.js';
import { SERVER_CONFIG } from './config.js';
import { cleanSceneCuts } from './editing.js';

/**
 * Execute ffprobe to extract accurate video and audio metadata.
 */
export async function extractMediaMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
      }

      try {
        const info = JSON.parse(stdout);
        const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');

        const duration = parseFloat(info.format?.duration || videoStream?.duration || '0');
        const filesize = parseInt(info.format?.size || '0', 10);
        const width = videoStream ? parseInt(videoStream.width || '0', 10) : 0;
        const height = videoStream ? parseInt(videoStream.height || '0', 10) : 0;

        // Calculate FPS
        let fps = 30;
        if (videoStream?.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2 && parseFloat(parts[1]) > 0) {
            fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
          } else if (parseFloat(parts[0]) > 0) {
            fps = Math.round(parseFloat(parts[0]));
          }
        }

        // Determine aspect ratio label
        let aspectRatioLabel = '16:9';
        if (width > 0 && height > 0) {
          const ratio = width / height;
          if (Math.abs(ratio - 9 / 16) < 0.15) {
            aspectRatioLabel = '9:16';
          } else if (Math.abs(ratio - 1) < 0.15) {
            aspectRatioLabel = '1:1';
          } else {
            aspectRatioLabel = '16:9';
          }
        }

        const metadata: VideoMetadata = {
          filename: path.basename(filePath),
          filesize,
          duration: Math.max(0.1, duration),
          width,
          height,
          fps: fps || 30,
          videoCodec: videoStream?.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          hasAudio: !!audioStream,
          bitrate: parseInt(info.format?.bit_rate || '0', 10),
          aspectRatioLabel,
        };

        resolve(metadata);
      } catch (err: any) {
        reject(new Error(`Failed to parse ffprobe json: ${err.message}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Detect silence intervals using ffmpeg silencedetect filter.
 * Returns array of { start, end, duration } in seconds.
 */
export function parseSilencedetectLog(log: string, sourceDurationSec?: number): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  const events = /silence_(start|end):\s*(\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  let activeStart: number | null = null;
  while ((match = events.exec(log))) {
    const t = Number(match[2]);
    if (!Number.isFinite(t)) continue;
    if (match[1] === 'start') {
      if (activeStart === null) activeStart = t;
    } else if (activeStart !== null && t > activeStart) {
      intervals.push({ start: activeStart, end: t, duration: t - activeStart });
      activeStart = null;
    }
  }
  // FFmpeg can omit silence_end when the source ends during silence.
  if (activeStart !== null && Number.isFinite(sourceDurationSec) && sourceDurationSec! > activeStart) {
    intervals.push({ start: activeStart, end: sourceDurationSec!, duration: sourceDurationSec! - activeStart });
  }
  return intervals.map(x => ({
    start: Math.round(x.start * 1000) / 1000,
    end: Math.round(x.end * 1000) / 1000,
    duration: Math.round(x.duration * 1000) / 1000,
  }));
}

export async function detectSilence(
  filePath: string,
  noiseDb = -30,
  minDurationSec = 0.5,
  sourceDurationSec?: number
): Promise<SilenceInterval[]> {
  return new Promise((resolve) => {
    const db = Number.isFinite(noiseDb) ? Math.max(-80, Math.min(-5, noiseDb)) : -30;
    const seconds = Number.isFinite(minDurationSec) ? Math.max(0.1, Math.min(10, minDurationSec)) : 0.5;
    const proc = spawn('ffmpeg', [
      '-hide_banner', '-nostats', '-loglevel', 'info', '-i', filePath,
      '-af', 'silencedetect=noise=' + db + 'dB:d=' + seconds,
      '-f', 'null', '-',
    ]);
    let log = '';
    let settled = false;
    const finish = (result: SilenceInterval[]) => { if (!settled) { settled = true; resolve(result); } };
    proc.stderr.on('data', chunk => {
      log += String(chunk);
      if (log.length > 512_000) log = log.slice(-512_000);
    });
    proc.on('error', () => finish([]));
    proc.on('close', code => finish(code === 0 ? parseSilencedetectLog(log, sourceDurationSec) : []));
  });
}

/**
 * FFmpeg scene-change candidates based on visual frame differences.
 * Inspired by PySceneDetect's content-adaptive approach, but intentionally
 * independent and non-AI. Time-window coverage is explicit.
 */
export async function detectSceneChanges(
  filePath: string,
  sourceDurationSec: number,
  limitSeconds = 120,
): Promise<{ timestamps: number[]; analyzedSeconds: number }> {
  const analyzedSeconds = Math.min(sourceDurationSec, limitSeconds);
  if (!Number.isFinite(analyzedSeconds) || analyzedSeconds < 1) return { timestamps: [], analyzedSeconds: 0 };
  return new Promise(resolve => {
    const args = [
      '-hide_banner', '-nostats', '-loglevel', 'info', '-i', filePath,
      '-t', String(analyzedSeconds),
      '-vf', 'fps=3,scale=256:-2,select=gt(scene\\,0.28),showinfo',
      '-an', '-f', 'null', '-',
    ];
    const proc = spawn('ffmpeg', args);
    let log = '';
    let settled = false;
    const timer = setTimeout(() => { proc.kill('SIGKILL'); }, 15_000);
    timer.unref();
    const finish = (result: number[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ timestamps: result, analyzedSeconds });
    };
    proc.stderr.on('data', chunk => {
      log += String(chunk);
      if (log.length > 512_000) log = log.slice(-512_000);
    });
    proc.on('error', () => finish([]));
    proc.on('close', code => {
      if (code !== 0) return finish([]);
      const matches = [...log.matchAll(/Parsed_showinfo[^\n]*pts_time:\s*([0-9.]+)/g)];
      finish(cleanSceneCuts(matches.map(m => Number(m[1])), analyzedSeconds));
    });
  });
}

/**
 * Extract 4 scene candidate keyframes as PNG/JPEG thumbnails
 */
export async function extractThumbnails(
  filePath: string,
  duration: number,
  outputDir = SERVER_CONFIG.THUMB_DIR
): Promise<string[]> {
  await fs.mkdir(outputDir, { recursive: true });
  const baseName = path.basename(filePath, path.extname(filePath));
  
  const timestamps = [
    Math.min(0.5, duration * 0.1),
    duration * 0.35,
    duration * 0.65,
    Math.max(0.5, duration * 0.85),
  ];

  const thumbFiles: string[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const outFilename = `${baseName}_thumb_${i + 1}.jpg`;
    const outPath = path.join(outputDir, outFilename);

    await new Promise<void>((res) => {
      const proc = spawn('ffmpeg', [
        '-ss', ts.toFixed(2),
        '-i', filePath,
        '-vframes', '1',
        '-q:v', '2',
        '-vf', 'scale=480:-1',
        '-y',
        outPath,
      ]);

      proc.on('close', () => {
        thumbFiles.push(`/api/media/thumb/${outFilename}`);
        res();
      });

      proc.on('error', () => {
        res();
      });
    });
  }

  return thumbFiles;
}
