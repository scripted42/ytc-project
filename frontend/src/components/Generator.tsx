import React, { useState, useEffect } from 'react';
import type { Campaign, Clip, Settings } from '../types';
import { Play, Copy, Check, Download, Info, Video, HelpCircle, Loader2, Sparkles, TrendingUp, Link } from 'lucide-react';
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
        subtitleOffset: parseFloat(subtitleOffset) || 0
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
        subtitleOffset: parseFloat(subtitleOffset) || 0
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
        useSplitScreen
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
