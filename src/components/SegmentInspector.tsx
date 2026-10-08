import React from 'react';
import { EditSegment, SegmentRole } from '../types/editor';
import {
  Sliders,
  CheckCircle,
  XCircle,
  Crosshair,
  ZoomIn,
  Trash2,
  Clock,
  Sparkles,
} from 'lucide-react';

interface SegmentInspectorProps {
  segment: EditSegment | null;
  sourceDuration: number;
  onUpdateSegment: (updated: EditSegment) => void;
  onDeleteSegment: (id: string) => void;
}

export const SegmentInspector: React.FC<SegmentInspectorProps> = ({
  segment,
  sourceDuration,
  onUpdateSegment,
  onDeleteSegment,
}) => {
  if (!segment) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center min-h-[200px]">
        <Sliders className="w-8 h-8 text-slate-700 mb-2 stroke-1" />
        <p>Nhấp vào bất kỳ phân đoạn nào trên dòng thời gian ở trên để xem chi tiết và tinh chỉnh thông số biên tập.</p>
      </div>
    );
  }

  const duration = Math.max(0, segment.sourceEnd - segment.sourceStart);

  const handleStartChange = (val: number) => {
    const start = Math.max(0, Math.min(val, segment.sourceEnd - 0.2));
    onUpdateSegment({ ...segment, sourceStart: Number(start.toFixed(2)) });
  };

  const handleEndChange = (val: number) => {
    const end = Math.min(sourceDuration, Math.max(val, segment.sourceStart + 0.2));
    onUpdateSegment({ ...segment, sourceEnd: Number(end.toFixed(2)) });
  };

  const handleFocalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onUpdateSegment({
      ...segment,
      focalPoint: {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      },
    });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Chi tiết phân đoạn đang chọn
          </h3>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
            {segment.id}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onDeleteSegment(segment.id)}
          className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Xóa đoạn này</span>
        </button>
      </div>

      {/* Primary Timing Controls */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-medium text-slate-400 block mb-1">
            Bắt đầu (giây)
          </label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={segment.sourceEnd - 0.1}
            value={segment.sourceStart}
            onChange={(e) => handleStartChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 font-mono focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-slate-400 block mb-1">
            Kết thúc (giây)
          </label>
          <input
            type="number"
            step="0.1"
            min={segment.sourceStart + 0.1}
            max={sourceDuration}
            value={segment.sourceEnd}
            onChange={(e) => handleEndChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 font-mono focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-slate-400 block mb-1">
            Thời lượng đoạn
          </label>
          <div className="w-full bg-slate-800/80 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-emerald-400 font-mono font-semibold flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{duration.toFixed(2)}s</span>
          </div>
        </div>
      </div>

      {/* Keep vs Cut Toggle and Role */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Keep or Cut */}
        <div>
          <label className="text-[10px] font-medium text-slate-400 block mb-1">
            Quyết định biên tập
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateSegment({ ...segment, keep: true })}
              className={`py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition ${
                segment.keep
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-750'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Giữ lại (Dựng)</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSegment({ ...segment, keep: false })}
              className={`py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition ${
                !segment.keep
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-750'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cắt bỏ (Xóa)</span>
            </button>
          </div>
        </div>

        {/* Segment Role */}
        <div>
          <label className="text-[10px] font-medium text-slate-400 block mb-1">
            Vai trò phân đoạn
          </label>
          <select
            value={segment.role}
            onChange={(e) => onUpdateSegment({ ...segment, role: e.target.value as SegmentRole })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 focus:border-indigo-500"
          >
            <option value="hook">Mở đầu (Hook 2-4 giây đầu thu hút)</option>
            <option value="core">Nội dung chính / Diễn biến chính</option>
            <option value="highlight">Điểm nhấn đặc sắc / Cao trào</option>
            <option value="outro">Phần kết / Lời chào kết thúc</option>
            <option value="filler">Đoạn dư thừa / Lan man</option>
            <option value="silence">Khoảng lặng / Tạm dừng nói</option>
          </select>
        </div>
      </div>

      {/* Editorial Reason & Confidence */}
      <div className="bg-slate-950/70 rounded-lg p-2.5 border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            Lý do biên tập từ AI:
          </span>
          <span className="text-slate-400 font-mono text-[10px]">
            Độ tin cậy: {Math.round((segment.confidence || 0.85) * 100)}%
          </span>
        </div>
        <p className="text-xs text-slate-300 italic leading-relaxed">
          &ldquo;{segment.reason}&rdquo;
        </p>
      </div>

      {/* Effects: Zoom Punch-In & Focal Point */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
        {/* Zoom Punch-In */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1">
            <span className="flex items-center gap-1">
              <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
              Thu phóng nhấn mạnh (Zoom Punch-in)
            </span>
            <span className="font-mono text-amber-400">
              {(segment.zoom || 1.0).toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min={1.0}
            max={1.35}
            step={0.05}
            value={segment.zoom || 1.0}
            onChange={(e) => onUpdateSegment({ ...segment, zoom: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
          />
        </div>

        {/* Focal Point Indicator */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1">
            <span className="flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
              Điểm lấy nét trọng tâm khi cắt dọc
            </span>
            <span className="font-mono text-indigo-400 text-[10px]">
              ({segment.focalPoint?.x ?? 0.5}, {segment.focalPoint?.y ?? 0.5})
            </span>
          </div>
          <div
            onClick={handleFocalClick}
            className="relative w-full h-12 bg-slate-950 border border-slate-700 rounded-md cursor-crosshair overflow-hidden"
            title="Bấm vào bất kỳ đâu trên khung để định tâm chủ thể"
          >
            <div
              className="absolute w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full bg-indigo-500 border border-white shadow pointer-events-none transition-all duration-100"
              style={{
                left: `${(segment.focalPoint?.x ?? 0.5) * 100}%`,
                top: `${(segment.focalPoint?.y ?? 0.5) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
