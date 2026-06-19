'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface School {
  id: string; name: string; code: string; city: string | null; state: string | null;
  phone: string | null; email: string | null; is_active: boolean;
  subscription_plan: string; subscription_end: string | null; created_at: string;
}

const planColors: Record<string, { bg: string; color: string }> = {
  premium: { bg: '#F5F3FF', color: '#7C3AED' },
  standard: { bg: '#FFF7ED', color: '#EA580C' },
  basic: { bg: '#F1F5F9', color: '#64748B' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0',
  borderRadius: 10, fontSize: 13, outline: 'none', background: 'white',
  boxSizing: 'border-box' as const,
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5,
};

export default function SchoolsPage() {
  const supabase = createClient();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [form, setForm] = useState({
    name: '', code: '', address: '', city: '', state: '', pincode: '',
    phone: '', email: '', subscription_plan: 'basic',
    subscription_start: new Date().toISOString().split('T')[0], subscription_end: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('schools').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (statusFilter === 'active') query = query.eq('is_active', true);
    if (statusFilter === 'paused') query = query.eq('is_active', false);
    if (planFilter !== 'all') query = query.eq('subscription_plan', planFilter);
    const { data } = await query;
    if (data) setSchools(data);
    setLoading(false);
  }, [supabase, statusFilter, planFilter]);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = schools.filter(s => s.is_active).length;
  const pausedCount = schools.filter(s => !s.is_active).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setSaving(true);
    if (!form.name || !form.code) { setFormError('School name and code are required.'); setSaving(false); return; }
    if (form.code.length < 4 || form.code.length > 8 || !/^[a-z0-9]+$/.test(form.code)) {
      setFormError('Code must be 4-8 lowercase alphanumeric characters.'); setSaving(false); return;
    }
    const { error } = await supabase.from('schools').insert({
      name: form.name, code: form.code, address: form.address || null, city: form.city || null,
      state: form.state || null, pincode: form.pincode || null, phone: form.phone || null,
      email: form.email || null, subscription_plan: form.subscription_plan,
      subscription_start: form.subscription_start || null, subscription_end: form.subscription_end || null,
    });
    if (error) {
      setFormError(error.message.includes('unique') ? 'School code already exists.' : error.message);
    } else {
      setShowCreateModal(false);
      setForm({ name: '', code: '', address: '', city: '', state: '', pincode: '', phone: '', email: '', subscription_plan: 'basic', subscription_start: new Date().toISOString().split('T')[0], subscription_end: '' });
      fetchSchools();
    }
    setSaving(false);
  };

  const handlePauseResume = async (schoolId: string, pause: boolean) => {
    if (pause && !pauseReason.trim()) return;
    await supabase.from('schools').update({ is_active: !pause }).eq('id', schoolId);
    setShowPauseModal(null); setPauseReason(''); fetchSchools();
  };

  const suggestCode = (name: string) => {
    const code = name.split(' ').filter(w => w.length > 0).map(w => w[0].toLowerCase()).join('').slice(0, 8);
    setForm(f => ({ ...f, code }));
  };

  return (
    <div className="dashboard-container">

      {/* Header */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>School Management</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Manage and monitor all registered schools</p>
        </div>
        <button
          id="create-school-btn"
          onClick={() => setShowCreateModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)', whiteSpace: 'nowrap' }}
        >
          <span style={{ fontSize: 16 }}>+</span> Add School
        </button>
      </div>

      {/* Stat Cards */}
      <div className="three-col-stats">
        {[
          { label: 'Total Schools', value: schools.length, color: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE' },
          { label: 'Active', value: activeCount, color: '#16A34A', bg: '#F0FDF4', border: '#DCFCE7' },
          { label: 'Paused', value: pausedCount, color: '#DC2626', bg: '#FEF2F2', border: '#FEE2E2' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: '6px 0 0', letterSpacing: '-0.02em' }}>
              {loading ? <span style={{ display: 'inline-block', width: 32, height: 28, background: 'rgba(0,0,0,0.08)', borderRadius: 6 }} /> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            id="school-search" type="text" placeholder="Search by name or code..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>
        {(['all', 'active', 'paused'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s',
              borderColor: statusFilter === s ? '#3B82F6' : '#E2E8F0',
              background: statusFilter === s ? '#EFF6FF' : 'white',
              color: statusFilter === s ? '#1D4ED8' : '#64748B',
            }}>
            {s === 'all' ? 'All Status' : s}
          </button>
        ))}
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
          style={{ padding: '9px 14px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 12, fontWeight: 600, color: '#475569', background: 'white', cursor: 'pointer', outline: 'none' }}>
          <option value="all">All Plans</option>
          <option value="basic">Basic</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Table Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 120px 110px 100px 130px 120px', padding: '12px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
          {['School', 'Code', 'City', 'Plan', 'Status', 'Expiry', 'Actions'].map((h, i) => (
            <p key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, textAlign: i === 6 ? 'right' : 'left' }}>{h}</p>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 44, background: '#F8FAFC', borderRadius: 8 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 24 }}>🏫</div>
            <p style={{ fontWeight: 700, color: '#1E293B', fontSize: 15, margin: 0 }}>No schools yet</p>
            <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Click <strong>+ Add School</strong> to onboard your first school</p>
          </div>
        ) : (
          filtered.map((school, idx) => (
            <div key={school.id}
              style={{ display: 'grid', gridTemplateColumns: '2fr 100px 120px 110px 100px 130px 120px', padding: '14px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center' }}>
              {/* School */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EFF6FF', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                  {school.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', margin: 0 }}>{school.name}</p>
                  {school.email && <p style={{ fontSize: 11, color: '#94A3B8', margin: '1px 0 0' }}>{school.email}</p>}
                </div>
              </div>
              {/* Code */}
              <code style={{ fontSize: 11, padding: '3px 8px', background: '#F1F5F9', color: '#475569', borderRadius: 6, fontFamily: 'monospace' }}>{school.code}</code>
              {/* City */}
              <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>{school.city || '—'}</p>
              {/* Plan */}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, display: 'inline-block', textTransform: 'capitalize', ...(planColors[school.subscription_plan] || planColors.basic) }}>
                {school.subscription_plan}
              </span>
              {/* Status */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: school.is_active ? '#F0FDF4' : '#FEF2F2', color: school.is_active ? '#16A34A' : '#DC2626' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: school.is_active ? '#16A34A' : '#DC2626', flexShrink: 0 }} />
                {school.is_active ? 'Active' : 'Paused'}
              </span>
              {/* Expiry */}
              <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                {school.subscription_end ? new Date(school.subscription_end).toLocaleDateString('en-IN') : '—'}
              </p>
              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {school.is_active ? (
                  <button onClick={() => setShowPauseModal(school.id)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
                    Pause
                  </button>
                ) : (
                  <button onClick={() => handlePauseResume(school.id, false)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1px solid #DCFCE7', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer' }}>
                    Resume
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create School Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 520, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Header */}
            <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>Add New School</h3>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Fill in the details to onboard a new school</p>
              </div>
              <button onClick={() => setShowCreateModal(false)}
                style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
              {formError && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>{formError}</div>
              )}
              <form id="create-school-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>School Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input type="text" value={form.name} style={inputStyle}
                    onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); suggestCode(e.target.value); }} required />
                </div>
                <div>
                  <label style={labelStyle}>School Code <span style={{ color: '#EF4444' }}>*</span> <span style={{ color: '#94A3B8', fontWeight: 400 }}>(4-8 chars, lowercase a-z 0-9)</span></label>
                  <input type="text" value={form.code} style={{ ...inputStyle, fontFamily: 'monospace' }}
                    onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) }))}
                    required minLength={4} maxLength={8} />
                  <p style={{ fontSize: 11, color: '#F59E0B', marginTop: 5 }}>⚠ Cannot be changed after creation. Used in all usernames.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>City</label>
                    <input type="text" value={form.city} style={inputStyle} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>State</label>
                    <input type="text" value={form.state} style={inputStyle} onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input type="tel" value={form.phone} style={inputStyle} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={form.email} style={inputStyle} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Subscription Plan</label>
                  <select value={form.subscription_plan} style={{ ...inputStyle, cursor: 'pointer' }} onChange={(e) => setForm(f => ({ ...f, subscription_plan: e.target.value }))}>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={form.subscription_start} style={inputStyle} onChange={(e) => setForm(f => ({ ...f, subscription_start: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" value={form.subscription_end} style={inputStyle} onChange={(e) => setForm(f => ({ ...f, subscription_end: e.target.value }))} />
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 28px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button type="button" onClick={() => setShowCreateModal(false)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" form="create-school-form" disabled={saving}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: saving ? '#93C5FD' : 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}>
                {saving ? 'Creating...' : 'Create School'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {showPauseModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 20 }}>⏸</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Pause School Access</h3>
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>All users will immediately lose access. This is reversible.</p>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <label style={labelStyle}>Reason for pausing <span style={{ color: '#EF4444' }}>*</span></label>
              <textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)}
                rows={3} placeholder="Enter reason..."
                style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }} />
            </div>
            <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowPauseModal(null); setPauseReason(''); }}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handlePauseResume(showPauseModal, true)} disabled={!pauseReason.trim()}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: !pauseReason.trim() ? '#FCA5A5' : '#DC2626', color: 'white', fontSize: 13, fontWeight: 700, cursor: !pauseReason.trim() ? 'not-allowed' : 'pointer' }}>
                Pause School
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
