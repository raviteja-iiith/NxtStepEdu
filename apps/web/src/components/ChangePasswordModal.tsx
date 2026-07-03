'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  onClose: () => void;
  accentColor?: string; // portal brand color
  role?: string; // 'parent' for PIN mode
}

export default function ChangePasswordModal({ onClose, accentColor = '#1E3A8A', role }: Props) {
  const isParent = role === 'parent';
  const supabase = createClient();
  const [current,  setCurrent]  = useState('');
  const [newPwd,   setNewPwd]   = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);
  const [showC,    setShowC]    = useState(false);
  const [showN,    setShowN]    = useState(false);
  const [showCf,   setShowCf]   = useState(false);

  const strength = (p: string) => {
    let s = 0;
    if (p.length >= 8)           s++;
    if (/[A-Z]/.test(p))         s++;
    if (/[0-9]/.test(p))         s++;
    if (/[^A-Za-z0-9]/.test(p))  s++;
    return s; // 0-4
  };
  const str = strength(newPwd);
  const strLabel = ['Too short','Weak','Fair','Good','Strong'][str] || '';
  const strColor = ['#E2E8F0','#EF4444','#F59E0B','#3B82F6','#22C55E'][str];

  const handleSave = async () => {
    setError('');
    if (isParent) {
      // PIN validation
      if (!current)              { setError('Enter your current PIN.'); return; }
      if (!/^\d{6}$/.test(current)) { setError('Current PIN must be exactly 6 digits.'); return; }
      if (!/^\d{6}$/.test(newPwd)) { setError('New PIN must be exactly 6 digits.'); return; }
      if (newPwd !== confirm)    { setError('PINs do not match.'); return; }
      if (newPwd === current)    { setError('New PIN must be different from current PIN.'); return; }
    } else {
      // Password validation
      if (!current)              { setError('Enter your current password.'); return; }
      if (newPwd.length < 8)     { setError('New password must be at least 8 characters.'); return; }
      if (newPwd !== confirm)    { setError('Passwords do not match.'); return; }
      if (newPwd === current)    { setError('New password must be different from current password.'); return; }
    }

    setSaving(true);
    // Re-authenticate with current password/PIN first
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setError('Session error — please log in again.'); setSaving(false); return; }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (signInErr) { setError(isParent ? 'Current PIN is incorrect.' : 'Current password is incorrect.'); setSaving(false); return; }

    // Update password/PIN
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd });
    if (updateErr) { setError(updateErr.message); setSaving(false); return; }

    setSuccess(true);
    setSaving(false);
    setTimeout(onClose, 2000);
  };

  const IS: React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit', paddingRight:40 };
  const EyeBtn = ({ show, toggle }: { show: boolean; toggle: () => void }) => (
    <button type="button" onClick={toggle}
      style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94A3B8', display:'flex', alignItems:'center', padding:2 }}>
      {show
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      }
    </button>
  );

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(6px)' }}>
      <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:20, boxShadow:'0 32px 80px rgba(0,0,0,0.25)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #F1F5F9', background:`linear-gradient(135deg,${accentColor}15,${accentColor}08)` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:`linear-gradient(135deg,${accentColor},${accentColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div>
              <p style={{ fontSize:15, fontWeight:800, color:'#0F172A', margin:0 }}>{isParent ? 'Change PIN' : 'Change Password'}</p>
                <p style={{ fontSize:12, color:'#64748B', margin:'2px 0 0' }}>Keep your account secure</p>
              </div>
            </div>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          {success ? (
            <div style={{ padding:'24px 16px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#F0FDF4', border:'2px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>✅</div>
              <p style={{ fontSize:15, fontWeight:700, color:'#15803D', margin:0 }}>{isParent ? 'PIN Changed!' : 'Password Changed!'}</p>
              <p style={{ fontSize:13, color:'#64748B', margin:0 }}>{isParent ? 'Your PIN has been updated successfully.' : 'Your password has been updated successfully.'}</p>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626', display:'flex', alignItems:'center', gap:8 }}>
                  <span>⚠</span> {error}
                </div>
              )}

              {isParent ? (
                /* ── Parent PIN mode ── */
                <>
                  {/* Current PIN */}
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Current PIN *</label>
                    <div style={{ position:'relative' }}>
                      <input type={showC?'text':'password'} inputMode="numeric" maxLength={6} value={current} onChange={e => setCurrent(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Your current 6-digit PIN" style={{ ...IS, letterSpacing:4 }} autoFocus/>
                      <EyeBtn show={showC} toggle={() => setShowC(v => !v)}/>
                    </div>
                  </div>

                  {/* New PIN */}
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>New PIN *</label>
                    <div style={{ position:'relative' }}>
                      <input type={showN?'text':'password'} inputMode="numeric" maxLength={6} value={newPwd} onChange={e => setNewPwd(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit PIN" style={{ ...IS, letterSpacing:4 }}/>
                      <EyeBtn show={showN} toggle={() => setShowN(v => !v)}/>
                    </div>
                    {newPwd && <p style={{ fontSize:11, color:'#64748B', margin:'4px 0 0' }}>{newPwd.length}/6 digits entered</p>}
                  </div>

                  {/* Confirm PIN */}
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Confirm New PIN *</label>
                    <div style={{ position:'relative' }}>
                      <input type={showCf?'text':'password'} inputMode="numeric" maxLength={6} value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Re-enter 6-digit PIN" style={{ ...IS, letterSpacing:4, borderColor: confirm && confirm !== newPwd ? '#FCA5A5' : '#E2E8F0' }}/>
                      <EyeBtn show={showCf} toggle={() => setShowCf(v => !v)}/>
                    </div>
                    {confirm && confirm !== newPwd && <p style={{ fontSize:11, color:'#EF4444', marginTop:4, fontWeight:600 }}>PINs don&apos;t match</p>}
                    {confirm && confirm === newPwd && newPwd && <p style={{ fontSize:11, color:'#22C55E', marginTop:4, fontWeight:600 }}>✓ PINs match</p>}
                  </div>

                  {/* Tips */}
                  <div style={{ padding:'10px 14px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:9, fontSize:11, color:'#64748B', lineHeight:1.6 }}>
                    <strong>Tips:</strong> Remember your 6-digit PIN. Do not share it with anyone.
                  </div>
                </>
              ) : (
                /* ── Password mode ── */
                <>
                  {/* Current password */}
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Current Password *</label>
                    <div style={{ position:'relative' }}>
                      <input type={showC?'text':'password'} value={current} onChange={e => setCurrent(e.target.value)} placeholder="Your current password" style={IS} autoFocus/>
                      <EyeBtn show={showC} toggle={() => setShowC(v => !v)}/>
                    </div>
                  </div>

                  {/* New password */}
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>New Password *</label>
                    <div style={{ position:'relative' }}>
                      <input type={showN?'text':'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 8 characters" style={IS}/>
                      <EyeBtn show={showN} toggle={() => setShowN(v => !v)}/>
                    </div>
                    {newPwd && (
                      <div style={{ marginTop:6 }}>
                        <div style={{ display:'flex', gap:3, marginBottom:4 }}>
                          {[1,2,3,4].map(i => (
                            <div key={i} style={{ flex:1, height:4, borderRadius:99, background: i <= str ? strColor : '#E2E8F0', transition:'background 0.2s' }}/>
                          ))}
                        </div>
                        <p style={{ fontSize:11, color:strColor, fontWeight:600, margin:0 }}>{strLabel}</p>
                      </div>
                    )}
                  </div>

                  {/* Confirm */}
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Confirm New Password *</label>
                    <div style={{ position:'relative' }}>
                      <input type={showCf?'text':'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter new password" style={{ ...IS, borderColor: confirm && confirm !== newPwd ? '#FCA5A5' : '#E2E8F0' }}/>
                      <EyeBtn show={showCf} toggle={() => setShowCf(v => !v)}/>
                    </div>
                    {confirm && confirm !== newPwd && <p style={{ fontSize:11, color:'#EF4444', marginTop:4, fontWeight:600 }}>Passwords don&apos;t match</p>}
                    {confirm && confirm === newPwd && newPwd && <p style={{ fontSize:11, color:'#22C55E', marginTop:4, fontWeight:600 }}>✓ Passwords match</p>}
                  </div>

                  {/* Tips */}
                  <div style={{ padding:'10px 14px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:9, fontSize:11, color:'#64748B', lineHeight:1.6 }}>
                    <strong>Tips:</strong> Use uppercase, numbers, and symbols for a stronger password.
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {!success && (
          <div style={{ padding:'0 24px 20px', display:'flex', gap:10 }}>
            <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex:1, padding:11, borderRadius:10, border:'none', fontSize:13, fontWeight:700, color:'white', cursor:saving?'not-allowed':'pointer',
                background:saving?`${accentColor}80`:`linear-gradient(135deg,${accentColor},${accentColor}CC)` }}>
              {saving ? 'Saving...' : isParent ? '🔐 Save PIN' : '🔒 Save Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
