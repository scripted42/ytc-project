import type { Clip } from '../types';
import { DollarSign, Eye, Film } from 'lucide-react';

interface AnalyticsProps {
  clips: Clip[];
}

export default function Analytics({ clips }: AnalyticsProps) {
  // Aggregate stats
  const totalClips = clips.length;
  const completedClips = clips.filter(c => c.status === 'completed');
  const totalViews = completedClips.reduce((sum, c) => sum + (c.views || 0), 0);
  const totalEarnings = completedClips.reduce((sum, c) => sum + (c.earnings || 0), 0);

  // Budget progress (e.g., let's track the maximum standard Whop campaign threshold of $1500)
  const targetPayoutGoal = 1500;
  const progressPercent = Math.min(100, Math.round((totalEarnings / targetPayoutGoal) * 100));

  return (
    <div className="animated-fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '700' }}>Earnings & Performance Analytics</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
          Real-time tracking of view counts and earnings across all active campaigns
        </p>
      </div>

      {/* Stats Counter Grid */}
      <div className="grid-cols-3" style={{ marginBottom: '32px' }}>
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              color: 'var(--primary)'
            }}
          >
            <DollarSign size={24} />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Earnings
            </span>
            <span style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-display)', color: '#fff' }}>
              ${totalEarnings.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              color: 'var(--secondary)'
            }}
          >
            <Eye size={24} />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Views
            </span>
            <span style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-display)', color: '#fff' }}>
              {totalViews.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              color: 'var(--accent)'
            }}
          >
            <Film size={24} />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Rendered Clips
            </span>
            <span style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-display)', color: '#fff' }}>
              {totalClips}
            </span>
          </div>
        </div>
      </div>

      {/* Goal Progress Tracker */}
      <div className="glass-card" style={{ marginBottom: '32px' }}>
        <div className="flex-between" style={{ marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700' }}>Campaign Target Progress</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
              Progress towards the campaign threshold limit of ${targetPayoutGoal.toLocaleString()}
            </p>
          </div>
          <span style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--secondary)' }}>
            {progressPercent}%
          </span>
        </div>

        <div style={{ width: '100%', background: 'rgba(255, 255, 255, 0.05)', height: '12px', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
          <div
            style={{
              width: `${progressPercent}%`,
              background: 'linear-gradient(90deg, var(--primary), var(--secondary))',
              height: '100%',
              borderRadius: '6px',
              transition: 'width 0.4s'
            }}
          />
        </div>

        <div className="flex-between" style={{ fontSize: '11px', color: 'var(--text-dark)' }}>
          <span>$0.00 Earned</span>
          <span>${targetPayoutGoal.toLocaleString()} Limit Cap</span>
        </div>
      </div>

      {/* Earnings Table / Log */}
      <div className="glass-card">
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
          Performance Log
        </h3>

        {completedClips.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            No performance metrics logged yet. Post videos and enter their view counts in the generator tab.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Clip Name</th>
                  <th style={{ padding: '12px 16px' }}>Campaign</th>
                  <th style={{ padding: '12px 16px' }}>Rate</th>
                  <th style={{ padding: '12px 16px' }}>Views</th>
                  <th style={{ padding: '12px 16px' }}>Earnings</th>
                  <th style={{ padding: '12px 16px' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {completedClips.map(clip => (
                  <tr key={clip.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '600' }}>{clip.name}</td>
                    <td style={{ padding: '12px 16px' }}>{clip.campaignName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--primary)' }}>
                      ${clip.campaignRate?.toFixed(2)}/1K
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600' }}>{clip.views.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--secondary)', fontWeight: '700' }}>
                      ${clip.earnings.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {new Date(clip.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
