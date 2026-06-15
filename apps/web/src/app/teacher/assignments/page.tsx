'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

import { getTeacherAssignments, getTeacherSubjectsAndSections, createAssignment } from '@school-erp/supabase/queries';
import { getUserProfile } from '@school-erp/supabase/queries';

interface Assignment { id: string; title: string; description: string | null; deadline: string; max_marks: number | null; is_published: boolean; subject_name?: string; section_name?: string; }

export default function AssignmentsPage() {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', subject_id: '', section_id: '', deadline: '', max_marks: '', is_published: true });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    
    const data = await getTeacherAssignments(supabase, userId);
    if (data) setAssignments(data.map((a: Record<string, unknown>) => ({ ...a, subject_name: (a.subjects as Record<string, string>)?.name, section_name: (a.sections as Record<string, string>)?.name })) as Assignment[]);

    const assgn = await getTeacherSubjectsAndSections(supabase, userId);
    if (assgn) {
      const secMap = new Map<string, { id: string; name: string; class_name: string }>();
      const subMap = new Map<string, { id: string; name: string }>();
      assgn.forEach((a: Record<string, unknown>) => {
        const sec = a.sections as Record<string, unknown>;
        const sub = a.subjects as Record<string, string>;
        if (sec) secMap.set(sec.id as string, { id: sec.id as string, name: sec.name as string, class_name: (sec.classes as Record<string, string>)?.name || '' });
        if (sub) subMap.set(sub.id as string, { id: sub.id as string, name: sub.name as string });
      });
      setSections(Array.from(secMap.values()));
      setSubjects(Array.from(subMap.values()));
    }
    setLoading(false);
  }, []); // supabase client is stable, don't include in deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!form.title || !form.subject_id || !form.section_id || !form.deadline) return;
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    
    const userData = await getUserProfile(supabase, userId);
    
    await createAssignment(supabase, {
      title: form.title, description: form.description || null, subject_id: form.subject_id, section_id: form.section_id,
      deadline: form.deadline, max_marks: form.max_marks ? parseInt(form.max_marks) : null, is_published: form.is_published,
      teacher_id: userId, school_id: userData?.school_id,
    });
    
    setShowAdd(false); setForm({ title: '', description: '', subject_id: '', section_id: '', deadline: '', max_marks: '', is_published: true });
    fetchAll(); setSaving(false);
  };

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Assignments</h2><p className="text-gray-500 text-sm mt-1">Create and grade assignments</p></div>
        <button onClick={() => setShowAdd(true)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#0F766E' }}>+ Create Assignment</button>
      </div>
      <div className="space-y-4">
        {loading ? [1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />) :
          assignments.length === 0 ? <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}><p className="text-3xl mb-2">📝</p><p className="text-gray-400">No assignments yet</p></div> :
          assignments.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all" style={{ borderColor: '#E2E8F0' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: a.is_published ? '#F0FDF4' : '#FFFBEB', color: a.is_published ? '#16A34A' : '#D97706' }}>{a.is_published ? 'Published' : 'Draft'}</span>
                    <span className="text-xs text-gray-400">{a.subject_name} • {a.section_name}</span>
                  </div>
                  <h3 className="font-bold text-gray-900">{a.title}</h3>
                  {a.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.description}</p>}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-gray-400">Deadline</p>
                  <p className="text-sm font-bold" style={{ color: new Date(a.deadline) < new Date() ? '#DC2626' : '#1E40AF' }}>{new Date(a.deadline).toLocaleDateString('en-IN')}</p>
                  {a.max_marks && <p className="text-xs text-gray-400 mt-1">{a.max_marks} marks</p>}
                </div>
              </div>
            </div>
          ))}
      </div>
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Create Assignment</h3><button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls + ' resize-none'} rows={3} style={{ borderColor: '#E2E8F0' }} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label><select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Section *</label><select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Deadline *</label><input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Marks</label><input type="number" value={form.max_marks} onChange={e => setForm(f => ({ ...f, max_marks: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div className="flex items-center gap-2"><input type="checkbox" id="pub" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} /><label htmlFor="pub" className="text-sm text-gray-700">Publish immediately</label></div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0F766E' }}>{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
