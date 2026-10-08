import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { VideoMetadata, SilenceInterval } from '../src/types/editor.js';
import { SERVER_CONFIG } from './config.js';

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
export async function detectSilence(
  filePath: string,
  noiseDb = -30,
  minDurationSec = 0.5
): Promise<SilenceInterval[]> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-i', filePath,
      '-af', `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
      '-f', 'null',
      '-',
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', () => {
      const intervals: SilenceInterval[] = [];
      const silenceStartRegex = /silence_start:\s*([0-9.]+)/g;
      const silenceEndRegex = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;

      const starts: number[] = [];
      let match;

      while ((match = silenceStartRegex.exec(stderr)) !== null) {
        starts.push(parseFloat(match[1]));
      }

      let endIdx = 0;
      while ((match = silenceEndRegex.exec(stderr)) !== null) {
        const end = parseFloat(match[1]);
        const dur = parseFloat(match[2]);
        const start = starts[endIdx] !== undefined ? starts[endIdx] : Math.max(0, end - dur);
        intervals.push({
          start: Math.round(start * 100) / 100,
          end: Math.round(end * 100) / 100,
          duration: Math.round(dur * 100) / 100,
        });
        endIdx++;
      }

      resolve(intervals);
    });

    proc.on('error', () => {
      resolve([]);
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
