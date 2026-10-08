import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

const APP_ROOT = process.cwd();
const STORAGE_ROOT = path.resolve(APP_ROOT, 'temp_storage');

export const SERVER_CONFIG = {
  // Gemini model for multimodal video understanding & editorial planning (Single configuration constant)
  GEMINI_MODEL: 'gemini-3.5-flash',
  
  // Centralized Storage paths
  STORAGE_ROOT,
  UPLOAD_DIR: path.resolve(STORAGE_ROOT, 'uploads'),
  RENDER_DIR: path.resolve(STORAGE_ROOT, 'renders'),
  THUMB_DIR: path.resolve(STORAGE_ROOT, 'thumbs'),
  SAMPLES_DIR: path.resolve(STORAGE_ROOT, 'samples'),
  
  // Safe limits for preview environment
  MAX_FILE_SIZE_BYTES: 150 * 1024 * 1024, // 150MB
  MAX_SOURCE_DURATION_SEC: 600, // 10 minutes max in V1
  DEFAULT_TARGET_DURATION_SEC: 30, // 30s default
  
  // Supported video mime types
  ALLOWED_MIME_TYPES: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'video/mpeg',
  ],
  
  // Supported aspect ratios and resolutions
  SUPPORTED_ASPECT_RATIOS: ['9:16', '16:9', '1:1'] as const,
  SUPPORTED_RESOLUTIONS: ['720p', '1080p'] as const,
};

/**
 * Robustly create and verify write permissions for all server storage directories
 */
export async function ensureStorageDirectories(): Promise<void> {
  const dirs = [
    SERVER_CONFIG.STORAGE_ROOT,
    SERVER_CONFIG.UPLOAD_DIR,
    SERVER_CONFIG.RENDER_DIR,
    SERVER_CONFIG.THUMB_DIR,
    SERVER_CONFIG.SAMPLES_DIR,
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fsSync.constants.W_OK);
  }
}
