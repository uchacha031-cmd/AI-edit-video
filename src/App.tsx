import React, { useState } from 'react';
import {
  AppProcessStatus,
  AspectRatio,
  EditorPreset,
  EditPlan,
  EditQualityCheck,
  EditSegment,
  EditSubtitle,
  RenderResult,
  Resolution,
  SilenceInterval,
  VideoMetadata,
} from './types/editor';
import { Header } from './components/Header';
import { UploadDropzone } from './components/UploadDropzone';
import { SourceInspector } from './components/SourceInspector';
import { AiControls } from './components/AiControls';
import { Timeline } from './components/Timeline';
import { SegmentInspector } from './components/SegmentInspector';
import { SubtitleManager } from './components/SubtitleManager';
import { VideoPlayerView } from './components/VideoPlayerView';
import { QualityBanner } from './components/QualityBanner';
import { ExportModal } from './components/ExportModal';
import { ErrorNotice } from './components/ErrorNotice';
import { DeveloperDiagnostics } from './components/DeveloperDiagnostics';
import { AiDiagnostics } from './types/editor';
import { fetchApiJson } from './utils/apiHelper';

export default function App() {
  // App workflow state
  const [status, setStatus] = useState<AppProcessStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [aiNotice, setAiNotice] = useState<{ userMessage: string; technicalDetails?: string | null } | null>(null);
  const [diagnostics, setDiagnostics] = useState<AiDiagnostics | null>(null);

  // Media Source state
  const [videoId, setVideoId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [silences, setSilences] = useState<SilenceInterval[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // Timeline & Playback state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Editorial settings
  const [selectedPreset, setSelectedPreset] = useState<EditorPreset>('Fast TikTok');
  const [targetDuration, setTargetDuration] = useState<number>(30);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [resolution, setResolution] = useState<Resolution>('720p');
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);

  // Edit Plan & AI Quality
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [qualityCheck, setQualityCheck] = useState<EditQualityCheck | null>(null);
  const [isApplyingCommand, setIsApplyingCommand] = useState(false);
  const [commandNotification, setCommandNotification] = useState<string | null>(null);

  // Render & Export state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [activeRenderId, setActiveRenderId] = useState<string | null>(null);

  // 1. Upload Video File
  const handleFileUpload = async (file: File) => {
    setStatus('uploading');
    setStatusMessage('Đang tải video lên máy chủ lưu trữ...');
    setErrorMessage('');
    setAiNotice(null);
    setPlan(null);
    setRenderResult(null);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const { ok, data } = await fetchApiJson('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!ok || !data?.success) {
        throw new Error(data?.error || 'Tải video lên thất bại');
      }

      setVideoId(data.videoId);
      setSourceUrl(data.mediaUrl);
      setMetadata(data.metadata);
      setSilences(data.silences || []);
      setThumbnails(data.thumbnails || []);
      setTargetDuration(Math.min(30, Math.round(data.metadata.duration)));
      setCurrentTime(0);

      setStatus('idle');
      setStatusMessage('Video đã tải xong. Sẵn sàng phân tích hoặc chỉnh sửa.');

      // Automatically trigger initial analysis for optimal vertical slice UX
      await runAnalysis(data.videoId, selectedPreset, Math.min(30, Math.round(data.metadata.duration)), aspectRatio);
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Tải video lên thất bại');
    }
  };

  // 2. Load Synthetic Sample Video
  const handleSelectSample = async (type: 'talking_head' | 'landscape_demo' | 'no_audio') => {
    setStatus('processing');
    const sampleLabel =
      type === 'talking_head'
        ? 'Chân dung 9:16'
        : type === 'landscape_demo'
        ? 'Phong cảnh 16:9'
        : 'Vuông 1:1';
    setStatusMessage(`Đang chuẩn bị và phân tích video mẫu (${sampleLabel})...`);
    setErrorMessage('');
    setAiNotice(null);
    setPlan(null);
    setRenderResult(null);

    try {
      const { ok, data } = await fetchApiJson('/api/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (!ok || !data?.success) {
        throw new Error(data?.error || 'Tải video mẫu thất bại');
      }

      setVideoId(data.videoId);
      setSourceUrl(data.mediaUrl);
      setMetadata(data.metadata);
      setSilences(data.silences || []);
      setThumbnails(data.thumbnails || []);
      setTargetDuration(Math.min(30, Math.round(data.metadata.duration)));
      setCurrentTime(0);

      const sampleAspect: AspectRatio = type === 'talking_head' ? '9:16' : type === 'landscape_demo' ? '16:9' : '1:1';
      setAspectRatio(sampleAspect);

      setStatus('idle');
      // Trigger AI Analysis for this sample clip
      await runAnalysis(data.videoId, selectedPreset, Math.min(30, Math.round(data.metadata.duration)), sampleAspect);
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Không thể tạo video mẫu');
    }
  };

  // 3. Run AI Video Analysis & Edit Plan Generation
  const runAnalysis = async (
    vId = videoId,
    preset = selectedPreset,
    targetDur = targetDuration,
    aspect = aspectRatio
  ) => {
    if (!vId) return;

    setStatus('analyzing');
    setStatusMessage('AI đang phân tích video, phát hiện điểm nổi bật và giọng nói...');
    setErrorMessage('');
    setAiNotice(null);

    try {
      const { ok, data } = await fetchApiJson('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vId,
          preset,
          targetDuration: targetDur,
          aspectRatio: aspect,
        }),
      });

      if (data?.diagnostics) {
        setDiagnostics(data.diagnostics);
      }

      if (!ok || !data?.success) {
        setPlan(null); // DO NOT KEEP OR GENERATE FAKE PLAN
        throw new Error(data?.error || 'Dịch vụ phân tích video AI tạm thời không khả dụng. Vui lòng bấm thử lại.');
      }

      setPlan(data.plan);
      setQualityCheck(data.qualityCheck);
      if (data.plan.segments && data.plan.segments.length > 0) {
        setSelectedSegmentId(data.plan.segments[0].id);
      }

      setStatus('idle');
      setStatusMessage('Kế hoạch biên tập đã được AI phân tích và tạo thành công.');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Phân tích video thất bại do dịch vụ AI tạm thời không khả dụng.');
    }
  };

  // 4. Natural Language Edit Command
  const handleApplyNaturalLanguageCommand = async (command: string) => {
    if (!plan || !videoId) return;

    setIsApplyingCommand(true);
    setCommandNotification('Đang áp dụng điều chỉnh từ AI...');

    try {
      const { ok, data } = await fetchApiJson('/api/modify-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          videoId,
          command,
        }),
      });

      if (!ok || !data?.success) {
        throw new Error(data?.error || 'Không thể cập nhật kế hoạch');
      }

      setPlan(data.plan);
      setCommandNotification(data.explanation || 'Kế hoạch biên tập đã được cập nhật thành công.');
      setTimeout(() => setCommandNotification(null), 5000);
    } catch (err: any) {
      console.error(err);
      setCommandNotification(`Lỗi cập nhật: ${err.message || 'Không thể áp dụng lệnh'}`);
    } finally {
      setIsApplyingCommand(false);
    }
  };

  // 5. Deterministic Timeline Modifications
  const recalculatePlanDuration = (updatedPlan: EditPlan): EditPlan => {
    const keptSecs = updatedPlan.segments
      .filter((s) => s.keep)
      .reduce((acc, s) => acc + (s.sourceEnd - s.sourceStart), 0);

    return {
      ...updatedPlan,
      export: {
        ...updatedPlan.export,
        actualEstimatedDuration: Number(keptSecs.toFixed(2)),
      },
      cuts: updatedPlan.segments
        .filter((s) => !s.keep)
        .map((s) => ({
          sourceStart: s.sourceStart,
          sourceEnd: s.sourceEnd,
          reason: s.reason,
        })),
    };
  };

  const handleUpdateSegment = (updated: EditSegment) => {
    if (!plan) return;
    const newSegs = plan.segments.map((s) => (s.id === updated.id ? updated : s));
    newSegs.sort((a, b) => a.sourceStart - b.sourceStart);
    setPlan(recalculatePlanDuration({ ...plan, segments: newSegs }));
  };

  const handleUpdateSegmentTimes = (id: string, start: number, end: number) => {
    if (!plan) return;
    const newSegs = plan.segments.map((s) =>
      s.id === id ? { ...s, sourceStart: start, sourceEnd: end } : s
    );
    newSegs.sort((a, b) => a.sourceStart - b.sourceStart);
    setPlan(recalculatePlanDuration({ ...plan, segments: newSegs }));
  };

  const handleToggleKeep = (id: string) => {
    if (!plan) return;
    const newSegs = plan.segments.map((s) =>
      s.id === id ? { ...s, keep: !s.keep } : s
    );
    setPlan(recalculatePlanDuration({ ...plan, segments: newSegs }));
  };

  const handleDeleteSegment = (id: string) => {
    if (!plan) return;
    const newSegs = plan.segments.filter((s) => s.id !== id);
    setPlan(recalculatePlanDuration({ ...plan, segments: newSegs }));
    if (selectedSegmentId === id) {
      setSelectedSegmentId(newSegs[0]?.id || null);
    }
  };

  const handleMoveSegment = (index: number, direction: 'left' | 'right') => {
    if (!plan) return;
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= plan.segments.length) return;

    const newSegs = [...plan.segments];
    const [moved] = newSegs.splice(index, 1);
    newSegs.splice(newIndex, 0, moved);

    setPlan({ ...plan, segments: newSegs });
  };

  const handleSplitSegmentAtCurrentTime = () => {
    if (!plan || !metadata) return;
    // Find segment containing currentTime
    const targetIdx = plan.segments.findIndex(
      (s) => currentTime > s.sourceStart + 0.3 && currentTime < s.sourceEnd - 0.3
    );
    if (targetIdx === -1) return;

    const original = plan.segments[targetIdx];
    const seg1: EditSegment = {
      ...original,
      id: `${original.id}_a`,
      sourceEnd: Number(currentTime.toFixed(2)),
    };
    const seg2: EditSegment = {
      ...original,
      id: `${original.id}_b`,
      sourceStart: Number(currentTime.toFixed(2)),
    };

    const newSegs = [...plan.segments];
    newSegs.splice(targetIdx, 1, seg1, seg2);
    setPlan(recalculatePlanDuration({ ...plan, segments: newSegs }));
    setSelectedSegmentId(seg2.id);
  };

  const handleUpdateSubtitles = (subs: EditSubtitle[]) => {
    if (!plan) return;
    setPlan({ ...plan, subtitles: subs });
  };

  // 6. Execute FFmpeg Render
  const handleRender = async () => {
    if (!plan || !videoId) return;

    setStatus('rendering');
    setStatusMessage('Máy chủ FFmpeg đang dựng video MP4...');
    setErrorMessage('');
    setIsExportModalOpen(true);

    try {
      const { ok, data } = await fetchApiJson('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          videoId,
          burnSubtitles,
        }),
      });

      if (!ok || !data?.success) {
        throw new Error(data?.error || 'Dựng video thất bại');
      }

      setRenderResult(data.result);
      setActiveRenderId(data.renderId);
      setStatus('completed');
      setStatusMessage('Quá trình dựng video MP4 đã hoàn tất thành công.');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Dựng video thất bại');
    }
  };

  const handleCancelRender = async () => {
    if (!activeRenderId) return;
    try {
      await fetchApiJson('/api/cancel-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderId: activeRenderId }),
      });
      setStatus('idle');
      setIsExportModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = () => {
    setVideoId(null);
    setSourceUrl(null);
    setMetadata(null);
    setSilences([]);
    setThumbnails([]);
    setPlan(null);
    setQualityCheck(null);
    setRenderResult(null);
    setStatus('idle');
    setErrorMessage('');
    setAiNotice(null);
    setDiagnostics(null);
  };

  const selectedSegment = plan?.segments.find((s) => s.id === selectedSegmentId) || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <Header
        status={status}
        statusMessage={statusMessage}
        metadata={metadata}
        onReset={handleReset}
        onSelectSample={handleSelectSample}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 space-y-4">
        {/* Error Notification Banner with Vietnamese Collapsible Details */}
        {errorMessage && (
          <ErrorNotice
            error={errorMessage}
            title="Lỗi xử lý"
            onRetry={videoId ? () => runAnalysis() : undefined}
            retryLabel="Thử lại"
            onDismiss={() => setErrorMessage('')}
            dismissLabel="Đóng"
          />
        )}

        {/* AI System Fallback / Notice with Collapsible Details */}
        {aiNotice && (
          <ErrorNotice
            variant="warning"
            title="Thông báo máy chủ AI"
            error={aiNotice}
            onRetry={videoId ? () => runAnalysis() : undefined}
            retryLabel="Phân tích lại với AI"
            onDismiss={() => setAiNotice(null)}
            dismissLabel="Đóng"
          />
        )}

        {/* Command Feedback Notification */}
        {commandNotification && (
          <div className="p-3 rounded-xl bg-indigo-950/80 border border-indigo-700 text-indigo-300 text-xs animate-fade-in flex items-center justify-between">
            <span>{commandNotification}</span>
            <button
              type="button"
              onClick={() => setCommandNotification(null)}
              className="text-indigo-400 hover:text-white ml-2 text-base font-bold"
              title="Đóng thông báo"
            >
              &times;
            </button>
          </div>
        )}

        {/* When no video is uploaded: Show Dropzone */}
        {!metadata ? (
          <div className="py-6 md:py-12">
            <UploadDropzone
              onFileSelected={handleFileUpload}
              onSelectSample={handleSelectSample}
              isUploading={status === 'uploading' || status === 'processing'}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Source Inspector (Technical Metadata & Keyframes) */}
            <SourceInspector
              metadata={metadata}
              silences={silences}
              thumbnails={thumbnails}
              onSeekTo={(sec) => setCurrentTime(sec)}
            />

            {/* Video Player + AI Controls Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Video Player View (7 cols on desktop) */}
              <div className="lg:col-span-7">
                <VideoPlayerView
                  sourceUrl={sourceUrl}
                  renderedUrl={renderResult?.videoUrl || null}
                  currentTime={currentTime}
                  duration={metadata.duration}
                  subtitles={plan?.subtitles || []}
                  aspectRatio={aspectRatio}
                  onTimeUpdate={(t) => setCurrentTime(t)}
                  onDurationChange={(d) => {}}
                />
              </div>

              {/* AI Controls & Presets Panel (5 cols on desktop) */}
              <div className="lg:col-span-5">
                <AiControls
                  currentPlan={plan}
                  selectedPreset={selectedPreset}
                  targetDuration={targetDuration}
                  aspectRatio={aspectRatio}
                  resolution={resolution}
                  isAnalyzing={status === 'analyzing' || status === 'planning'}
                  isRendering={status === 'rendering'}
                  isApplyingCommand={isApplyingCommand}
                  onSelectPreset={(p) => setSelectedPreset(p)}
                  onTargetDurationChange={(d) => {
                    setTargetDuration(d);
                    if (plan) {
                      setPlan({
                        ...plan,
                        project: { ...plan.project, targetDuration: d },
                        export: { ...plan.export, targetDuration: d },
                      });
                    }
                  }}
                  onAspectRatioChange={(a) => {
                    setAspectRatio(a);
                    if (plan) {
                      setPlan({
                        ...plan,
                        crop: { ...plan.crop, aspectRatio: a },
                        export: { ...plan.export, aspectRatio: a },
                      });
                    }
                  }}
                  onResolutionChange={(r) => {
                    setResolution(r);
                    if (plan) {
                      setPlan({
                        ...plan,
                        export: { ...plan.export, resolution: r },
                      });
                    }
                  }}
                  onRunAnalysis={() => runAnalysis()}
                  onApplyNaturalLanguageCommand={handleApplyNaturalLanguageCommand}
                  onRender={handleRender}
                  burnSubtitles={burnSubtitles}
                  onToggleBurnSubtitles={(b) => setBurnSubtitles(b)}
                />
              </div>
            </div>

            {/* Interactive Timeline */}
            {plan && (
              <Timeline
                totalDuration={metadata.duration}
                currentTime={currentTime}
                segments={plan.segments}
                subtitles={plan.subtitles}
                selectedSegmentId={selectedSegmentId}
                onSelectSegment={(id) => setSelectedSegmentId(id)}
                onSeek={(sec) => setCurrentTime(sec)}
                onUpdateSegmentTimes={handleUpdateSegmentTimes}
                onToggleKeep={handleToggleKeep}
                onDeleteSegment={handleDeleteSegment}
                onMoveSegment={handleMoveSegment}
                onSplitSegmentAtCurrentTime={handleSplitSegmentAtCurrentTime}
              />
            )}

            {/* Segment Inspector & Subtitle Manager Grid */}
            {plan && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6">
                  <SegmentInspector
                    segment={selectedSegment}
                    sourceDuration={metadata.duration}
                    onUpdateSegment={handleUpdateSegment}
                    onDeleteSegment={handleDeleteSegment}
                  />
                </div>

                <div className="lg:col-span-6">
                  <SubtitleManager
                    subtitles={plan.subtitles}
                    currentTime={currentTime}
                    onUpdateSubtitles={handleUpdateSubtitles}
                    onSeekTo={(sec) => setCurrentTime(sec)}
                  />
                </div>
              </div>
            )}

            {/* AI Quality Audit Banner */}
            <QualityBanner
              qualityCheck={qualityCheck}
              warnings={plan?.warnings}
            />

            {/* Developer Diagnostics Panel */}
            <DeveloperDiagnostics diagnostics={diagnostics} />
          </div>
        )}
      </main>

      {/* Export / Render Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        isRendering={status === 'rendering'}
        renderResult={renderResult}
        errorMessage={errorMessage}
        onClose={() => setIsExportModalOpen(false)}
        onCancelRender={handleCancelRender}
        onRetryRender={handleRender}
      />
    </div>
  );
}
