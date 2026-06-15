'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Tab = 'years' | 'classes' | 'sections' | 'subjects';

interface AcademicYear { id: string; name: string; start_date: string; end_date: string; is_current: boolean; }
interface Class { id: string; name: string; numeric_order: number | null; academic_year_id: string; }
interface Section { id: string; name: string; class_id: string; class_teacher_id: string | null; max_students: number; academic_year_id: string; class_name?: string; teacher_name?: string; }
interface Subject { id: string; name: string; code: string | null; class_id: string; teacher_id: string | null; academic_year_id: string; class_name?: string; teacher_name?: string; }
interface Teacher { id: string; full_name: string; }

export default function AcademicsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('years');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [currentYearId, setCurrentYearId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Year form
  const [yearForm, setYearForm] = useState({ name: '', start_date: '', end_date: '' });
  // Class form
  const [classForm, setClassForm] = useState({ name: '', numeric_order: '' });
  // Section form
  const [sectionForm, setSectionForm] = useState({ name: '', class_id: '', class_teacher_id: '', max_students: '50' });
  // Subject form
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', class_id: '', teacher_id: '' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: y } = await supabase.from('academic_years').select('*').order('start_date', { ascending: false });
    if (y) {
      setYears(y);
      const cur = y.find((yr: AcademicYear) => yr.is_current);
      if (cur) setCurrentYearId(cur.id);
      else if (y.length > 0) setCurrentYearId(y[0].id);
    }

    // Fetch teachers filtered by school_id so newly added teachers always appear
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (userRow?.school_id) {
        const { data: t } = await supabase.from('users')
          .select('id, full_name')
          .eq('school_id', userRow.school_id)
          .eq('role', 'teacher')
          .eq('is_active', true)
          .order('full_name');
        if (t) setTeachers(t);
      }
    }
    setLoading(false);
  }, [supabase]);

  const fetchClasses = useCallback(async () => {
    if (!currentYearId) return;
    const { data } = await supabase.from('classes').select('*').eq('academic_year_id', currentYearId).order('numeric_order');
    if (data) setClasses(data);
  }, [supabase, currentYearId]);

  const fetchSections = useCallback(async () => {
    if (!currentYearId) return;
    const { data } = await supabase.from('sections')
      .select('*, classes(name), users!sections_class_teacher_id_fkey(full_name)')
      .eq('academic_year_id', currentYearId);
    if (data) setSections(data.map((s: Record<string, unknown>) => ({
      ...s,
      class_name: (s.classes as Record<string, string>)?.name,
      teacher_name: (s['users!sections_class_teacher_id_fkey'] as Record<string, string>)?.full_name
        || (s.users as Record<string, string>)?.full_name,
    })) as Section[]);
  }, [supabase, currentYearId]);

  const fetchSubjects = useCallback(async () => {
    if (!currentYearId) return;
    const { data } = await supabase.from('subjects')
      .select('*, classes(name), users!subjects_teacher_id_fkey(full_name)')
      .eq('academic_year_id', currentYearId);
    if (data) setSubjects(data.map((s: Record<string, unknown>) => ({
      ...s,
      class_name: (s.classes as Record<string, string>)?.name,
      teacher_name: (s['users!subjects_teacher_id_fkey'] as Record<string, string>)?.full_name
        || (s.users as Record<string, string>)?.full_name,
    })) as Subject[]);
  }, [supabase, currentYearId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchClasses(); fetchSections(); fetchSubjects(); }, [fetchClasses, fetchSections, fetchSubjects]);

  const handleCreate = async () => {
    setSaving(true); setFormError('');
    try {
      if (tab === 'years') {
        if (!yearForm.name || !yearForm.start_date || !yearForm.end_date) { setFormError('All fields required'); setSaving(false); return; }
        const { error } = await supabase.from('academic_years').insert({ name: yearForm.name, start_date: yearForm.start_date, end_date: yearForm.end_date, is_current: years.length === 0 });
        if (error) { setFormError(error.message); setSaving(false); return; }
        setYearForm({ name: '', start_date: '', end_date: '' });
        fetchAll();
      } else if (tab === 'classes') {
        if (!classForm.name) { setFormError('Class name required'); setSaving(false); return; }
        const { error } = await supabase.from('classes').insert({ name: classForm.name, numeric_order: classForm.numeric_order ? parseInt(classForm.numeric_order) : null, academic_year_id: currentYearId });
        if (error) { setFormError(error.message); setSaving(false); return; }
        setClassForm({ name: '', numeric_order: '' });
        fetchClasses();
      } else if (tab === 'sections') {
        if (!sectionForm.name || !sectionForm.class_id) { setFormError('Name and class required'); setSaving(false); return; }
        const { error } = await supabase.from('sections').insert({ name: sectionForm.name, class_id: sectionForm.class_id, class_teacher_id: sectionForm.class_teacher_id || null, max_students: parseInt(sectionForm.max_students) || 50, academic_year_id: currentYearId });
        if (error) { setFormError(error.message); setSaving(false); return; }
        setSectionForm({ name: '', class_id: '', class_teacher_id: '', max_students: '50' });
        fetchSections();
      } else if (tab === 'subjects') {
        if (!subjectForm.name || !subjectForm.class_id) { setFormError('Name and class required'); setSaving(false); return; }
        const { error } = await supabase.from('subjects').insert({ name: subjectForm.name, code: subjectForm.code || null, class_id: subjectForm.class_id, teacher_id: subjectForm.teacher_id || null, academic_year_id: currentYearId });
        if (error) { setFormError(error.message); setSaving(false); return; }
        setSubjectForm({ name: '', code: '', class_id: '', teacher_id: '' });
        fetchSubjects();
      }
      setShowModal(false);
    } catch { setFormError('An error occurred'); }
    setSaving(false);
  };

  const setCurrentYear = async (id: string) => {
    await supabase.from('academic_years').update({ is_current: false }).neq('id', id);
    await supabase.from('academic_years').update({ is_current: true }).eq('id', id);
    fetchAll();
  };

  const deleteItem = async (table: string, id: string) => {
    if (!confirm('Are you sure?')) return;
    await supabase.from(table).delete().eq('id', id);
    if (table === 'academic_years') fetchAll();
    else if (table === 'classes') fetchClasses();
    else if (table === 'sections') fetchSections();
    else if (table === 'subjects') fetchSubjects();
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'years', label: 'Academic Years', icon: '📅' },
    { key: 'classes', label: 'Classes', icon: '🏫' },
    { key: 'sections', label: 'Sections', icon: '📋' },
    { key: 'subjects', label: 'Subjects', icon: '📖' },
  ];

  const btnStyle = { background: '#1E40AF' };
  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Structure</h2>
          <p className="text-gray-500 text-sm mt-1">Manage your school&apos;s academic configuration</p>
        </div>
        <button onClick={() => { setShowModal(true); setFormError(''); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg transition-all" style={btnStyle}>
          + Add {tabs.find(t => t.key === tab)?.label.replace(/s$/, '') || 'Item'}
        </button>
      </div>

      {/* Year Selector */}
      {tab !== 'years' && years.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Academic Year:</span>
          <select value={currentYearId} onChange={e => setCurrentYearId(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" style={{ borderColor: '#E2E8F0' }}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name} {y.is_current ? '(Current)' : ''}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#1E40AF' : '#64748B', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? (
          <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {tab === 'years' && <><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th><th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th></>}
                {tab === 'classes' && <><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th><th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th></>}
                {tab === 'sections' && <><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Section</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Class</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Class Teacher</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Capacity</th><th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th></>}
                {tab === 'subjects' && <><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Subject</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Class</th><th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Teacher</th><th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th></>}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {tab === 'years' && (years.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">📅</p><p className="text-sm">No academic years yet. Create your first!</p></td></tr>
              ) : years.map(y => (
                <tr key={y.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-semibold text-gray-900">{y.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(y.start_date).toLocaleDateString('en-IN')} — {new Date(y.end_date).toLocaleDateString('en-IN')}</td>
                  <td className="px-6 py-4">{y.is_current ? <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#F0FDF4', color: '#16A34A' }}>Current</span> : <button onClick={() => setCurrentYear(y.id)} className="text-xs text-blue-600 hover:underline">Set as current</button>}</td>
                  <td className="px-6 py-4 text-right"><button onClick={() => deleteItem('academic_years', y.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button></td></tr>
              )))}
              {tab === 'classes' && (classes.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">🏫</p><p className="text-sm">No classes yet.</p></td></tr>
              ) : classes.map(c => (
                <tr key={c.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-semibold text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.numeric_order ?? '—'}</td>
                  <td className="px-6 py-4 text-right"><button onClick={() => deleteItem('classes', c.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button></td></tr>
              )))}
              {tab === 'sections' && (sections.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">📋</p><p className="text-sm">No sections yet.</p></td></tr>
              ) : sections.map(s => (
                <tr key={s.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-semibold text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.class_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.teacher_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.max_students}</td>
                  <td className="px-6 py-4 text-right"><button onClick={() => deleteItem('sections', s.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button></td></tr>
              )))}
              {tab === 'subjects' && (subjects.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">📖</p><p className="text-sm">No subjects yet.</p></td></tr>
              ) : subjects.map(s => (
                <tr key={s.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-semibold text-gray-900">{s.name}</td>
                  <td className="px-6 py-4"><code className="text-xs px-2 py-1 rounded" style={{ background: '#F1F5F9' }}>{s.code || '—'}</code></td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.class_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.teacher_name || '—'}</td>
                  <td className="px-6 py-4 text-right"><button onClick={() => deleteItem('subjects', s.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button></td></tr>
              )))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Add {tabs.find(t => t.key === tab)?.label.replace(/s$/, '')}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}

            <div className="space-y-4">
              {tab === 'years' && (<>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input type="text" placeholder='e.g. "2025-2026"' value={yearForm.name} onChange={e => setYearForm(f => ({ ...f, name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label><input type="date" value={yearForm.start_date} onChange={e => setYearForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label><input type="date" value={yearForm.end_date} onChange={e => setYearForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                </div>
              </>)}
              {tab === 'classes' && (<>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label><input type="text" placeholder='e.g. "Class 1", "KG2"' value={classForm.name} onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label><input type="number" placeholder="1, 2, 3..." value={classForm.numeric_order} onChange={e => setClassForm(f => ({ ...f, numeric_order: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </>)}
              {tab === 'sections' && (<>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Section Name *</label><input type="text" placeholder='e.g. "A", "B"' value={sectionForm.name} onChange={e => setSectionForm(f => ({ ...f, name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class *</label><select value={sectionForm.class_id} onChange={e => setSectionForm(f => ({ ...f, class_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select class...</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class Teacher</label><select value={sectionForm.class_teacher_id} onChange={e => setSectionForm(f => ({ ...f, class_teacher_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">None</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Students</label><input type="number" value={sectionForm.max_students} onChange={e => setSectionForm(f => ({ ...f, max_students: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </>)}
              {tab === 'subjects' && (<>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject Name *</label><input type="text" placeholder='e.g. "Mathematics"' value={subjectForm.name} onChange={e => setSubjectForm(f => ({ ...f, name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Code</label><input type="text" placeholder='e.g. "MATH8"' value={subjectForm.code} onChange={e => setSubjectForm(f => ({ ...f, code: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class *</label><select value={subjectForm.class_id} onChange={e => setSubjectForm(f => ({ ...f, class_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select class...</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject Teacher</label><select value={subjectForm.teacher_id} onChange={e => setSubjectForm(f => ({ ...f, teacher_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">None</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
              </>)}
            </div>

            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={btnStyle}>{saving ? 'Saving...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
