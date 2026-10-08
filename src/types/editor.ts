export type AspectRatio = '9:16' | '16:9' | '1:1';
export type Resolution = '720p' | '1080p';
export type SegmentRole = 'hook' | 'core' | 'highlight' | 'filler' | 'silence' | 'outro';

export interface VideoMetadata {
  filename: string;
  filesize: number;
  duration: number; // in seconds
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec?: string;
  hasAudio: boolean;
  bitrate?: number;
  aspectRatioLabel: AspectRatio | string;
}

export interface SilenceInterval {
  start: number;
  end: number;
  duration: number;
}

export interface EditSegment {
  id: string;
  sourceStart: number; // seconds
  sourceEnd: number;   // seconds
  keep: boolean;
  confidence: number; // 0 to 1
  reason: string;
  role: SegmentRole;
  label?: string;
  zoom?: number; // 1.0 = normal, 1.15 = subtle punch-in
  focalPoint?: {
    x: number; // 0.0 (left) to 1.0 (right)
    y: number; // 0.0 (top) to 1.0 (bottom)
  };
}

export interface EditCut {
  sourceStart: number;
  sourceEnd: number;
  reason: string;
}

export interface EditSubtitle {
  id: string;
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export interface EditPlan {
  project: {
    title: string;
    sourceDuration: number;
    targetDuration: number;
    preset: string;
    prompt?: string;
  };
  source: {
    filename: string;
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    hasAudio: boolean;
  };
  segments: EditSegment[];
  cuts: EditCut[];
  subtitles: EditSubtitle[];
  crop: {
    aspectRatio: AspectRatio;
    focalPoint: {
      x: number;
      y: number;
    };
  };
  effects: {
    zoomPunchIn: boolean;
    colorFilter?: 'none' | 'vibrant' | 'warm' | 'cool' | 'cinematic';
    transition?: 'none' | 'fade' | 'crossfade';
  };
  audio: {
    normalize: boolean;
    removeSilence: boolean;
    silenceThresholdDb: number;
    volumeBoost: number;
  };
  export: {
    aspectRatio: AspectRatio;
    resolution: Resolution;
    fps: number;
    targetDuration: number;
    actualEstimatedDuration: number;
  };
  warnings: string[];
}

export interface EditQualityCheck {
  approved: boolean;
  severity: 'low' | 'medium' | 'high';
  issues: string[];
  suggestedFixes: string[];
  editorialScore?: number; // 0-100
}

export type EditorPreset =
  | 'Fast TikTok'
  | 'Talking Head'
  | 'Gaming Highlight'
  | 'Cinematic'
  | 'Short Social'
  | 'Clean Minimal';

export type AppProcessStatus =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'analyzing'
  | 'planning'
  | 'validating'
  | 'rendering'
  | 'completed'
  | 'error';

export interface RenderResult {
  success: boolean;
  videoUrl: string;
  srtUrl?: string;
  filename: string;
  duration: number;
  sizeBytes: number;
  warnings?: string[];
  renderTimeSec: number;
}

export interface AiDiagnostics {
  selectedModel: string;
  videoFilename: string;
  videoSizeBytes: number;
  videoDurationSec: number;
  uploadStatus: string;
  geminiFileUri?: string;
  geminiFileState?: string;
  analysisAttempt: number;
  maxAttempts: number;
  httpStatus: number | string;
  requestStartTime: string;
  requestEndTime: string;
  durationMs: number;
  totalRetryDelayMs: number;
  errorDetails?: string;
}
