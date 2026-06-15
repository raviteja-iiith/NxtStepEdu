'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface School {
  id: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  subscription_plan: string;
  subscription_end: string | null;
  created_at: string;
}

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

  // Create school form state
  const [form, setForm] = useState({
    name: '', code: '', address: '', city: '', state: '', pincode: '',
    phone: '', email: '', subscription_plan: 'basic',
    subscription_start: new Date().toISOString().split('T')[0],
    subscription_end: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSchools = useCallback(async () => {
    let query = supabase
      .from('schools')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (statusFilter === 'active') query = query.eq('is_active', true);
    if (statusFilter === 'paused') query = query.eq('is_active', false);
    if (planFilter !== 'all') query = query.eq('subscription_plan', planFilter);

    const { data } = await query;
    if (data) setSchools(data);
    setLoading(false);
  }, [supabase, statusFilter, planFilter]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  const filteredSchools = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    if (!form.name || !form.code) {
      setFormError('School name and code are required.');
      setSaving(false);
      return;
    }

    if (form.code.length < 4 || form.code.length > 8 || !/^[a-z0-9]+$/.test(form.code)) {
      setFormError('Code must be 4-8 lowercase alphanumeric characters.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('schools').insert({
      name: form.name,
      code: form.code,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      pincode: form.pincode || null,
      phone: form.phone || null,
      email: form.email || null,
      subscription_plan: form.subscription_plan,
      subscription_start: form.subscription_start || null,
      subscription_end: form.subscription_end || null,
    });

    if (error) {
      setFormError(error.message.includes('unique') ? 'School code already exists. Choose a different code.' : error.message);
    } else {
      setShowCreateModal(false);
      setForm({ name: '', code: '', address: '', city: '', state: '', pincode: '', phone: '', email: '', subscription_plan: 'basic', subscription_start: new Date().toISOString().split('T')[0], subscription_end: '' });
      fetchSchools();
    }
    setSaving(false);
  };

  const handlePauseResume = async (schoolId: string, pause: boolean) => {
    if (pause && !pauseReason.trim()) return;

    await supabase
      .from('schools')
      .update({ is_active: !pause })
      .eq('id', schoolId);

    setShowPauseModal(null);
    setPauseReason('');
    fetchSchools();
  };

  const suggestCode = (name: string) => {
    const code = name.split(' ').filter(w => w.length > 0).map(w => w[0].toLowerCase()).join('').slice(0, 8);
    setForm(f => ({ ...f, code }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">School Management</h2>
          <p className="text-gray-500 text-sm mt-1">{schools.length} schools registered</p>
        </div>
        <button
          id="create-school-btn"
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg hover:-translate-y-0.5"
          style={{ background: '#1E40AF' }}
        >
          + Add School
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            id="school-search"
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ borderColor: '#E2E8F0' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'paused')}
          className="px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: '#E2E8F0' }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: '#E2E8F0' }}
        >
          <option value="all">All Plans</option>
          <option value="basic">Basic</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">School</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">City</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry</th>
                <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-6 py-4"><div className="skeleton h-6 rounded" /></td>
                  </tr>
                ))
              ) : filteredSchools.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    <p className="text-3xl mb-2">🏫</p>
                    <p className="text-sm">No schools found. Create your first school!</p>
                  </td>
                </tr>
              ) : (
                filteredSchools.map((school) => (
                  <tr key={school.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0" style={{ background: '#EFF6FF', color: '#1E40AF' }}>
                          {school.name.charAt(0)}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{school.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs px-2 py-1 rounded" style={{ background: '#F1F5F9', color: '#475569', fontFamily: 'var(--font-mono)' }}>
                        {school.code}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{school.city || '—'}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{
                        background: school.subscription_plan === 'premium' ? '#F5F3FF' : school.subscription_plan === 'standard' ? '#FFF7ED' : '#F1F5F9',
                        color: school.subscription_plan === 'premium' ? '#7C3AED' : school.subscription_plan === 'standard' ? '#EA580C' : '#64748B',
                      }}>
                        {school.subscription_plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{
                        background: school.is_active ? '#F0FDF4' : '#FEF2F2',
                        color: school.is_active ? '#16A34A' : '#DC2626',
                      }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: school.is_active ? '#16A34A' : '#DC2626' }} />
                        {school.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {school.subscription_end ? new Date(school.subscription_end).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {school.is_active ? (
                          <button
                            onClick={() => setShowPauseModal(school.id)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-50 text-red-600"
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePauseResume(school.id, false)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-green-50 text-green-600"
                          >
                            Resume
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create School Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Add New School</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); suggestCode(e.target.value); }}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#E2E8F0' }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School Code * <span className="text-gray-400">(4-8 chars, lowercase)</span></label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  style={{ borderColor: '#E2E8F0' }}
                  required
                  minLength={4}
                  maxLength={8}
                />
                <p className="text-xs text-gray-400 mt-1">⚠️ Cannot be changed after creation. Used in all usernames.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text" value={form.city}
                    onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text" value={form.state}
                    onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel" value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email" value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                <select
                  value={form.subscription_plan}
                  onChange={(e) => setForm(f => ({ ...f, subscription_plan: e.target.value }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#E2E8F0' }}
                >
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Start</label>
                  <input
                    type="date" value={form.subscription_start}
                    onChange={(e) => setForm(f => ({ ...f, subscription_start: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subscription End</label>
                  <input
                    type="date" value={form.subscription_end}
                    onChange={(e) => setForm(f => ({ ...f, subscription_end: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ borderColor: '#E2E8F0' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:shadow-lg"
                  style={{ background: '#1E40AF' }}
                >
                  {saving ? 'Creating...' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Pause School Access</h3>
            <p className="text-sm text-gray-500 mb-4">
              All users of this school will immediately lose access. This action is reversible.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
              <textarea
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                style={{ borderColor: '#E2E8F0' }}
                rows={3}
                placeholder="Enter reason for pausing..."
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPauseModal(null); setPauseReason(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50"
                style={{ borderColor: '#E2E8F0' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handlePauseResume(showPauseModal, true)}
                disabled={!pauseReason.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                style={{ background: '#DC2626' }}
              >
                Pause School
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
