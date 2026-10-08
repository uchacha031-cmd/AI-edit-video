import React, { useRef, useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  Sparkles,
  FileVideo,
  Download,
} from 'lucide-react';
import { AspectRatio, EditSubtitle } from '../types/editor';

interface VideoPlayerViewProps {
  sourceUrl: string | null;
  renderedUrl: string | null;
  currentTime: number;
  duration: number;
  subtitles: EditSubtitle[];
  aspectRatio: AspectRatio;
  onTimeUpdate: (time: number) => void;
  onDurationChange?: (dur: number) => void;
}

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  sourceUrl,
  renderedUrl,
  currentTime,
  duration,
  subtitles,
  aspectRatio,
  onTimeUpdate,
  onDurationChange,
}) => {
  const [activeTab, setActiveTab] = useState<'source' | 'rendered'>('source');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showCropGuide, setShowCropGuide] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Default to rendered tab once a rendered video becomes available
  useEffect(() => {
    if (renderedUrl) {
      setActiveTab('rendered');
    }
  }, [renderedUrl]);

  // Sync external seek with video element
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.4) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleRateChange = (rate: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const activeSubtitle = subtitles.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  );

  const activeVideoUrl = activeTab === 'rendered' && renderedUrl ? renderedUrl : sourceUrl;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
      {/* Tabs Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('source')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'source'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileVideo className="w-3.5 h-3.5 text-indigo-400" />
            <span>Xem trước video gốc</span>
          </button>

          {renderedUrl && (
            <button
              type="button"
              onClick={() => setActiveTab('rendered')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                activeTab === 'rendered'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Xem video đã dựng (MP4)</span>
            </button>
          )}
        </div>

        {activeTab === 'source' && (
          <button
            type="button"
            onClick={() => setShowCropGuide(!showCropGuide)}
            className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
              showCropGuide
                ? 'bg-indigo-950 border-indigo-700 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            Khung cắt {aspectRatio}: {showCropGuide ? 'BẬT' : 'TẮT'}
          </button>
        )}
      </div>

      {/* Video Container Surface */}
      <div className="relative aspect-video max-h-[460px] bg-black flex items-center justify-center overflow-hidden group select-none">
        {activeVideoUrl ? (
          <video
            ref={videoRef}
            src={activeVideoUrl}
            className="w-full h-full object-contain"
            onTimeUpdate={() => {
              if (videoRef.current) {
                onTimeUpdate(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current && onDurationChange) {
                onDurationChange(videoRef.current.duration);
              }
            }}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
          />
        ) : (
          <div className="text-slate-500 text-xs text-center p-6">
            Chưa có video nào. Vui lòng tải video của bạn lên hoặc chọn video mẫu ở trên.
          </div>
        )}

        {/* Realtime HTML Subtitle Overlay */}
        {activeSubtitle && (
          <div className="absolute bottom-12 left-4 right-4 flex justify-center pointer-events-none z-20">
            <div className="bg-black/75 backdrop-blur-sm text-white font-bold text-sm md:text-base px-4 py-1.5 rounded-lg border border-white/20 shadow-2xl text-center max-w-xl animate-fade-in tracking-wide drop-shadow-md">
              {activeSubtitle.text}
            </div>
          </div>
        )}

        {/* Aspect Ratio Crop Guide Mask (For 9:16 or 1:1 on 16:9 source) */}
        {showCropGuide && activeTab === 'source' && aspectRatio !== '16:9' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {aspectRatio === '9:16' && (
              <div className="h-full aspect-[9/16] border-2 border-dashed border-indigo-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-start justify-end p-2">
                <span className="text-[10px] font-mono bg-indigo-600/90 text-white px-1.5 py-0.5 rounded">
                  Khung dọc 9:16 (TikTok / Reels)
                </span>
              </div>
            )}
            {aspectRatio === '1:1' && (
              <div className="h-full aspect-square border-2 border-dashed border-indigo-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-start justify-end p-2">
                <span className="text-[10px] font-mono bg-indigo-600/90 text-white px-1.5 py-0.5 rounded">
                  Khung vuông 1:1
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video Player Controls Bar */}
      <div className="bg-slate-950 px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={!activeVideoUrl}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          {/* Replay */}
          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play();
                setIsPlaying(true);
              }
            }}
            disabled={!activeVideoUrl}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Phát lại từ đầu"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Time Display */}
          <span className="font-mono text-slate-300 text-xs pl-1">
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Playback Speed */}
          <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[11px] font-mono">
            {[1, 1.25, 1.5].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleRateChange(rate)}
                className={`px-1 py-0.5 rounded ${
                  playbackRate === rate ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Mute */}
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Download link for rendered video */}
          {activeTab === 'rendered' && renderedUrl && (
            <a
              href={renderedUrl}
              download="video_da_dung.mp4"
              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải video MP4</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
