import React from 'react';
import type { Clip } from '../types';
import { Share2, Clock, CheckCircle, ExternalLink, AlertTriangle, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface SchedulerProps {
  clips: Clip[];
  onRefresh: () => void;
}

export default function Scheduler({ clips, onRefresh }: SchedulerProps) {
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  
  const completedClips = clips.filter(c => c.status === 'completed');

  const handleCopyCaption = (clip: Clip) => {
    const text = `${clip.title}\n\n${clip.tags}`;
    navigator.clipboard.writeText(text);
    setCopiedClipId(clip.id);
    setTimeout(() => setCopiedClipId(null), 2000);
  };

  return (
    <div className="animated-fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '700' }}>Publishing & Scheduler Assistant</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
          Avoid shadowbans by posting organically using this assistant
        </p>
      </div>

      {/* Safety Alert Box */}
      <div
        style={{
          background: 'rgba(99, 102, 241, 0.05)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          marginBottom: '32px'
        }}
      >
        <div style={{ display: 'flex', gap: '16px' }}>
          <AlertTriangle size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#fff' }}>
              Why We Avoid Fully Automated Bot Uploading
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.6' }}>
              Platforms like TikTok and YouTube have highly sophisticated bot-detection algorithms. When videos are uploaded using API automation scripts (headless browsers, unofficial APIs), they are frequently flagged as spam and given <strong>0 views (shadowbanned)</strong>.
              <br /><br />
              The safest, most high-reach method is <strong>Semi-Automated Copy-Posting</strong>:
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: '20px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>1. Let the backend auto-clip the video to 9:16 layout.</li>
              <li>2. Copy the pre-generated, FTC-compliant caption with one click here.</li>
              <li>3. Open the social media upload page using the quick links below.</li>
              <li>4. Drag-and-drop the clip and paste your caption. You get 100% organic reach!</li>
            </ul>
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
                  <div>
                    <span className="badge badge-secondary" style={{ marginBottom: '8px', fontSize: '10px' }}>
                      {clip.campaignName}
                    </span>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-display)', marginBottom: '6px' }}>
                      {clip.name}
                    </h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                      Rendered: {new Date(clip.createdAt).toLocaleDateString()} at {new Date(clip.createdAt).toLocaleTimeString()}
                    </p>

                    <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '4px' }}>
                        Title: {clip.title}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                        {clip.tags}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'stretch', justifyContent: 'space-between', minWidth: '150px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '8px 12px' }}
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
                      className="btn btn-primary"
                      style={{ fontSize: '12px', padding: '8px 12px', textDecoration: 'none' }}
                    >
                      Download File
                    </a>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px', justifyContent: 'center' }}>
                      <CheckCircle size={14} style={{ color: 'var(--secondary)' }} /> Not Posted Yet
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Side: Quick Links & Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Upload Channels
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <a
                href="https://www.tiktok.com/creator-center/upload"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>Upload to TikTok</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="https://studio.youtube.com/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>Upload to YouTube Shorts</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
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
