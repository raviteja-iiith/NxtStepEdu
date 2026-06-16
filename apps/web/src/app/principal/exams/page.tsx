'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Exam { id: string; name: string; exam_type: string; exam_date: string; start_time: string | null; duration_minutes: number | null; total_marks: number; passing_marks: number | null; is_published: boolean; class_name?: string; subject_name?: string; }
interface ClassItem { id: string; name: string; }
interface Subject { id: string; name: string; class_id: string; }
interface Section { id: string; name: string; class_id: string; }

const EXAM_TYPES = [
  { value: 'unit_test', label: 'Unit Test' }, { value: 'mid_term', label: 'Mid Term' },
  { value: 'final', label: 'Final Exam' }, { value: 'practical', label: 'Practical' }, { value: 'internal', label: 'Internal' },
];

export default function ExamsPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [filterType, setFilterType] = useState('');

  const [form, setForm] = useState({ name: '', exam_type: 'unit_test', class_id: '', section_id: '', subject_id: '', exam_date: '', start_time: '', duration_minutes: '60', total_marks: '100', passing_marks: '35' });

  const fetchExams = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!userData?.school_id) { setLoading(false); return; }
    let q = supabase.from('exams').select('*, classes(name), subjects(name)').eq('school_id', userData.school_id).order('exam_date', { ascending: false });
    if (filterType) q = q.eq('exam_type', filterType);
    const { data } = await q;
    if (data) setExams(data.map((e: Record<string, unknown>) => ({ ...e, class_name: (e.classes as Record<string, string>)?.name, subject_name: (e.subjects as Record<string, string>)?.name })) as Exam[]);
    setLoading(false);
  }, [supabase, filterType]);

  const fetchStructure = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) return;
    const sid = u.school_id;

    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', sid).maybeSingle();

    if (yr?.id) {
      // Prefer academic-year scoped data
      const [{ data: c }, { data: sub }, { data: sec }] = await Promise.all([
        supabase.from('classes').select('id, name').eq('academic_year_id', yr.id).order('numeric_order'),
        supabase.from('subjects').select('id, name, class_id').eq('academic_year_id', yr.id),
        supabase.from('sections').select('id, name, class_id').eq('academic_year_id', yr.id),
      ]);
      if (c) setClasses(c);
      if (sub) setSubjects(sub);
      if (sec) setSections(sec);
    } else {
      // Fallback: no academic year set — load by school_id directly
      const [{ data: c }, { data: sub }, { data: sec }] = await Promise.all([
        supabase.from('classes').select('id, name').eq('school_id', sid).order('numeric_order'),
        supabase.from('subjects').select('id, name, class_id').eq('school_id', sid),
        supabase.from('sections').select('id, name, class_id').eq('school_id', sid),
      ]);
      if (c) setClasses(c);
      if (sub) setSubjects(sub);
      if (sec) setSections(sec);
    }
  }, [supabase]);


  useEffect(() => { fetchStructure(); }, [fetchStructure]);
  useEffect(() => { fetchExams(); }, [fetchExams]);

  const filteredSubjects = subjects.filter(s => !form.class_id || s.class_id === form.class_id);
  const filteredSections = sections.filter(s => !form.class_id || s.class_id === form.class_id);

  const handleCreate = async () => {
    if (!form.name || !form.class_id || !form.subject_id || !form.exam_date) { setFormError('Name, class, subject, and date are required'); return; }
    setSaving(true); setFormError('');
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    const { error } = await supabase.from('exams').insert({
      name: form.name, exam_type: form.exam_type, class_id: form.class_id, section_id: form.section_id || null,
      subject_id: form.subject_id, exam_date: form.exam_date, start_time: form.start_time || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      total_marks: parseInt(form.total_marks), passing_marks: form.passing_marks ? parseInt(form.passing_marks) : null,
      academic_year_id: yr?.id, school_id: userData?.school_id, created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowAdd(false);
    setForm({ name: '', exam_type: 'unit_test', class_id: '', section_id: '', subject_id: '', exam_date: '', start_time: '', duration_minutes: '60', total_marks: '100', passing_marks: '35' });
    fetchExams(); setSaving(false);
  };

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from('exams').update({ is_published: !current }).eq('id', id);
    fetchExams();
  };

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Exam Management</h2><p className="text-gray-500 text-sm mt-1">Schedule exams, manage marks, and publish results</p></div>
        <button onClick={() => { setShowAdd(true); setFormError(''); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#1E40AF' }}>+ Create Exam</button>
      </div>

      <div className="flex items-center gap-3">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }}>
          <option value="">All Types</option>{EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-sm text-gray-500">{exams.length} exam{exams.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div> : (
          <table className="w-full">
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Exam</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Class/Subject</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Marks</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {exams.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">📝</p><p className="text-sm">No exams scheduled yet.</p></td></tr>
              ) : exams.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{e.name}</td>
                  <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{e.exam_type?.replace('_', ' ')}</span></td>
                  <td className="px-6 py-4 text-sm text-gray-600">{e.class_name} — {e.subject_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(e.exam_date).toLocaleDateString('en-IN')}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{e.total_marks} (Pass: {e.passing_marks || '—'})</td>
                  <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: e.is_published ? '#F0FDF4' : '#FFFBEB', color: e.is_published ? '#16A34A' : '#D97706' }}>{e.is_published ? 'Published' : 'Draft'}</span></td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => togglePublish(e.id, e.is_published)} className="text-xs hover:underline" style={{ color: e.is_published ? '#D97706' : '#16A34A' }}>{e.is_published ? 'Unpublish' : 'Publish'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Schedule Exam</h3><button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Exam Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='e.g. "Unit Test 1 — Mathematics"' className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Exam Type *</label><select value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}>{EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class *</label><select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value, section_id: '', subject_id: '' }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Section</label><select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">All sections</option>{filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label><select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Exam Date *</label><input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label><input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Total Marks *</label><input type="number" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Pass Marks</label><input type="number" value={form.passing_marks} onChange={e => setForm(f => ({ ...f, passing_marks: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#1E40AF' }}>{saving ? 'Creating...' : 'Create Exam'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
