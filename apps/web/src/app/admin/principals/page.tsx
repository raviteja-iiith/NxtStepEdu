'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Principal {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  last_login_at: string | null;
  school: { id: string; name: string; code: string } | null;
}

interface School {
  id: string;
  name: string;
  code: string;
}

export default function PrincipalsPage() {
  const supabase = createClient();
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState<{ username: string; password: string; name: string; school: string } | null>(null);

  const [form, setForm] = useState({
    school_id: '', full_name: '', phone: '', email: '', employee_id: '', qualification: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: principalUsers } = await supabase
      .from('users')
      .select('id, full_name, phone, email, is_active, last_login_at, school_id')
      .eq('role', 'principal')
      .order('created_at', { ascending: false });

    const { data: allSchools } = await supabase
      .from('schools')
      .select('id, name, code')
      .eq('is_active', true)
      .is('deleted_at', null);

    if (allSchools) setSchools(allSchools as School[]);

    if (principalUsers && allSchools) {
      const mapped = (principalUsers as Record<string, unknown>[]).map((p) => ({
        ...p,
        school: (allSchools as School[]).find((s: School) => s.id === (p as Record<string, unknown>).school_id) || null,
      }));
      setPrincipals(mapped as Principal[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    const school = schools.find(s => s.id === form.school_id);
    if (!school) { setFormError('Select a school.'); setSaving(false); return; }

    const username = `principal@${school.code}`;
    const tempPassword = generatePassword();

    try {
      // Create auth user via API route (server-side)
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${username}@schoolerp.local`,
          password: tempPassword,
          role: 'principal',
          school_id: school.id,
          full_name: form.full_name,
          phone: form.phone,
          user_email: form.email,
          username,
          employee_id: form.employee_id,
          qualification: form.qualification,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setFormError(result.error || 'Failed to create principal.');
        setSaving(false);
        return;
      }

      setShowCreateModal(false);
      setShowCredentialsModal({
        username,
        password: tempPassword,
        name: form.full_name,
        school: school.name,
      });
      setForm({ school_id: '', full_name: '', phone: '', email: '', employee_id: '', qualification: '' });
      fetchData();
    } catch {
      setFormError('Failed to create principal. Please try again.');
    }

    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Principal Management</h2>
          <p className="text-gray-500 text-sm mt-1">{principals.length} principals registered</p>
        </div>
        <button
          id="create-principal-btn"
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg"
          style={{ background: '#1E40AF' }}
        >
          + Create Principal
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase">Name</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase">School</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase">Phone</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-6 py-4"><div className="skeleton h-6 rounded" /></td></tr>
              ))
            ) : principals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  <p className="text-3xl mb-2">👤</p>
                  <p className="text-sm">No principals yet. Create one for a school!</p>
                </td>
              </tr>
            ) : (
              principals.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: '#EFF6FF', color: '#1E40AF' }}>
                        {p.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                        <p className="text-xs text-gray-400">{p.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{p.school?.name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.phone || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{
                      background: p.is_active ? '#F0FDF4' : '#FEF2F2',
                      color: p.is_active ? '#16A34A' : '#DC2626',
                    }}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {p.last_login_at ? new Date(p.last_login_at).toLocaleDateString('en-IN') : 'Never'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Create Principal</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select School *</label>
                <select
                  value={form.school_id}
                  onChange={(e) => setForm(f => ({ ...f, school_id: e.target.value }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#E2E8F0' }}
                  required
                >
                  <option value="">Choose a school...</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                  <input type="text" value={form.employee_id} onChange={(e) => setForm(f => ({ ...f, employee_id: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qualification</label>
                  <input type="text" value={form.qualification} onChange={(e) => setForm(f => ({ ...f, qualification: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} />
                </div>
              </div>

              {form.school_id && (
                <div className="p-3 rounded-lg text-sm" style={{ background: '#EFF6FF', color: '#1E40AF' }}>
                  Username will be: <strong>principal@{schools.find(s => s.id === form.school_id)?.code}</strong>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#1E40AF' }}>{saving ? 'Creating...' : 'Create Principal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3" style={{ background: '#F0FDF4' }}>✅</div>
              <h3 className="text-xl font-bold text-gray-900">Principal Created!</h3>
              <p className="text-gray-500 text-sm mt-1">{showCredentialsModal.name} — {showCredentialsModal.school}</p>
            </div>

            <div className="p-4 rounded-xl border-2 border-dashed mb-6" style={{ borderColor: '#3B82F6', background: '#EFF6FF' }}>
              <p className="text-xs text-blue-600 font-semibold mb-3 uppercase">Login Credentials</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Username:</span>
                  <code className="text-sm font-bold" style={{ color: '#1E40AF', fontFamily: 'var(--font-mono)' }}>{showCredentialsModal.username}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Password:</span>
                  <code className="text-sm font-bold" style={{ color: '#DC2626', fontFamily: 'var(--font-mono)' }}>{showCredentialsModal.password}</code>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mb-4">
              ⚠️ Save these credentials securely. The password will be changed on first login.
            </p>

            <button
              onClick={() => setShowCredentialsModal(null)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg"
              style={{ background: '#1E40AF' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
