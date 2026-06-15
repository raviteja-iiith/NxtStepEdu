'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Resource {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  file_url: string | null;
  subject_name?: string;
  section_name?: string;
  class_name?: string;
  created_at: string;
  is_published: boolean;
}

const RESOURCE_TYPES = ['notes', 'worksheet', 'video', 'presentation', 'other'];

export default function ResourcesPage() {
  const supabase = createClient();
  const [resources, setResources] = useState<Resource[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', resource_type: 'notes', subject_id: '', section_id: '', file_url: '', is_published: true });
  const [formError, setFormError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    // Fetch resources created by this teacher
    const { data: res } = await supabase.from('resources')
      .select('*, subjects(name), sections(name, classes(name))')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (res) {
      setResources(res.map((r: any) => ({
        ...r,
        subject_name: r.subjects?.name,
        section_name: r.sections?.name,
        class_name: r.sections?.classes?.name,
      })));
    }

    // Fetch teacher's sections & subjects
    const { data: assgn } = await supabase.from('teacher_section_assignments')
      .select('sections(id, name, classes(name)), subjects(id, name)')
      .eq('teacher_id', userId);

    if (assgn) {
      const secMap = new Map<string, { id: string; name: string; class_name: string }>();
      const subMap = new Map<string, { id: string; name: string }>();
      assgn.forEach((a: any) => {
        if (a.sections) secMap.set(a.sections.id, { id: a.sections.id, name: a.sections.name, class_name: a.sections?.classes?.name || '' });
        if (a.subjects) subMap.set(a.subjects.id, { id: a.subjects.id, name: a.subjects.name });
      });
      setSections(Array.from(secMap.values()));
      setSubjects(Array.from(subMap.values()));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    setFormError('');
    if (!form.title) { setFormError('Title is required.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', user.id).single();

    const { error } = await supabase.from('resources').insert({
      title: form.title,
      description: form.description || null,
      resource_type: form.resource_type,
      subject_id: form.subject_id || null,
      section_id: form.section_id || null,
      file_url: form.file_url || null,
      is_published: form.is_published,
      created_by: user.id,
      school_id: u?.school_id,
    });

    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowAdd(false);
    setForm({ title: '', description: '', resource_type: 'notes', subject_id: '', section_id: '', file_url: '', is_published: true });
    fetchAll();
    setSaving(false);
  };

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from('resources').update({ is_published: !current }).eq('id', id);
    fetchAll();
  };

  const typeIcons: Record<string, string> = { notes: '📝', worksheet: '📋', video: '🎬', presentation: '📊', other: '📁' };

  const inputCls = 'w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Resources</h2><p className="text-gray-500 text-sm mt-1">Share notes, worksheets, and presentations with students</p></div>
        <button onClick={() => { setShowAdd(true); setFormError(''); }}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#0F766E' }}>
          + Add Resource
        </button>
      </div>

      <div className="space-y-3">
        {loading ? [1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />) :
          resources.length === 0 ? (
            <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
              <p className="text-4xl mb-3">📁</p>
              <p className="text-gray-500 text-sm">No resources uploaded yet</p>
              <p className="text-xs text-gray-400 mt-1">Published resources are visible to parents in their portal</p>
            </div>
          ) :
          resources.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all flex items-start justify-between" style={{ borderColor: '#E2E8F0' }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#F0FDF4' }}>
                  {typeIcons[r.resource_type] || '📁'}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                      style={{ background: r.is_published ? '#F0FDF4' : '#FFFBEB', color: r.is_published ? '#16A34A' : '#D97706' }}>
                      {r.is_published ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{r.resource_type}</span>
                    {r.subject_name && <span className="text-xs text-gray-400">• {r.subject_name}</span>}
                    {r.class_name && r.section_name && <span className="text-xs text-gray-400">• {r.class_name}-{r.section_name}</span>}
                  </div>
                  <h3 className="font-bold text-gray-900">{r.title}</h3>
                  {r.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{r.description}</p>}
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold text-teal-600 hover:underline mt-1 inline-block">📎 Open File</a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button onClick={() => togglePublish(r.id, r.is_published)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                  style={{ borderColor: '#E2E8F0', color: r.is_published ? '#D97706' : '#16A34A' }}>
                  {r.is_published ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </div>
          ))
        }
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Add Resource</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={inputCls + ' resize-none'} rows={2} style={{ borderColor: '#E2E8F0' }} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}>
                    {RESOURCE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}>
                    <option value="">All Subjects</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                <select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}>
                  <option value="">All Sections</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">File URL</label>
                <input value={form.file_url} onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))}
                  className={inputCls} style={{ borderColor: '#E2E8F0' }} placeholder="https://drive.google.com/..." /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pubRes" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                <label htmlFor="pubRes" className="text-sm text-gray-700">Publish immediately (visible to parents)</label>
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0F766E' }}>
                {saving ? 'Saving...' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
