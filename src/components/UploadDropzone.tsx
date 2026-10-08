import React, { useRef, useState } from 'react';
import { Upload, Film, Video } from 'lucide-react';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  onSelectSample: (type: 'talking_head' | 'landscape_demo' | 'no_audio') => void;
  isUploading: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileSelected,
  onSelectSample,
  isUploading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
        onFileSelected(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 md:p-10 text-center space-y-6 max-w-2xl mx-auto shadow-2xl">
      <div className="space-y-2">
        <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-1">
          <Film className="w-8 h-8" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
          Tải video gốc của bạn lên
        </h2>
        <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto">
          Gemini AI sẽ phân tích nội dung video, tự chọn những đoạn hay nhất, cắt bỏ khoảng lặng thừa, tạo kế hoạch dựng thông minh và xuất video MP4 bằng FFmpeg.
        </p>
      </div>

      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-950/30 scale-[1.01]'
            : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/80'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="p-3 rounded-full bg-slate-800/80 text-slate-300">
          <Upload className="w-6 h-6 text-indigo-400" />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-200">
            {isUploading ? 'Đang tải lên và kiểm tra thông số video...' : 'Kéo và thả tệp video vào đây'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            hoặc <span className="text-indigo-400 underline font-medium">chọn tệp từ thiết bị của bạn</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-500 font-mono pt-1">
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">Định dạng MP4, WebM, MOV</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">Tối đa 150MB</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">Bản V1 xử lý 1 video nguồn</span>
        </div>
      </div>

      {/* Or Quick Test with Synthetic Samples */}
      <div className="pt-2 border-t border-slate-800/80 space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
          Bạn chưa có sẵn video? Hãy thử ngay các clip mẫu dựng sẵn:
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() => onSelectSample('talking_head')}
            className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500 text-left transition flex flex-col justify-between group"
          >
            <div>
              <span className="font-semibold text-slate-200 group-hover:text-indigo-300 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-indigo-400" />
                Chân dung (TikTok 9:16)
              </span>
              <p className="text-[10px] text-slate-400 mt-1">
                15s video dọc kèm nhịp nói và 2 khoảng lặng mẫu.
              </p>
            </div>
            <span className="text-[10px] font-mono text-indigo-400 font-medium mt-2">Dùng mẫu 9:16 &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectSample('landscape_demo')}
            className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500 text-left transition flex flex-col justify-between group"
          >
            <div>
              <span className="font-semibold text-slate-200 group-hover:text-indigo-300 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-blue-400" />
                Phong cảnh (Ngang 16:9)
              </span>
              <p className="text-[10px] text-slate-400 mt-1">
                18s video ngang kèm tiếng thử nghiệm và khoảng dừng.
              </p>
            </div>
            <span className="text-[10px] font-mono text-indigo-400 font-medium mt-2">Dùng mẫu 16:9 &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectSample('no_audio')}
            className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500 text-left transition flex flex-col justify-between group"
          >
            <div>
              <span className="font-semibold text-slate-200 group-hover:text-indigo-300 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-amber-400" />
                Video không tiếng (1:1)
              </span>
              <p className="text-[10px] text-slate-400 mt-1">
                8s video vuông không âm thanh (kiểm tra dựng video thuần).
              </p>
            </div>
            <span className="text-[10px] font-mono text-indigo-400 font-medium mt-2">Dùng mẫu 1:1 &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
