import React, { useState } from 'react';
import type { Campaign } from '../types';
import { Plus, Trash2, Edit2, Link, Award, Play } from 'lucide-react';
import axios from 'axios';

interface CampaignsProps {
  campaigns: Campaign[];
  onRefresh: () => void;
  onSelectCampaign: (campaign: Campaign) => void;
}

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
      `1. Tag @callofduty on every post (TikTok/Insta caption, or YouTube Shorts title).\n2. FTC Disclosure (#Ad, #Advertisement, or #Sponsored) is REQUIRED.\n3. Placement: Must be on its own separate line, as the first hashtag.\n4. Original audio only. Do NOT add background music or gameplay B-roll.\n5. Video length: Must be at least 10 seconds.`
    );
    setPlatforms(['tiktok', 'youtube', 'instagram']);
    setIsAdding(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !rate || !sourceUrl) return;

    try {
      await axios.post('/api/campaigns', {
        name,
        brand,
        rate: parseFloat(rate),
        sourceUrl,
        guidelines,
        platform: platforms
      });
      onRefresh();
      setIsAdding(false);
      resetForm();
    } catch (err) {
      console.error('Failed to add campaign:', err);
    }
  };

  const resetForm = () => {
    setName('');
    setBrand('');
    setRate('1.50');
    setSourceUrl('');
    setGuidelines('');
    setPlatforms(['tiktok', 'youtube']);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this campaign? All associated clips will be deleted.')) return;
    try {
      await axios.delete(`/api/campaigns/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  };

  const togglePlatform = (p: string) => {
    if (platforms.includes(p)) {
      setPlatforms(platforms.filter(x => x !== p));
    } else {
      setPlatforms([...platforms, p]);
    }
  };

  return (
    <div className="animated-fade-in">
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '700' }}>Active Campaigns</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Select a campaign to begin auto-clipping assets</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={handleAddDefaultCoD}>
            Load CoD Sample
          </button>
          <button className="btn btn-primary" onClick={() => setIsAdding(!isAdding)}>
            <Plus size={18} /> {isAdding ? 'Cancel' : 'Add Campaign'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="glass-card" style={{ marginBottom: '32px', animation: 'fadeIn 0.3s ease' }}>
          <h3 style={{ marginBottom: '20px', fontFamily: 'var(--font-display)' }}>Add New Campaign</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="grid-cols-2">
              <div>
                <label>Campaign Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Call of Duty - Modern Warfare 4"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Brand / Sponsor</label>
                <input
                  type="text"
                  placeholder="e.g. Activision"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-cols-2">
              <div>
                <label>Pay Rate (per 1,000 views in USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="1.50"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Target Platforms</label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                  {['tiktok', 'youtube', 'instagram'].map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`btn ${platforms.includes(p) ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '8px 16px', fontSize: '12px', textTransform: 'capitalize' }}
                      onClick={() => togglePlatform(p)}
                    >
                      {p === 'youtube' ? 'YouTube Shorts' : p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label>Source Video / Trailer URL (YouTube or Direct MP4 Link) *</label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                required
              />
            </div>

            <div>
              <label>Campaign Guidelines & Instructions</label>
              <textarea
                rows={5}
                placeholder="Enter rules, hashtags, FTC disclosure requirements..."
                value={guidelines}
                onChange={e => setGuidelines(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Campaign
              </button>
            </div>
          </form>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Award size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No campaigns configured yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
            Click the "Load CoD Sample" button above to quickly test with the Call of Duty: MW4 campaign details, or create your own.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button className="btn btn-primary" onClick={handleAddDefaultCoD}>
              Load CoD Sample
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-cols-2">
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="glass-card"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectCampaign(campaign)}
            >
              <div className="flex-between" style={{ marginBottom: '12px' }}>
                <span className="badge badge-primary">{campaign.brand || 'No Brand'}</span>
                <span
                  className="badge badge-secondary"
                  style={{ fontWeight: '700', fontSize: '13px' }}
                >
                  ${campaign.rate.toFixed(2)}/1K views
                </span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                {campaign.name}
              </h3>
              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  marginBottom: '16px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {campaign.guidelines || 'No guidelines entered.'}
              </p>
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  {campaign.platform.map(plat => (
                    <span
                      key={plat}
                      className="badge"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        textTransform: 'uppercase',
                        fontSize: '10px',
                        padding: '2px 8px'
                      }}
                    >
                      {plat}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={(e) => handleDelete(campaign.id, e)}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '12px' }}>
                    <Play size={12} style={{ fill: '#fff' }} /> Clip
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
