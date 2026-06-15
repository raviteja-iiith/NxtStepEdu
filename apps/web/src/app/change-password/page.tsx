'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChangePasswordPage() {
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
      if (!user) { window.location.href = '/login'; return; }
      supabase.from('users').select('role, full_name').eq('id', user.id).single().then(({ data }: { data: { role: string; full_name: string } | null }) => {
        if (data) { setRole(data.role); setName(data.full_name || ''); }
      });
    });
  }, [supabase]);

  const getStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const s = Math.min(score, 4);
    return {
      score: s,
      label: ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][s],
      color: ['#DC2626', '#D97706', '#D97706', '#16A34A', '#16A34A'][s],
    };
  };

  const strength = getStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) { setError(updateError.message); setLoading(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Mark first login complete — wait for DB write before navigating
        await supabase.from('users').update({ is_first_login: false }).eq('id', user.id);
        // Hard navigation so middleware sees updated is_first_login flag
        window.location.href = `/${role || 'teacher'}/dashboard`;
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const roleColors: Record<string, string> = {
    principal: '#1E40AF',
    teacher: '#0F766E',
    parent: '#7C3AED',
  };
  const accent = roleColors[role] || '#1E40AF';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      padding: '24px', fontFamily: "'Inter', sans-serif",
    }}>
      {/* Background orbs */}
      <div style={{
        position: 'fixed', top: '-10%', right: '-5%', width: 400, height: 400,
        borderRadius: '50%', background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-10%', left: '-5%', width: 350, height: 350,
        borderRadius: '50%', background: 'radial-gradient(circle, #7C3AED22 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, background: `${accent}22`, border: `1px solid ${accent}44`,
          }}>🔐</div>
          <h1 style={{ color: '#F1F5F9', fontSize: 26, fontWeight: 700, margin: '0 0 8px' }}>
            {name ? `Welcome, ${name.split(' ')[0]}!` : 'Set Your Password'}
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
            First login detected. Please set a secure password to continue.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
          padding: '36px 32px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}>
          {error && (
            <div style={{
              marginBottom: 20, padding: '12px 16px', borderRadius: 12,
              background: '#FEF2F2', color: '#DC2626', fontSize: 14, fontWeight: 500,
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* New Password */}
            <div>
              <label style={{ display: 'block', color: '#CBD5E1', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 14,
                  background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F1F5F9', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {newPassword && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 4, borderRadius: 4,
                        background: i < strength.score ? strength.color : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                  <p style={{ color: strength.color, fontSize: 12, fontWeight: 600, margin: 0 }}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ display: 'block', color: '#CBD5E1', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 14,
                  background: 'rgba(15,23,42,0.6)',
                  border: `1px solid ${confirmPassword && newPassword !== confirmPassword ? '#DC2626' : 'rgba(255,255,255,0.1)'}`,
                  color: '#F1F5F9', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p style={{ color: '#F87171', fontSize: 12, margin: '6px 0 0', fontWeight: 500 }}>
                  Passwords don&apos;t match
                </p>
              )}
            </div>

            <div style={{
              padding: '12px 16px', borderRadius: 12, fontSize: 12, color: '#64748B',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <p style={{ margin: '0 0 4px', color: '#94A3B8', fontWeight: 600 }}>Password requirements:</p>
              {[
                { ok: newPassword.length >= 8, text: 'At least 8 characters' },
                { ok: /[A-Z]/.test(newPassword), text: 'One uppercase letter' },
                { ok: /[0-9]/.test(newPassword), text: 'One number' },
              ].map((r, i) => (
                <p key={i} style={{ margin: '2px 0', color: r.ok ? '#4ADE80' : '#64748B' }}>
                  {r.ok ? '✓' : '○'} {r.text}
                </p>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !newPassword || newPassword !== confirmPassword}
              style={{
                padding: '14px', borderRadius: 12, border: 'none',
                background: loading || !newPassword || newPassword !== confirmPassword
                  ? 'rgba(255,255,255,0.1)'
                  : `linear-gradient(135deg, ${accent}, ${accent}dd)`,
                color: loading || !newPassword || newPassword !== confirmPassword ? '#475569' : 'white',
                fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', letterSpacing: 0.3,
              }}
            >
              {loading ? '⏳ Setting password...' : '🔐 Set New Password →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 16 }}>
          Having trouble? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}
