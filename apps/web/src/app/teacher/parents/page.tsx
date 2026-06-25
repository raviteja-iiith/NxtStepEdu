'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ParentRecord { id: string; full_name: string; phone: string | null; is_active: boolean; student_name: string; section_name: string; }

const AVATAR_COLORS = [
  { bg: '#EFF6FF', color: '#1D4ED8' },
  { bg: '#F0FDF4', color: '#16A34A' },
  { bg: '#F5F3FF', color: '#7C3AED' },
  { bg: '#FFFBEB', color: '#D97706' },
  { bg: '#FDF2F8', color: '#BE185D' },
];

export default function TeacherParentsPage() {
  const supabase = createClient();
  const isMobile = useIsMobile();
  
  const [parents, setParents] = useState<ParentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [students, setStudents] = useState<{ id: string; full_name: string; section_name: string }[]>([]);
  const [form, setForm] = useState({ full_name: '', phone: '', relationship: 'guardian' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showCreds, setShowCreds] = useState<{ phone: string; pin: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [showLinkModal, setShowLinkModal] = useState<{ parentId: string; parentName: string } | null>(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkRelationship, setLinkRelationship] = useState('guardian');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');

  const fetchParentsAndStudents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    const { data: classSecs } = await supabase.from('sections').select('id').eq('class_teacher_id', userId);
    const { data: subjectAsgn } = await supabase.from('teacher_section_assignments').select('section_id').eq('teacher_id', userId);

    const allSectionIds = [...new Set([...(classSecs || []).map((s: any) => s.id as string), ...(subjectAsgn || []).map((a: any) => a.section_id as string)])];

    if (allSectionIds.length === 0) {
      setStudents([]); setParents([]); setLoading(false); return;
    }

    const { data: studentData } = await supabase.from('students').select('id, full_name, sections(name)').in('section_id', allSectionIds).neq('is_active', false).order('full_name');
    const myStudents = studentData || [];
    setStudents(myStudents.map((s: any) => ({ id: s.id, full_name: s.full_name, section_name: (s.sections as any)?.name || '' })));

    const studentIds = myStudents.map((s: any) => s.id as string);
    if (studentIds.length === 0) { setParents([]); setLoading(false); return; }

    const res = await fetch(`/api/teacher/parent-links?studentIds=${studentIds.join(',')}`);
    const { links } = res.ok ? await res.json() : { links: [] };

    const parentIds = [...new Set((links || []).map((l: any) => l.parent_id).filter(Boolean))];
    let parentUsers: any[] = [];
    if (parentIds.length > 0) {
      const { data } = await supabase.from('users').select('id, full_name, phone, is_active').in('id', parentIds);
      parentUsers = data || [];
    }
    const userMap = new Map(parentUsers.map((u: any) => [u.id, u]));

    const parentByStudent = new Map<string, ParentRecord[]>();
    (links || []).forEach((l: any) => {
      if (!l.parent_id) return;
      const u = userMap.get(l.parent_id) || (l.users as any) || {};
      const record: ParentRecord = {
        id: l.parent_id, full_name: u.full_name || 'Unknown', phone: u.phone || null, is_active: u.is_active ?? true, student_name: '', section_name: '',
      };
      if (!parentByStudent.has(l.student_id)) parentByStudent.set(l.student_id, []);
      parentByStudent.get(l.student_id)!.push(record);
    });

    const list: ParentRecord[] = [];
    myStudents.forEach((s: any) => {
      const linkedParents = parentByStudent.get(s.id);
      const secName = (s.sections as any)?.name || s.section_name || '';
      if (linkedParents && linkedParents.length > 0) {
        // Add a row for each parent linked to this student
        linkedParents.forEach(p => list.push({ ...p, student_name: s.full_name, section_name: secName }));
      } else {
        list.push({ id: `no-parent-${s.id}`, full_name: '', phone: null, is_active: true, student_name: s.full_name, section_name: secName });
      }
    });

    setParents(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchParentsAndStudents(); }, [fetchParentsAndStudents]);

  const handleAddParent = async () => {
    if (!form.full_name || !form.phone || !selectedStudentId) { setFormError('All fields are required'); return; }
    if (form.phone.length !== 10) { setFormError('Phone must be 10 digits'); return; }
    setSaving(true); setFormError('');

    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', userId).single();

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${form.phone}@parent.schoolerp.local`, password: pin, role: 'parent', full_name: form.full_name, phone: form.phone, username: form.phone, school_id: userData?.school_id }),
      });
      const result = await res.json();
      if (!res.ok) { setFormError(result.error || 'Failed to create parent account'); setSaving(false); return; }

      const newParentId: string = result.userId;
      if (!newParentId) { setFormError('Parent created but no userId returned — contact admin.'); setSaving(false); return; }

      const { error: linkError } = await supabase.from('student_parent_links').insert({
        parent_id: newParentId, student_id: selectedStudentId, relationship: form.relationship || 'guardian', is_primary_contact: true, created_by: userId,
      });

      if (linkError) {
        setFormError(`Parent account created but linking failed: ${linkError.message}. Please link manually from the student profile.`);
        setSaving(false); fetchParentsAndStudents(); return;
      }

      setShowAddModal(false); setShowCreds({ phone: form.phone, pin, name: form.full_name });
      setForm({ full_name: '', phone: '', relationship: 'guardian' }); setSelectedStudentId(''); fetchParentsAndStudents();
    } catch (err: any) { setFormError(`Network error: ${err?.message || 'Please try again.'}`); }
    setSaving(false);
  };

  const handleLinkExisting = async () => {
    if (!showLinkModal || !linkStudentId) { setLinkError('Please select a student'); return; }
    setLinking(true); setLinkError('');
    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    const { error } = await supabase.from('student_parent_links').insert({
      parent_id: showLinkModal.parentId, student_id: linkStudentId, relationship: linkRelationship || 'guardian', is_primary_contact: true, created_by: userId,
    });
    if (error) { setLinkError(error.message); setLinking(false); return; }
    setShowLinkModal(null); setLinkStudentId(''); setLinkRelationship('guardian'); fetchParentsAndStudents(); setLinking(false);
  };

  const filtered = parents.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()) || (p.phone || '').includes(search) || p.student_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ paddingBottom: isMobile ? 80 : 24, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header Area */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 16, background: 'white', padding: 24, borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Parent Management</h2>
          <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0 0' }}>Manage parents and link them to students in your classes ({parents.length} total)</p>
        </div>
        <button onClick={() => { setShowAddModal(true); setFormError(''); }} 
          style={{ width: isMobile ? '100%' : 'auto', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add New Parent
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <input type="text" placeholder="Search by parent name, phone, or child's name..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '14px 16px 14px 48px', background: 'white', border: '1px solid #E2E8F0', borderRadius: 16, fontSize: 14, fontWeight: 500, color: '#0F172A', outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }} />
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 20, display: 'flex', alignItems: 'center', gap: 16, opacity: 0.7 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F1F5F9 flex-shrink-0' }}></div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 16, background: '#F1F5F9', borderRadius: 4, width: '30%' }}></div>
                <div style={{ height: 12, background: '#F1F5F9', borderRadius: 4, width: '20%' }}></div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 300 }}>
          <div style={{ width: 80, height: 80, background: '#F8FAFC', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid #E2E8F0', fontSize: 32 }}>👨‍👩‍👧</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>{search ? 'No matches found' : 'No parents yet'}</h3>
          <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, margin: 0 }}>
            {search ? `We couldn't find any parents matching "${search}".` : 'None of the students in your assigned sections have a parent linked yet.'}
          </p>
        </div>
      ) : isMobile ? (
        /* Mobile Card View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((p, i) => {
            const hasParent = !!p.full_name;
            const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <div key={p.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 20, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                {!hasParent && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: '#FBBF24' }} />}
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0, background: hasParent ? ac.bg : '#F8FAFC', color: hasParent ? ac.color : '#94A3B8', border: hasParent ? 'none' : '1px solid #E2E8F0' }}>
                    {hasParent ? p.full_name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div>
                    {hasParent ? (
                      <>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>{p.full_name}</h3>
                        <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748B', margin: '4px 0 0 0' }}>{p.phone || 'No phone'}</p>
                      </>
                    ) : (
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#94A3B8', fontStyle: 'italic', margin: 0 }}>No parent linked</h3>
                    )}
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid #F1F5F9' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px 0' }}>Student Details</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.student_name}
                    {p.section_name && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'white', border: '1px solid #E2E8F0', color: '#475569' }}>Sec {p.section_name}</span>}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  <div>
                    {hasParent ? (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: p.is_active ? '#F0FDF4' : '#FEF2F2', color: p.is_active ? '#16A34A' : '#DC2626', border: `1px solid ${p.is_active ? '#DCFCE7' : '#FEE2E2'}` }}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#FFFBEB', color: '#B45309', border: '1px solid #FEF3C7' }}>Needs Parent</span>
                    )}
                  </div>
                  {!hasParent && (
                    <button onClick={() => { setShowAddModal(true); setFormError(''); setSelectedStudentId(p.id.replace('no-parent-', '')); }}
                      style={{ padding: '8px 16px', borderRadius: 10, background: '#F0FDF4', color: '#16A34A', border: '1px solid #DCFCE7', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Parent
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop Table View */
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 2fr 100px 140px', padding: '16px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 12, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <div>Parent Details</div>
            <div>Login Phone</div>
            <div>Linked Student</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((p, i) => {
              const hasParent = !!p.full_name;
              const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 2fr 100px 140px', padding: '16px 24px', alignItems: 'center', borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0, background: hasParent ? ac.bg : '#F8FAFC', color: hasParent ? ac.color : '#94A3B8', border: hasParent ? 'none' : '1px solid #E2E8F0' }}>
                      {hasParent ? p.full_name.charAt(0).toUpperCase() : '?'}
                    </div>
                    {hasParent ? (
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{p.full_name}</p>
                    ) : (
                      <p style={{ margin: 0, fontSize: 14, fontStyle: 'italic', fontWeight: 600, color: '#94A3B8' }}>No parent linked yet</p>
                    )}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#475569' }}>{p.phone || <span style={{ color: '#CBD5E1' }}>—</span>}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{p.student_name}</p>
                    {p.section_name && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, border: '1px solid #E2E8F0', background: 'white', color: '#64748B', textTransform: 'uppercase' }}>Sec {p.section_name}</span>}
                  </div>
                  <div>
                    {hasParent ? (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: p.is_active ? '#F0FDF4' : '#FEF2F2', color: p.is_active ? '#16A34A' : '#DC2626', border: `1px solid ${p.is_active ? '#DCFCE7' : '#FEE2E2'}` }}>
                        {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: '#FFFBEB', color: '#B45309', border: '1px solid #FEF3C7' }}>UNLINKED</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {!hasParent && (
                      <button onClick={() => { setShowAddModal(true); setFormError(''); setSelectedStudentId(p.id.replace('no-parent-', '')); }}
                        style={{ padding: '8px 12px', borderRadius: 8, background: '#F0FDF4', color: '#16A34A', border: '1px solid #DCFCE7', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Parent
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Add Parent Account</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748B' }}>Create and link a new parent</p>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'white', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div style={{ padding: 24 }}>
              {formError && (
                <div style={{ marginBottom: 20, padding: 14, borderRadius: 12, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <svg style={{ flexShrink: 0, marginTop: 2 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {formError}
                </div>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Student Details *</label>
                  <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#0F172A', outline: 'none' }}>
                    <option value="">Select a student...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name} (Sec {s.section_name})</option>)}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Parent Full Name *</label>
                  <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Ramesh Sharma" style={{ width: '100%', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#0F172A', outline: 'none' }} />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mobile Number *</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} maxLength={10} placeholder="10 digits" style={{ width: '100%', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#0F172A', outline: 'none', fontFamily: 'monospace' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Relationship *</label>
                    <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} style={{ width: '100%', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#0F172A', outline: 'none' }}>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                
                <div style={{ padding: 14, marginTop: 8, borderRadius: 12, border: '1px solid #CCFBF1', background: '#F0FDFA', color: '#115E59', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <svg style={{ flexShrink: 0, marginTop: 2, color: '#0D9488' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>A secure 6-digit PIN will be generated automatically and the parent will be linked to this student instantly.</p>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 800, border: '1px solid #E2E8F0', color: '#475569', background: 'white', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleAddParent} disabled={saving} style={{ flex: 1, padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 800, color: 'white', background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)' }}>
                  {saving ? 'Creating...' : 'Create & Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCreds && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 380, background: 'white', borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 6, background: 'linear-gradient(to right, #14B8A6, #10B981)' }}></div>
            
            <div style={{ padding: 32 }}>
              <div style={{ width: 80, height: 80, margin: '0 auto 24px', background: '#F0FDFA', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #CCFBF1', fontSize: 36 }}>🎉</div>
              
              <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Success!</h3>
              <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                <strong style={{ color: '#0F172A' }}>{showCreds.name}</strong> has been successfully created and linked.
              </p>
              
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20, textAlign: 'left', marginBottom: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Login Mobile Number</p>
                  <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg color="#94A3B8" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{showCreds.phone}</p>
                  </div>
                </div>
                <div>
                  <p style={{ margin: '0 0 6px 0', fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Generated PIN</p>
                  <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg color="#94A3B8" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: '#0F766E', letterSpacing: 6 }}>{showCreds.pin}</p>
                  </div>
                </div>
              </div>
              
              <p style={{ margin: '0 0 24px 0', fontSize: 12, color: '#64748B', fontWeight: 600 }}>Please share these credentials with the parent. They will be prompted to change their PIN on their first login.</p>
              
              <button onClick={() => setShowCreds(null)} style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 800, color: 'white', background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)' }}>
                Awesome, I'll share it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
