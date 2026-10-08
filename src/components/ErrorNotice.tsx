import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Copy, Check, RefreshCw, X } from 'lucide-react';
import { parseAppError } from '../utils/errorHelper';

interface ErrorNoticeProps {
  error: string | { userMessage: string; technicalDetails?: string | null } | null;
  title?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  dismissLabel?: string;
  variant?: 'error' | 'warning' | 'info';
}

export const ErrorNotice: React.FC<ErrorNoticeProps> = ({
  error,
  title,
  onDismiss,
  onRetry,
  retryLabel = 'Thử lại',
  dismissLabel = 'Đóng',
  variant = 'error',
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const parsed =
    typeof error === 'string'
      ? parseAppError(error)
      : {
          userMessage: error.userMessage,
          technicalDetails: error.technicalDetails ?? null,
        };

  const handleCopy = () => {
    if (!parsed.technicalDetails) return;
    navigator.clipboard.writeText(parsed.technicalDetails);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const colorClasses = {
    error: {
      container: 'bg-rose-950/80 border-rose-800 text-rose-200',
      icon: 'text-rose-400',
      badge: 'bg-rose-900/60 text-rose-300 border-rose-700',
      btnSecondary: 'bg-rose-900/40 hover:bg-rose-900/80 text-rose-200 border-rose-700',
      btnPrimary: 'bg-rose-600 hover:bg-rose-500 text-white',
      debugBg: 'bg-black/60 border-rose-900/70 text-rose-300',
    },
    warning: {
      container: 'bg-amber-950/80 border-amber-800 text-amber-200',
      icon: 'text-amber-400',
      badge: 'bg-amber-900/60 text-amber-300 border-amber-700',
      btnSecondary: 'bg-amber-900/40 hover:bg-amber-900/80 text-amber-200 border-amber-700',
      btnPrimary: 'bg-amber-600 hover:bg-amber-500 text-white',
      debugBg: 'bg-black/60 border-amber-900/70 text-amber-300',
    },
    info: {
      container: 'bg-indigo-950/80 border-indigo-800 text-indigo-200',
      icon: 'text-indigo-400',
      badge: 'bg-indigo-900/60 text-indigo-300 border-indigo-700',
      btnSecondary: 'bg-indigo-900/40 hover:bg-indigo-900/80 text-indigo-200 border-indigo-700',
      btnPrimary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
      debugBg: 'bg-black/60 border-indigo-900/70 text-indigo-300',
    },
  }[variant];

  const defaultTitle =
    variant === 'error' ? 'Lỗi' : variant === 'warning' ? 'Cảnh báo' : 'Thông báo';

  return (
    <div
      className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all shadow-lg ${colorClasses.container}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${colorClasses.icon}`} />
          <div className="space-y-1">
            <span className="font-semibold text-white block">
              {title || defaultTitle}
            </span>
            <p className="leading-relaxed text-slate-200 text-xs">
              {parsed.userMessage}
            </p>
          </div>
        </div>

        {/* Action buttons (Retry / Dismiss) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow transition ${colorClasses.btnPrimary}`}
            >
              <RefreshCw className="w-3 h-3" />
              <span>{retryLabel}</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className={`p-1.5 rounded-lg border text-xs transition ${colorClasses.btnSecondary}`}
              title={dismissLabel}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Technical Details Section */}
      {parsed.technicalDetails && (
        <div className="pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition py-1"
          >
            {showTechnicalDetails ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            <span>
              {showTechnicalDetails ? 'Ẩn chi tiết kỹ thuật' : 'Xem chi tiết kỹ thuật'}
            </span>
          </button>

          {showTechnicalDetails && (
            <div
              className={`mt-2 p-3 rounded-lg border font-mono text-[11px] space-y-2 overflow-hidden ${colorClasses.debugBg}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Mã phản hồi từ máy chủ / AI:
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-white/10 hover:bg-white/20 text-slate-200 transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="overflow-x-auto whitespace-pre-wrap break-all max-h-40 p-2 rounded bg-black/50 text-slate-300">
                {parsed.technicalDetails}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
