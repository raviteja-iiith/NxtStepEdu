'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Student {
  id: string; full_name: string; admission_number: string | null; date_of_birth: string | null;
  gender: string | null; blood_group: string | null; roll_number: number | null;
  is_active: boolean; admission_date: string | null;
  class_name?: string; section_name?: string;
}

interface ClassItem { id: string; name: string; }
interface SectionItem { id: string; name: string; class_id: string; }

export default function StudentsPage() {
  const supabase = createClient();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    full_name: '', date_of_birth: '', gender: '', blood_group: '', class_id: '', section_id: '',
    roll_number: '', address: '', admission_number: '', admission_date: new Date().toISOString().split('T')[0]
  });

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: currentUser } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!currentUser?.school_id) { setLoading(false); return; }
    let q = supabase.from('students').select('*, classes(name), sections(name)').eq('school_id', currentUser.school_id).eq('is_active', true).order('full_name');
    if (filterClass) q = q.eq('class_id', filterClass);
    if (filterSection) q = q.eq('section_id', filterSection);
    const { data } = await q;
    if (data) setStudents(data.map((s: Record<string, unknown>) => ({
      ...s, class_name: (s.classes as Record<string, string>)?.name, section_name: (s.sections as Record<string, string>)?.name,
    })) as Student[]);
    setLoading(false);
  }, [supabase, filterClass, filterSection]);

  const fetchStructure = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!userRow?.school_id) return;

    // Try current academic year first, fall back to all classes in school
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', userRow.school_id).maybeSingle();
    if (yr) {
      const { data: c } = await supabase.from('classes').select('id, name').eq('academic_year_id', yr.id).order('numeric_order');
      if (c) setClasses(c);
      const { data: s } = await supabase.from('sections').select('id, name, class_id').eq('academic_year_id', yr.id);
      if (s) setSections(s);
    } else {
      // No current academic year - load classes/sections by school_id
      const { data: c } = await supabase.from('classes').select('id, name').eq('school_id', userRow.school_id).order('numeric_order');
      if (c) setClasses(c);
      const { data: s } = await supabase.from('sections').select('id, name, class_id').eq('school_id', userRow.school_id);
      if (s) setSections(s);
    }
  }, [supabase]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const filteredSections = sections.filter(s => !form.class_id || s.class_id === form.class_id);
  const filterSections2 = sections.filter(s => !filterClass || s.class_id === filterClass);

  const handleAdd = async () => {
    if (!form.full_name || !form.date_of_birth || !form.gender || !form.class_id || !form.section_id) {
      setFormError('Name, DOB, gender, class & section are required'); return;
    }
    setSaving(true); setFormError('');

    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId).single();
    const schoolId = userRow?.school_id;
    if (!schoolId) { setFormError('Could not determine school. Please refresh.'); setSaving(false); return; }

    // Get current academic year (scoped to this school)
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', schoolId).maybeSingle();

    // Auto-generate admission number using school_id prefix + year + sequence
    const year = new Date().getFullYear();
    const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId);
    const admNum = form.admission_number || `STU-${year}-${String((studentCount || 0) + 1).padStart(4, '0')}`;
    const rollNo = form.roll_number ? parseInt(form.roll_number) : null;

    const { data: insertedData, error } = await supabase.from('students').insert({
      full_name: form.full_name,
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      blood_group: form.blood_group || null,
      class_id: form.class_id,
      section_id: form.section_id,
      roll_number: rollNo,
      address: form.address || null,
      admission_number: admNum,
      admission_date: form.admission_date,
      academic_year_id: yr?.id || null,
      school_id: schoolId,
      is_active: true,
    }).select();

    if (error) {
      setFormError(`Error: ${error.message}`);
      setSaving(false);
      return;
    }

    if (!insertedData || insertedData.length === 0) {
      setFormError('Student could not be saved. This may be a permissions issue. Please ensure you are logged in as Principal and try again.');
      setSaving(false);
      return;
    }

    setShowAdd(false);
    setForm({ full_name: '', date_of_birth: '', gender: '', blood_group: '', class_id: '', section_id: '', roll_number: '', address: '', admission_number: '', admission_date: new Date().toISOString().split('T')[0] });
    fetchStudents();
    setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('students').update({ is_active: !current }).eq('id', id);
    fetchStudents();
  };

  const searched = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.admission_number || '').toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Student Management</h2><p className="text-gray-500 text-sm mt-1">Admissions, profiles, and academic tracking</p></div>
        <button onClick={() => { setShowAdd(true); setFormError(''); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg transition-all" style={{ background: '#1E40AF' }}>+ Admit Student</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input type="text" placeholder="Search by name or admission number..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: '#E2E8F0' }} /></div>
        <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterSection(''); }} className="px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }}><option value="">All Classes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }}><option value="">All Sections</option>{filterSections2.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <span className="text-sm text-gray-500">{searched.length} student{searched.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div> : (
          <table className="w-full">
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Admission No.</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Class</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Roll No.</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Gender</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {searched.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">👨‍🎓</p><p className="text-sm">No students found.</p></td></tr>
              ) : searched.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setShowProfile(s)}>
                  <td className="px-6 py-4"><p className="text-sm font-semibold text-gray-900">{s.full_name}</p></td>
                  <td className="px-6 py-4"><code className="text-xs px-2 py-1 rounded" style={{ background: '#F1F5F9' }}>{s.admission_number || '—'}</code></td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.class_name} - {s.section_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.roll_number ?? '—'}</td>
                  <td className="px-6 py-4"><span className="text-xs font-medium px-2 py-1 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{s.gender || '—'}</span></td>
                  <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setShowProfile(s)} className="text-xs text-blue-600 hover:underline mr-2">View</button>
                    <button onClick={() => toggleActive(s.id, s.is_active)} className="text-xs text-red-500 hover:underline">Deactivate</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Student Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Admit New Student</h3><button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label><input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label><select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class *</label><select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value, section_id: '' }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Section *</label><select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Admission No.</label><input placeholder="Auto-generated" value={form.admission_number} onChange={e => setForm(f => ({ ...f, admission_number: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label><input type="number" value={form.roll_number} onChange={e => setForm(f => ({ ...f, roll_number: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label><select value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">Select...</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Admission Date</label><input type="date" value={form.admission_date} onChange={e => setForm(f => ({ ...f, admission_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls + ' resize-none'} rows={2} style={{ borderColor: '#E2E8F0' }} /></div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#1E40AF' }}>{saving ? 'Admitting...' : 'Admit Student'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Student Profile</h3><button onClick={() => setShowProfile(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-3xl mb-3" style={{ background: '#EFF6FF' }}>👨‍🎓</div>
              <h4 className="text-lg font-bold text-gray-900">{showProfile.full_name}</h4>
              <p className="text-sm text-gray-500">{showProfile.class_name} - {showProfile.section_name}</p>
            </div>
            <div className="space-y-3">
              {[
                ['Admission No.', showProfile.admission_number],
                ['Roll Number', showProfile.roll_number],
                ['Date of Birth', showProfile.date_of_birth ? new Date(showProfile.date_of_birth).toLocaleDateString('en-IN') : null],
                ['Gender', showProfile.gender],
                ['Blood Group', showProfile.blood_group],
                ['Admission Date', showProfile.admission_date ? new Date(showProfile.admission_date).toLocaleDateString('en-IN') : null],
              ].map(([label, value], i) => (
                <div key={i} className="flex justify-between p-3 rounded-lg" style={{ background: '#F8FAFC' }}>
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className="text-sm font-medium text-gray-900 capitalize">{value ?? '—'}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowProfile(null)} className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#1E40AF' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
