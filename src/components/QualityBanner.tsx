import React from 'react';
import { EditQualityCheck } from '../types/editor';
import { CheckCircle2, AlertTriangle, AlertOctagon, Sparkles } from 'lucide-react';

interface QualityBannerProps {
  qualityCheck: EditQualityCheck | null;
  warnings?: string[];
}

export const QualityBanner: React.FC<QualityBannerProps> = ({
  qualityCheck,
  warnings,
}) => {
  if (!qualityCheck && (!warnings || warnings.length === 0)) return null;

  const isApproved = qualityCheck?.approved ?? true;
  const severity = qualityCheck?.severity ?? 'low';

  const getSeverityBadge = () => {
    switch (severity) {
      case 'low':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">Mức độ: Nhẹ</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-700">Mức độ: Vừa</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-700">Mức độ: Cao</span>;
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isApproved ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
          <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Đánh giá chất lượng &amp; Độ chuẩn xác biên tập AI</span>
          </h4>
        </div>

        <div className="flex items-center gap-2">
          {qualityCheck?.editorialScore !== undefined && (
            <span className="font-mono text-emerald-400 font-semibold bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Điểm đánh giá: {qualityCheck.editorialScore}/100
            </span>
          )}
          {getSeverityBadge()}
        </div>
      </div>

      {qualityCheck?.issues && qualityCheck.issues.length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-[11px] font-medium text-slate-400">Nhận xét biên tập từ AI:</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-300 pl-1">
            {qualityCheck.issues.map((issue, idx) => (
              <li key={idx} className="leading-relaxed">{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {qualityCheck?.suggestedFixes && qualityCheck.suggestedFixes.length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-[11px] font-medium text-slate-400">Gợi ý tối ưu hóa:</span>
          <ul className="list-disc list-inside space-y-0.5 text-indigo-300 pl-1">
            {qualityCheck.suggestedFixes.map((fix, idx) => (
              <li key={idx} className="leading-relaxed">{fix}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-slate-800">
          <span className="text-[11px] font-medium text-amber-400">Lưu ý kỹ thuật hệ thống:</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
