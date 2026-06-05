import React, { useState, useEffect } from 'react';
import axios from 'axios';
import type { Campaign, Clip, Settings } from './types';
import Campaigns from './components/Campaigns';
import Generator from './components/Generator';
import Scheduler from './components/Scheduler';
import Analytics from './components/Analytics';
import { Award, Layers, Calendar, BarChart3, Settings as SettingsIcon } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'scheduler' | 'analytics'>('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  // Data States
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [settings, setSettings] = useState<Settings>({
    gameplayUrl: '',
    gameplayPath: '',
    gameplayDownloaded: false
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
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
      
      // Update selected campaign reference if it exists to refresh nested properties
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
    
    // Auto refresh data every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [selectedCampaign]);

  const handleSelectCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setActiveTab('campaigns');
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <Award size={28} style={{ color: 'var(--primary)', strokeWidth: '2.5px' }} />
          <span className="logo-text">ClipFlow AI</span>
        </div>
        
        <nav className="sidebar-menu">
          <li
            className={`menu-item ${activeTab === 'campaigns' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('campaigns');
              setSelectedCampaign(null);
            }}
          >
            <Layers size={18} />
            <span>Campaigns</span>
          </li>
          <li
            className={`menu-item ${activeTab === 'scheduler' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('scheduler');
              setSelectedCampaign(null);
            }}
          >
            <Calendar size={18} />
            <span>Scheduler</span>
          </li>
          <li
            className={`menu-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('analytics');
              setSelectedCampaign(null);
            }}
          >
            <BarChart3 size={18} />
            <span>Analytics</span>
          </li>
        </nav>

        <div style={{ padding: '24px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-dark)' }}>
          System Version: 1.0.0<br />
          Status: <span style={{ color: 'var(--secondary)' }}>Online</span>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'var(--text-muted)' }}>Connecting to ClipFlow server...</p>
          </div>
        ) : (
          <>
            {/* Campaigns / Generator tab */}
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

            {/* Scheduler tab */}
            {activeTab === 'scheduler' && (
              <Scheduler clips={clips} onRefresh={fetchData} />
            )}

            {/* Analytics tab */}
            {activeTab === 'analytics' && (
              <Analytics clips={clips} campaigns={campaigns} />
            )}
          </>
        )}
      </main>
      
      {/* Keyframe animation for spinner (since Tailwind isn't imported) */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1.5s linear infinite;
        }
      `}</style>
    </div>
  );
}
