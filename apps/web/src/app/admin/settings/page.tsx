'use client';

import { useState } from 'react';

interface FeatureFlag { label: string; desc: string; enabled: boolean; icon: React.ReactNode; }

export default function AdminSettings() {
  const [appName, setAppName] = useState('NxtStepEdu');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [flags, setFlags] = useState<FeatureFlag[]>([
    { label: 'AI Features', desc: 'Enable AI report summaries and chatbot (per plan)', enabled: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><path d="M22 6l-3 3-3-3"/></svg> },
    { label: 'SMS Notifications', desc: 'Send SMS alerts via MSG91 gateway', enabled: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { label: 'Email Notifications', desc: 'Send transactional emails via Resend', enabled: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
    { label: 'Push Notifications', desc: 'Send push notifications via Firebase', enabled: false, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  ]);

  const toggleFlag = (i: number) => setFlags(f => f.map((flag, idx) => idx === i ? { ...flag, enabled: !flag.enabled } : flag));

  const handleSaveBranding = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0',
    borderRadius: 10, fontSize: 13, outline: 'none', background: 'white',
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>System Configuration</h2>
        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Platform-wide settings, branding, and feature flags</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Platform Branding */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EFF6FF', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Platform Branding</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Customize how the platform appears</p>
            </div>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Platform Name</label>
              <input type="text" value={appName} onChange={e => setAppName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Platform Logo</label>
              <div style={{ width: '100%', height: 100, border: '2px dashed #E2E8F0', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', background: '#FAFAFA' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Drop logo here or click to upload</p>
              </div>
            </div>
            <button onClick={handleSaveBranding}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: saved ? '#16A34A' : 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.2s' }}>
              {saved ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg> Saved!</>
              ) : 'Save Branding'}
            </button>
          </div>
        </div>

        {/* Feature Flags */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Feature Flags</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Enable or disable platform features</p>
            </div>
          </div>
          <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {flags.map((flag, i) => (
              <div key={i} onClick={() => toggleFlag(i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderRadius: 10, cursor: 'pointer', background: flag.enabled ? '#F8FAFF' : '#FAFAFA', border: `1px solid ${flag.enabled ? '#DBEAFE' : '#F1F5F9'}`, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: flag.enabled ? '#3B82F6' : '#94A3B8', flexShrink: 0 }}>{flag.icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: flag.enabled ? '#1E293B' : '#64748B', margin: 0 }}>{flag.label}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{flag.desc}</p>
                  </div>
                </div>
                {/* Toggle */}
                <div style={{ width: 40, height: 22, borderRadius: 99, background: flag.enabled ? '#22C55E' : '#CBD5E1', display: 'flex', alignItems: 'center', padding: '0 3px', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transform: flag.enabled ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Maintenance Mode */}
      <div style={{ background: maintenanceMode ? '#FFF7ED' : 'white', borderRadius: 14, border: `1px solid ${maintenanceMode ? '#FED7AA' : '#E8ECF0'}`, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: maintenanceMode ? '#FEF3C7' : '#F1F5F9', color: maintenanceMode ? '#D97706' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
              🔧
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Maintenance Mode</h3>
              <p style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>When enabled, all non-admin users will see a maintenance page</p>
            </div>
          </div>
          <button onClick={() => setMaintenanceMode(!maintenanceMode)}
            style={{ padding: '10px 22px', borderRadius: 10, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: maintenanceMode ? 'linear-gradient(135deg, #15803D, #22C55E)' : 'linear-gradient(135deg, #B91C1C, #EF4444)', boxShadow: maintenanceMode ? '0 4px 12px rgba(34,197,94,0.25)' : '0 4px 12px rgba(239,68,68,0.25)', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
            {maintenanceMode ? '✓ Disable Maintenance' : '⚠ Enable Maintenance'}
          </button>
        </div>
        {maintenanceMode && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E', margin: 0 }}>Maintenance mode is <strong>ACTIVE</strong>. All non-admin users are currently seeing the maintenance page.</p>
          </div>
        )}
      </div>

      {/* System Info */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>System Information</h3>
          <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Current environment details</p>
        </div>
        <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { label: 'Environment', value: process.env.NODE_ENV || 'development' },
            { label: 'Version', value: 'v1.0.0' },
            { label: 'Database', value: 'Supabase (PostgreSQL)' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '12px 16px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{item.label}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0, fontFamily: 'monospace' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
