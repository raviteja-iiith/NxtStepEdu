'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const P = { fontFamily: "'Inter', sans-serif" };
const IS: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, color: '#0F172A', background: 'white', outline: 'none', boxSizing: 'border-box' };
const IS_DIS: React.CSSProperties = { ...IS, background: '#F8FAFC', color: '#94A3B8' };

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' });
  const [userId, setUserId] = useState('');
  const [pinForm, setPinForm] = useState({ newPin: '', confirm: '' });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase.from('users').select('full_name, phone, email').eq('id', user.id).single();
    if (data) setForm({ full_name: data.full_name || '', phone: data.phone || '', email: data.email || '' });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    setSaving(true); setSuccess(''); setError('');
    const { error: err } = await supabase.from('users').update({ full_name: form.full_name, email: form.email }).eq('id', userId);
    if (err) setError(err.message); else setSuccess('Profile updated successfully!');
    setSaving(false);
  };

  const handlePinChange = async () => {
    setPinError(''); setPinSuccess('');
    if (pinForm.newPin.length !== 6) { setPinError('PIN must be exactly 6 digits.'); return; }
    if (!/^\d+$/.test(pinForm.newPin)) { setPinError('PIN must contain only digits.'); return; }
    if (pinForm.newPin !== pinForm.confirm) { setPinError('PINs do not match.'); return; }
    setSavingPin(true);
    const { error: authErr } = await supabase.auth.updateUser({ password: pinForm.newPin });
    if (authErr) { setPinError(authErr.message); setSavingPin(false); return; }
    await supabase.from('users').update({ is_first_login: false }).eq('id', userId);
    setPinSuccess('PIN updated successfully!');
    setPinForm({ newPin: '', confirm: '' });
    setSavingPin(false);
  };

  const initials = form.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '👤';

  return (
    <div style={{ ...P, display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Profile & Settings</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Manage your personal information and login PIN</p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {[1,2].map(i => <div key={i} style={{ height: 260, background: '#F8FAFC', borderRadius: 20, border: '1px solid #F1F5F9' }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Personal Info Card */}
          <div style={{ background: 'white', borderRadius: 20, padding: '32px', border: '1px solid #E8ECF0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#6D28D9,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: 'white', boxShadow: '0 6px 20px rgba(109,40,217,0.25)', flexShrink: 0 }}>
                {initials}
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>{form.full_name || 'Parent'}</p>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0', fontWeight: 500 }}>Parent Account</p>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #F1F5F9', margin: 0 }} />

            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>Personal Information</h3>

            {success && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F0FDF4', color: '#16A34A', fontSize: 13, fontWeight: 600, border: '1px solid #BBF7D0' }}>✓ {success}</div>}
            {error   && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', color: '#DC2626', fontSize: 13, fontWeight: 600, border: '1px solid #FECACA' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={IS} placeholder="Your full name" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone (Login ID)</label>
                <input value={form.phone} disabled style={IS_DIS} />
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '5px 0 0' }}>Phone number is your login ID and cannot be changed</p>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email <span style={{ color: '#CBD5E1', fontWeight: 400 }}>(optional)</span></label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={IS} placeholder="your@email.com" />
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: saving ? '#A78BFA' : 'linear-gradient(135deg,#7C3AED,#A855F7)', color: 'white', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.3)', transition: 'all 0.15s', width: 'fit-content' }}>
              {saving ? '⏳ Saving...' : '✓ Save Changes'}
            </button>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Change PIN Card */}
            <div style={{ background: 'white', borderRadius: 20, padding: '28px 32px', border: '1px solid #E8ECF0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>🔐 Change PIN</h3>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0' }}>Update your 6-digit login PIN</p>
              </div>
              {pinSuccess && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F0FDF4', color: '#16A34A', fontSize: 13, fontWeight: 600, border: '1px solid #BBF7D0' }}>✓ {pinSuccess}</div>}
              {pinError   && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', color: '#DC2626', fontSize: 13, fontWeight: 600, border: '1px solid #FECACA' }}>{pinError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New PIN</label>
                  <input type="password" inputMode="numeric" placeholder="6-digit PIN" maxLength={6}
                    value={pinForm.newPin} onChange={e => setPinForm(f => ({ ...f, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    style={{ ...IS, fontSize: 20, letterSpacing: 8, textAlign: 'center' }} />
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>{pinForm.newPin.length}/6 digits</p>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm PIN</label>
                  <input type="password" inputMode="numeric" placeholder="Re-enter PIN" maxLength={6}
                    value={pinForm.confirm} onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    style={{ ...IS, fontSize: 20, letterSpacing: 8, textAlign: 'center', borderColor: pinForm.confirm && pinForm.newPin !== pinForm.confirm ? '#FECACA' : '#E2E8F0' }} />
                </div>
              </div>
              <button onClick={handlePinChange} disabled={savingPin || pinForm.newPin.length !== 6}
                style={{ padding: '11px 24px', borderRadius: 12, border: 'none', background: (savingPin || pinForm.newPin.length !== 6) ? '#E2E8F0' : 'linear-gradient(135deg,#7C3AED,#A855F7)', color: (savingPin || pinForm.newPin.length !== 6) ? '#94A3B8' : 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', width: 'fit-content' }}>
                {savingPin ? '⏳ Updating...' : '🔐 Update PIN'}
              </button>
            </div>

            {/* Account Info */}
            <div style={{ background: '#FAFAFA', borderRadius: 18, padding: '22px 24px', border: '1px solid #F1F5F9' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#475569', margin: '0 0 12px' }}>ℹ️ Account Info</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Your phone number is your login ID and cannot be changed', 'Contact school administration to update your phone number', 'Use a 6-digit numeric PIN every time you log in'].map((tip, i) => (
                  <p key={i} style={{ fontSize: 13, color: '#64748B', margin: 0, paddingLeft: 14, position: 'relative', lineHeight: 1.5 }}>
                    <span style={{ position: 'absolute', left: 0, color: '#A78BFA' }}>•</span>{tip}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
