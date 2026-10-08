import React, { useRef } from 'react';
import {
  EditSegment,
  EditSubtitle,
  SegmentRole,
} from '../types/editor';
import {
  Scissors,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
} from 'lucide-react';

interface TimelineProps {
  totalDuration: number;
  currentTime: number;
  segments: EditSegment[];
  subtitles: EditSubtitle[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  onSeek: (seconds: number) => void;
  onUpdateSegmentTimes: (id: string, start: number, end: number) => void;
  onToggleKeep: (id: string) => void;
  onDeleteSegment: (id: string) => void;
  onMoveSegment: (index: number, direction: 'left' | 'right') => void;
  onSplitSegmentAtCurrentTime: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  totalDuration,
  currentTime,
  segments,
  subtitles,
  selectedSegmentId,
  onSelectSegment,
  onSeek,
  onToggleKeep,
  onDeleteSegment,
  onMoveSegment,
  onSplitSegmentAtCurrentTime,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const duration = Math.max(1, totalDuration);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const getRoleBadge = (role: SegmentRole) => {
    switch (role) {
      case 'hook':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] px-1 py-0.2 rounded font-semibold uppercase">Mở đầu (Hook)</span>;
      case 'highlight':
        return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] px-1 py-0.2 rounded font-semibold uppercase">Điểm nhấn</span>;
      case 'outro':
        return <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] px-1 py-0.2 rounded font-semibold uppercase">Kết thúc</span>;
      case 'silence':
        return <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] px-1 py-0.2 rounded font-semibold uppercase">Khoảng lặng</span>;
      case 'filler':
        return <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] px-1 py-0.2 rounded font-semibold uppercase">Đoạn thừa</span>;
      default:
        return <span className="bg-slate-700/60 text-slate-300 text-[9px] px-1 py-0.2 rounded font-semibold uppercase">Nội dung chính</span>;
    }
  };

  // Generate tick marks for ruler (e.g. every 2 or 5 seconds)
  const step = duration > 60 ? 10 : duration > 20 ? 5 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) {
    ticks.push(t);
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
      {/* Timeline Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Scissors className="w-4 h-4 text-emerald-400" />
            <span>Dòng thời gian đa rãnh (Timeline)</span>
          </h3>
          <span className="text-xs font-mono text-emerald-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
          </span>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSplitSegmentAtCurrentTime}
            className="px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition"
            title="Tách phân đoạn tại vị trí kim thời gian"
          >
            <Scissors className="w-3.5 h-3.5 text-indigo-400" />
            <span>Tách đoạn tại vị trí phát</span>
          </button>
        </div>
      </div>

      {/* Timeline Surface */}
      <div
        ref={containerRef}
        onClick={handleRulerClick}
        className="relative bg-slate-950 rounded-lg border border-slate-800 p-2 cursor-pointer select-none overflow-hidden min-h-[140px]"
      >
        {/* Time Ruler */}
        <div className="relative h-6 border-b border-slate-800 text-[10px] text-slate-500 font-mono">
          {ticks.map((t) => {
            const leftPct = (t / duration) * 100;
            return (
              <div
                key={t}
                className="absolute top-0 bottom-0 flex flex-col items-center"
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
              >
                <span>{t}s</span>
                <div className="w-px h-1.5 bg-slate-700 mt-auto" />
              </div>
            );
          })}
        </div>

        {/* Video Segments Track */}
        <div className="relative h-16 mt-2 rounded bg-slate-900/60 border border-slate-800/80 overflow-hidden flex">
          {segments.map((seg, idx) => {
            const isSelected = selectedSegmentId === seg.id;
            const segDuration = seg.sourceEnd - seg.sourceStart;
            const widthPct = (segDuration / duration) * 100;
            const leftPct = (seg.sourceStart / duration) * 100;

            return (
              <div
                key={seg.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSegment(seg.id);
                  onSeek(seg.sourceStart);
                }}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${Math.max(1, widthPct)}%`,
                  top: 2,
                  bottom: 2,
                }}
                className={`rounded px-1.5 py-1 text-[10px] transition-all flex flex-col justify-between overflow-hidden cursor-pointer ${
                  seg.keep
                    ? isSelected
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg ring-2 ring-emerald-400 z-20'
                      : 'bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-600/60 text-emerald-200'
                    : isSelected
                    ? 'bg-slate-800/90 text-rose-300 ring-2 ring-rose-500 opacity-80 z-20'
                    : 'bg-slate-900/80 hover:bg-slate-850 border border-dashed border-rose-900/60 text-slate-500 opacity-60'
                }`}
                title={`${seg.reason} (${seg.sourceStart}s - ${seg.sourceEnd}s)`}
              >
                {/* Segment Top Label */}
                <div className="flex items-center justify-between gap-1 overflow-hidden pointer-events-none">
                  <div className="flex items-center gap-1 truncate">
                    {getRoleBadge(seg.role)}
                    <span className="font-semibold truncate">
                      {seg.label || `Đoạn ${idx + 1}`}
                    </span>
                  </div>
                  {seg.zoom && seg.zoom > 1 && (
                    <span className="text-[8px] bg-black/40 px-1 rounded text-amber-300 flex items-center gap-0.5">
                      <ZoomIn className="w-2.5 h-2.5" />
                      {seg.zoom}x
                    </span>
                  )}
                </div>

                {/* Segment Bottom Time & Status */}
                <div className="flex items-center justify-between text-[9px] font-mono opacity-80 pointer-events-none">
                  <span>{segDuration.toFixed(1)}s</span>
                  <span>{seg.keep ? 'GIỮ' : 'CẮT BỎ'}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Subtitles Track */}
        <div className="relative h-6 mt-1.5 rounded bg-slate-900/40 border border-slate-800/40 overflow-hidden">
          {subtitles.map((sub) => {
            const subDur = sub.end - sub.start;
            const widthPct = (subDur / duration) * 100;
            const leftPct = (sub.start / duration) * 100;

            return (
              <div
                key={sub.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(sub.start);
                }}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${Math.max(1, widthPct)}%`,
                  top: 2,
                  bottom: 2,
                }}
                className="rounded bg-indigo-900/60 border border-indigo-700/60 text-indigo-200 px-1 text-[9px] truncate flex items-center hover:bg-indigo-800/80 transition"
                title={`Phụ đề: "${sub.text}" (${sub.start}s - ${sub.end}s)`}
              >
                <span className="truncate">{sub.text}</span>
              </div>
            );
          })}
        </div>

        {/* Playhead Vertical Scrubber Bar */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none shadow-md shadow-rose-500/50"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="w-2.5 h-2.5 bg-rose-500 rounded-full -ml-1 -mt-1 shadow" />
        </div>
      </div>

      {/* Selected Segment Quick Bar */}
      {selectedSegmentId && (() => {
        const segIdx = segments.findIndex((s) => s.id === selectedSegmentId);
        const seg = segments[segIdx];
        if (!seg) return null;

        return (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-200">Đoạn #{segIdx + 1}:</span>
              <span className="text-slate-400 font-mono">
                {seg.sourceStart.toFixed(2)}s &rarr; {seg.sourceEnd.toFixed(2)}s ({(seg.sourceEnd - seg.sourceStart).toFixed(2)}s)
              </span>
              <span className="italic text-slate-400 text-[11px] truncate max-w-xs">
                &ldquo;{seg.reason}&rdquo;
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Keep Toggle */}
              <button
                type="button"
                onClick={() => onToggleKeep(seg.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition ${
                  seg.keep
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {seg.keep ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>{seg.keep ? 'Giữ đoạn này' : 'Bỏ đoạn này'}</span>
              </button>

              {/* Move Left */}
              <button
                type="button"
                disabled={segIdx === 0}
                onClick={() => onMoveSegment(segIdx, 'left')}
                className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300"
                title="Chuyển lên trước"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>

              {/* Move Right */}
              <button
                type="button"
                disabled={segIdx === segments.length - 1}
                onClick={() => onMoveSegment(segIdx, 'right')}
                className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300"
                title="Chuyển ra sau"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => onDeleteSegment(seg.id)}
                className="p-1 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300"
                title="Xóa phân đoạn này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
