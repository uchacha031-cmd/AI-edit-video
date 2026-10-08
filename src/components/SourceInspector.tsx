import React from 'react';
import { VideoMetadata, SilenceInterval } from '../types/editor';
import { Volume2, VolumeX, Layers, Clock, Cpu, FileVideo, Radio } from 'lucide-react';

interface SourceInspectorProps {
  metadata: VideoMetadata;
  silences: SilenceInterval[];
  thumbnails: string[];
  onSeekTo?: (seconds: number) => void;
}

export const SourceInspector: React.FC<SourceInspectorProps> = ({
  metadata,
  silences,
  thumbnails,
  onSeekTo,
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSilenceDuration = silences.reduce((acc, curr) => acc + curr.duration, 0);

  return (
    <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <FileVideo className="w-4 h-4 text-indigo-400" />
          <span>Thông số video gốc (Xác thực qua FFprobe)</span>
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          {metadata.filename}
        </span>
      </div>

      {/* Technical Spec Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
        <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block mb-0.5">Thời lượng</span>
          <span className="font-semibold text-slate-200 font-mono text-sm flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            {metadata.duration.toFixed(1)}s
          </span>
        </div>

        <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block mb-0.5">Độ phân giải</span>
          <span className="font-semibold text-slate-200 font-mono text-sm flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            {metadata.width}x{metadata.height}
          </span>
        </div>

        <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block mb-0.5">Tốc độ khung hình</span>
          <span className="font-semibold text-slate-200 font-mono text-sm">
            {metadata.fps} FPS
          </span>
        </div>

        <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block mb-0.5">Dung lượng tệp</span>
          <span className="font-semibold text-slate-200 font-mono text-sm">
            {formatBytes(metadata.filesize)}
          </span>
        </div>

        <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block mb-0.5">Bộ mã hóa</span>
          <span className="font-semibold text-slate-200 font-mono text-sm flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            {metadata.videoCodec.toUpperCase()}
          </span>
        </div>

        <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block mb-0.5">Kênh âm thanh</span>
          <span className="font-semibold text-slate-200 text-sm flex items-center gap-1">
            {metadata.hasAudio ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-mono">{metadata.audioCodec || 'AAC'}</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">Không có tiếng</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Silence Detection Summary */}
      {metadata.hasAudio && (
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/40 flex flex-wrap items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-300 font-medium">Phân tích khoảng lặng máy chủ:</span>
            <span className="text-slate-400">
              Phát hiện <strong className="text-slate-200">{silences.length}</strong> khoảng lặng ({totalSilenceDuration.toFixed(1)}s được đo; chỉ cắt các đoạn đủ dài, có chừa biên bảo vệ lời nói)
            </span>
          </div>
          {silences.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5">
              {silences.slice(0, 5).map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSeekTo?.(s.start)}
                  className="px-2 py-0.5 rounded bg-slate-700/80 hover:bg-slate-600 text-[11px] font-mono text-slate-300 border border-slate-600 transition"
                  title="Nhấp để tua đến khoảng lặng này"
                >
                  {s.start.toFixed(1)}s - {s.end.toFixed(1)}s ({s.duration.toFixed(1)}s)
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keyframe Thumbnails */}
      {thumbnails.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-slate-400 block font-medium">Khung hình tiêu biểu các phân cảnh:</span>
          <div className="grid grid-cols-4 gap-2">
            {thumbnails.map((thumb, idx) => (
              <div
                key={idx}
                className="relative aspect-video rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 group"
              >
                <img
                  src={thumb}
                  alt={`Khung hình cảnh ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-slate-200 backdrop-blur">
                  Cảnh #{idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
