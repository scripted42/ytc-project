import { useState } from 'react';
import type { Campaign } from '../types';
import { Plus, Trash2, Play, Sparkles, ChevronRight, Film } from 'lucide-react';
import axios from 'axios';

interface CampaignsProps {
  campaigns: Campaign[];
  onRefresh: () => void;
  onSelectCampaign: (campaign: Campaign) => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#ff0050',
  youtube: '#ff0000',
  instagram: '#c13584',
};

export default function Campaigns({ campaigns, onRefresh, onSelectCampaign }: CampaignsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [rate, setRate] = useState('1.50');
  const [sourceUrl, setSourceUrl] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'youtube']);

  const handleAddDefaultCoD = () => {
    setName('Call of Duty - Modern Warfare 4 Reveal Trailer');
    setBrand('Clipping Culture / Activision');
    setRate('1.50');
    setSourceUrl('https://www.youtube.com/watch?v=jLbst85USN8');
    setGuidelines(
      `1. Tag @callofduty on every post.\n2. FTC Disclosure (#Ad) is REQUIRED on its own line.\n3. Original audio only. No background music.\n4. Video length: at least 10 seconds.`
    );
    setPlatforms(['tiktok', 'youtube', 'instagram']);
    setIsAdding(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !rate || !sourceUrl) return;
    try {
      await axios.post('/api/campaigns', {
        name, brand, rate: parseFloat(rate), sourceUrl, guidelines, platform: platforms
      });
      onRefresh();
      setIsAdding(false);
      resetForm();
    } catch (err) { console.error(err); }
  };

  const resetForm = () => {
    setName(''); setBrand(''); setRate('1.50'); setSourceUrl(''); setGuidelines('');
    setPlatforms(['tiktok', 'youtube']);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this campaign and all its clips?')) return;
    try { await axios.delete(`/api/campaigns/${id}`); onRefresh(); } catch (err) { console.error(err); }
  };

  const togglePlatform = (p: string) =>
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div className="animated-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="header-title">Campaigns</h2>
          <p className="header-subtitle">Select a campaign to start generating viral clips</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={handleAddDefaultCoD}>
            <Film size={14} /> Load CoD Sample
          </button>
          <button className="btn btn-primary" style={{ fontSize: '13px' }} onClick={() => setIsAdding(!isAdding)}>
            <Plus size={14} /> {isAdding ? 'Cancel' : 'New Campaign'}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="glass-card animated-fade-in-up" style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-subtle)', border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={16} style={{ color: 'var(--primary-light)' }} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: '700' }}>New Campaign</h3>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="grid-cols-2">
              <div>
                <label>Campaign Name *</label>
                <input type="text" placeholder="e.g. Call of Duty MW4 Reveal" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label>Brand / Sponsor</label>
                <input type="text" placeholder="e.g. Activision" value={brand} onChange={e => setBrand(e.target.value)} />
              </div>
            </div>

            <div className="grid-cols-2">
              <div>
                <label>Pay Rate (USD per 1,000 views) *</label>
                <input type="number" step="0.01" placeholder="1.50" value={rate} onChange={e => setRate(e.target.value)} required />
              </div>
              <div>
                <label>Target Platforms</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {['tiktok', 'youtube', 'instagram'].map(p => (
                    <button
                      key={p} type="button"
                      onClick={() => togglePlatform(p)}
                      style={{
                        padding: '7px 14px', fontSize: '12px', fontWeight: '600',
                        borderRadius: 'var(--radius-sm)', border: '1px solid',
                        cursor: 'pointer', transition: 'all 0.2s',
                        background: platforms.includes(p) ? 'var(--primary-subtle)' : 'transparent',
                        borderColor: platforms.includes(p) ? 'var(--primary)' : 'var(--border)',
                        color: platforms.includes(p) ? 'var(--primary-light)' : 'var(--text-dark)',
                        fontFamily: 'var(--font-sans)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {p === 'youtube' ? 'YT Shorts' : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label>Source Video URL (YouTube or direct MP4) *</label>
              <input type="url" placeholder="https://www.youtube.com/watch?v=..." value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} required />
            </div>

            <div>
              <label>Campaign Guidelines & Rules</label>
              <textarea rows={4} placeholder="FTC disclosure requirements, hashtags, usage rules..." value={guidelines} onChange={e => setGuidelines(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={() => { setIsAdding(false); resetForm(); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>Save Campaign</button>
            </div>
          </form>
        </div>
      )}

      {/* Campaign Grid */}
      {campaigns.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Sparkles size={28} style={{ color: 'var(--primary-light)' }} />
            </div>
            <h3 className="empty-state-title">No campaigns yet</h3>
            <p className="empty-state-sub">
              Create your first campaign by adding a YouTube video URL and pay rate, or load the CoD sample to explore.
            </p>
            <button className="btn btn-primary" onClick={handleAddDefaultCoD}>
              <Film size={16} /> Try CoD Sample
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-cols-2 stagger" style={{ gap: '16px' }}>
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="campaign-card animated-fade-in"
              onClick={() => onSelectCampaign(campaign)}
            >
              {/* Card body */}
              <div className="campaign-card-body">
                {/* Top badges row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span className="badge badge-primary" style={{ fontSize: '11px' }}>
                    {campaign.brand || 'Independent'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '16px',
                    fontWeight: '800',
                    color: 'var(--secondary-light)',
                  }}>
                    ${campaign.rate.toFixed(2)}<span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-dark)', marginLeft: '3px' }}>/1K</span>
                  </span>
                </div>

                {/* Name */}
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: '700', marginBottom: '10px', lineHeight: '1.3' }}>
                  {campaign.name}
                </h3>

                {/* Guidelines preview */}
                <p style={{
                  color: 'var(--text-dark)', fontSize: '13px', lineHeight: '1.55',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                  {campaign.guidelines || 'No guidelines entered.'}
                </p>
              </div>

              {/* Card footer */}
              <div className="campaign-card-footer">
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {campaign.platform.map(plat => (
                    <span key={plat} style={{
                      padding: '2px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: '700',
                      background: `${PLATFORM_COLORS[plat] || '#666'}18`,
                      color: PLATFORM_COLORS[plat] || '#aaa',
                      border: `1px solid ${PLATFORM_COLORS[plat] || '#666'}40`,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {plat}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn btn-icon btn-secondary"
                    onClick={(e) => handleDelete(campaign.id, e)}
                    title="Delete campaign"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button className="btn btn-primary" style={{ padding: '7px 16px', fontSize: '12px' }}>
                    <Play size={12} style={{ fill: '#fff' }} /> Open <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
