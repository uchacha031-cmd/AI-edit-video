import React, { useState } from 'react';
import { Terminal, ChevronDown, ChevronUp, Copy, Check, Cpu, Clock, HardDrive, FileVideo, ShieldCheck, RefreshCw } from 'lucide-react';
import { AiDiagnostics } from '../types/editor';

interface DeveloperDiagnosticsProps {
  diagnostics: AiDiagnostics | null;
}

export const DeveloperDiagnostics: React.FC<DeveloperDiagnosticsProps> = ({ diagnostics }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!diagnostics) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSuccess = String(diagnostics.httpStatus) === '200';

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 text-xs overflow-hidden">
      {/* Header bar / accordion toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-slate-300 text-xs">
            Bảng chẩn đoán kỹ thuật (Dành cho nhà phát triển)
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
              isSuccess
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                : 'bg-rose-950/80 text-rose-300 border-rose-800'
            }`}
          >
            HTTP {diagnostics.httpStatus} &bull; {diagnostics.selectedModel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>{isOpen ? 'Thu gọn' : 'Xem chi tiết'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expanded diagnostic metrics */}
      {isOpen && (
        <div className="p-4 pt-2 border-t border-slate-800/80 space-y-3 bg-slate-950/50">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Thông số chi tiết phiên phân tích AI:
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Đã sao chép JSON</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Sao chép thông số</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            {/* 1. Selected Model */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                <Cpu className="w-3 h-3 text-indigo-400" /> Mô hình AI
              </span>
              <span className="font-mono font-semibold text-slate-200 text-xs">
                {diagnostics.selectedModel}
              </span>
            </div>

            {/* 2. Video Filename & Size */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                <FileVideo className="w-3 h-3 text-blue-400" /> Tệp video
              </span>
              <span className="font-mono text-slate-200 truncate block font-medium" title={diagnostics.videoFilename}>
                {diagnostics.videoFilename} ({formatBytes(diagnostics.videoSizeBytes)})
              </span>
            </div>

            {/* 3. Video Duration */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Thời lượng gốc
              </span>
              <span className="font-mono text-slate-200 font-medium">
                {diagnostics.videoDurationSec.toFixed(1)}s
              </span>
            </div>

            {/* 4. Upload Status */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-emerald-400" /> Trạng thái tải lên
              </span>
              <span className="text-slate-200 font-medium truncate block" title={diagnostics.uploadStatus}>
                {diagnostics.uploadStatus}
              </span>
            </div>

            {/* 5. Gemini File State */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-teal-400" /> Trạng thái tệp Gemini
              </span>
              <span className="font-mono text-teal-300 font-semibold">
                {diagnostics.geminiFileState || 'ACTIVE'}
              </span>
            </div>

            {/* 6. Analysis Attempt Number */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-purple-400" /> Lần thử gọi model
              </span>
              <span className="font-mono text-slate-200 font-semibold">
                Lần {diagnostics.analysisAttempt} / {diagnostics.maxAttempts}
              </span>
            </div>

            {/* 7. HTTP Status */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">Mã trạng thái HTTP</span>
              <span
                className={`font-mono font-bold ${
                  isSuccess ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {diagnostics.httpStatus}
              </span>
            </div>

            {/* 8. Total Retry Delay */}
            <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">Tổng độ trễ Retry</span>
              <span className="font-mono text-slate-300 font-medium">
                {(diagnostics.totalRetryDelayMs / 1000).toFixed(2)}s
              </span>
            </div>
          </div>

          {/* Timestamps & Request Execution Window */}
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span>Thời điểm bắt đầu: </span>
              <strong className="text-slate-300">{diagnostics.requestStartTime}</strong>
            </div>
            <div>
              <span>Thời điểm kết thúc: </span>
              <strong className="text-slate-300">{diagnostics.requestEndTime}</strong>
            </div>
            <div>
              <span>Tổng thời gian phản hồi: </span>
              <strong className="text-indigo-400">{(diagnostics.durationMs / 1000).toFixed(1)}s</strong>
            </div>
          </div>

          {/* Clean error note if failed, without raw stack trace */}
          {diagnostics.errorDetails && !isSuccess && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-900/60 text-[11px] text-rose-300">
              <span className="font-semibold block mb-0.5 text-rose-200">Ghi chú lỗi từ dịch vụ:</span>
              <p className="font-mono break-all">{diagnostics.errorDetails}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
