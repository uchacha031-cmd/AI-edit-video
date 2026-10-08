import React from 'react';
import { RenderResult } from '../types/editor';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import { ErrorNotice } from './ErrorNotice';

interface ExportModalProps {
  isOpen: boolean;
  isRendering: boolean;
  renderResult: RenderResult | null;
  renderProgress?: number | null;
  errorMessage?: string;
  onClose: () => void;
  onCancelRender?: () => void;
  onRetryRender?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  isRendering,
  renderResult,
  renderProgress,
  errorMessage,
  onClose,
  onCancelRender,
  onRetryRender,
}) => {
  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative">
        {/* Close button */}
        {!isRendering && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {isRendering
                ? 'Đang dựng video MP4'
                : renderResult?.success
                ? 'Xuất video hoàn tất thành công'
                : 'Thông báo xử lý video'}
            </h3>
            <p className="text-xs text-slate-400">
              {isRendering
                ? 'Hệ thống đang cắt ghép phân đoạn, chuẩn hóa âm thanh và kết xuất tệp MP4 chuẩn H.264...'
                : renderResult?.success
                ? 'Video của bạn đã được cắt gọt, ghép nối và kết xuất thành tệp MP4 chất lượng cao.'
                : 'Cập nhật trạng thái tiến trình xử lý'}
            </p>
          </div>
        </div>

        {/* Active Rendering Progress State */}
        {isRendering && (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-200 block">
                Tiến trình dựng video máy chủ đang chạy...
              </span>
              <span className="text-xs text-slate-400 block font-mono">
                Cắt đoạn &rarr; Ghép nối &rarr; Căn khung &rarr; Phụ đề &rarr; Chuẩn hóa âm &rarr; Mã hóa H.264
              </span>
              {typeof renderProgress === 'number' && (
                <div className="mt-4 mx-auto max-w-sm space-y-2" role="progressbar" aria-label="Tiến độ dựng video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={renderProgress}>
                  <div className="flex justify-between text-xs text-slate-300"><span>Tiến độ FFmpeg</span><span>{Math.round(renderProgress)}%</span></div>
                  <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div className="h-full bg-indigo-400 transition-all duration-300" style={{ width: Math.min(100, Math.max(0, renderProgress)) + '%' }} />
                  </div>
                </div>
              )}
            </div>

            {onCancelRender && (
              <button
                type="button"
                onClick={onCancelRender}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
              >
                Hủy quá trình dựng
              </button>
            )}
          </div>
        )}

        {/* Error State with Collapsible Technical Details */}
        {errorMessage && !isRendering && (
          <ErrorNotice
            error={errorMessage}
            title="Sự cố dựng video"
            onRetry={onRetryRender}
            retryLabel="Thử dựng lại"
            onDismiss={onClose}
            dismissLabel="Đóng"
          />
        )}

        {/* Render Success State */}
        {renderResult && renderResult.success && !isRendering && (
          <div className="space-y-4">
            {/* Embedded Result Video Player */}
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner">
              <video
                src={renderResult.videoUrl}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            {/* Technical Stats Grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-800/70 rounded-lg p-2.5 border border-slate-700/60">
                <span className="text-[10px] text-slate-400 block mb-0.5">Thời lượng sau dựng</span>
                <span className="font-mono font-semibold text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {renderResult.duration.toFixed(1)}s
                </span>
              </div>

              <div className="bg-slate-800/70 rounded-lg p-2.5 border border-slate-700/60">
                <span className="text-[10px] text-slate-400 block mb-0.5">Thời gian dựng</span>
                <span className="font-mono font-semibold text-slate-200">
                  {renderResult.renderTimeSec}s
                </span>
              </div>

              <div className="bg-slate-800/70 rounded-lg p-2.5 border border-slate-700/60">
                <span className="text-[10px] text-slate-400 block mb-0.5">Dung lượng tệp</span>
                <span className="font-mono font-semibold text-slate-200">
                  {formatBytes(renderResult.sizeBytes)}
                </span>
              </div>
            </div>

            {/* Download Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={renderResult.videoUrl}
                download={renderResult.filename}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                <Download className="w-4 h-4" />
                <span>Tải video MP4 đã dựng</span>
              </a>

              {renderResult.srtUrl && (
                <a
                  href={renderResult.srtUrl}
                  download="phu_de.srt"
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Tải tệp .SRT</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

