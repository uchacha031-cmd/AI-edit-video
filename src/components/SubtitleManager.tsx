import React, { useState } from 'react';
import { EditSubtitle } from '../types/editor';
import { Type, Download, Plus, Trash2, Clock, Check } from 'lucide-react';

interface SubtitleManagerProps {
  subtitles: EditSubtitle[];
  currentTime: number;
  onUpdateSubtitles: (subs: EditSubtitle[]) => void;
  onSeekTo: (seconds: number) => void;
}

export const SubtitleManager: React.FC<SubtitleManagerProps> = ({
  subtitles,
  currentTime,
  onUpdateSubtitles,
  onSeekTo,
}) => {
  const [newText, setNewText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleTextChange = (id: string, text: string) => {
    onUpdateSubtitles(
      subtitles.map((s) => (s.id === id ? { ...s, text } : s))
    );
  };

  const handleTimeChange = (id: string, field: 'start' | 'end', val: number) => {
    onUpdateSubtitles(
      subtitles.map((s) => (s.id === id ? { ...s, [field]: Number(val.toFixed(2)) } : s))
    );
  };

  const handleDelete = (id: string) => {
    onUpdateSubtitles(subtitles.filter((s) => s.id !== id));
  };

  const handleAddAtCurrentTime = () => {
    if (!newText.trim()) return;
    const newSub: EditSubtitle = {
      id: `sub_${Date.now()}`,
      start: Number(currentTime.toFixed(2)),
      end: Number((currentTime + 2.5).toFixed(2)),
      text: newText.trim(),
    };
    onUpdateSubtitles([...subtitles, newSub].sort((a, b) => a.start - b.start));
    setNewText('');
  };

  const downloadSrtFile = () => {
    let srt = '';
    subtitles.forEach((s, idx) => {
      const formatTime = (sec: number) => {
        const ms = Math.floor((sec % 1) * 1000);
        const sInt = Math.floor(sec) % 60;
        const mInt = Math.floor(sec / 60) % 60;
        const hInt = Math.floor(sec / 3600);
        return `${String(hInt).padStart(2, '0')}:${String(mInt).padStart(2, '0')}:${String(sInt).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      srt += `${idx + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Bản ghi lời thoại &amp; Phụ đề
          </h3>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
            {subtitles.length} dòng
          </span>
        </div>

        <button
          type="button"
          onClick={downloadSrtFile}
          disabled={subtitles.length === 0}
          className="px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
          title="Tải về tệp phụ đề rời định dạng .SRT"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>Xuất tệp .SRT</span>
        </button>
      </div>

      {/* Subtitles List */}
      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
        {subtitles.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            Chưa có dòng phụ đề nào. Bạn có thể để AI tự động nhận diện lời thoại hoặc nhập thêm phụ đề thủ công bên dưới.
          </div>
        ) : (
          subtitles.map((sub, idx) => {
            const isActive = currentTime >= sub.start && currentTime <= sub.end;
            return (
              <div
                key={sub.id}
                className={`p-2 rounded-lg border text-xs space-y-1.5 transition ${
                  isActive
                    ? 'bg-indigo-950/70 border-indigo-500/80'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSeekTo(sub.start)}
                    className="flex items-center gap-1 font-mono text-[11px] text-indigo-400 hover:underline"
                    title="Tua tới mốc bắt đầu phụ đề"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{sub.start.toFixed(2)}s - {sub.end.toFixed(2)}s</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      value={sub.start}
                      onChange={(e) => handleTimeChange(sub.id, 'start', parseFloat(e.target.value) || 0)}
                      className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[11px] font-mono text-slate-200"
                    />
                    <span className="text-slate-500">&rarr;</span>
                    <input
                      type="number"
                      step="0.1"
                      value={sub.end}
                      onChange={(e) => handleTimeChange(sub.id, 'end', parseFloat(e.target.value) || 0)}
                      className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[11px] font-mono text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(sub.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition"
                      title="Xóa dòng phụ đề này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={sub.text}
                  onChange={(e) => handleTextChange(sub.id, e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-100 focus:border-indigo-500"
                  placeholder="Nội dung phụ đề (tiếng Việt / song ngữ)..."
                />
              </div>
            );
          })
        )}
      </div>

      {/* Add New Subtitle Line */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Nhập nội dung phụ đề mới tại thời điểm hiện tại..."
          className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500"
        />
        <button
          type="button"
          onClick={handleAddAtCurrentTime}
          disabled={!newText.trim()}
          className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm</span>
        </button>
      </div>
    </div>
  );
};
