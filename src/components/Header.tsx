import React from 'react';
import { Film, Sparkles, RefreshCw, AlertCircle, Video, Download } from 'lucide-react';
import { AppProcessStatus, VideoMetadata } from '../types/editor';

interface HeaderProps {
  status: AppProcessStatus;
  statusMessage?: string;
  metadata?: VideoMetadata | null;
  onReset: () => void;
  onSelectSample: (type: 'talking_head' | 'landscape_demo' | 'no_audio') => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  statusMessage,
  metadata,
  onReset,
  onSelectSample,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'idle':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">Sẵn sàng</span>;
      case 'uploading':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-sky-950 text-sky-400 border border-sky-700 animate-pulse">Đang tải video lên...</span>;
      case 'processing':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-950 text-blue-400 border border-blue-700 animate-pulse">Đang phân tích âm thanh &amp; thông số...</span>;
      case 'analyzing':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-950 text-purple-300 border border-purple-700 animate-pulse">Gemini đang phân tích video...</span>;
      case 'planning':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 animate-pulse">Đang lập kế hoạch dựng...</span>;
      case 'validating':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">Đang kiểm tra kế hoạch...</span>;
      case 'rendering':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse">Đang dựng video MP4...</span>;
      case 'completed':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-600">Hoàn tất</span>;
      case 'error':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-rose-950 text-rose-400 border border-rose-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Lỗi</span>;
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Logo and App Title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-100 text-base md:text-lg tracking-tight">AI Auto Video Editor</h1>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">BẢN V1 PRO</span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Phân tích nội dung bằng Gemini AI &bull; Tự động chọn đoạn hay &bull; Dựng video MP4 bằng FFmpeg
            </p>
          </div>
        </div>

        {/* Status and Action Buttons */}
        <div className="flex items-center gap-2 md:gap-3">
          {getStatusBadge()}

          {/* Download Source Code Zip */}
          <a
            href="/api/download-source"
            download="ai-video-editor-source.zip"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
            title="Tải toàn bộ file zip mã nguồn của dự án về máy tính"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải file ZIP mã nguồn</span>
          </a>

          {/* Sample Video Dropdown or Quick Trigger */}
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Dùng thử ngay bằng video mẫu tích hợp sẵn"
            >
              <Video className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dùng video mẫu</span>
            </button>
            <div className="absolute right-0 mt-1 w-60 rounded-lg bg-slate-800 border border-slate-700 shadow-xl py-1 hidden group-hover:block z-50">
              <button
                type="button"
                onClick={() => onSelectSample('talking_head')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-indigo-600 hover:text-white transition flex flex-col"
              >
                <span className="font-medium">Video chân dung (Dọc 9:16)</span>
                <span className="text-[10px] opacity-75">15 giây giọng nói &amp; 2 khoảng dừng ngắt lời</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectSample('landscape_demo')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-indigo-600 hover:text-white transition flex flex-col border-t border-slate-700/50"
              >
                <span className="font-medium">Video phong cảnh (Ngang 16:9)</span>
                <span className="text-[10px] opacity-75">18 giây demo kỹ thuật có nhịp điệu &amp; khoảng lặng</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectSample('no_audio')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-indigo-600 hover:text-white transition flex flex-col border-t border-slate-700/50"
              >
                <span className="font-medium">Video không có tiếng (Vuông 1:1)</span>
                <span className="text-[10px] opacity-75">8 giây video không chứa luồng âm thanh</span>
              </button>
            </div>
          </div>

          {metadata && (
            <button
              type="button"
              onClick={onReset}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition"
              title="Làm mới / Bắt đầu dự án mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
