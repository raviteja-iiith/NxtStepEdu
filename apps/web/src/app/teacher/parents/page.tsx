'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ParentRecord { id: string; full_name: string; phone: string | null; is_active: boolean; student_name: string; section_name: string; }

export default function TeacherParentsPage() {
  const supabase = createClient();
  const [parents, setParents] = useState<ParentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [students, setStudents] = useState<{ id: string; full_name: string; section_name: string }[]>([]);
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showCreds, setShowCreds] = useState<{ phone: string; pin: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const fetchParentsAndStudents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    // Get sections this teacher is assigned to
    const { data: assignments } = await supabase
      .from('teacher_section_assignments')
      .select('section_id')
      .eq('teacher_id', userId);

    const sectionIds = [...new Set((assignments || []).map((a: any) => a.section_id))];
    if (sectionIds.length === 0) { setLoading(false); return; }

    // Get all students in these sections
    const { data: studentData } = await supabase
      .from('students')
      .select('id, full_name, sections(name)')
      .in('section_id', sectionIds)
      .eq('is_active', true)
      .order('full_name');

    if (studentData) {
      setStudents(studentData.map((s: any) => ({ id: s.id, full_name: s.full_name, section_name: s.sections?.name || '' })));
    }

    const studentIds = (studentData || []).map((s: any) => s.id);
    if (studentIds.length === 0) { setLoading(false); return; }

    // Get parents linked to those students
    const { data: links } = await supabase
      .from('student_parent_links')
      .select('parent_id, students(full_name, sections(name)), users(id, full_name, phone, is_active)')
      .in('student_id', studentIds);

    if (links) {
      const seen = new Set<string>();
      const list: ParentRecord[] = [];
      links.forEach((l: any) => {
        if (!l.parent_id || seen.has(l.parent_id)) return;
        seen.add(l.parent_id);
        list.push({
          id: l.parent_id,
          full_name: l.users?.full_name || 'Unknown',
          phone: l.users?.phone || null,
          is_active: l.users?.is_active ?? true,
          student_name: l.students?.full_name || '',
          section_name: l.students?.sections?.name || '',
        });
      });
      setParents(list);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchParentsAndStudents(); }, [fetchParentsAndStudents]);

  const handleAddParent = async () => {
    if (!form.full_name || !form.phone || !selectedStudentId) { setFormError('All fields are required'); return; }
    if (form.phone.length !== 10) { setFormError('Phone must be 10 digits'); return; }
    setSaving(true); setFormError('');

    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${form.phone}@parent.schoolerp.local`,
          password: pin,
          role: 'parent',
          full_name: form.full_name,
          phone: form.phone,
          username: form.phone,
          school_id: userData?.school_id,
        }),
      });
      const result = await res.json();
      if (!res.ok) { setFormError(result.error || 'Failed to create parent'); setSaving(false); return; }

      // Link parent to student
      await supabase.from('student_parent_links').insert({
        parent_id: result.userId,
        student_id: selectedStudentId,
        school_id: userData?.school_id,
        relationship: 'parent',
      });

      setShowAddModal(false);
      setShowCreds({ phone: form.phone, pin, name: form.full_name });
      setForm({ full_name: '', phone: '' });
      setSelectedStudentId('');
      fetchParentsAndStudents();
    } catch { setFormError('Network error. Please try again.'); }
    setSaving(false);
  };

  const filtered = parents.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').includes(search) ||
    p.student_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Parent Management</h2>
          <p className="text-gray-500 text-sm mt-1">Parents of your students ({parents.length} total)</p>
        </div>
        <button onClick={() => { setShowAddModal(true); setFormError(''); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg transition-all" style={{ background: '#0F766E' }}>
          + Add Parent
        </button>
      </div>

      <div className="flex-1 relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input type="text" placeholder="Search by name, phone or student..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: '#E2E8F0' }} />
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? (
          <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
        ) : (
          <table className="w-full">
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Parent</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Phone (Login)</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Child</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr></thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                  <p className="text-3xl mb-2">👨‍👩‍👧</p>
                  <p className="text-sm">No parents found for your sections.</p>
                </td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#F5F3FF', color: '#7C3AED' }}>{p.full_name.charAt(0)}</div>
                      <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-gray-600">{p.phone || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.student_name} {p.section_name && <span className="text-xs text-gray-400">(Sec {p.section_name})</span>}</td>
                  <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: p.is_active ? '#F0FDF4' : '#FEF2F2', color: p.is_active ? '#16A34A' : '#DC2626' }}>{p.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Add Parent Account</h3><button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Select Student *</label>
                <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" style={{ borderColor: '#E2E8F0' }}>
                  <option value="">Choose student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name} (Sec {s.section_name})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Parent Name *</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" style={{ borderColor: '#E2E8F0' }} placeholder="Full name" />
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone Number * <span className="text-gray-400">(10 digits — used as login)</span></label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} maxLength={10} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" style={{ borderColor: '#E2E8F0' }} placeholder="9876543210" />
              </div>
              <div className="p-3 rounded-lg text-xs text-teal-700" style={{ background: '#F0FDF4' }}>A 6-digit PIN will be auto-generated for this parent to log in with.</div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleAddParent} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#0F766E' }}>{saving ? 'Creating...' : 'Create Parent'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 animate-scale-in text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Parent Account Created!</h3>
            <p className="text-gray-500 text-sm mb-6">{showCreds.name}</p>
            <div className="p-4 rounded-xl space-y-3 mb-4" style={{ background: '#F1F5F9' }}>
              <div><p className="text-xs text-gray-500">Phone (Login)</p><p className="font-mono font-bold text-gray-900">{showCreds.phone}</p></div>
              <div><p className="text-xs text-gray-500">6-digit PIN</p><p className="font-mono font-bold text-gray-900 text-xl tracking-widest">{showCreds.pin}</p></div>
            </div>
            <p className="text-xs text-gray-400 mb-4">Parent will be asked to change PIN on first login</p>
            <button onClick={() => setShowCreds(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#0F766E' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
