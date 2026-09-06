'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Resource {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  file_url: string | null;
  subject_id?: string | null;
  subject_name?: string;
  section_name?: string;
  class_name?: string;
  created_at: string;
  is_published: boolean;
}

const RESOURCE_TYPES = ['notes', 'worksheet', 'video', 'presentation', 'other'];

const TYPE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: '📝 Notes' },
  { key: 'worksheet', label: '📋 Worksheet' },
  { key: 'video', label: '🎬 Video' },
  { key: 'presentation', label: '📊 Presentation' },
  { key: 'other', label: '📁 Other' },
];

const typeIcons: Record<string, string> = {
  notes: '📝', worksheet: '📋', video: '🎬', presentation: '📊', other: '📁',
};

const typeColors: Record<string, string> = {
  notes: '#0F766E', worksheet: '#1D4ED8', video: '#DC2626', presentation: '#7C3AED', other: '#64748B',
};

const IS: React.CSSProperties = {
  width: '100%', padding: '9px 13px', border: '1px solid #E2E8F0', borderRadius: 9,
  fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit',
};

const LS: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

export default function ResourcesPage() {
  const supabase = createClient();

  // ── Data ──────────────────────────────────────────────────────────────────────
  const [resources, setResources] = useState<Resource[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('');

  // ── Modal ─────────────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', resource_type: 'notes',
    subject_id: '', section_id: '', file_url: '', is_published: true,
  });
  const [formError, setFormError] = useState('');

  // ── Copy state ────────────────────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

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

    const { data: classSecs } = await supabase
      .from('sections').select('id, name, classes(name)').eq('class_teacher_id', userId);

    const { data: assgn } = await supabase.from('teacher_section_assignments')
      .select('sections(id, name, classes(name)), subjects(id, name)').eq('teacher_id', userId);

    if (assgn || classSecs) {
      const secMap = new Map<string, { id: string; name: string; class_name: string }>();
      const subMap = new Map<string, { id: string; name: string }>();
      (classSecs || []).forEach((s: any) => {
        secMap.set(s.id, { id: s.id, name: s.name, class_name: s.classes?.name || '' });
      });
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

  // ── Create ────────────────────────────────────────────────────────────────────
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

  // ── Toggle publish ────────────────────────────────────────────────────────────
  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from('resources').update({ is_published: !current }).eq('id', id);
    fetchAll();
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this resource? This cannot be undone.')) return;
    await supabase.from('resources').delete().eq('id', id);
    fetchAll();
  };

  // ── Copy link ─────────────────────────────────────────────────────────────────
  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filtered = resources.filter(r => {
    const matchSearch = search === '' || r.title.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === 'all' || r.resource_type === activeTab;
    const matchSubject = subjectFilter === '' || r.subject_id === subjectFilter;
    return matchSearch && matchTab && matchSubject;
  });

  const totalCount = resources.length;
  const publishedCount = resources.filter(r => r.is_published).length;
  const draftCount = totalCount - publishedCount;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Resources</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Share notes, worksheets, and presentations with students</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setFormError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg,#0F766E,#0D9488)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,118,110,0.3)', whiteSpace: 'nowrap' }}
        >
          + Add Resource
        </button>
      </div>

      {/* Stats row */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: '#F1F5F9', fontSize: 12, fontWeight: 600, color: '#475569' }}>
            📦 {totalCount} Total
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: '#F0FDF4', fontSize: 12, fontWeight: 600, color: '#16A34A' }}>
            ✅ {publishedCount} Published
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: '#FFFBEB', fontSize: 12, fontWeight: 600, color: '#D97706' }}>
            🕓 {draftCount} Draft
          </span>
        </div>
      )}

      {/* Search + Subject filter */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', color: '#94A3B8' }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resources by title…"
            style={{ ...IS, paddingLeft: 33, borderRadius: 10 }}
          />
        </div>
        <select
          value={subjectFilter}
          onChange={e => setSubjectFilter(e.target.value)}
          style={{ ...IS, width: 'auto', minWidth: 160, borderRadius: 10, cursor: 'pointer' }}
        >
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Type filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TYPE_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '6px 14px', borderRadius: 999,
                border: isActive ? '1.5px solid #0F766E' : '1.5px solid #E2E8F0',
                background: isActive ? '#ECFDF5' : 'white',
                color: isActive ? '#0F766E' : '#64748B',
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Resource list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} style={{ height: 88, background: '#F1F5F9', borderRadius: 18, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E2E8F0', padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 40, marginBottom: 10 }}>{resources.length === 0 ? '📁' : '🔍'}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: 0 }}>
              {resources.length === 0 ? 'No resources uploaded yet' : 'No resources match your filters'}
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
              {resources.length === 0
                ? 'Published resources are visible to parents in their portal'
                : 'Try adjusting your search, type, or subject filter'}
            </p>
            {resources.length > 0 && (
              <button
                onClick={() => { setSearch(''); setActiveTab('all'); setSubjectFilter(''); }}
                style={{ marginTop: 14, padding: '7px 18px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: 'white', fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filtered.map(r => {
            const color = typeColors[r.resource_type] || typeColors.other;
            const isCopied = copiedId === r.id;
            return (
              <div
                key={r.id}
                style={{
                  background: 'white', borderRadius: 16, border: '1px solid #E2E8F0',
                  padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16,
                  boxShadow: '0 1px 4px rgba(15,23,42,0.04)', transition: 'box-shadow 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.10)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.04)')}
              >
                {/* Type icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: color + '18', border: `2px solid ${color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>
                  {typeIcons[r.resource_type] || '📁'}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Badge row */}
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: r.is_published ? '#F0FDF4' : '#FFFBEB',
                      color: r.is_published ? '#16A34A' : '#D97706',
                    }}>
                      {r.is_published ? '● Published' : '○ Draft'}
                    </span>
                    {r.subject_name && (
                      <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8' }}>
                        {r.subject_name}
                      </span>
                    )}
                    {r.class_name && r.section_name && (
                      <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#F5F3FF', color: '#7C3AED' }}>
                        {r.class_name}-{r.section_name}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                      {formatDate(r.created_at)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: '0 0 3px' }}>{r.title}</h3>

                  {/* Description 2-line clamp */}
                  {r.description && (
                    <p style={{
                      fontSize: 12, color: '#64748B', margin: '0 0 10px',
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.5',
                    }}>
                      {r.description}
                    </p>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: r.description ? 0 : 6 }}>
                    {r.file_url && (
                      <button
                        onClick={() => handleCopy(r.id, r.file_url!)}
                        style={{
                          padding: '5px 12px', borderRadius: 7,
                          border: '1.5px solid #E2E8F0',
                          background: isCopied ? '#F0FDF4' : 'white',
                          fontSize: 12, fontWeight: 600,
                          color: isCopied ? '#16A34A' : '#475569',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {isCopied ? '✓ Copied!' : '🔗 Copy Link'}
                      </button>
                    )}
                    {r.file_url && (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: '5px 12px', borderRadius: 7,
                          border: '1.5px solid #E2E8F0', background: 'white',
                          fontSize: 12, fontWeight: 600, color: '#475569',
                          textDecoration: 'none', display: 'inline-flex',
                          alignItems: 'center', gap: 4, cursor: 'pointer',
                        }}
                      >
                        ↗ Open
                      </a>
                    )}
                    <button
                      onClick={() => togglePublish(r.id, r.is_published)}
                      style={{
                        padding: '5px 12px', borderRadius: 7,
                        border: '1.5px solid #E2E8F0', background: 'white',
                        fontSize: 12, fontWeight: 600,
                        color: r.is_published ? '#D97706' : '#16A34A',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {r.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      style={{
                        padding: '5px 12px', borderRadius: 7,
                        border: '1.5px solid #FEE2E2', background: 'white',
                        fontSize: 12, fontWeight: 600, color: '#DC2626',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Resource Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflowY: 'auto', padding: '32px 32px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>Add Resource</h3>
              <button onClick={() => setShowAdd(false)} style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            {formError && <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>{formError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LS}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={IS} placeholder="e.g. Chapter 1 Notes" />
              </div>
              <div>
                <label style={LS}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...IS, resize: 'none' }} rows={2} placeholder="Optional description..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#475569', marginTop: 4 }}>
                <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#0F766E', cursor: 'pointer' }} />
                Publish immediately (visible to parents)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none', background: saving ? '#93C5FD' : 'linear-gradient(135deg,#0F766E,#0D9488)', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(15,118,110,0.3)' }}>
                {saving ? 'Saving...' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
