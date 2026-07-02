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

const IS: React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };

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

    // Fetch teacher's sections & subjects — combine class teacher role + subject assignments
    const { data: classSecs } = await supabase
      .from('sections')
      .select('id, name, classes(name)')
      .eq('class_teacher_id', userId);

    const { data: assgn } = await supabase.from('teacher_section_assignments')
      .select('sections(id, name, classes(name)), subjects(id, name)')
      .eq('teacher_id', userId);

    if (assgn || classSecs) {
      const secMap = new Map<string, { id: string; name: string; class_name: string }>();
      const subMap = new Map<string, { id: string; name: string }>();

      // Add class teacher sections (no subject association)
      (classSecs || []).forEach((s: any) => {
        secMap.set(s.id, { id: s.id, name: s.name, class_name: s.classes?.name || '' });
      });

      // Add subject-assigned sections and their subjects
      (assgn || []).forEach((a: any) => {
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
    <div className="dashboard-container">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Resources</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Share notes, worksheets, and presentations with students</p>
        </div>
        <button onClick={() => { setShowAdd(true); setFormError(''); }}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)', whiteSpace:'nowrap' }}>
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
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)' }}>
          <div style={{ width:'100%', maxWidth:500, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'92vh', overflowY:'auto', padding:'32px 32px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Add Resource</h3>
              <button onClick={() => setShowAdd(false)} style={{ border:'none', background:'transparent', color:'#94A3B8', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {formError && <div style={{ marginBottom:16, padding:'10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>{formError}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={LS}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={IS} placeholder="e.g. Chapter 1 Notes" />
              </div>
              <div>
                <label style={LS}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...IS, resize:'none' }} rows={2} placeholder="Optional description..." />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>Type</label>
                  <select value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value }))} style={IS}>
                    {RESOURCE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Subject</label>
                  <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} style={IS}>
                    <option value="">All Subjects</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={LS}>Section</label>
                <select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} style={IS}>
                  <option value="">All Sections</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>File URL</label>
                <input value={form.file_url} onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))} style={IS} placeholder="https://drive.google.com/..." />
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#475569', marginTop:4 }}>
                <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} style={{ width:16, height:16, accentColor:'#0F766E', cursor:'pointer' }} />
                Publish immediately (visible to parents)
              </label>
            </div>
            <div style={{ display:'flex', gap:12, marginTop:28 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)' }}>
                {saving ? 'Saving...' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
