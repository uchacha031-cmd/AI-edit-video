import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  Send,
  RotateCcw,
  Play,
  CheckCircle2,
} from 'lucide-react';
import { AspectRatio, EditorPreset, EditPlan, Resolution } from '../types/editor';

interface AiControlsProps {
  currentPlan: EditPlan | null;
  selectedPreset: EditorPreset;
  targetDuration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  isAnalyzing: boolean;
  isRendering: boolean;
  isApplyingCommand: boolean;
  onSelectPreset: (preset: EditorPreset) => void;
  onTargetDurationChange: (dur: number) => void;
  onAspectRatioChange: (aspect: AspectRatio) => void;
  onResolutionChange: (res: Resolution) => void;
  onRunAnalysis: () => void;
  onApplyNaturalLanguageCommand: (command: string) => void;
  onRender: () => void;
  burnSubtitles: boolean;
  onToggleBurnSubtitles: (enabled: boolean) => void;
}

const PRESETS: { id: EditorPreset; label: string; desc: string }[] = [
  { id: 'Fast TikTok', label: 'TikTok Nhanh', desc: 'Dọc 9:16, nhịp điệu nhanh, 3 giây đầu giữ chân người xem, cắt gọn ngắt quãng' },
  { id: 'Talking Head', label: 'Thuyết trình / Podcast', desc: 'Cắt bỏ đoạn ngập ngừng, từ đệm và khoảng lặng, giữ nhịp nói tự nhiên' },
  { id: 'Gaming Highlight', label: 'Highlight nổi bật', desc: 'Tập trung vào pha hành động gay cấn và khoảnh khắc cao trào' },
  { id: 'Cinematic', label: 'Điện ảnh (Cinematic)', desc: 'Ngang 16:9, nhịp chuyển mượt mà, áp tông màu điện ảnh cuốn hút' },
  { id: 'Short Social', label: 'Video ngắn (Shorts/Reels)', desc: 'Cô đọng 15-30 giây súc tích, giữ mạch nội dung thu hút' },
  { id: 'Clean Minimal', label: 'Tối giản tự nhiên', desc: 'Cắt gọt khoảng lặng nhẹ nhàng, chuẩn hóa âm thanh, giữ trọn vẹn mạch gốc' },
];

export const AiControls: React.FC<AiControlsProps> = ({
  currentPlan,
  selectedPreset,
  targetDuration,
  aspectRatio,
  resolution,
  isAnalyzing,
  isRendering,
  isApplyingCommand,
  onSelectPreset,
  onTargetDurationChange,
  onAspectRatioChange,
  onResolutionChange,
  onRunAnalysis,
  onApplyNaturalLanguageCommand,
  onRender,
  burnSubtitles,
  onToggleBurnSubtitles,
}) => {
  const [nlCommand, setNlCommand] = useState('');

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlCommand.trim() || isApplyingCommand) return;
    onApplyNaturalLanguageCommand(nlCommand.trim());
    setNlCommand('');
  };

  return (
    <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 space-y-4">
      {/* Header and Preset Pills */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Phong cách biên tập (Preset)</span>
          </label>
          <span className="text-[11px] text-slate-400">
            Chọn thể loại &amp; nhịp điệu dựng
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESETS.map((p) => {
            const isSelected = selectedPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPreset(p.id)}
                className={`text-left p-2.5 rounded-lg border text-xs transition duration-150 flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md shadow-indigo-900/30'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold">{p.label}</span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                  {p.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Natural Language Edit Command */}
      <form onSubmit={handleCommandSubmit} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-purple-400" />
            <span>Lệnh chỉnh sửa bằng tiếng Việt</span>
          </label>
          <span className="text-[10px] text-slate-400">
            Điều chỉnh kế hoạch mà không xóa các chỉnh sửa thủ công
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={nlCommand}
            onChange={(e) => setNlCommand(e.target.value)}
            placeholder="Ví dụ: Làm clip TikTok 30s, giữ đoạn hay nhất ở đầu, cắt lan man, thêm phụ đề tiếng Việt..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-24 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            disabled={isApplyingCommand || isAnalyzing}
          />
          <button
            type="submit"
            disabled={!nlCommand.trim() || isApplyingCommand || isAnalyzing}
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition"
          >
            {isApplyingCommand ? (
              <span className="animate-spin text-xs">&#9696;</span>
            ) : (
              <Send className="w-3 h-3" />
            )}
            <span>Áp dụng</span>
          </button>
        </div>
      </form>

      {/* Export Specs: Aspect Ratio, Resolution & Target Duration */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80">
        {/* Aspect Ratio */}
        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Tỉ lệ khung hình
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(['9:16', '16:9', '1:1'] as AspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onAspectRatioChange(ratio)}
                className={`py-1.5 text-xs font-mono font-medium rounded-md border text-center transition ${
                  aspectRatio === ratio
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Độ phân giải
          </label>
          <div className="grid grid-cols-2 gap-1">
            {(['720p', '1080p'] as Resolution[]).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => onResolutionChange(res)}
                className={`py-1.5 text-xs font-mono font-medium rounded-md border text-center transition ${
                  resolution === res
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Target Duration */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1">
            <span>Thời lượng mục tiêu</span>
            <span className="text-indigo-400 font-mono font-semibold">{targetDuration}s</span>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            step={5}
            value={targetDuration}
            onChange={(e) => onTargetDurationChange(Number(e.target.value))}
            className="w-full accent-indigo-500 h-1.5 bg-slate-750 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Burn Subtitles and Effects Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80 text-xs">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
          <input
            type="checkbox"
            checked={burnSubtitles}
            onChange={(e) => onToggleBurnSubtitles(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4"
          />
          <span>Chèn phụ đề trực tiếp vào hình ảnh video</span>
        </label>

        {currentPlan && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span>Đoạn giữ: <strong className="text-emerald-400">{currentPlan.segments.filter((s) => s.keep).length}</strong></span>
            <span>&bull;</span>
            <span>Đoạn cắt: <strong className="text-rose-400">{currentPlan.cuts.length}</strong></span>
            <span>&bull;</span>
            <span>Thời lượng dự kiến: <strong className="text-indigo-300">{currentPlan.export.actualEstimatedDuration.toFixed(1)}s</strong></span>
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={isAnalyzing || isRendering}
          className="flex-1 min-w-[160px] py-2.5 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition"
        >
          {isAnalyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Đang phân tích video...</span>
            </>
          ) : currentPlan ? (
            <>
              <RotateCcw className="w-4 h-4" />
              <span>Phân tích lại với AI</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Tự động chỉnh sửa bằng AI</span>
            </>
          )}
        </button>

        {currentPlan && (
          <button
            type="button"
            onClick={onRender}
            disabled={isRendering || isAnalyzing}
            className="flex-1 min-w-[160px] py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition"
          >
            {isRendering ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang dựng video...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Dựng &amp; Xuất video</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
