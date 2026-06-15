'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchActiveSchools, verifyUserLogin, updateUserLastLogin } from './actions';

type Step = 'school' | 'role' | 'credentials';
type Role = 'principal' | 'teacher' | 'parent';

interface School {
  id: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  logo_url: string | null;
}

export default function LoginPage() {
  const supabase = createClient();

  const [step, setStep] = useState<Step>('school');
  const [schools, setSchools] = useState<School[]>([]);
  const [filteredSchools, setFilteredSchools] = useState<School[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchSchools() {
      const data = await fetchActiveSchools();
      if (data) { setSchools(data); setFilteredSchools(data); }
    }
    fetchSchools();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim() === '') { setFilteredSchools(schools); }
      else {
        const q = searchQuery.toLowerCase();
        setFilteredSchools(schools.filter(s =>
          s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.city && s.city.toLowerCase().includes(q))
        ));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, schools]);

  const handleSchoolSelect = useCallback((school: School) => { setSelectedSchool(school); setStep('role'); setError(''); }, []);
  const handleRoleSelect = useCallback((role: Role) => { setSelectedRole(role); setStep('credentials'); setError(''); }, []);
  const handleBack = useCallback(() => {
    setError('');
    if (step === 'role') { setStep('school'); setSelectedSchool(null); }
    else if (step === 'credentials') { setStep('role'); setSelectedRole(null); setUsername(''); setPassword(''); setPhone(''); setPin(''); }
  }, [step]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool || !selectedRole) return;
    setLoading(true); setError('');
    try {
      let loginEmail: string;
      let loginPassword: string;
      if (selectedRole === 'parent') {
        loginEmail = phone.includes('@') ? phone : `${phone}@parent.schoolerp.local`;
        loginPassword = pin;
      } else {
        // Username format: firstname.empid@SCHOOLCODE (e.g. srl.t005@NXTS)
        // Auth email stored as: firstname.empid.SCHOOLCODE@schoolerp.local
        // Replace the @ in username with . to avoid double-@ then append domain
        loginEmail = `${username.replace('@', '.')}@schoolerp.local`;
        loginPassword = password;
      }
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (authError) {
        setError('Invalid credentials. Please check your username/phone and password/PIN.');
        setLoading(false);
        return;
      }
      if (authData.user) {
        let userData = null;
        // Retry up to 2 times to handle server action cold-start failures
        for (let attempt = 0; attempt < 2; attempt++) {
          userData = await verifyUserLogin(authData.user.id);
          if (userData) break;
          await new Promise(r => setTimeout(r, 500)); // wait 500ms before retry
        }
        if (!userData || userData.school_id !== selectedSchool.id || userData.role !== selectedRole) {
          await supabase.auth.signOut();
          setError('Access denied. Your account does not belong to this school or role.');
          setLoading(false);
          return;
        }
        if (!userData.is_active) {
          await supabase.auth.signOut();
          setError('Your account has been deactivated. Please contact your school administrator.');
          setLoading(false);
          return;
        }
        await updateUserLastLogin(authData.user.id);
        // Use hard navigation so the browser re-sends all cookies (including the
        // newly-set Supabase auth cookie) to the server, preventing the middleware
        // race condition that caused "unexpected response" on soft router.push.
        if (userData.is_first_login) {
          window.location.href = '/change-password';
        } else {
          window.location.href = `/${userData.role}/dashboard`;
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    }
    setLoading(false);
  };

  const stepIndex = step === 'school' ? 0 : step === 'role' ? 1 : 2;
  const roleColors: Record<Role, string> = { principal: '#3B82F6', teacher: '#14B8A6', parent: '#A855F7' };

  return (
    <div className="login-page">
      {/* Background */}
      <div className="landing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="grid-overlay" />
      </div>

      {/* Left Branding */}
      <div className="login-branding">
        <div className="login-brand-inner">
          <div className="logo-group" style={{ marginBottom: 32 }}>
            <div className="logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="logo-text">NxtStepEdu</span>
          </div>
          <h2 className="login-brand-title">
            Welcome back to your<br />
            <span className="gradient-text">School Portal</span>
          </h2>
          <p className="login-brand-desc">
            Manage your school operations efficiently. Track attendance, grades, fees, and communicate with parents — all in one place.
          </p>
          <div className="login-brand-features">
            {[
              { icon: '🔒', text: 'Secure, encrypted access for all users' },
              { icon: '📱', text: 'Access from any device, anywhere' },
              { icon: '⚡', text: 'Real-time updates and notifications' },
            ].map((item, i) => (
              <div key={i} className="brand-feature-item">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Form */}
      <div className="login-form-side">
        <div className="login-card animate-scale-in">
          {/* Step Indicator */}
          <div className="step-indicator">
            {(['school', 'role', 'credentials'] as Step[]).map((s, i) => (
              <div key={s} className="step-row">
                <div className={`step-circle ${stepIndex >= i ? 'step-active' : ''}`}>
                  {stepIndex > i ? '✓' : i + 1}
                </div>
                {i < 2 && <div className={`step-line ${stepIndex > i ? 'step-line-active' : ''}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: School */}
          {step === 'school' && (
            <div className="animate-fade-in">
              <h2 className="login-title">Select Your School</h2>
              <p className="login-desc">Choose your school to continue</p>
              <div className="search-box">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input id="school-search" type="text" placeholder="Search by name, code, or city..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
              </div>
              <div className="school-list">
                {filteredSchools.length === 0 ? (
                  <div className="empty-msg"><p>🏫</p><p>No schools found</p></div>
                ) : (
                  filteredSchools.map((school) => (
                    <button key={school.id} id={`school-${school.code}`} onClick={() => handleSchoolSelect(school)} className="school-item">
                      <div className="school-avatar">{school.logo_url ? <img src={school.logo_url} alt={school.name} /> : school.name.charAt(0)}</div>
                      <div className="school-info">
                        <p className="school-name">{school.name}</p>
                        <p className="school-meta">{[school.city, school.state].filter(Boolean).join(', ')} <span className="school-code">{school.code}</span></p>
                      </div>
                      <svg className="school-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Role */}
          {step === 'role' && selectedSchool && (
            <div className="animate-fade-in">
              <button onClick={handleBack} className="back-btn">← Back</button>
              <h2 className="login-title">Select Your Role</h2>
              <p className="login-desc">Logging into <span style={{ color: '#60A5FA', fontWeight: 600 }}>{selectedSchool.name}</span></p>
              <div className="role-list">
                {[
                  { role: 'principal' as Role, icon: '🏫', label: 'Principal', desc: 'School management & administration', color: '#3B82F6' },
                  { role: 'teacher' as Role, icon: '👨‍🏫', label: 'Teacher', desc: 'Attendance, assignments & grades', color: '#14B8A6' },
                  { role: 'parent' as Role, icon: '👨‍👩‍👧', label: 'Parent', desc: "View child's progress & communicate", color: '#A855F7' },
                ].map((item) => (
                  <button key={item.role} id={`role-${item.role}`} onClick={() => handleRoleSelect(item.role)} className="role-item" style={{ '--role-color': item.color } as React.CSSProperties}>
                    <div className="role-icon-wrap" style={{ background: `${item.color}15`, color: item.color }}><span className="role-emoji">{item.icon}</span></div>
                    <div className="role-info"><p className="role-label">{item.label}</p><p className="role-desc">{item.desc}</p></div>
                    <svg className="school-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Credentials */}
          {step === 'credentials' && selectedSchool && selectedRole && (
            <div className="animate-fade-in">
              <button onClick={handleBack} className="back-btn">← Back</button>
              <h2 className="login-title">{selectedRole === 'parent' ? 'Parent Login' : `${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Login`}</h2>
              <p className="login-desc"><span style={{ color: roleColors[selectedRole], fontWeight: 600 }}>{selectedSchool.name}</span></p>

              {error && (<div className="login-error">{error}</div>)}

              <form onSubmit={handleLogin} className="login-form">
                {selectedRole === 'parent' ? (
                  <>
                    <div className="form-group">
                      <label htmlFor="phone">Mobile Number</label>
                      <input id="phone" type="tel" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} maxLength={10} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="pin">PIN</label>
                      <input id="pin" type="password" placeholder="6-digit PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="form-input" required />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="username">Username</label>
                      <input id="username" type="text" placeholder={selectedRole === 'principal' ? `principal@${selectedSchool.code}` : `name.empid@${selectedSchool.code}`} value={username} onChange={(e) => setUsername(e.target.value)} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="password">Password</label>
                      <input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-input" required />
                    </div>
                  </>
                )}

                <button id="login-submit" type="submit" disabled={loading} className="login-submit-btn" style={{ background: loading ? '#475569' : `linear-gradient(135deg, ${roleColors[selectedRole]}, ${roleColors[selectedRole]}dd)` }}>
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Signing in...
                    </span>
                  ) : 'Sign In →'}
                </button>

                <p className="login-forgot">Forgot your password? Contact your school administrator.</p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
