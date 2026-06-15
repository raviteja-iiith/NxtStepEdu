'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Teacher {
  id: string; full_name: string; phone: string; email: string | null;
  is_active: boolean; last_login_at: string | null; username: string;
  profile?: { employee_id: string | null; qualification: string | null; specialization: string | null; joining_date: string | null; };
}

interface Section { id: string; name: string; class_name: string; }
interface Subject { id: string; name: string; class_id: string; }
interface Assignment { id: string; teacher_id: string; section_id: string; subject_id: string; }

export default function TeachersPage() {
  const supabase = createClient();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [showCreds, setShowCreds] = useState<{ username: string; password: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Add form
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', employee_id: '', qualification: '', specialization: '', joining_date: '' });

  // Assignment state
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    const { data: currentUser } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    if (!currentUser?.school_id) { setLoading(false); return; }
    const { data } = await supabase.from('users').select('id, full_name, phone, email, is_active, last_login_at, username, teacher_profiles(employee_id, qualification, specialization, joining_date)')
      .eq('role', 'teacher').eq('school_id', currentUser.school_id).order('full_name');
    if (data) setTeachers(data.map((t: Record<string, unknown>) => ({ ...t, profile: Array.isArray(t.teacher_profiles) ? t.teacher_profiles[0] : t.teacher_profiles })) as Teacher[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  const handleAddTeacher = async () => {
    if (!form.full_name || !form.phone) { setFormError('Name and phone required'); return; }
    setSaving(true); setFormError('');

    const empId = form.employee_id || `T${String(teachers.length + 1).padStart(3, '0')}`;
    const firstName = form.full_name.split(' ')[0].toLowerCase();

    // Get school code from school
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    let schoolCode = 'school';
    if (userData?.school_id) {
      const { data: school } = await supabase.from('schools').select('code').eq('id', userData.school_id).single();
      if (school) schoolCode = school.code;
    }

    const username = `${firstName}.${empId.toLowerCase()}@${schoolCode}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const password = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Convert username@SCHOOLCODE → username.SCHOOLCODE@schoolerp.local
          // e.g. srl.t005@NXTS → srl.t005.NXTS@schoolerp.local (single @ only)
          email: `${username.replace('@', '.')}@schoolerp.local`,
          password, role: 'teacher', full_name: form.full_name, phone: form.phone,
          username, school_id: userData?.school_id,
          profile_data: { employee_id: empId, qualification: form.qualification, specialization: form.specialization, joining_date: form.joining_date || null }
        })
      });
      const result = await res.json();
      if (!res.ok) { setFormError(result.error || 'Failed to create teacher'); setSaving(false); return; }

      setShowAdd(false);
      setShowCreds({ username, password });
      setForm({ full_name: '', phone: '', email: '', employee_id: '', qualification: '', specialization: '', joining_date: '' });
      fetchTeachers();
    } catch { setFormError('Network error'); }
    setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('users').update({ is_active: !current }).eq('id', id);
    fetchTeachers();
  };

  // Assignment modal
  const openAssign = async (teacherId: string) => {
    setShowAssign(teacherId);
    // Get the teacher's school_id to scope sections/subjects
    const { data: teacherUser } = await supabase.from('users').select('school_id').eq('id', teacherId).single();
    const schoolId = teacherUser?.school_id;
    if (!schoolId) return;
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', schoolId).maybeSingle();
    const { data: sec } = await supabase.from('sections').select('id, name, classes(name)').eq('school_id', schoolId);
    if (sec) setSections(sec.map((s: Record<string, unknown>) => ({ id: s.id as string, name: s.name as string, class_name: (s.classes as Record<string, string>)?.name || '' })));
    const { data: sub } = await supabase.from('subjects').select('id, name, class_id').eq('school_id', schoolId);
    if (sub) setSubjects(sub as Subject[]);
    const { data: asgn } = await supabase.from('teacher_section_assignments').select('*').eq('teacher_id', teacherId);
    if (asgn) setAssignments(asgn as Assignment[]);
  };

  const addAssignment = async () => {
    if (!selectedSection || !selectedSubject || !showAssign) return;
    // Get teacher's school_id for RLS compliance
    const { data: teacherUser } = await supabase.from('users').select('school_id').eq('id', showAssign).single();
    const schoolId = teacherUser?.school_id;
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    await supabase.from('teacher_section_assignments').insert({
      teacher_id: showAssign, section_id: selectedSection, subject_id: selectedSubject,
      academic_year_id: yr?.id, school_id: schoolId || null,
    });
    openAssign(showAssign);
    setSelectedSection(''); setSelectedSubject('');
  };

  const removeAssignment = async (id: string) => {
    await supabase.from('teacher_section_assignments').delete().eq('id', id);
    if (showAssign) openAssign(showAssign);
  };

  const filtered = teachers.filter(t => t.full_name.toLowerCase().includes(search.toLowerCase()) || t.username?.toLowerCase().includes(search.toLowerCase()));

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const btnPrimary = "px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg transition-all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Teacher Management</h2><p className="text-gray-500 text-sm mt-1">Manage teachers, assignments, and credentials</p></div>
        <button onClick={() => { setShowAdd(true); setFormError(''); }} className={btnPrimary} style={{ background: '#1E40AF' }}>+ Add Teacher</button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input type="text" placeholder="Search by name or username..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} /></div>
        <span className="text-sm text-gray-500">{filtered.length} teacher{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div> : (
          <table className="w-full">
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Teacher</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Employee ID</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Contact</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">👨‍🏫</p><p className="text-sm">No teachers found.</p></td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4"><p className="text-sm font-semibold text-gray-900">{t.full_name}</p><p className="text-xs text-gray-400 font-mono">{t.username}</p></td>
                  <td className="px-6 py-4"><code className="text-xs px-2 py-1 rounded" style={{ background: '#F1F5F9' }}>{t.profile?.employee_id || '—'}</code></td>
                  <td className="px-6 py-4"><p className="text-sm text-gray-600">{t.phone}</p>{t.email && <p className="text-xs text-gray-400">{t.email}</p>}</td>
                  <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: t.is_active ? '#F0FDF4' : '#FEF2F2', color: t.is_active ? '#16A34A' : '#DC2626' }}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => openAssign(t.id)} className="text-xs text-blue-600 hover:underline">Assign</button>
                    <button onClick={() => toggleActive(t.id, t.is_active)} className="text-xs hover:underline" style={{ color: t.is_active ? '#DC2626' : '#16A34A' }}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Teacher Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Add Teacher</h3><button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label><input placeholder="Auto-generated" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label><input type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Qualification</label><input value={form.qualification} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label><input value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleAddTeacher} disabled={saving} className={`flex-1 ${btnPrimary} disabled:opacity-50`} style={{ background: '#1E40AF' }}>{saving ? 'Creating...' : 'Create Teacher'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 animate-scale-in text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Teacher Created!</h3>
            <p className="text-gray-500 text-sm mb-6">Share these credentials with the teacher</p>
            <div className="p-4 rounded-xl space-y-3" style={{ background: '#F1F5F9' }}>
              <div><p className="text-xs text-gray-500">Username</p><p className="font-mono font-bold text-gray-900">{showCreds.username}</p></div>
              <div><p className="text-xs text-gray-500">Temporary Password</p><p className="font-mono font-bold text-gray-900">{showCreds.password}</p></div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Teacher will be asked to change password on first login</p>
            <button onClick={() => setShowCreds(null)} className={`w-full mt-6 ${btnPrimary}`} style={{ background: '#1E40AF' }}>Done</button>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 animate-scale-in max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Section & Subject Assignments</h3><button onClick={() => setShowAssign(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            <div className="space-y-3 mb-6">
              {assignments.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No assignments yet</p> :
                assignments.map(a => {
                  const sec = sections.find(s => s.id === a.section_id);
                  const sub = subjects.find(s => s.id === a.subject_id);
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#F8FAFC' }}>
                      <span className="text-sm"><strong>{sec?.class_name} - {sec?.name}</strong> → {sub?.name}</span>
                      <button onClick={() => removeAssignment(a.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  );
                })}
            </div>
            <div className="border-t pt-4 space-y-3" style={{ borderColor: '#E2E8F0' }}>
              <p className="text-sm font-medium text-gray-700">Add New Assignment</p>
              <div className="grid grid-cols-2 gap-3">
                <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className={inputCls} style={{ borderColor: '#E2E8F0' }}>
                  <option value="">Select section...</option>{sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
                </select>
                <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className={inputCls} style={{ borderColor: '#E2E8F0' }}>
                  <option value="">Select subject...</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button onClick={addAssignment} disabled={!selectedSection || !selectedSubject} className={`w-full ${btnPrimary} disabled:opacity-50`} style={{ background: '#1E40AF' }}>Add Assignment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
