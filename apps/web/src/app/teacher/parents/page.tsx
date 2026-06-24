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

    // Step 1: Get teacher's sections
    const { data: classSecs } = await supabase
      .from('sections')
      .select('id')
      .eq('class_teacher_id', userId);

    const { data: subjectAsgn } = await supabase
      .from('teacher_section_assignments')
      .select('section_id')
      .eq('teacher_id', userId);

    const allSectionIds = [
      ...new Set([
        ...(classSecs || []).map((s: any) => s.id as string),
        ...(subjectAsgn || []).map((a: any) => a.section_id as string),
      ])
    ];

    if (allSectionIds.length === 0) {
      setStudents([]);
      setParents([]);
      setLoading(false);
      return;
    }

    // Step 2: Get all students in teacher's sections
    const { data: studentData } = await supabase
      .from('students')
      .select('id, full_name, sections(name)')
      .in('section_id', allSectionIds)
      .neq('is_active', false)
      .order('full_name');

    const myStudents = studentData || [];
    setStudents(myStudents.map((s: any) => ({
      id: s.id,
      full_name: s.full_name,
      section_name: (s.sections as any)?.name || '',
    })));

    const studentIds = myStudents.map((s: any) => s.id as string);
    if (studentIds.length === 0) {
      setParents([]);
      setLoading(false);
      return;
    }

    // Step 3: Get parent links for those students
    const { data: links } = await supabase
      .from('student_parent_links')
      .select('parent_id, student_id, students(id, full_name, sections(name)), users(id, full_name, phone, is_active)')
      .in('student_id', studentIds);

    // Build a map: student_id → parent record
    const parentByStudent = new Map<string, ParentRecord>();
    (links || []).forEach((l: any) => {
      if (!l.parent_id) return;
      parentByStudent.set(l.student_id, {
        id: l.parent_id,
        full_name: l.users?.full_name || 'Unknown',
        phone: l.users?.phone || null,
        is_active: l.users?.is_active ?? true,
        student_name: l.students?.full_name || '',
        section_name: (l.students?.sections as any)?.name || '',
      });
    });

    // Show one entry per student: either their linked parent or "No parent" placeholder
    const list: ParentRecord[] = [];
    myStudents.forEach((s: any) => {
      const linked = parentByStudent.get(s.id);
      if (linked) {
        list.push(linked);
      } else {
        // Student has no parent — show them so teacher knows to add one
        list.push({
          id: `no-parent-${s.id}`,   // synthetic id to avoid key collision
          full_name: '',
          phone: null,
          is_active: true,
          student_name: s.full_name,
          section_name: (s.sections as any)?.name || '',
        });
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
      // Step 1: Create the auth user + users row
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
      if (!res.ok) { setFormError(result.error || 'Failed to create parent account'); setSaving(false); return; }

      const newParentId: string = result.userId;
      if (!newParentId) { setFormError('Parent created but no userId returned — contact admin.'); setSaving(false); return; }

      // Step 2: Link parent to student
      // Note: student_parent_links has NO school_id column.
      // relationship must be one of: 'father','mother','guardian','other'
      const { error: linkError } = await supabase.from('student_parent_links').insert({
        parent_id: newParentId,
        student_id: selectedStudentId,
        relationship: form.relationship || 'guardian',
        is_primary_contact: true,
        created_by: userId,
      });

      if (linkError) {
        // Parent account was created, but linking failed — show a clear error
        setFormError(`Parent account created but linking failed: ${linkError.message}. Please link manually from the student profile.`);
        setSaving(false);
        fetchParentsAndStudents();
        return;
      }

      setShowAddModal(false);
      setShowCreds({ phone: form.phone, pin, name: form.full_name });
      setForm({ full_name: '', phone: '', relationship: 'guardian' });
      setSelectedStudentId('');
      fetchParentsAndStudents();
    } catch (err: any) { setFormError(`Network error: ${err?.message || 'Please try again.'}`); }
    setSaving(false);
  };

  const handleLinkExisting = async () => {
    if (!showLinkModal || !linkStudentId) { setLinkError('Please select a student'); return; }
    setLinking(true); setLinkError('');
    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    const { error } = await supabase.from('student_parent_links').insert({
      parent_id: showLinkModal.parentId,
      student_id: linkStudentId,
      relationship: linkRelationship || 'guardian',
      is_primary_contact: true,
      created_by: userId,
    });
    if (error) { setLinkError(error.message); setLinking(false); return; }
    setShowLinkModal(null); setLinkStudentId(''); setLinkRelationship('guardian');
    fetchParentsAndStudents();
    setLinking(false);
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

      <div className="bg-white rounded-2xl border" style={{ borderColor: '#E2E8F0' }}>
        {loading ? (
          <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
        ) : (
          <div className="flex flex-col">
            {/* Header */}
            <div className="hidden md:grid grid-cols-[2fr_110px_1.5fr_80px_120px] px-6 py-3 text-xs font-semibold text-gray-500 uppercase border-b" style={{ background: '#F8FAFC', borderColor: '#F1F5F9' }}>
              <div>Parent</div>
              <div>Phone (Login)</div>
              <div>Child</div>
              <div>Status</div>
              <div className="text-right">Actions</div>
            </div>

            {/* Body */}
            <div className="flex flex-col divide-y" style={{ borderColor: '#F1F5F9' }}>
              {filtered.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  <p className="text-3xl mb-2">👨‍👩‍👧</p>
                  <p className="text-sm">No parents found for your sections.</p>
                </div>
              ) : filtered.map(p => {
                const hasParent = !!p.full_name;
                return (
                  <div key={p.id} className="grid grid-cols-1 md:grid-cols-[2fr_110px_1.5fr_80px_120px] gap-3 md:gap-0 px-6 py-4 items-center hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: hasParent ? '#F5F3FF' : '#F8FAFC', color: hasParent ? '#7C3AED' : '#94A3B8' }}>
                        {hasParent ? p.full_name.charAt(0) : '?'}
                      </div>
                      {hasParent
                        ? <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                        : <p className="text-sm text-gray-400 italic">No parent yet</p>
                      }
                    </div>
                    <div className="font-mono text-sm text-gray-600">{p.phone || '—'}</div>
                    <div className="text-sm">
                      {p.student_name
                        ? <span className="text-gray-700 font-medium">{p.student_name} {p.section_name && <span className="text-xs text-gray-400">(Sec {p.section_name})</span>}</span>
                        : <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: '#FFFBEB', color: '#D97706' }}>⚠️ Not linked</span>
                      }
                    </div>
                    <div>
                      {hasParent
                        ? <span className="text-xs font-medium px-2.5 py-1 rounded-full w-fit" style={{ background: p.is_active ? '#F0FDF4' : '#FEF2F2', color: p.is_active ? '#16A34A' : '#DC2626' }}>{p.is_active ? 'Active' : 'Inactive'}</span>
                        : <span className="text-xs font-medium px-2.5 py-1 rounded-full w-fit" style={{ background: '#FEF9C3', color: '#854D0E' }}>Unlinked</span>
                      }
                    </div>
                    <div className="flex justify-start md:justify-end">
                      {!hasParent && (
                        <button
                          onClick={() => { setShowAddModal(true); setFormError(''); setSelectedStudentId(p.id.replace('no-parent-', '')); }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg w-fit"
                          style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #DCFCE7' }}>
                          + Add Parent
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Relationship to Child *</label>
                <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" style={{ borderColor: '#E2E8F0' }}>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="p-3 rounded-lg text-xs text-teal-700" style={{ background: '#F0FDF4' }}>✅ A 6-digit PIN will be auto-generated. The parent will be automatically linked to the selected student.</div>
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
            <p className="text-gray-500 text-sm mb-2">{showCreds.name} has been created and <strong>linked to the student</strong>.</p>
            <div className="p-4 rounded-xl space-y-3 mb-4" style={{ background: '#F1F5F9' }}>
              <div><p className="text-xs text-gray-500">Phone (Login)</p><p className="font-mono font-bold text-gray-900">{showCreds.phone}</p></div>
              <div><p className="text-xs text-gray-500">6-digit PIN</p><p className="font-mono font-bold text-gray-900 text-xl tracking-widest">{showCreds.pin}</p></div>
            </div>
            <p className="text-xs text-gray-400 mb-4">Share these credentials with the parent. They will be asked to change PIN on first login.</p>
            <button onClick={() => setShowCreds(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#0F766E' }}>Done</button>
          </div>
        </div>
      )}

      {/* Link to Child Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Link Parent to Child</h3>
                <p className="text-sm text-gray-500 mt-1">{showLinkModal.parentName}</p>
              </div>
              <button onClick={() => setShowLinkModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {linkError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{linkError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Select Student *</label>
                <select value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }}>
                  <option value="">Choose student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name} (Sec {s.section_name})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Relationship *</label>
                <select value={linkRelationship} onChange={e => setLinkRelationship(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }}>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowLinkModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleLinkExisting} disabled={linking}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#1E40AF' }}>
                {linking ? 'Linking...' : '🔗 Link Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

