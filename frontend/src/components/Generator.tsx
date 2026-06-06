import React, { useState, useEffect } from 'react';
import type { Campaign, Clip, Settings } from '../types';
import {
  Copy, Check, Download, Loader2, Sparkles, TrendingUp,
  Image, ImagePlus, X, ChevronLeft, Scissors, Zap, Film,
  Clock, DollarSign, AlertCircle, Eye, Trash2
} from 'lucide-react';
import axios from 'axios';

interface GeneratorProps {
  campaign: Campaign;
  clips: Clip[];
  settings: Settings;
  onRefreshClips: () => void;
  onRefreshSettings: () => void;
  onBack: () => void;
}

// ── Live preview helper ────────────────────────────────────────────────────
function splitForPreview(titleText: string) {
  let text = titleText.trim();
  if (!text) return [];
  if (text.endsWith('.') && !text.endsWith('...')) {
    if ((text.match(/\./g) || []).length === 1) text = text.slice(0, -1);
  }
  let parts = text.split(/([?!:-]+)/).map(s => s.trim()).filter(Boolean);
  const clean: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (/^[?!:-]+$/.test(parts[i]) && clean.length > 0) clean[clean.length - 1] += parts[i];
    else clean.push(parts[i]);
  }
  const final: string[] = [];
  clean.forEach(line => {
    const words = line.split(/\s+/);
    if (words.length > 4) {
      const mid = Math.ceil(words.length / 2);
      final.push(words.slice(0, mid).join(' '));
      final.push(words.slice(mid).join(' '));
    } else if (line.length > 0) final.push(line);
  });
  if (final.length <= 1) {
    const words = text.split(/\s+/);
    if (words.length <= 3) return [{ text, highlight: true }];
    if (words.length <= 5) {
      const mid = Math.ceil(words.length / 2);
      return [{ text: words.slice(0, mid).join(' '), highlight: false }, { text: words.slice(mid).join(' '), highlight: true }];
    }
    const chunk = Math.ceil(words.length / 3);
    const l1 = words.slice(0, Math.min(3, chunk));
    const l2 = words.slice(l1.length, l1.length + chunk);
    const l3 = words.slice(l1.length + l2.length);
    return [
      ...(l1.length ? [{ text: l1.join(' '), highlight: false }] : []),
      ...(l2.length ? [{ text: l2.join(' '), highlight: false }] : []),
      ...(l3.length ? [{ text: l3.join(' '), highlight: true }] : []),
    ];
  }
  return final.slice(0, 4).map((t, i, arr) => ({ text: t, highlight: i === arr.length - 1 }));
}

// ── Stepper ────────────────────────────────────────────────────────────────
function Stepper({ step, onChange }: { step: number; onChange: (s: number) => void }) {
  const steps = [
    { label: 'Setup', sub: 'Configure & generate' },
    { label: 'AI Insights', sub: 'Viral moments' },
    { label: 'My Clips', sub: 'Download & publish' },
  ];
  return (
    <div className="stepper">
      {steps.map((s, i) => {
        const num = i + 1;
        const active = step === num;
        const done = step > num;
        return (
          <React.Fragment key={num}>
            <div
              className={`stepper-step ${active ? 'active' : ''} ${done ? 'completed' : ''}`}
              onClick={() => onChange(num)}
            >
              <div className="stepper-circle">
                {done ? <Check size={14} /> : num}
              </div>
              <div className="stepper-text">
                <span className="stepper-label">{s.label}</span>
                <span className="stepper-sublabel">{s.sub}</span>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`stepper-divider ${done ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Processing Modal ───────────────────────────────────────────────────────
function ProcessingModal({ message, progress }: { message: string; progress?: number }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="processing-modal-content">
          <div className="processing-ring" />
          <h3 className="processing-title">Processing…</h3>
          <p className="processing-sub">{message}</p>
          {progress !== undefined && (
            <div className="processing-progress">
              <div className="processing-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>This may take a minute. Do not close this window.</p>
        </div>
      </div>
    </div>
  );
}

// ── Thumbnail Right Panel ──────────────────────────────────────────────────
interface ThumbPanelProps {
  clip: Clip;
  frames: string[];
  selectedFrame: number;
  onSelectFrame: (i: number) => void;
  titleText: string;
  onTitleChange: (v: string) => void;
  style: 'classic' | 'cyber' | 'bubble';
  onStyleChange: (s: 'classic' | 'cyber' | 'bubble') => void;
  isRendering: boolean;
  isGeneratingTitle: boolean;
  onGenerateTitle: () => void;
  onRender: () => void;
  onClose: () => void;
}

function ThumbnailPanel({
  clip, frames, selectedFrame, onSelectFrame,
  titleText, onTitleChange, style: activeStyle, onStyleChange,
  isRendering, isGeneratingTitle, onGenerateTitle, onRender, onClose
}: ThumbPanelProps) {
  const previewLines = splitForPreview(titleText);
  const focusX = clip.focusX !== undefined ? clip.focusX : 0.5;

  const getLineStyle = (line: { text: string; highlight: boolean }): React.CSSProperties => {
    const len = line.text.length;
    let base = activeStyle === 'bubble' ? 30 : activeStyle === 'cyber' ? 24 : 28;
    if (len > 22) base = Math.round(base * 0.58);
    else if (len > 17) base = Math.round(base * 0.70);
    else if (len > 12) base = Math.round(base * 0.85);

    const shared: React.CSSProperties = {
      textTransform: 'uppercase', lineHeight: 0.92, letterSpacing: '0.5px',
      fontSize: `${base}px`,
    };
    if (activeStyle === 'classic') return {
      ...shared,
      fontFamily: "'Anton','Impact',sans-serif",
      color: line.highlight ? '#FFD700' : '#fff',
      WebkitTextStroke: '1px #000',
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    };
    if (activeStyle === 'cyber') return {
      ...shared,
      fontFamily: "'Montserrat',sans-serif", fontWeight: 900,
      color: line.highlight ? '#ff00ea' : '#00f3ff',
      WebkitTextStroke: '0.3px #000',
      textShadow: line.highlight
        ? '0 0 4px rgba(255,0,234,0.8)'
        : '0 0 4px rgba(0,243,255,0.8)',
    };
    // bubble
    return {
      ...shared,
      fontFamily: "'Anton','Impact',sans-serif",
      color: line.highlight ? '#ff3c00' : '#ffe600',
      WebkitTextStroke: '1px #000',
      textShadow: '2px 2px 0 #000',
    };
  };

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 298,
          background: 'transparent',
        }}
      />
      {/* Right Panel */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: '380px',
        background: 'var(--bg-modal)',
        borderLeft: '1px solid var(--border)',
        zIndex: 299,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        animation: 'slideInRight 0.3s var(--ease)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--primary-subtle)', border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ImagePlus size={14} style={{ color: 'var(--primary-light)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-display)' }}>Thumbnail Generator</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dark)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
          {/* Live Preview */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dark)', marginBottom: '10px' }}>Live Preview</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '160px', height: '284px',
                position: 'relative', overflow: 'hidden',
                borderRadius: '10px',
                border: '2px solid var(--border)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                background: '#111',
              }}>
                {frames[selectedFrame] && (
                  <img src={frames[selectedFrame]} alt="bg"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(focusX * 100).toFixed(1)}% center`, position: 'absolute', inset: 0, zIndex: 1 }} />
                )}
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 2,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.7) 100%)'
                }} />
                <div style={{
                  position: 'absolute', top: '34px', left: '9px', right: '9px',
                  zIndex: 3, display: 'flex', flexDirection: 'column', gap: '1px',
                  transform: activeStyle === 'bubble' ? 'skewY(-3deg) rotate(-3deg)' : 'none'
                }}>
                  {previewLines.map((line, i) => (
                    <div key={i} style={getLineStyle(line)}>{line.text}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Frame Picker */}
          {frames.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dark)', marginBottom: '10px' }}>
                Select Frame
              </div>
              <div className="frame-grid">
                {frames.map((url, idx) => (
                  <div key={idx} className={`frame-item ${selectedFrame === idx ? 'selected' : ''}`} onClick={() => onSelectFrame(idx)}>
                    <img src={url} alt={`Frame ${idx + 1}`} style={{ objectPosition: `${(focusX * 100).toFixed(1)}% center` }} />
                    {selectedFrame === idx && (
                      <div className="frame-check"><Check size={10} color="#fff" /></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dark)' }}>
              Title Text
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Enter title for the thumbnail…"
                value={titleText}
                onChange={e => onTitleChange(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0 12px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={onGenerateTitle}
                disabled={isGeneratingTitle}
                title="Generate short clickbait title"
              >
                {isGeneratingTitle ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            </div>
          </div>

          {/* Style Picker */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dark)', marginBottom: '8px' }}>
              Text Style
            </div>
            <div className="style-picker">
              {(['classic', 'cyber', 'bubble'] as const).map(s => (
                <button key={s} className={`style-btn ${activeStyle === s ? 'active' : ''}`} onClick={() => onStyleChange(s)}>
                  {s === 'classic' ? '⚡ Classic' : s === 'cyber' ? '🌐 Cyber' : '💥 Bubble'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, fontSize: '13px' }} onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2, fontSize: '13px' }}
            onClick={onRender}
            disabled={isRendering || frames.length === 0}
          >
            {isRendering ? <><Loader2 size={14} className="animate-spin" /> Rendering…</> : <><Sparkles size={14} /> Render Thumbnail</>}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Clip Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status, progress }: { status: string; progress: number }) {
  if (status === 'completed') return <span className="badge badge-secondary"><Check size={10} /> Ready</span>;
  if (status === 'failed') return <span className="badge badge-accent"><AlertCircle size={10} /> Failed</span>;
  if (['downloading', 'downloading_gameplay', 'processing'].includes(status)) {
    return (
      <span className="badge badge-warning">
        <Loader2 size={10} className="animate-spin" />
        {status.replace('_', ' ')} {progress}%
      </span>
    );
  }
  return <span className="badge" style={{ background: 'var(--border)', color: 'var(--text-dark)' }}>Pending</span>;
}

// ── Main Generator ─────────────────────────────────────────────────────────
export default function Generator({ campaign, clips, settings, onRefreshClips, onRefreshSettings, onBack }: GeneratorProps) {
  // ── Step state
  const [activeStep, setActiveStep] = useState(1);

  // ── Clipping form
  const [generatorMode, setGeneratorMode] = useState<'single' | 'auto'>('single');
  const [startTime, setStartTime] = useState('0');
  const [duration, setDuration] = useState('30');
  const [splitDuration, setSplitDuration] = useState('30');
  const [subtitleOffset, setSubtitleOffset] = useState('0');
  const [useSplitScreen, setUseSplitScreen] = useState(false);
  const [cropPosition, setCropPosition] = useState<'auto' | 'left' | 'center' | 'right'>('auto');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');

  // ── Processing modal
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [processingProgress, setProcessingProgress] = useState<number | undefined>(undefined);

  // ── Feedback
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [activeVideoClipId, setActiveVideoClipId] = useState<string | null>(null);
  const [viewInputs, setViewInputs] = useState<{ [k: string]: string }>({});
  const [isDownloadingGameplay, setIsDownloadingGameplay] = useState(false);
  const [gameplayProgress, setGameplayProgress] = useState(0);

  // ── AI Insights
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [renderingInsightId, setRenderingInsightId] = useState<string | null>(null);
  const [copiedInsightId, setCopiedInsightId] = useState<string | null>(null);

  // ── Thumbnail panel (right-side)
  const [thumbPanelClipId, setThumbPanelClipId] = useState<string | null>(null);
  const [thumbnailFrames, setThumbnailFrames] = useState<{ [id: string]: string[] }>({});
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<{ [id: string]: number }>({});
  const [thumbnailTitle, setThumbnailTitle] = useState<{ [id: string]: string }>({});
  const [thumbnailStyle, setThumbnailStyle] = useState<{ [id: string]: 'classic' | 'cyber' | 'bubble' }>({});
  const [extractingFramesClipId, setExtractingFramesClipId] = useState<string | null>(null);
  const [renderingThumbnailClipId, setRenderingThumbnailClipId] = useState<string | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  const campaignClips = clips.filter(c => c.campaignId === campaign.id);
  const completedClips = campaignClips.filter(c => c.status === 'completed');
  const totalEarnings = completedClips.reduce((sum, c) => sum + (c.earnings || 0), 0);
  const totalViews = completedClips.reduce((sum, c) => sum + (c.views || 0), 0);

  // Compliance defaults
  useEffect(() => {
    const isCod = campaign.name.toLowerCase().includes('call of duty') || campaign.name.toLowerCase().includes('cod');
    if (isCod) {
      setTitle('Ghost vs Price in Modern Warfare 4 looks CRAZY! @callofduty');
      setTags('#Ad\n#MW4 #ModernWarfare4 #clipping');
    } else {
      setTitle(`${campaign.name} is insane!`);
      setTags(`#Ad\n#${campaign.brand?.replace(/\s+/g, '') || 'clipping'}`);
    }
  }, [campaign]);

  // Poll active clips
  useEffect(() => {
    const hasActive = campaignClips.some(c => ['pending', 'downloading', 'downloading_gameplay', 'processing'].includes(c.status));
    if (hasActive) {
      const t = setInterval(onRefreshClips, 3000);
      return () => clearInterval(t);
    }
  }, [clips, onRefreshClips]);

  // Poll gameplay download
  useEffect(() => {
    if (!isDownloadingGameplay) return;
    const t = setInterval(async () => {
      try {
        const res = await axios.get('/api/settings/download-status');
        setGameplayProgress(res.data.progress);
        if (res.data.status === 'completed') { setIsDownloadingGameplay(false); onRefreshSettings(); }
        else if (res.data.status === 'failed') { setIsDownloadingGameplay(false); alert(`Download failed: ${res.data.error}`); }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [isDownloadingGameplay]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useSplitScreen && !settings.gameplayDownloaded) {
      alert('Download the gameplay background first or disable Split-Screen.');
      return;
    }
    try {
      setProcessingMsg('Downloading video and generating clip… This may take 1–3 minutes.');
      setProcessingProgress(undefined);
      setIsProcessing(true);
      await axios.post('/api/clips/generate', {
        campaignId: campaign.id,
        startTime: parseInt(startTime, 10),
        duration: parseInt(duration, 10),
        useSplitScreen, title, tags,
        subtitleOffset: parseFloat(subtitleOffset) || 0,
        cropPosition,
      });
      setStartTime(prev => (parseInt(prev, 10) + parseInt(duration, 10)).toString());
      onRefreshClips();
      setActiveStep(3); // Jump to clips!
    } catch (err) {
      alert('Failed to trigger clip generation.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useSplitScreen && !settings.gameplayDownloaded) {
      alert('Download the gameplay background first.');
      return;
    }
    try {
      setProcessingMsg(`Auto-splitting the full video into ${splitDuration}s clips… Starting in background.`);
      setIsProcessing(true);
      await axios.post(`/api/campaigns/${campaign.id}/split`, {
        clipDuration: parseInt(splitDuration, 10),
        useSplitScreen, cropPosition,
      });
      onRefreshClips();
      setActiveStep(3);
    } catch (err) {
      alert('Failed to start auto-splitting.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInstantRender = async (insight: any, index: number) => {
    if (useSplitScreen && !settings.gameplayDownloaded) {
      alert('Download the gameplay background first.');
      return;
    }
    try {
      setRenderingInsightId(index.toString());
      setProcessingMsg('Rendering clip from AI insight…');
      setIsProcessing(true);
      await axios.post('/api/clips/generate', {
        campaignId: campaign.id,
        startTime: insight.startTime, duration: insight.duration,
        useSplitScreen, title: insight.suggestedTitle, tags: insight.suggestedTags,
        subtitleOffset: parseFloat(subtitleOffset) || 0, cropPosition,
      });
      onRefreshClips();
      setActiveStep(3);
    } catch (err) {
      alert('Failed to render instant clip.');
    } finally {
      setIsProcessing(false);
      setRenderingInsightId(null);
    }
  };

  const handleAnalyzeTranscript = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      await axios.post(`/api/campaigns/${campaign.id}/analyze-transcript`);
      onRefreshClips();
    } catch (err: any) {
      setAnalysisError(err.response?.data?.error || 'Failed. Make sure an AI API key is set in backend/.env.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyCaption = (clip: Clip) => {
    navigator.clipboard.writeText(`${clip.title}\n\n${clip.tags}`);
    setCopiedClipId(clip.id);
    setTimeout(() => setCopiedClipId(null), 2000);
  };

  const handleCopyInsightCaption = (insight: any, idx: number) => {
    navigator.clipboard.writeText(`${insight.suggestedTitle}\n\n${insight.suggestedTags}`);
    setCopiedInsightId(idx.toString());
    setTimeout(() => setCopiedInsightId(null), 2000);
  };

  const handleUpdateViews = async (clipId: string) => {
    const v = viewInputs[clipId];
    if (!v || isNaN(parseInt(v, 10))) return;
    try {
      await axios.put(`/api/clips/${clipId}/views`, { views: parseInt(v, 10) });
      setViewInputs(prev => ({ ...prev, [clipId]: '' }));
      onRefreshClips();
    } catch {}
  };

  const handleDeleteClip = async (id: string) => {
    if (!confirm('Delete this clip and its file?')) return;
    try { await axios.delete(`/api/clips/${id}`); onRefreshClips(); } catch {}
  };

  const handleDownloadGameplay = async () => {
    try { setIsDownloadingGameplay(true); setGameplayProgress(0); await axios.post('/api/settings/download-gameplay'); }
    catch { setIsDownloadingGameplay(false); }
  };

  const handleGenerateClickbaitTitle = async (clipId: string) => {
    setIsGeneratingTitle(true);
    try {
      const res = await axios.post(`/api/clips/${clipId}/generate-clickbait-title`);
      const newTitle = res.data.clickbaitTitle;
      setThumbnailTitle(prev => ({ ...prev, [clipId]: newTitle }));
    } catch (err) {
      console.error('Failed to generate clickbait title:', err);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  // ── Thumbnail ────────────────────────────────────────────────────────────
  const openThumbPanel = async (clip: Clip) => {
    const cid = clip.id;
    setThumbPanelClipId(cid);
    
    // Automatically pre-populate style and select frame index 2 when opened
    setThumbnailStyle(prev => ({ ...prev, [cid]: prev[cid] || 'classic' }));
    setSelectedFrameIndex(prev => ({ ...prev, [cid]: prev[cid] !== undefined ? prev[cid] : 2 }));

    // Default to the clean suggested clip title when opened if not set yet
    if (!thumbnailTitle[cid]) {
      setThumbnailTitle(prev => ({ ...prev, [cid]: clip.title || clip.name || '' }));
    }

    if (!thumbnailFrames[cid] || thumbnailFrames[cid].length === 0) {
      try {
        setExtractingFramesClipId(cid);
        const res = await axios.post(`/api/clips/${cid}/extract-frames`);
        setThumbnailFrames(prev => ({ ...prev, [cid]: res.data.frames }));
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed to extract frames.');
        setThumbPanelClipId(null);
      } finally {
        setExtractingFramesClipId(null);
      }
    }
  };

  const handleRenderThumbnail = async (clipId: string) => {
    try {
      setRenderingThumbnailClipId(clipId);
      await axios.post(`/api/clips/${clipId}/generate-thumbnail`, {
        frameIndex: selectedFrameIndex[clipId] ?? 0,
        titleText: thumbnailTitle[clipId] || '',
        textStyle: thumbnailStyle[clipId] || 'classic',
      });
      setThumbPanelClipId(null);
      onRefreshClips();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to render thumbnail.');
    } finally {
      setRenderingThumbnailClipId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const thumbClip = thumbPanelClipId ? campaignClips.find(c => c.id === thumbPanelClipId) : null;

  return (
    <div className="animated-fade-in" style={{ position: 'relative' }}>
      {/* Processing overlay */}
      {isProcessing && <ProcessingModal message={processingMsg} progress={processingProgress} />}

      {/* Thumbnail right panel */}
      {thumbClip && thumbPanelClipId && (
        <ThumbnailPanel
          clip={thumbClip}
          frames={thumbnailFrames[thumbPanelClipId] || []}
          selectedFrame={selectedFrameIndex[thumbPanelClipId] ?? 0}
          onSelectFrame={i => setSelectedFrameIndex(prev => ({ ...prev, [thumbPanelClipId]: i }))}
          titleText={thumbnailTitle[thumbPanelClipId] || ''}
          onTitleChange={v => setThumbnailTitle(prev => ({ ...prev, [thumbPanelClipId]: v }))}
          style={thumbnailStyle[thumbPanelClipId] || 'classic'}
          onStyleChange={s => setThumbnailStyle(prev => ({ ...prev, [thumbPanelClipId]: s }))}
          isRendering={renderingThumbnailClipId === thumbPanelClipId}
          isGeneratingTitle={isGeneratingTitle}
          onGenerateTitle={() => handleGenerateClickbaitTitle(thumbPanelClipId)}
          onRender={() => handleRenderThumbnail(thumbPanelClipId)}
          onClose={() => setThumbPanelClipId(null)}
        />
      )}

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
              <ChevronLeft size={14} /> Campaigns
            </button>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{campaign.name}</span>
          </div>
          <h2 className="header-title" style={{ marginBottom: 0 }}>{campaign.name}</h2>
        </div>
        <span className="badge badge-secondary" style={{ fontSize: '13px', padding: '6px 14px' }}>
          <DollarSign size={12} />{campaign.rate.toFixed(2)}/1K views
        </span>
      </div>

      {/* ── Stats strip ── */}
      {campaignClips.length > 0 && (
        <div className="earnings-strip">
          <div className="earnings-item">
            <div className="earnings-value">{campaignClips.length}</div>
            <div className="earnings-label">Total Clips</div>
          </div>
          <div className="earnings-divider" />
          <div className="earnings-item">
            <div className="earnings-value">{completedClips.length}</div>
            <div className="earnings-label">Completed</div>
          </div>
          <div className="earnings-divider" />
          <div className="earnings-item">
            <div className="earnings-value">{totalViews.toLocaleString()}</div>
            <div className="earnings-label">Total Views</div>
          </div>
          <div className="earnings-divider" />
          <div className="earnings-item">
            <div className="earnings-value" style={{ color: 'var(--secondary-light)' }}>${totalEarnings.toFixed(2)}</div>
            <div className="earnings-label">Earnings</div>
          </div>
        </div>
      )}

      {/* ── Stepper ── */}
      <div className="glass-card" style={{ padding: '6px', marginBottom: '24px' }}>
        <Stepper step={activeStep} onChange={setActiveStep} />
      </div>

      {/* ══════════════════════════════════════════════
          STEP 1: SETUP
      ══════════════════════════════════════════════ */}
      {activeStep === 1 && (
        <div className="animated-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
          {/* Left: Main form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mode tabs */}
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="section-title" style={{ marginBottom: 0 }}>Generate Clip</h3>
                <div className="tab-group">
                  <button className={`tab-btn ${generatorMode === 'single' ? 'active' : ''}`} onClick={() => setGeneratorMode('single')}>
                    <Scissors size={12} /> Single
                  </button>
                  <button className={`tab-btn ${generatorMode === 'auto' ? 'active' : ''}`} onClick={() => setGeneratorMode('auto')}>
                    <Zap size={12} /> Auto-Split
                  </button>
                </div>
              </div>

              {generatorMode === 'single' ? (
                <form id="clip-form" onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="grid-cols-2">
                    <div>
                      <label>Start Time (seconds) *</label>
                      <input type="number" min="0" value={startTime} onChange={e => setStartTime(e.target.value)} placeholder="0" required />
                    </div>
                    <div>
                      <label>Duration (seconds) *</label>
                      <input type="number" min="10" max="120" value={duration} onChange={e => setDuration(e.target.value)} placeholder="30" required />
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px', display: 'block' }}>10–120s. Best: 15–30s for Shorts.</span>
                    </div>
                  </div>

                  <div>
                    <label>Subtitle Offset (seconds)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input type="range" min="-5" max="5" step="0.1" value={subtitleOffset}
                        onChange={e => setSubtitleOffset(e.target.value)}
                        style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-light)', minWidth: '40px', textAlign: 'right' }}>
                        {parseFloat(subtitleOffset) >= 0 ? '+' : ''}{subtitleOffset}s
                      </span>
                    </div>
                  </div>

                  <div>
                    <label>Title / Caption</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Viral-ready title…" />
                  </div>

                  <div>
                    <label>Tags (FTC disclosure on first line)</label>
                    <textarea rows={3} value={tags} onChange={e => setTags(e.target.value)} placeholder="#Ad&#10;#hashtag1 #hashtag2" />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px' }}>
                    <Scissors size={16} /> Generate Clip
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAutoSplit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label>Clip Duration (seconds) *</label>
                    <input type="number" min="10" max="120" value={splitDuration} onChange={e => setSplitDuration(e.target.value)} required />
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px', display: 'block' }}>
                      The full video will be split into equal clips of this length.
                    </span>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px' }}>
                    <Zap size={16} /> Start Auto-Split
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right: Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Split Screen */}
            <div className="form-section">
              <div className="form-section-title"><Film size={14} /> Split-Screen</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '2px' }}>Gameplay Overlay</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dark)' }}>Subway Surfers / Minecraft below clip</div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', margin: 0 }}>
                  <input type="checkbox" checked={useSplitScreen} onChange={e => setUseSplitScreen(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '99px', cursor: 'pointer',
                    background: useSplitScreen ? 'var(--primary)' : 'var(--border)',
                    transition: 'background 0.2s',
                    boxShadow: useSplitScreen ? 'inset 0 0 6px rgba(0,0,0,0.2)' : 'none'
                  }} />
                  <span style={{
                    position: 'absolute', left: useSplitScreen ? '20px' : '2px', top: '2px',
                    width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                  }} />
                </label>
              </div>
              {useSplitScreen && (
                settings.gameplayDownloaded ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--secondary-light)' }}>
                    <Check size={12} /> Gameplay background ready
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '12px', color: 'var(--warning)', marginBottom: '8px' }}>Gameplay not downloaded yet.</p>
                    <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 14px', width: '100%' }}
                      onClick={handleDownloadGameplay} disabled={isDownloadingGameplay}>
                      {isDownloadingGameplay ? <><Loader2 size={12} className="animate-spin" /> Downloading ({gameplayProgress}%)</> : <><Download size={12} /> Download Gameplay</>}
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Crop */}
            <div className="form-section">
              <div className="form-section-title">📐 Crop Focus</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['auto', 'left', 'center', 'right'] as const).map(pos => (
                  <button key={pos} type="button" onClick={() => setCropPosition(pos)} style={{
                    padding: '7px 4px', fontSize: '11px', fontWeight: '700',
                    borderRadius: 'var(--radius-sm)', border: '1px solid',
                    cursor: 'pointer', transition: 'all 0.2s',
                    background: cropPosition === pos ? 'var(--primary-subtle)' : 'transparent',
                    borderColor: cropPosition === pos ? 'var(--primary)' : 'var(--border)',
                    color: cropPosition === pos ? 'var(--primary-light)' : 'var(--text-dark)',
                    textTransform: 'capitalize', fontFamily: 'var(--font-sans)',
                  }}>
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick nav to clips */}
            {campaignClips.length > 0 && (
              <button className="btn btn-secondary" style={{ fontSize: '13px', width: '100%' }} onClick={() => setActiveStep(3)}>
                <Film size={14} /> View {campaignClips.length} Clip{campaignClips.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 2: AI INSIGHTS
      ══════════════════════════════════════════════ */}
      {activeStep === 2 && (
        <div className="animated-fade-in">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: 'var(--primary)' }} /> AI Viral Insights
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                AI scans the transcript and finds the highest-retention moments automatically.
              </p>
            </div>
            <button className="btn btn-primary" style={{ fontSize: '13px' }} onClick={handleAnalyzeTranscript} disabled={isAnalyzing}>
              {isAnalyzing ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Sparkles size={14} /> {campaign.viralInsights?.length ? 'Re-analyze' : 'Scan Transcript'}</>}
            </button>
          </div>

          {analysisError && (
            <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', color: 'var(--accent-light)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> {analysisError}
            </div>
          )}

          {!campaign.viralInsights || campaign.viralInsights.length === 0 ? (
            <div className="glass-card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Sparkles size={28} style={{ color: 'var(--primary-light)' }} />
                </div>
                <h3 className="empty-state-title">No insights yet</h3>
                <p className="empty-state-sub">
                  Click "Scan Transcript" above to let AI find the viral moments in this video. It takes about 15–30 seconds.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {campaign.viralInsights.map((insight, i) => (
                <div key={i} className="insight-card">
                  <div className="insight-card-header">
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span className="badge badge-primary" style={{ fontSize: '10px' }}>#{i + 1}</span>
                        <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                          <TrendingUp size={10} /> Virality {insight.viralityScore || '9'}/10
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-dark)' }}>
                          <Clock size={11} style={{ display: 'inline', marginRight: '4px' }} />
                          {Math.floor(insight.startTime / 60).toString().padStart(2, '0')}:{(insight.startTime % 60).toString().padStart(2, '0')}
                          {' – '}
                          {Math.floor(insight.endTime / 60).toString().padStart(2, '0')}:{(insight.endTime % 60).toString().padStart(2, '0')}
                          {' '}({insight.duration}s)
                        </span>
                      </div>
                      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700' }}>{insight.title}</h4>
                      <div className="virality-bar">
                        <div className="virality-bar-fill" style={{ width: `${((insight.viralityScore || 9) / 10) * 100}%` }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}
                        onClick={() => handleCopyInsightCaption(insight, i)}>
                        {copiedInsightId === i.toString() ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Caption</>}
                      </button>
                      <button className="btn btn-primary" style={{ fontSize: '12px', padding: '7px 14px' }}
                        onClick={() => handleInstantRender(insight, i)}
                        disabled={renderingInsightId === i.toString()}>
                        {renderingInsightId === i.toString()
                          ? <><Loader2 size={12} className="animate-spin" /> Rendering…</>
                          : <><Zap size={12} /> Instant Render</>}
                      </button>
                    </div>
                  </div>
                  <div className="insight-card-body">
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', borderLeft: '3px solid var(--primary)', paddingLeft: '12px' }}>
                      {insight.explanation}
                    </p>
                    <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', padding: '12px', fontSize: '12px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-dark)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px' }}>Caption Preview</div>
                      <div style={{ fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>{insight.suggestedTitle}</div>
                      <div style={{ color: 'var(--text-dark)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{insight.suggestedTags}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 3: MY CLIPS
      ══════════════════════════════════════════════ */}
      {activeStep === 3 && (
        <div className="animated-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h3 className="section-title">My Clips <span style={{ color: 'var(--text-dark)', fontWeight: '400' }}>({campaignClips.length})</span></h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Download, copy caption, or generate thumbnail for each clip.</p>
            </div>
            <button className="btn btn-primary" style={{ fontSize: '13px' }} onClick={() => setActiveStep(1)}>
              <Scissors size={14} /> New Clip
            </button>
          </div>

          {campaignClips.length === 0 ? (
            <div className="glass-card">
              <div className="empty-state">
                <div className="empty-state-icon"><Film size={28} style={{ color: 'var(--primary-light)' }} /></div>
                <h3 className="empty-state-title">No clips yet</h3>
                <p className="empty-state-sub">Go to Setup to generate your first clip, or use AI Insights to find viral moments automatically.</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={() => setActiveStep(1)}><Scissors size={14} /> Setup</button>
                  <button className="btn btn-primary" style={{ fontSize: '13px' }} onClick={() => setActiveStep(2)}><Sparkles size={14} /> AI Insights</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid-cols-2" style={{ gap: '16px' }}>
              {campaignClips.slice().reverse().map(clip => (
                <div key={clip.id} className="clip-card">
                  {/* Thumbnail / Video row */}
                  <div style={{ display: 'flex', gap: '0', height: '160px', position: 'relative', overflow: 'hidden' }}>
                    {/* Thumbnail or dark bg */}
                    <div style={{ width: '90px', flexShrink: 0, background: '#000', position: 'relative', overflow: 'hidden' }}>
                      {clip.thumbnailPath ? (
                        <img src={clip.thumbnailPath} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : clip.status === 'completed' ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-1)', flexDirection: 'column', gap: '6px' }}>
                          <Image size={20} style={{ color: 'var(--text-faint)' }} />
                          <span style={{ fontSize: '9px', color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.3 }}>No thumbnail</span>
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--bg-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {['downloading', 'downloading_gameplay', 'processing', 'pending'].includes(clip.status) && (
                            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-faint)' }} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info panel */}
                    <div style={{ flex: 1, padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden', background: 'var(--bg-surface-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <StatusBadge status={clip.status} progress={clip.progress} />
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: '700', lineHeight: '1.3', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {clip.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dark)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span><Clock size={10} style={{ display: 'inline' }} /> {clip.startTime}s – {clip.startTime + clip.duration}s</span>
                        <span>•</span>
                        <span>{clip.duration}s</span>
                      </div>
                      {clip.views > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--secondary-light)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <TrendingUp size={11} /> {clip.views.toLocaleString()} views · <span style={{ color: 'var(--secondary)' }}>${clip.earnings.toFixed(2)}</span>
                        </div>
                      )}

                      {/* Progress bar */}
                      {['downloading', 'downloading_gameplay', 'processing'].includes(clip.status) && (
                        <div className="progress-bar" style={{ marginTop: '2px' }}>
                          <div className="progress-bar-fill" style={{ width: `${clip.progress}%` }} />
                        </div>
                      )}

                      {/* Clickbait Title & Tags */}
                      {clip.status === 'completed' && (
                        <div style={{ marginTop: '4px', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary-light)', marginBottom: '3px', letterSpacing: '0.05em' }}>
                            Viral Caption (Auto-Generated)
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={clip.title}>
                            {clip.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={clip.tags}>
                            {clip.tags.replace(/\n+/g, ' ')}
                          </div>
                        </div>
                      )}

                      {clip.error && (
                        <div style={{ fontSize: '11px', color: 'var(--accent-light)' }}>{clip.error}</div>
                      )}
                    </div>
                  </div>

                  {/* Actions row */}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.15)' }}>
                    {clip.status === 'completed' && (
                      <>
                        {/* Preview toggle */}
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}
                          onClick={() => setActiveVideoClipId(activeVideoClipId === clip.id ? null : clip.id)}>
                          <Eye size={12} /> {activeVideoClipId === clip.id ? 'Hide' : 'Preview'}
                        </button>

                        {/* Copy caption */}
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}
                          onClick={() => handleCopyCaption(clip)}>
                          {copiedClipId === clip.id ? <><Check size={12} style={{ color: 'var(--secondary)' }} /> Copied</> : <><Copy size={12} /> Caption</>}
                        </button>

                        {/* Download */}
                        <a href={`/clips/${clip.fileName}`} download
                          className="btn btn-success" style={{ padding: '6px 12px', fontSize: '11px', textDecoration: 'none' }}>
                          <Download size={12} /> Download
                        </a>

                        {/* Thumbnail */}
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', marginLeft: 'auto' }}
                          onClick={() => openThumbPanel(clip)}
                          disabled={extractingFramesClipId === clip.id}>
                          {extractingFramesClipId === clip.id
                            ? <><Loader2 size={12} className="animate-spin" /> Loading…</>
                            : <><ImagePlus size={12} /> {clip.thumbnailPath ? 'Re-thumbnail' : 'Thumbnail'}</>}
                        </button>
                      </>
                    )}

                    {/* View counter */}
                    {clip.status === 'completed' && (
                      <div style={{ width: '100%', display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                        <TrendingUp size={12} style={{ color: 'var(--text-dark)', flexShrink: 0 }} />
                        <input type="number" placeholder="Add views…"
                          style={{ flex: 1, padding: '5px 8px', fontSize: '11px', height: '26px' }}
                          value={viewInputs[clip.id] || ''} onChange={e => setViewInputs(p => ({ ...p, [clip.id]: e.target.value }))} />
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', height: '26px' }}
                          onClick={() => handleUpdateViews(clip.id)}>Add</button>
                        <button className="btn btn-icon btn-secondary" style={{ height: '26px', width: '26px' }}
                          title="Delete clip" onClick={() => handleDeleteClip(clip.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}

                    {clip.status !== 'completed' && (
                      <button className="btn btn-icon btn-secondary" style={{ marginLeft: 'auto' }}
                        title="Delete clip" onClick={() => handleDeleteClip(clip.id)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Expanded video preview */}
                  {activeVideoClipId === clip.id && clip.status === 'completed' && (
                    <div style={{ padding: '14px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                      <div className="video-preview-wrapper" style={{ maxWidth: '200px' }}>
                        <video controls src={`/clips/${clip.fileName}`} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
