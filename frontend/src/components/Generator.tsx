import React, { useState, useEffect } from 'react';
import type { Campaign, Clip, Settings } from '../types';
import { Play, Copy, Check, Download, Info, Video, HelpCircle, Loader2, Sparkles, TrendingUp, Link, Image, ImagePlus } from 'lucide-react';
import axios from 'axios';

interface GeneratorProps {
  campaign: Campaign;
  clips: Clip[];
  settings: Settings;
  onRefreshClips: () => void;
  onRefreshSettings: () => void;
  onBack: () => void;
}

export default function Generator({
  campaign,
  clips,
  settings,
  onRefreshClips,
  onRefreshSettings,
  onBack
}: GeneratorProps) {
  // Clipping Form States
  const [startTime, setStartTime] = useState('0');
  const [duration, setDuration] = useState('15');
  const [useSplitScreen, setUseSplitScreen] = useState(false); // Default to false to obey CoD guidelines!
  const [subtitleOffset, setSubtitleOffset] = useState('0');
  const [cropPosition, setCropPosition] = useState<'auto' | 'left' | 'center' | 'right'>('auto');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-Split States
  const [generatorMode, setGeneratorMode] = useState<'single' | 'auto'>('single');
  const [splitDuration, setSplitDuration] = useState('30');
  const [isSplitting, setIsSplitting] = useState(false);

  // Download Gameplay Background States
  const [isDownloadingGameplay, setIsDownloadingGameplay] = useState(false);
  const [gameplayProgress, setGameplayProgress] = useState(0);

  // Feedback states
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [viewInputs, setViewInputs] = useState<{ [key: string]: string }>({});

  // AI Slicing States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [renderingInsightId, setRenderingInsightId] = useState<string | null>(null);
  const [copiedInsightId, setCopiedInsightId] = useState<string | null>(null);

  // Thumbnail States
  const [extractingFramesClipId, setExtractingFramesClipId] = useState<string | null>(null);
  const [thumbnailFrames, setThumbnailFrames] = useState<{ [clipId: string]: string[] }>({});
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<{ [clipId: string]: number }>({});
  const [thumbnailTitle, setThumbnailTitle] = useState<{ [clipId: string]: string }>({});
  const [renderingThumbnailClipId, setRenderingThumbnailClipId] = useState<string | null>(null);
  const [thumbnailShowSection, setThumbnailShowSection] = useState<{ [clipId: string]: boolean }>({});
  const [thumbnailStyle, setThumbnailStyle] = useState<{ [clipId: string]: 'classic' | 'cyber' | 'bubble' }>({});

  const handleAnalyzeTranscript = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      await axios.post(`/api/campaigns/${campaign.id}/analyze-transcript`);
      onRefreshClips();
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.response?.data?.error || 'Failed to analyze transcript. Make sure GEMINI_API_KEY is configured in backend/.env.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUseInsight = (insight: any) => {
    setStartTime(insight.startTime.toString());
    setDuration(insight.duration.toString());
    setTitle(insight.suggestedTitle);
    setTags(insight.suggestedTags);
    
    const formElement = document.getElementById('generator-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleInstantRender = async (insight: any, index: number) => {
    if (useSplitScreen && !settings.gameplayDownloaded) {
      alert('You must download the background gameplay video first or disable Split-Screen.');
      return;
    }
    
    try {
      setRenderingInsightId(index.toString());
      await axios.post('/api/clips/generate', {
        campaignId: campaign.id,
        startTime: insight.startTime,
        duration: insight.duration,
        useSplitScreen,
        title: insight.suggestedTitle,
        tags: insight.suggestedTags,
        subtitleOffset: parseFloat(subtitleOffset) || 0,
        cropPosition
      });
      onRefreshClips();
    } catch (err) {
      console.error(err);
      alert('Failed to trigger instant generation.');
    } finally {
      setRenderingInsightId(null);
    }
  };

  const handleCopyInsightCaption = (insight: any, index: number) => {
    const fullText = `${insight.suggestedTitle}\n\n${insight.suggestedTags}`;
    navigator.clipboard.writeText(fullText);
    setCopiedInsightId(index.toString());
    setTimeout(() => setCopiedInsightId(null), 2000);
  };

  // Filter clips for this campaign
  const campaignClips = clips.filter(c => c.campaignId === campaign.id);

  // Load compliance defaults for captions when campaign details change
  useEffect(() => {
    // Generate standard compliant caption based on the campaign guidelines
    if (campaign.name.toLowerCase().includes('call of duty') || campaign.name.toLowerCase().includes('cod')) {
      setTitle(`Ghost vs Price in Modern Warfare 4 looks CRAZY! @callofduty`);
      setTags(`#Ad\n#MW4 #ModernWarfare4 #clipping`);
    } else {
      setTitle(`${campaign.name} is insane!`);
      setTags(`#Ad\n#${campaign.brand?.replace(/\s+/g, '') || 'clipping'}`);
    }
  }, [campaign]);

  // Poll for generating clip progress
  useEffect(() => {
    const activeClips = clips.some(c => ['pending', 'downloading', 'downloading_gameplay', 'processing'].includes(c.status));
    
    if (activeClips) {
      const interval = setInterval(() => {
        onRefreshClips();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [clips, onRefreshClips]);

  // Poll gameplay download progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isDownloadingGameplay) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get('/api/settings/download-status');
          setGameplayProgress(res.data.progress);
          if (res.data.status === 'completed') {
            setIsDownloadingGameplay(false);
            onRefreshSettings();
          } else if (res.data.status === 'failed') {
            setIsDownloadingGameplay(false);
            alert(`Gameplay download failed: ${res.data.error}`);
          }
        } catch (err) {
          console.error(err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isDownloadingGameplay, onRefreshSettings]);

  const handleDownloadGameplay = async () => {
    try {
      setIsDownloadingGameplay(true);
      setGameplayProgress(0);
      await axios.post('/api/settings/download-gameplay');
    } catch (err) {
      console.error(err);
      setIsDownloadingGameplay(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;

    if (useSplitScreen && !settings.gameplayDownloaded) {
      alert('You must download the background gameplay video first or disable Split-Screen.');
      return;
    }

    try {
      setIsGenerating(true);
      await axios.post('/api/clips/generate', {
        campaignId: campaign.id,
        startTime: parseInt(startTime, 10),
        duration: parseInt(duration, 10),
        useSplitScreen,
        title,
        tags,
        subtitleOffset: parseFloat(subtitleOffset) || 0,
        cropPosition
      });
      setIsGenerating(false);
      onRefreshClips();
      // Incremental start times for next clip ease-of-use
      setStartTime((prev) => (parseInt(prev, 10) + parseInt(duration, 10)).toString());
    } catch (err) {
      console.error(err);
      setIsGenerating(false);
      alert('Failed to trigger clip generation.');
    }
  };

  const handleAutoSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSplitting) return;

    if (useSplitScreen && !settings.gameplayDownloaded) {
      alert('You must download the background gameplay video first or disable Split-Screen.');
      return;
    }

    try {
      setIsSplitting(true);
      await axios.post(`/api/campaigns/${campaign.id}/split`, {
        clipDuration: parseInt(splitDuration, 10),
        useSplitScreen,
        cropPosition
      });
      alert('Auto-splitting has started in the background! The clips will be generated sequentially. You can track progress in the list below.');
      setIsSplitting(false);
      onRefreshClips();
    } catch (err) {
      console.error(err);
      setIsSplitting(false);
      alert('Failed to start campaign auto-splitting.');
    }
  };

  const handleCopyCaption = (clip: Clip) => {
    const fullText = `${clip.title}\n\n${clip.tags}`;
    navigator.clipboard.writeText(fullText);
    setCopiedClipId(clip.id);
    setTimeout(() => setCopiedClipId(null), 2000);
  };

  const handleUpdateViews = async (clipId: string) => {
    const views = viewInputs[clipId];
    if (!views || isNaN(parseInt(views, 10))) return;

    try {
      await axios.put(`/api/clips/${clipId}/views`, {
        views: parseInt(views, 10)
      });
      setViewInputs(prev => ({ ...prev, [clipId]: '' }));
      onRefreshClips();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteClip = async (id: string) => {
    if (!confirm('Are you sure you want to delete this clip and its generated file?')) return;
    try {
      await axios.delete(`/api/clips/${id}`);
      onRefreshClips();
    } catch (err) {
      console.error(err);
    }
  };

  // Thumbnail Handlers
  const handleExtractFrames = async (clipId: string, clipTitle: string) => {
    try {
      setExtractingFramesClipId(clipId);
      setThumbnailShowSection(prev => ({ ...prev, [clipId]: true }));
      const res = await axios.post(`/api/clips/${clipId}/extract-frames`);
      setThumbnailFrames(prev => ({ ...prev, [clipId]: res.data.frames }));
      setSelectedFrameIndex(prev => ({ ...prev, [clipId]: 2 })); // Default to middle frame
      setThumbnailTitle(prev => ({ ...prev, [clipId]: clipTitle || '' }));
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to extract frames.');
    } finally {
      setExtractingFramesClipId(null);
    }
  };

  const handleRenderThumbnail = async (clipId: string) => {
    const frameIdx = selectedFrameIndex[clipId] ?? 0;
    const titleText = thumbnailTitle[clipId] || '';
    const textStyle = thumbnailStyle[clipId] || 'classic';
    try {
      setRenderingThumbnailClipId(clipId);
      await axios.post(`/api/clips/${clipId}/generate-thumbnail`, {
        frameIndex: frameIdx,
        titleText,
        textStyle
      });
      setThumbnailShowSection(prev => ({ ...prev, [clipId]: false }));
      setThumbnailFrames(prev => ({ ...prev, [clipId]: [] }));
      onRefreshClips();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to render thumbnail.');
    } finally {
      setRenderingThumbnailClipId(null);
    }
  };

  const getLivePreviewLines = (titleText: string) => {
    let text = titleText.trim();
    if (text.length === 0) return [];
    
    // Clean trailing punctuation
    if (text.endsWith('.') && !text.endsWith('...')) {
      const periods = text.match(/\./g) || [];
      if (periods.length === 1) {
        text = text.slice(0, -1);
      }
    }

    // Split by common sentence/clause boundaries: ?, !, :, -, and keep punctuation attached
    let initialLines = text.split(/([?!:-]+)/).map(s => s.trim()).filter(Boolean);
    
    const cleanLines: string[] = [];
    for (let i = 0; i < initialLines.length; i++) {
      const part = initialLines[i];
      if (/^[?!:-]+$/.test(part) && cleanLines.length > 0) {
        cleanLines[cleanLines.length - 1] += part;
      } else {
        cleanLines.push(part);
      }
    }

    // Re-split excessively long lines (> 4 words) into balanced sub-lines
    const finalLines: string[] = [];
    cleanLines.forEach(line => {
      const words = line.split(/\s+/);
      if (words.length > 4) {
        const mid = Math.ceil(words.length / 2);
        finalLines.push(words.slice(0, mid).join(' '));
        finalLines.push(words.slice(mid).join(' '));
      } else if (line.length > 0) {
        finalLines.push(line);
      }
    });

    // Fallback to word-count division if punctuation split didn't yield multiple lines
    if (finalLines.length <= 1) {
      const words = text.split(/\s+/);
      if (words.length <= 3) {
        return [{ text: text, highlight: true, badge: false }];
      } else if (words.length <= 5) {
        const mid = Math.ceil(words.length / 2);
        return [
          { text: words.slice(0, mid).join(' '), highlight: false, badge: false },
          { text: words.slice(mid).join(' '), highlight: true, badge: false }
        ];
      } else {
        const chunkSize = Math.ceil(words.length / 3);
        const line1 = words.slice(0, Math.min(3, chunkSize));
        const line2 = words.slice(line1.length, line1.length + chunkSize);
        const line3 = words.slice(line1.length + line2.length);

        const res = [];
        if (line1.length > 0) res.push({ text: line1.join(' '), highlight: false, badge: false });
        if (line2.length > 0) res.push({ text: line2.join(' '), highlight: false, badge: false });
        if (line3.length > 0) res.push({ text: line3.join(' '), highlight: true, badge: false });
        return res;
      }
    }

    return finalLines.slice(0, 4).map((lineText, idx, arr) => {
      return {
        text: lineText,
        highlight: idx === arr.length - 1,
        badge: false
      };
    });
  };

  const isCoDCampaign = campaign.name.toLowerCase().includes('call of duty') || campaign.name.toLowerCase().includes('cod');

  return (
    <div className="animated-fade-in">
      {/* Header breadcrumb */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          ← Back to Campaigns
        </button>
        <div className="flex-between">
          <div>
            <h2 className="header-title" style={{ margin: 0 }}>{campaign.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
              Manage settings and generate clips using the automated FFmpeg engine
            </p>
          </div>
          <span className="badge badge-secondary" style={{ fontSize: '14px', padding: '8px 16px' }}>
            ${campaign.rate.toFixed(2)}/1K views
          </span>
        </div>
      </div>

      <div className="grid-cols-3">
        {/* Left column: Generator configuration */}
        <div className="glass-card" style={{ gridColumn: 'span 2', height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Generate Clips</h3>
          </div>

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
            <button
              type="button"
              onClick={() => setGeneratorMode('single')}
              style={{
                padding: '8px 16px',
                background: generatorMode === 'single' ? 'rgba(99, 102, 241, 0.1)' : 'none',
                border: 'none',
                borderRadius: '6px',
                color: generatorMode === 'single' ? 'var(--primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Single Clip Mode
            </button>
            <button
              type="button"
              onClick={() => setGeneratorMode('auto')}
              style={{
                padding: '8px 16px',
                background: generatorMode === 'auto' ? 'rgba(99, 102, 241, 0.1)' : 'none',
                border: 'none',
                borderRadius: '6px',
                color: generatorMode === 'auto' ? 'var(--primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Auto-Split Campaign Mode
            </button>
          </div>

          {generatorMode === 'single' ? (
            <form id="generator-form" onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="grid-cols-2">
              <div>
                <label>Start Time (Seconds) *</label>
                <input
                  type="number"
                  min="0"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  placeholder="0"
                  required
                />
                <span style={{ fontSize: '12px', color: 'var(--text-dark)', marginTop: '4px', display: 'block' }}>
                  Choose where to start trimming the source trailer.
                </span>
              </div>
              <div>
                <label>Clip Duration (Seconds) *</label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  placeholder="15"
                  required
                />
                <span style={{ fontSize: '12px', color: 'var(--text-dark)', marginTop: '4px', display: 'block' }}>
                  Must be at least 10s. Keep between 15-30s for optimal Shorts/TikTok loops.
                </span>
              </div>
            </div>

            {/* Subtitle Synchronization Offset */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Subtitle Synchronization Offset (Seconds)</span>
                <span className="badge badge-primary" style={{ fontSize: '10px', padding: '2px 6px' }}>Manual Alignment</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' }}>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.1"
                  value={subtitleOffset}
                  onChange={e => setSubtitleOffset(e.target.value)}
                  style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    step="0.1"
                    min="-5"
                    max="5"
                    value={subtitleOffset}
                    onChange={e => setSubtitleOffset(e.target.value)}
                    style={{ width: '80px', padding: '6px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>s</span>
                </div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Shift all captions. Use negative values (e.g. <code>-0.5s</code>) if subtitles are delayed, and positive values (e.g. <code>+0.5s</code>) if they are too early.
              </span>
            </div>

            {/* Split screen overlay setting */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}
            >
              <div className="flex-between">
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Split-Screen Gameplay Overlay</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    Stacks a viral Subway Surfers/Minecraft video on the bottom half of the clip.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={useSplitScreen}
                    onChange={e => setUseSplitScreen(e.target.checked)}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {useSplitScreen && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  {settings.gameplayDownloaded ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary)' }}>
                      <span className="badge badge-secondary" style={{ fontSize: '11px' }}>Ready</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Gameplay background is cached locally and ready to merge.
                      </span>
                    </div>
                  ) : (
                    <div className="flex-between">
                      <span style={{ fontSize: '13px', color: 'var(--accent)' }}>
                        Gameplay background needs to be downloaded before processing.
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={handleDownloadGameplay}
                        disabled={isDownloadingGameplay}
                      >
                        {isDownloadingGameplay ? `Downloading (${gameplayProgress}%)` : 'Download Background'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subject Framing / Smart Reframe Setting */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}
            >
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Subject Framing (9:16 Crop Focus)</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                  Choose which area of the widescreen video to crop for the 9:16 aspect ratio.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['auto', 'center', 'left', 'right'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setCropPosition(pos)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: cropPosition === pos ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        border: cropPosition === pos ? '1px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: '6px',
                        color: cropPosition === pos ? 'var(--primary)' : 'var(--text)',
                        fontWeight: '600',
                        fontSize: '13px',
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {pos === 'auto' ? '✨ Auto Focus (AI)' : pos}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                  {cropPosition === 'auto' && "✨ AI will scan the video's center frame to auto-focus on the speaker's face."}
                  {cropPosition === 'center' && "Crops the exact center of the frame (standard crop)."}
                  {cropPosition === 'left' && "Focuses on the left third of the widescreen frame (e.g. host)."}
                  {cropPosition === 'right' && "Focuses on the right third of the widescreen frame (e.g. guest)."}
                </span>
              </div>
            </div>

            {/* Campaign warnings */}
            {isCoDCampaign && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.06)',
                  border: '1px solid rgba(244, 63, 94, 0.15)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  display: 'flex',
                  gap: '10px'
                }}
              >
                <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '12px', lineHeight: '1.4', color: '#fca5a5' }}>
                  <strong>CoD Guidelines Notice:</strong> Do NOT add external broll or background music. Original audio only. For compliance, it is highly recommended to keep <strong>Split-Screen disabled</strong>, since they require official trailer assets only.
                </div>
              </div>
            )}

            {/* Compliance Caption / Tags Generator */}
            <div>
              <label>Compliant Video Title</label>
              <input
                type="text"
                placeholder="Title that matches your clip..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label>Compliant Caption & FTC Disclosures</label>
              <textarea
                rows={4}
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="#Ad #MW4 #ModernWarfare4 @callofduty"
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                FTC rules state #Ad must be the first hashtag on its own separate line.
              </span>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Triggering generation...
                </>
              ) : (
                'Queue Automated Clip Generation'
              )}
            </button>
          </form>
          ) : (
            <form onSubmit={handleAutoSplit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label>Clip Duration (Seconds) *</label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={splitDuration}
                  onChange={e => setSplitDuration(e.target.value)}
                  placeholder="30"
                  required
                />
                <span style={{ fontSize: '12px', color: 'var(--text-dark)', marginTop: '4px', display: 'block' }}>
                  The entire video trailer will be automatically split into sequential clips of this duration.
                </span>
              </div>

              {/* Split screen overlay setting */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px'
                }}
              >
                <div className="flex-between">
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Split-Screen Gameplay Overlay</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      Stacks a viral Subway Surfers/Minecraft video on the bottom half of the clip.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={useSplitScreen}
                      onChange={e => setUseSplitScreen(e.target.checked)}
                      style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {useSplitScreen && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    {settings.gameplayDownloaded ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary)' }}>
                        <span className="badge badge-secondary" style={{ fontSize: '11px' }}>Ready</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Gameplay background is cached locally and ready to merge.
                        </span>
                      </div>
                    ) : (
                      <div className="flex-between">
                        <span style={{ fontSize: '13px', color: 'var(--accent)' }}>
                          Gameplay background needs to be downloaded before processing.
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={handleDownloadGameplay}
                          disabled={isDownloadingGameplay}
                        >
                          {isDownloadingGameplay ? `Downloading (${gameplayProgress}%)` : 'Download Background'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subject Framing / Smart Reframe Setting */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px'
                }}
              >
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Subject Framing (9:16 Crop Focus)</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                    Choose which area of the widescreen video to crop for the 9:16 aspect ratio.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['auto', 'center', 'left', 'right'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setCropPosition(pos)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: cropPosition === pos ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                          border: cropPosition === pos ? '1px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '6px',
                          color: cropPosition === pos ? 'var(--primary)' : 'var(--text)',
                          fontWeight: '600',
                          fontSize: '13px',
                          textTransform: 'capitalize',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {pos === 'auto' ? '✨ Auto Focus (AI)' : pos}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                    {cropPosition === 'auto' && "✨ AI will scan the video's center frame to auto-focus on the speaker's face."}
                    {cropPosition === 'center' && "Crops the exact center of the frame (standard crop)."}
                    {cropPosition === 'left' && "Focuses on the left third of the widescreen frame (e.g. host)."}
                    {cropPosition === 'right' && "Focuses on the right third of the widescreen frame (e.g. guest)."}
                  </span>
                </div>
              </div>

              {/* Campaign warnings */}
              {isCoDCampaign && (
                <div
                  style={{
                    background: 'rgba(244, 63, 94, 0.06)',
                    border: '1px solid rgba(244, 63, 94, 0.15)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px',
                    display: 'flex',
                    gap: '10px'
                  }}
                >
                  <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12px', lineHeight: '1.4', color: '#fca5a5' }}>
                    <strong>CoD Guidelines Notice:</strong> Do NOT add external broll or background music. Original audio only. For compliance, it is highly recommended to keep <strong>Split-Screen disabled</strong>, since they require official trailer assets only.
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={isSplitting}>
                {isSplitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Splitting trailer...
                  </>
                ) : (
                  'Start Auto-Split Campaign Video'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Right column: Source trailer info and guidelines */}
        <div className="glass-card" style={{ height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Video size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', margin: 0 }}>Campaign Requirements</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Source URL</span>
              <a
                href={campaign.sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                Link <Link size={12} />
              </a>
            </div>
            
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Guidelines Checklist:</span>
              <div
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  whiteSpace: 'pre-line',
                  lineHeight: '1.5',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  border: '1px solid var(--border)'
                }}
              >
                {campaign.guidelines || 'No specific rules added.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Viral Insights Section */}
      <div style={{ marginTop: '40px' }} className="animated-fade-in">
        <div className="glass-card" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}>
                <Sparkles size={24} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '800', margin: 0, background: 'linear-gradient(90deg, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  AI Viral Slicing Insights
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Scan the YouTube video transcript and let Gemini identify high-retention viral clips.
                </p>
              </div>
            </div>
            
            {campaign.viralInsights && campaign.viralInsights.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
                onClick={handleAnalyzeTranscript}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <><Loader2 size={16} className="animate-spin" /> Re-analyzing...</>
                ) : (
                  <><Sparkles size={16} /> Re-analyze Transcript</>
                )}
              </button>
            )}
          </div>

          {analysisError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '16px', borderRadius: '8px', marginBottom: '20px', color: '#fca5a5', fontSize: '13px' }}>
              <strong>Error:</strong> {analysisError}
            </div>
          )}

          {!campaign.viralInsights || campaign.viralInsights.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255, 255, 255, 0.01)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 20px auto', lineHeight: '1.6' }}>
                Analyze the video's transcript to extract the most engaging logical segments. The AI will also generate guidelines-compliant titles and FTC tags automatically.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '12px 24px', fontSize: '14px', margin: '0 auto', background: 'linear-gradient(95deg, var(--primary), var(--secondary))', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                onClick={handleAnalyzeTranscript}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <><Loader2 size={18} className="animate-spin" /> Scanning & Analyzing Video...</>
                ) : (
                  <><Sparkles size={18} /> Scan Transcript & Generate Insights</>
                )}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {campaign.viralInsights.map((insight, index) => (
                <div
                  key={index}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '24px',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span className="badge badge-secondary" style={{
                          background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
                          color: '#c084fc',
                          fontSize: '11px',
                          padding: '4px 10px',
                          border: '1px solid rgba(168, 85, 247, 0.2)'
                        }}>
                          Recommendation #{index + 1}
                        </span>
                        <span className="badge badge-primary" style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <TrendingUp size={12} /> Virality: {insight.viralityScore || '9.0'}/10
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          Time: <strong>{Math.floor(insight.startTime / 60).toString().padStart(2, '0')}:{(insight.startTime % 60).toString().padStart(2, '0')}</strong> - <strong>{Math.floor(insight.endTime / 60).toString().padStart(2, '0')}:{(insight.endTime % 60).toString().padStart(2, '0')}</strong> ({insight.duration}s)
                        </span>
                      </div>
                      <h4 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-display)', margin: 0, color: 'var(--text-primary)' }}>
                        {insight.title}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '8px 14px', fontSize: '12px' }}
                        onClick={() => handleUseInsight(insight)}
                      >
                        Draft in Form
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => handleInstantRender(insight, index)}
                        disabled={renderingInsightId === index.toString()}
                      >
                        {renderingInsightId === index.toString() ? (
                          <><Loader2 size={14} className="animate-spin" /> Rendering...</>
                        ) : (
                          'Instant Render'
                        )}
                      </button>
                    </div>
                  </div>

                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.6', margin: '0 0 16px 0', paddingLeft: '12px', borderLeft: '3px solid var(--primary)' }}>
                    {insight.explanation}
                  </p>

                  {insight.contextCheck && (
                    <div style={{
                      background: 'rgba(99, 102, 241, 0.04)',
                      border: '1px dashed rgba(99, 102, 241, 0.15)',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '16px',
                      fontSize: '12px',
                      color: '#a5b4fc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {(() => {
                        const text = insight.contextCheck;
                        const startMatch = text.match(/Starts with:\s*(['"]?.*?['"]?)(?=\.\s*Ends with:|\s*Ends with:|$)/i);
                        const endMatch = text.match(/Ends with:\s*(['"]?.*?['"]?)(?=\.\s*Verification:|\s*Verification:|$)/i);
                        const verificationMatch = text.match(/Verification:\s*(.*?)$/i);

                        if (startMatch || endMatch || verificationMatch) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontWeight: '700', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                                <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                                <span>Context Verification Passed</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255, 255, 255, 0.01)', borderRadius: '6px', padding: '10px', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                {startMatch && (
                                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                                    <span style={{ color: 'var(--text-dark)', fontWeight: '600', minWidth: '80px' }}>Start Point:</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{startMatch[1].replace(/^[ '"]+|[ '"]+$/g, '')}</span>
                                  </div>
                                )}
                                {endMatch && (
                                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                                    <span style={{ color: 'var(--text-dark)', fontWeight: '600', minWidth: '80px' }}>End Point:</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{endMatch[1].replace(/^[ '"]+|[ '"]+$/g, '')}</span>
                                  </div>
                                )}
                                {verificationMatch && (
                                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                                    <span style={{ color: 'var(--secondary)', fontWeight: '600', minWidth: '80px' }}>Validation:</span>
                                    <span style={{ color: '#a5b4fc', lineHeight: '1.4' }}>{verificationMatch[1]}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                            <Info size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                            <div>
                              <strong>Context Verification:</strong> {text}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dark)' }}>
                        AI Generated & Compliant Caption
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px', height: '26px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => handleCopyInsightCaption(insight, index)}
                      >
                        {copiedInsightId === index.toString() ? (
                          <><Check size={12} style={{ color: 'var(--secondary)' }} /> Copied</>
                        ) : (
                          <><Copy size={12} /> Copy Caption</>
                        )}
                      </button>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {insight.suggestedTitle}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                        {insight.suggestedTags}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Generated Clips History list */}
      <div style={{ marginTop: '48px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>
          Generated Clips ({campaignClips.length})
        </h3>

        {campaignClips.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No clips generated yet. Fill out the form above to render your first clip.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {campaignClips.map(clip => (
              <div key={clip.id} className="glass-card" style={{ padding: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}
                >
                  <div style={{ flex: '1', minWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-display)', margin: 0 }}>
                        {clip.name}
                      </h4>
                      {clip.status === 'completed' && (
                        <span className="badge badge-secondary" style={{ fontSize: '10px' }}>Ready</span>
                      )}
                      {['downloading', 'downloading_gameplay', 'processing'].includes(clip.status) && (
                        <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                          {clip.status.replace('_', ' ')} ({clip.progress}%)
                        </span>
                      )}
                      {clip.status === 'failed' && (
                        <span className="badge badge-accent" style={{ fontSize: '10px' }}>Failed</span>
                      )}
                    </div>
                    
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      Trim: <strong>{clip.startTime}s - {clip.startTime + clip.duration}s</strong> ({clip.duration}s) | Split screen: <strong>{clip.useSplitScreen ? 'Yes' : 'No'}</strong>
                    </p>

                    {clip.status === 'completed' && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', maxWidth: '500px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          Compliant Caption Preview
                        </p>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                            {clip.title}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {clip.tags}
                          </div>
                        </div>
                      </div>
                    )}

                    {clip.error && (
                      <p style={{ color: 'var(--accent)', fontSize: '11px', marginTop: '6px' }}>
                        Error: {clip.error}
                      </p>
                    )}
                  </div>

                  {/* Render video file preview locally if finished */}
                  {clip.status === 'completed' && activeClipId === clip.id && (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                      <div className="video-preview-wrapper">
                        <video controls src={`/clips/${clip.fileName}`} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* View Tracker */}
                    {clip.status === 'completed' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                        <TrendingUp size={14} style={{ color: 'var(--secondary)' }} />
                        <span style={{ fontSize: '12px' }}>
                          <strong>{clip.views.toLocaleString()}</strong> views (${clip.earnings.toFixed(2)})
                        </span>
                        
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                          <input
                            type="number"
                            placeholder="Add views"
                            style={{ width: '90px', padding: '4px 8px', fontSize: '11px', height: '24px' }}
                            value={viewInputs[clip.id] || ''}
                            onChange={e => setViewInputs({ ...viewInputs, [clip.id]: e.target.value })}
                          />
                          <button
                            className="btn btn-primary"
                            style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                            onClick={() => handleUpdateViews(clip.id)}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {clip.status === 'completed' && (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '8px 12px', fontSize: '12px' }}
                            onClick={() => setActiveClipId(activeClipId === clip.id ? null : clip.id)}
                          >
                            {activeClipId === clip.id ? 'Hide Preview' : 'Preview'}
                          </button>
                          
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '8px 12px', fontSize: '12px' }}
                            onClick={() => handleCopyCaption(clip)}
                          >
                            {copiedClipId === clip.id ? (
                              <><Check size={14} style={{ color: 'var(--secondary)' }} /> Copied</>
                            ) : (
                              <><Copy size={14} /> Copy Caption</>
                            )}
                          </button>
                          
                          <a
                            href={`/clips/${clip.fileName}`}
                            download
                            className="btn btn-primary"
                            style={{ padding: '8px 16px', fontSize: '12px', textDecoration: 'none' }}
                          >
                            <Download size={14} /> Download
                          </a>
                        </>
                      )}
                      
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--accent)' }}
                        onClick={() => handleDeleteClip(clip.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Thumbnail Generator Section */}
                  {clip.status === 'completed' && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      {/* Thumbnail Actions Row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {!thumbnailShowSection[clip.id] && !clip.thumbnailPath && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => handleExtractFrames(clip.id, clip.title)}
                            disabled={extractingFramesClipId === clip.id}
                          >
                            {extractingFramesClipId === clip.id ? (
                              <><Loader2 size={14} className="animate-spin" /> Extracting Frames...</>
                            ) : (
                              <><ImagePlus size={14} /> Generate Thumbnail</>
                            )}
                          </button>
                        )}

                        {clip.thumbnailPath && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="badge badge-secondary" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Image size={12} /> Thumbnail Ready
                            </span>
                            <a
                              href={clip.thumbnailPath}
                              download
                              className="btn btn-primary"
                              style={{ padding: '6px 14px', fontSize: '11px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Download size={12} /> Download Thumbnail
                            </a>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 14px', fontSize: '11px' }}
                              onClick={() => handleExtractFrames(clip.id, clip.title)}
                              disabled={extractingFramesClipId === clip.id}
                            >
                              {extractingFramesClipId === clip.id ? 'Extracting...' : 'Re-generate'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Thumbnail Preview */}
                      {clip.thumbnailPath && !thumbnailShowSection[clip.id] && (
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                          <img
                            src={clip.thumbnailPath}
                            alt="Thumbnail Preview"
                            style={{
                              width: '180px',
                              height: '320px',
                              objectFit: 'cover',
                              borderRadius: '12px',
                              border: '2px solid var(--border)',
                              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                            }}
                          />
                        </div>
                      )}

                      {/* Frame Picker UI */}
                      {thumbnailShowSection[clip.id] && (thumbnailFrames[clip.id]?.length > 0) && (
                        <div style={{
                          marginTop: '16px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          padding: '20px'
                        }}>
                          <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Image size={16} style={{ color: 'var(--primary)' }} />
                            Select Best Frame
                          </h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Pick the frame with the best facial expression or pose for the thumbnail.
                          </p>

                          {/* Frame Grid */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            gap: '8px',
                            marginBottom: '20px'
                          }}>
                            {thumbnailFrames[clip.id].map((frameUrl, idx) => (
                              <div
                                key={idx}
                                onClick={() => setSelectedFrameIndex(prev => ({ ...prev, [clip.id]: idx }))}
                                style={{
                                  cursor: 'pointer',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  border: selectedFrameIndex[clip.id] === idx
                                    ? '3px solid var(--primary)'
                                    : '3px solid transparent',
                                  boxShadow: selectedFrameIndex[clip.id] === idx
                                    ? '0 0 12px rgba(99, 102, 241, 0.4)'
                                    : 'none',
                                  transition: 'all 0.2s',
                                  position: 'relative'
                                }}
                              >
                                <img
                                  src={frameUrl}
                                  alt={`Frame ${idx + 1}`}
                                  style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }}
                                />
                                {selectedFrameIndex[clip.id] === idx && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '4px', right: '4px',
                                    background: 'var(--primary)',
                                    borderRadius: '50%',
                                    width: '20px', height: '20px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                  }}>
                                    <Check size={12} color="white" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Title Input */}
                          <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', display: 'block', color: 'var(--text-muted)' }}>
                              Thumbnail Title Text
                            </label>
                            <input
                              type="text"
                              placeholder="Enter title for thumbnail..."
                              value={thumbnailTitle[clip.id] || ''}
                              onChange={e => setThumbnailTitle(prev => ({ ...prev, [clip.id]: e.target.value }))}
                              style={{ width: '100%' }}
                            />
                          </div>

                          {/* Style Picker */}
                          <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', display: 'block', color: 'var(--text-muted)' }}>
                              Text Style
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {(['classic', 'cyber', 'bubble'] as const).map((style) => (
                                <button
                                  key={style}
                                  type="button"
                                  onClick={() => setThumbnailStyle(prev => ({ ...prev, [clip.id]: style }))}
                                  style={{
                                    flex: 1,
                                    padding: '8px',
                                    background: (thumbnailStyle[clip.id] || 'classic') === style ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                                    border: (thumbnailStyle[clip.id] || 'classic') === style ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    borderRadius: '6px',
                                    color: (thumbnailStyle[clip.id] || 'classic') === style ? 'var(--primary)' : 'var(--text)',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    textTransform: 'capitalize',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  {style === 'classic' && 'Classic Bold'}
                                  {style === 'cyber' && 'Neon Cyber'}
                                  {style === 'bubble' && 'Comic Bubble'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Live Preview Box */}
                          <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', display: 'block', color: 'var(--text-muted)' }}>
                              Live Preview (Realtime)
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <div style={{
                                width: '180px',
                                height: '320px',
                                position: 'relative',
                                overflow: 'hidden',
                                borderRadius: '12px',
                                border: '2px solid var(--border)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                background: '#111'
                              }}>
                                {/* Background Image */}
                                {thumbnailFrames[clip.id]?.[selectedFrameIndex[clip.id] ?? 2] && (
                                  <img
                                    src={thumbnailFrames[clip.id][selectedFrameIndex[clip.id] ?? 2]}
                                    alt="Live Preview Background"
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      zIndex: 1
                                    }}
                                  />
                                )}
                                {/* Dark Gradient Overlay */}
                                <div style={{
                                  position: 'absolute',
                                  top: 0, left: 0, width: '100%', height: '100%',
                                  background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.2) 75%, rgba(0,0,0,0.7) 100%)',
                                  zIndex: 2
                                }} />
                                {/* Title Container */}
                                <div style={{
                                  position: 'absolute',
                                  top: '38px',
                                  left: '10px',
                                  right: '10px',
                                  zIndex: 3,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                  transform: (thumbnailStyle[clip.id] || 'classic') === 'bubble' ? 'skewY(-3deg) rotate(-3deg)' : 'none'
                                }}>
                                  {getLivePreviewLines(thumbnailTitle[clip.id] || '').map((line, idx) => {
                                    const activeStyle = thumbnailStyle[clip.id] || 'classic';
                                    if (line.badge) {
                                      let badgeStyle: React.CSSProperties = {
                                        alignSelf: 'flex-start',
                                        fontSize: '8px',
                                        fontWeight: 900,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        marginBottom: '2px'
                                      };
                                      if (activeStyle === 'classic') {
                                        badgeStyle = {
                                          ...badgeStyle,
                                          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                          color: '#000000',
                                          boxShadow: '0 2px 6px rgba(255, 165, 0, 0.3)'
                                        };
                                      } else if (activeStyle === 'cyber') {
                                        badgeStyle = {
                                          ...badgeStyle,
                                          background: 'linear-gradient(135deg, #00f3ff, #ff00ea)',
                                          color: '#ffffff',
                                          boxShadow: '0 2px 6px rgba(0, 243, 255, 0.3)'
                                        };
                                      } else if (activeStyle === 'bubble') {
                                        badgeStyle = {
                                          ...badgeStyle,
                                          background: '#000000',
                                          color: '#ffe600',
                                          border: '1px solid #ffe600',
                                          boxShadow: '2px 2px 0px #000000'
                                        };
                                      }
                                      return (
                                        <div key={idx} style={badgeStyle}>
                                          {line.text}
                                        </div>
                                      );
                                    } else {
                                      const textLength = line.text.length;
                                      // Base sizes proportional to backend: 115px / 100px / 120px on 720px canvas
                                      // Preview is 180px wide (25% of 720px), so we scale by 0.25
                                      let baseSize = 28;                        // Classic: 115 * 0.25 = ~28
                                      if (activeStyle === 'cyber') baseSize = 24;  // Cyber:   100 * 0.25 = 25
                                      if (activeStyle === 'bubble') baseSize = 30; // Bubble:  120 * 0.25 = 30
                                      
                                      let previewFontSize = baseSize;
                                      if (textLength > 22) {
                                        previewFontSize = Math.round(baseSize * 0.58);
                                      } else if (textLength > 17) {
                                        previewFontSize = Math.round(baseSize * 0.70);
                                      } else if (textLength > 12) {
                                        previewFontSize = Math.round(baseSize * 0.85);
                                      }
                                      // ≤12 chars: stays at full size

                                      let lineStyle: React.CSSProperties = {
                                        textTransform: 'uppercase',
                                        lineHeight: 0.92,
                                        letterSpacing: '0.5px'
                                      };
                                      if (activeStyle === 'classic') {
                                        lineStyle = {
                                          ...lineStyle,
                                          fontFamily: "'Anton', 'Impact', sans-serif",
                                          fontSize: `${previewFontSize}px`,
                                          color: line.highlight ? '#FFD700' : '#FFFFFF',
                                          WebkitTextStroke: '1px #000000',
                                          textShadow: '0 1px 3px rgba(0,0,0,0.8)'
                                        };
                                      } else if (activeStyle === 'cyber') {
                                        lineStyle = {
                                          ...lineStyle,
                                          fontFamily: "'Montserrat', sans-serif",
                                          fontWeight: 900,
                                          fontSize: `${previewFontSize}px`,
                                          color: line.highlight ? '#ff00ea' : '#00f3ff',
                                          WebkitTextStroke: '0.3px #000000',
                                          textShadow: line.highlight
                                            ? '0 0 4px rgba(255, 0, 234, 0.8), 0 0 10px rgba(255, 0, 234, 0.4)'
                                            : '0 0 4px rgba(0, 243, 255, 0.8), 0 0 10px rgba(0, 243, 255, 0.4)'
                                        };
                                      } else if (activeStyle === 'bubble') {
                                        lineStyle = {
                                          ...lineStyle,
                                          fontFamily: "'Anton', 'Impact', sans-serif",
                                          fontSize: `${previewFontSize}px`,
                                          color: line.highlight ? '#ff3c00' : '#ffe600',
                                          WebkitTextStroke: '1px #000000',
                                          textShadow: '2px 2px 0px #000000'
                                        };
                                      }
                                      return (
                                        <div key={idx} style={lineStyle}>
                                          {line.text}
                                        </div>
                                      );
                                    }
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Render Button */}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '10px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                              onClick={() => handleRenderThumbnail(clip.id)}
                              disabled={renderingThumbnailClipId === clip.id}
                            >
                              {renderingThumbnailClipId === clip.id ? (
                                <><Loader2 size={14} className="animate-spin" /> Rendering Thumbnail...</>
                              ) : (
                                <><Sparkles size={14} /> Render Thumbnail</>
                              )}
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '10px 16px', fontSize: '13px' }}
                              onClick={() => {
                                setThumbnailShowSection(prev => ({ ...prev, [clip.id]: false }));
                                setThumbnailFrames(prev => ({ ...prev, [clip.id]: [] }));
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Progress bar for background processing */}
                {['downloading', 'downloading_gameplay', 'processing'].includes(clip.status) && (
                  <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', marginTop: '16px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${clip.progress}%`,
                        background: 'linear-gradient(90deg, var(--primary), var(--secondary))',
                        height: '100%',
                        transition: 'width 0.4s'
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
