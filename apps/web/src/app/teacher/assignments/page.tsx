'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTeacherAssignments, getTeacherSubjectsAndSections, createAssignment } from '@school-erp/supabase/queries';
import { getUserProfile } from '@school-erp/supabase/queries';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

interface Assignment { id: string; title: string; description: string | null; deadline: string; max_marks: number | null; is_published: boolean; subject_name?: string; section_name?: string; }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isArchived(deadline: string) {
  return Date.now() - new Date(deadline).getTime() > SEVEN_DAYS_MS;
}

const IS: React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };

export default function AssignmentsPage() {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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

  // We could filter by teacher_id using postgres_changes, or just watch all assignments and let it refetch if needed.
  useRealtimeTable('assignments', null, fetchAll);

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

  // Separate active vs archived
  const active   = assignments.filter(a => !isArchived(a.deadline));
  const archived = assignments.filter(a => isArchived(a.deadline));
  const visible  = showArchived ? assignments : active;

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="dashboard-container">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Assignments</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Create and manage assignments for your sections</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)', whiteSpace:'nowrap' }}>
          + Create Assignment
        </button>
      </div>

      {/* Archive toggle */}
      {!loading && archived.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background: showArchived ? '#FFF7ED' : '#F8FAFC', border:`1px solid ${showArchived ? '#FED7AA' : '#E2E8F0'}`, borderRadius:12 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:600, color: showArchived ? '#C2410C' : '#475569' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              style={{ width:16, height:16, accentColor:'#C2410C', cursor:'pointer' }}
            />
            Show archived ({archived.length} assignment{archived.length !== 1 ? 's' : ''} — overdue &gt;7 days)
          </label>
          {!showArchived && (
            <span style={{ fontSize:12, color:'#94A3B8' }}>These are hidden from parent view</span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {loading ? [1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />) :
          visible.length === 0 ? (
            <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
              <p className="text-3xl mb-2">📝</p>
              <p className="text-gray-400">{showArchived ? 'No assignments yet' : 'No active assignments'}</p>
              {active.length === 0 && archived.length > 0 && !showArchived && (
                <p className="text-xs text-gray-400 mt-2">All assignments are archived (overdue &gt;7 days). Enable "Show archived" above to view them.</p>
              )}
            </div>
          ) :
          visible.map(a => {
            const archived = isArchived(a.deadline);
            return (
              <div key={a.id} className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all" style={{ borderColor: archived ? '#FED7AA' : '#E2E8F0', opacity: archived ? 0.85 : 1 }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: a.is_published ? '#F0FDF4' : '#FFFBEB', color: a.is_published ? '#16A34A' : '#D97706' }}>{a.is_published ? 'Published' : 'Draft'}</span>
                      {archived && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:'#FFF7ED', color:'#C2410C' }}>🗂 Archived</span>}
                      <span className="text-xs text-gray-400">{a.subject_name} • {a.section_name}</span>
                    </div>
                    <h3 className="font-bold text-gray-900">{a.title}</h3>
                    {a.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.description}</p>}
                    {archived && <p className="text-xs mt-1" style={{ color:'#C2410C' }}>⚠ This assignment is over 7 days past its deadline and is hidden from parents.</p>}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-gray-400">Deadline</p>
                    <p className="text-sm font-bold" style={{ color: new Date(a.deadline) < new Date() ? '#DC2626' : '#1E40AF' }}>{new Date(a.deadline).toLocaleDateString('en-IN')}</p>
                    {a.max_marks && <p className="text-xs text-gray-400 mt-1">{a.max_marks} marks</p>}
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>

      {showAdd && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)' }}>
          <div style={{ width:'100%', maxWidth:500, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'92vh', overflowY:'auto', padding:'32px 32px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Create Assignment</h3>
              <button onClick={() => setShowAdd(false)} style={{ border:'none', background:'transparent', color:'#94A3B8', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={LS}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={IS} placeholder="e.g. Chapter 1 Homework" />
              </div>
              <div>
                <label style={LS}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...IS, resize:'none' }} rows={3} placeholder="Optional description or instructions..." />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>Subject *</label>
                  <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} style={IS}>
                    <option value="">Select...</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Section *</label>
                  <select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} style={IS}>
                    <option value="">Select...</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>Deadline *</label>
                  <input type="date" value={form.deadline} min={new Date().toISOString().split('T')[0]} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={IS} />
                </div>
                <div>
                  <label style={LS}>Max Marks</label>
                  <input type="number" value={form.max_marks} onChange={e => setForm(f => ({ ...f, max_marks: e.target.value }))} style={IS} placeholder="e.g. 100" />
                </div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#475569', marginTop:4 }}>
                <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} style={{ width:16, height:16, accentColor:'#0F766E', cursor:'pointer' }} />
                Publish immediately (visible to parents)
              </label>
            </div>
            <div style={{ display:'flex', gap:12, marginTop:28 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)' }}>
                {saving ? 'Creating...' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
