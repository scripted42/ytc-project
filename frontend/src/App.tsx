import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Campaign, Clip, Settings } from './types';
import Campaigns from './components/Campaigns';
import Generator from './components/Generator';
import Scheduler from './components/Scheduler';
import Analytics from './components/Analytics';
import { Zap, Layers, Calendar, BarChart3, X } from 'lucide-react';


export default function App() {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'scheduler' | 'analytics'>('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [settings, setSettings] = useState<Settings>({
    gameplayUrl: '',
    gameplayPath: '',
    gameplayDownloaded: false
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [campaignsRes, clipsRes, settingsRes] = await Promise.all([
        axios.get('/api/campaigns'),
        axios.get('/api/clips'),
        axios.get('/api/settings')
      ]);
      setCampaigns(campaignsRes.data);
      setClips(clipsRes.data);
      setSettings(settingsRes.data);
      if (selectedCampaign) {
        const updated = campaignsRes.data.find((c: Campaign) => c.id === selectedCampaign.id);
        if (updated) setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error('API polling error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [selectedCampaign]);

  const handleSelectCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setActiveTab('campaigns');
  };

  const navItems = [
    { id: 'campaigns', label: 'Campaigns', icon: Layers },
    { id: 'scheduler', label: 'Scheduler',  icon: Calendar },
    { id: 'analytics', label: 'Analytics',  icon: BarChart3 },
  ] as const;

  return (
    <div className="app-container">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="logo-container">
          <div className="logo-icon">
            <Zap size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <span className="logo-text">ClipFlow AI</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-menu">
          {navItems.map(({ id, label, icon: Icon }) => (
            <li
              key={id}
              className={`menu-item ${activeTab === id && !selectedCampaign ? 'active' : ''}`}
              onClick={() => { setActiveTab(id); setSelectedCampaign(null); }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </li>
          ))}
        </nav>

        {/* Active Campaign Strip */}
        {selectedCampaign && (
          <div
            className="sidebar-campaign-strip"
            onClick={() => setSelectedCampaign(selectedCampaign)}
            title="Currently editing this campaign"
          >
            <div className="sidebar-campaign-label">▶ Active Campaign</div>
            <div className="sidebar-campaign-name">{selectedCampaign.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--primary-light)', marginTop: '4px', opacity: 0.7 }}>
              ${selectedCampaign.rate.toFixed(2)}/1K views
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedCampaign(null); setActiveTab('campaigns'); }}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dark)', padding: '2px',
                display: 'flex', alignItems: 'center'
              }}
              title="Close campaign"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <span>v1.0.0</span>
          <span><span className="status-dot" />Online</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
            <div className="processing-ring" style={{ width: '44px', height: '44px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Connecting to ClipFlow server…</p>
          </div>
        ) : (
          <>
            {activeTab === 'campaigns' && (
              selectedCampaign ? (
                <Generator
                  campaign={selectedCampaign}
                  clips={clips}
                  settings={settings}
                  onRefreshClips={fetchData}
                  onRefreshSettings={fetchData}
                  onBack={() => setSelectedCampaign(null)}
                />
              ) : (
                <Campaigns
                  campaigns={campaigns}
                  onRefresh={fetchData}
                  onSelectCampaign={handleSelectCampaign}
                />
              )
            )}
            {activeTab === 'scheduler' && <Scheduler clips={clips} onRefresh={fetchData} />}
            {activeTab === 'analytics' && <Analytics clips={clips} />}
          </>
        )}
      </main>

      {/* Global keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
