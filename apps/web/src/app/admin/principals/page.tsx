'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Principal {
  id: string; full_name: string; phone: string | null; email: string | null;
  is_active: boolean; last_login_at: string | null;
  school: { id: string; name: string; code: string } | null;
}
interface School { id: string; name: string; code: string; }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0',
  borderRadius: 10, fontSize: 13, outline: 'none', background: 'white',
  boxSizing: 'border-box' as const, fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5,
};

export default function PrincipalsPage() {
  const supabase = createClient();
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState<{ username: string; password: string; name: string; school: string } | null>(null);
  const [form, setForm] = useState({ school_id: '', full_name: '', phone: '', email: '', employee_id: '', qualification: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: principalUsers }, { data: allSchools }] = await Promise.all([
      supabase.from('users').select('id, full_name, phone, email, is_active, last_login_at, school_id').eq('role', 'principal').order('created_at', { ascending: false }),
      supabase.from('schools').select('id, name, code').eq('is_active', true).is('deleted_at', null),
    ]);
    if (allSchools) setSchools(allSchools as School[]);
    if (principalUsers && allSchools) {
      setPrincipals((principalUsers as Record<string, unknown>[]).map(p => ({
        ...p,
        school: (allSchools as School[]).find((s: School) => s.id === (p as Record<string, unknown>).school_id) || null,
      })) as Principal[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = principals.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.school?.name.toLowerCase().includes(search.toLowerCase()) || false
  );
  const activeCount = principals.filter(p => p.is_active).length;

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    const school = schools.find(s => s.id === form.school_id);
    if (!school) { setFormError('Select a school.'); setSaving(false); return; }
    const username = `principal@${school.code}`;
    const tempPassword = generatePassword();
    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${username}@schoolerp.local`, password: tempPassword, role: 'principal', school_id: school.id, full_name: form.full_name, phone: form.phone, user_email: form.email, username, employee_id: form.employee_id, qualification: form.qualification }),
      });
      const result = await res.json();
      if (!res.ok) { setFormError(result.error || 'Failed to create principal.'); setSaving(false); return; }
      setShowCreateModal(false);
      setShowCredentialsModal({ username, password: tempPassword, name: form.full_name, school: school.name });
      setForm({ school_id: '', full_name: '', phone: '', email: '', employee_id: '', qualification: '' });
      fetchData();
    } catch { setFormError('Failed to create principal. Please try again.'); }
    setSaving(false);
  };

  const selectedSchoolCode = schools.find(s => s.id === form.school_id)?.code;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Principal Management</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Create and manage principals across all schools</p>
        </div>
        <button id="create-principal-btn" onClick={() => setShowCreateModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 16 }}>+</span> Create Principal
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: 'Total Principals', value: principals.length, color: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE' },
          { label: 'Active', value: activeCount, color: '#16A34A', bg: '#F0FDF4', border: '#DCFCE7' },
          { label: 'Schools Covered', value: new Set(principals.map(p => p.school?.id).filter(Boolean)).size, color: '#7C3AED', bg: '#F5F3FF', border: '#EDE9FE' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: '6px 0 0', letterSpacing: '-0.02em' }}>
              {loading ? <span style={{ display: 'inline-block', width: 32, height: 28, background: 'rgba(0,0,0,0.08)', borderRadius: 6 }} /> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 360 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Search by name or school..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>

      {/* List */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Header Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 140px 100px 140px', padding: '12px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
          {['Name', 'School', 'Phone', 'Status', 'Last Login'].map(h => (
            <p key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{h}</p>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 52, background: '#F8FAFC', borderRadius: 8 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <p style={{ fontWeight: 700, color: '#1E293B', fontSize: 15, margin: 0 }}>No principals yet</p>
            <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Click <strong>+ Create Principal</strong> to assign one to a school</p>
          </div>
        ) : (
          filtered.map((p, idx) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 140px 100px 140px', padding: '14px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center' }}>
              {/* Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                  {p.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', margin: 0 }}>{p.full_name}</p>
                  {p.email && <p style={{ fontSize: 11, color: '#94A3B8', margin: '1px 0 0' }}>{p.email}</p>}
                </div>
              </div>
              {/* School */}
              <div>
                {p.school ? (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>{p.school.name}</p>
                    <code style={{ fontSize: 11, color: '#94A3B8', background: '#F1F5F9', padding: '1px 6px', borderRadius: 4 }}>{p.school.code}</code>
                  </>
                ) : <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>—</p>}
              </div>
              {/* Phone */}
              <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>{p.phone || '—'}</p>
              {/* Status */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: p.is_active ? '#F0FDF4' : '#FEF2F2', color: p.is_active ? '#16A34A' : '#DC2626', width: 'fit-content' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.is_active ? '#16A34A' : '#DC2626' }} />
                {p.is_active ? 'Active' : 'Inactive'}
              </span>
              {/* Last Login */}
              <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                {p.last_login_at ? new Date(p.last_login_at).toLocaleDateString('en-IN') : <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>Never</span>}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>Create Principal</h3>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Assign a principal to a school</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', color: '#64748B', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
              {formError && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>{formError}</div>}
              <form id="create-principal-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Select School <span style={{ color: '#EF4444' }}>*</span></label>
                  <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }} required>
                    <option value="">Choose a school...</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                {selectedSchoolCode && (
                  <div style={{ padding: '10px 14px', background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 9, fontSize: 13, color: '#1D4ED8' }}>
                    Login username will be: <strong>principal@{selectedSchoolCode}</strong>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Full Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input type="text" value={form.full_name} style={inputStyle} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Phone <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="tel" value={form.phone} style={inputStyle} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Email <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="email" value={form.email} style={inputStyle} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Employee ID</label>
                    <input type="text" value={form.employee_id} style={inputStyle} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Qualification</label>
                    <input type="text" value={form.qualification} style={inputStyle} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))} />
                  </div>
                </div>
              </form>
            </div>

            <div style={{ padding: '16px 28px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" form="create-principal-form" disabled={saving} style={{ flex: 1, padding: 11, borderRadius: 10, border: 'none', background: saving ? '#93C5FD' : 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}>
                {saving ? 'Creating...' : 'Create Principal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '28px 28px 20px', textAlign: 'center', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F0FDF4', border: '1px solid #DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 24 }}>✅</div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>Principal Created!</h3>
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 5 }}>{showCredentialsModal.name} · {showCredentialsModal.school}</p>
            </div>
            <div style={{ padding: '20px 28px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Login Credentials</p>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[{ label: 'Username', value: showCredentialsModal.username, color: '#1D4ED8' }, { label: 'Password', value: showCredentialsModal.password, color: '#DC2626' }].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#64748B' }}>{item.label}</span>
                    <code style={{ fontSize: 13, fontWeight: 700, color: item.color, background: 'white', border: '1px solid #E2E8F0', padding: '3px 10px', borderRadius: 7 }}>{item.value}</code>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#F59E0B', marginTop: 12, textAlign: 'center' }}>⚠ Save these credentials. Password will be changed on first login.</p>
            </div>
            <div style={{ padding: '0 28px 24px' }}>
              <button onClick={() => setShowCredentialsModal(null)} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
