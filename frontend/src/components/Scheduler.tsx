import React, { useState, useEffect } from 'react';
import type { Clip } from '../types';
import { Share2, Clock, CheckCircle, ExternalLink, AlertTriangle, Copy, Check, Youtube, Loader2, Link2, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface SchedulerProps {
  clips: Clip[];
  onRefresh: () => void;
}

export default function Scheduler({ clips, onRefresh }: SchedulerProps) {
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [isYoutubeConnected, setIsYoutubeConnected] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);

  // Poll active uploads or refresh list when a clip is uploading
  useEffect(() => {
    checkYoutubeStatus();
    
    // Check if any clip is currently uploading
    const hasUploadingClip = clips.some(c => c.youtubeUploadStatus === 'uploading');
    let interval: NodeJS.Timeout;
    
    if (hasUploadingClip) {
      interval = setInterval(() => {
        onRefresh();
      }, 3000); // Poll every 3 seconds to update upload status
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [clips, onRefresh]);

  const checkYoutubeStatus = async () => {
    try {
      const res = await axios.get('/api/youtube/status');
      setIsYoutubeConnected(res.data.connected);
    } catch (err) {
      console.error('Failed to check YouTube status:', err);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleConnectYoutube = () => {
    window.location.href = '/api/auth/youtube';
  };

  const handleDisconnectYoutube = async () => {
    if (!confirm('Are you sure you want to disconnect your YouTube Channel?')) return;
    try {
      await axios.post('/api/youtube/disconnect');
      setIsYoutubeConnected(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to disconnect YouTube:', err);
      alert('Failed to disconnect channel.');
    }
  };

  const handleUploadToYoutube = async (clipId: string) => {
    try {
      setUploadingClipId(clipId);
      await axios.post(`/api/clips/${clipId}/upload-youtube`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to trigger YouTube upload.');
    } finally {
      setUploadingClipId(null);
    }
  };

  const handleCopyCaption = (clip: Clip) => {
    const text = `${clip.title}\n\n${clip.tags}`;
    navigator.clipboard.writeText(text);
    setCopiedClipId(clip.id);
    setTimeout(() => setCopiedClipId(null), 2000);
  };

  const completedClips = clips.filter(c => c.status === 'completed');

  return (
    <div className="animated-fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '700' }}>Publishing & Scheduler Assistant</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
          Publish your generated clips directly or copy captions for organic posting
        </p>
      </div>

      {/* Safety Alert Box */}
      <div
        style={{
          background: 'rgba(99, 102, 241, 0.03)',
          border: '1px solid rgba(99, 102, 241, 0.1)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          marginBottom: '32px'
        }}
      >
        <div style={{ display: 'flex', gap: '16px' }}>
          <AlertTriangle size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#fff' }}>
              Guidelines for Automated & Organic Posting
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.6' }}>
              We support **resumable YouTube draft uploads** via the official API. Uploading clips as private drafts allows YouTube's servers to pre-process copyright checks securely. You can review drafts, add final touches, and schedule publication directly within YouTube Studio to maximize reach.
            </p>
          </div>
        </div>
      </div>

      <div className="grid-cols-3">
        {/* Left Side: Video schedule queue */}
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>
            Ready to Publish Queue ({completedClips.length})
          </h3>

          {completedClips.length === 0 ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
              <Clock size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p style={{ color: 'var(--text-muted)' }}>No completed clips ready. Generate some clips first!</p>
            </div>
          ) : (
            completedClips.map(clip => (
              <div key={clip.id} className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <span className="badge badge-secondary" style={{ fontSize: '10px' }}>
                        {clip.campaignName}
                      </span>
                      {clip.thumbnailPath && (
                        <span className="badge badge-secondary" style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', borderColor: 'rgba(99, 102, 241, 0.2)' }}>
                          Thumbnail Ready
                        </span>
                      )}
                    </div>
                    
                    <h4 style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-display)', marginBottom: '6px' }}>
                      {clip.name}
                    </h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                      Rendered: {new Date(clip.createdAt).toLocaleDateString()} at {new Date(clip.createdAt).toLocaleTimeString()}
                    </p>

                    <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '12px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '4px' }}>
                        Title: {clip.title}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                        {clip.tags}
                      </p>
                    </div>

                    {/* YouTube upload specific errors */}
                    {clip.youtubeUploadStatus === 'failed' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>
                        <AlertCircle size={14} />
                        <span>Upload failed: {clip.youtubeUploadError || 'Unknown API error'}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'stretch', justifyContent: 'space-between', minWidth: '180px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '8px 12px', width: '100%' }}
                        onClick={() => handleCopyCaption(clip)}
                      >
                        {copiedClipId === clip.id ? (
                          <><Check size={14} style={{ color: 'var(--secondary)' }} /> Copied!</>
                        ) : (
                          <><Copy size={14} /> Copy Caption</>
                        )}
                      </button>
                      
                      <a
                        href={`/clips/${clip.fileName}`}
                        download
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '8px 12px', textDecoration: 'none', textAlign: 'center', display: 'block', width: '100%' }}
                      >
                        Download File
                      </a>
                    </div>

                    {/* YouTube Publisher Actions */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {clip.youtubeUploadStatus === 'success' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span className="badge badge-secondary" style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', width: '100%', justifyContent: 'center' }}>
                            <CheckCircle size={12} /> Uploaded to YouTube
                          </span>
                          <a
                            href={`https://studio.youtube.com/video/${clip.youtubeVideoId}/edit`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-primary"
                            style={{ fontSize: '11px', padding: '6px 10px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <ExternalLink size={12} /> Edit in Studio
                          </a>
                        </div>
                      ) : clip.youtubeUploadStatus === 'uploading' ? (
                        <button className="btn btn-primary" disabled style={{ fontSize: '12px', padding: '8px 12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <Loader2 size={14} className="animate-spin" /> Uploading Draft...
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={!isYoutubeConnected || uploadingClipId === clip.id}
                          onClick={() => handleUploadToYoutube(clip.id)}
                          style={{
                            fontSize: '12px',
                            padding: '8px 12px',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            opacity: isYoutubeConnected ? 1 : 0.5,
                            cursor: isYoutubeConnected ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <Youtube size={14} /> 
                          {clip.youtubeUploadStatus === 'failed' ? 'Retry YT Upload' : 'Upload YT Draft'}
                        </button>
                      )}
                      
                      {!isYoutubeConnected && clip.youtubeUploadStatus !== 'success' && (
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                          Connect channel to enable upload
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Side: Quick Links & Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* YouTube Integration Status Card */}
          <div className="glass-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              top: '-20px', right: '-20px',
              width: '80px', height: '80px',
              background: 'rgba(239, 68, 68, 0.03)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1
            }}>
              <Youtube size={40} style={{ color: 'rgba(239, 68, 68, 0.08)' }} />
            </div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', zIndex: 2 }}>
              <Youtube size={18} style={{ color: '#ff0000' }} />
              YouTube Channel
            </h3>

            {checkingAuth ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Loader2 size={16} className="animate-spin" /> Checking connection...
              </div>
            ) : isYoutubeConnected ? (
              <div style={{ position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                    CONNECTED
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                  Your channel is authorized to upload drafts directly with customized thumbnails.
                </p>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '12px', color: '#ef4444' }}
                  onClick={handleDisconnectYoutube}
                >
                  Disconnect Channel
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                    DISCONNECTED
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                  Connect your YouTube channel using Google OAuth to enable one-click private draft uploading.
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={handleConnectYoutube}
                >
                  <Youtube size={14} /> Connect Channel
                </button>
              </div>
            )}
          </div>

          <div className="glass-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Manual B-Roll Channels
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <a
                href="https://www.tiktok.com/creator-center/upload"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', textDecoration: 'none', fontSize: '12px' }}
              >
                <span>Upload to TikTok</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="https://studio.youtube.com/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', textDecoration: 'none', fontSize: '12px' }}
              >
                <span>YouTube Studio Web</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', textDecoration: 'none', fontSize: '12px' }}
              >
                <span>Upload to Instagram Reels</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="glass-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>
              Pre-Publish Checklist
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="checkbox" style={{ width: '16px', height: '16px' }} />
                <span>Is FTC disclosure (#Ad, #Sponsored) on its own separate first line?</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="checkbox" style={{ width: '16px', height: '16px' }} />
                <span>Did you tag the official brand handle (e.g. @callofduty)?</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="checkbox" style={{ width: '16px', height: '16px' }} />
                <span>Is the video sound set to the original trailer track (no custom background music)?</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="checkbox" style={{ width: '16px', height: '16px' }} />
                <span>Is the clip length at least 10 seconds?</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
