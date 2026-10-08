import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { SERVER_CONFIG } from './config.js';

/**
 * Generate synthetic sample video clips on demand using FFmpeg
 */
export async function getOrCreateSampleVideo(
  type: 'talking_head' | 'landscape_demo' | 'no_audio' = 'talking_head'
): Promise<string> {
  await fs.mkdir(SERVER_CONFIG.SAMPLES_DIR, { recursive: true });
  const filename = `sample_${type}.mp4`;
  const filePath = path.join(SERVER_CONFIG.SAMPLES_DIR, filename);

  // Check if exists and valid
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 10000) {
      return filePath;
    }
  } catch {}

  if (type === 'talking_head') {
    // 15 seconds, 720x1280 (portrait 9:16), 2 silence pauses at 4-6s and 11-13s
    await runFfmpegCommand([
      '-f', 'lavfi', '-i', 'testsrc=duration=15:size=720x1280:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=15',
      '-filter_complex',
      "[0:v]drawbox=y=ih-200:color=black@0.6:width=iw:height=140:t=fill,drawtext=text='AI Video Editor - Talking Head':fontcolor=white:fontsize=32:x=(w-tw)/2:y=h-160[v];[1:a]volume=enable='between(t,4,6)+between(t,11,13)':volume=0[a]",
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-y', filePath,
    ]);
  } else if (type === 'landscape_demo') {
    // 18 seconds, 1280x720 (16:9), 2 silence pauses at 5-7s and 12-14s
    await runFfmpegCommand([
      '-f', 'lavfi', '-i', 'smptebars=duration=18:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=523:duration=18',
      '-filter_complex',
      "[0:v]drawbox=y=ih-140:color=black@0.7:width=iw:height=100:t=fill,drawtext=text='Landscape 16\\:9 Tech Demo':fontcolor=white:fontsize=36:x=(w-tw)/2:y=h-110[v];[1:a]volume=enable='between(t,5,7)+between(t,12,14)':volume=0[a]",
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-y', filePath,
    ]);
  } else {
    // 8 seconds, 720x720 (1:1), No audio stream
    await runFfmpegCommand([
      '-f', 'lavfi', '-i', 'testsrc2=duration=8:size=720x720:rate=30',
      '-vf', "drawbox=y=ih-120:color=black@0.7:width=iw:height=80:t=fill,drawtext=text='Silent Square Clip':fontcolor=white:fontsize=32:x=(w-tw)/2:y=h-80",
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
      '-pix_fmt', 'yuv420p',
      '-y', filePath,
    ]);
  }

  return filePath;
}

function runFfmpegCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Sample generation failed code ${code}: ${stderr.slice(-400)}`));
    });
    proc.on('error', reject);
  });
}
