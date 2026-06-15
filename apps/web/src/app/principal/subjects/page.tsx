'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PrincipalSubjectsPage() {
  const supabase = createClient();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<{id:string;full_name:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (u?.school_id) {
        // Fetch subjects — use plain select to avoid FK alias confusion
        const { data } = await supabase
          .from('subjects')
          .select('id, name, code, school_id, class_id, teacher_id, classes(name)')
          .eq('school_id', u.school_id)
          .order('name');

        if (data) {
          // Separately fetch teacher names for all teacher_ids
          const teacherIds = [...new Set((data as any[]).filter((s: any) => s.teacher_id).map((s: any) => s.teacher_id))];
          let teacherMap: Record<string, string> = {};
          if (teacherIds.length > 0) {
            const { data: tData } = await supabase
              .from('users')
              .select('id, full_name')
              .in('id', teacherIds as string[]);
            if (tData) tData.forEach((t: any) => { teacherMap[t.id] = t.full_name; });
          }
          setSubjects((data as any[]).map((s: any) => ({ ...s, teacher_name: s.teacher_id ? teacherMap[s.teacher_id] : null })));
        }

        // Fetch all active teachers for this school for the assignment dropdown
        const { data: tList } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('school_id', u.school_id)
          .eq('role', 'teacher')
          .eq('is_active', true)
          .order('full_name');
        if (tList) setTeachers(tList);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);

  const handleAssignTeacher = async (subjectId: string, classId: string) => {
    setSaving(true);
    // 1. Update subjects table
    await supabase.from('subjects').update({ teacher_id: selectedTeacher || null }).eq('id', subjectId);

    // 2. Sync teacher_section_assignments ─ remove old entries for this subject
    await supabase.from('teacher_section_assignments').delete().eq('subject_id', subjectId);

    if (selectedTeacher) {
      // 3. Get all sections for this class + current academic year
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId || '').single();
      const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
      const { data: secs } = await supabase.from('sections').select('id').eq('class_id', classId);

      if (secs && secs.length > 0 && userRow?.school_id) {
        const assignments = secs.map((s: any) => ({
          teacher_id: selectedTeacher,
          section_id: s.id,
          subject_id: subjectId,
          school_id: userRow.school_id,
          academic_year_id: yr?.id || null,
        }));
        await supabase.from('teacher_section_assignments')
          .upsert(assignments, { onConflict: 'teacher_id,section_id,subject_id,academic_year_id', ignoreDuplicates: true });
      }
    }

    setEditingId(null);
    setSelectedTeacher('');
    fetchSubjects();
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Subjects</h2>
        <p className="text-slate-500 text-sm mt-1">All subjects configured for this school</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : subjects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-4xl mb-3">📚</p>
          <p className="text-slate-600 font-semibold">No subjects configured yet</p>
          <p className="text-sm text-slate-400 mt-1">Go to Academics → Subjects to add subjects.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Class</th>
                <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Teacher</th>
                <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {subjects.map((sub: any) => (
                <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-semibold text-slate-800">{sub.name}</td>
                  <td className="py-4 px-6 text-slate-600">{sub.classes?.name || '—'}</td>
                  <td className="py-4 px-6">
                    {editingId === sub.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedTeacher}
                          onChange={e => setSelectedTeacher(e.target.value)}
                          className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ borderColor: '#E2E8F0' }}
                        >
                          <option value="">— Remove teacher —</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                        <button onClick={() => handleAssignTeacher(sub.id, sub.class_id)} disabled={saving}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                          style={{ background: '#1E40AF' }}>{saving ? '...' : 'Save'}</button>
                        <button onClick={() => { setEditingId(null); setSelectedTeacher(''); }}
                          className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className={sub.teacher_name ? 'text-slate-700 font-medium' : 'text-slate-400 italic'}>
                          {sub.teacher_name || 'Not assigned'}
                        </span>
                        <button
                          onClick={() => { setEditingId(sub.id); setSelectedTeacher(sub.teacher_id || ''); }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg hover:shadow-sm transition-all"
                          style={{ background: '#EFF6FF', color: '#1E40AF' }}
                        >
                          {sub.teacher_name ? 'Change' : 'Assign'}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-6"><span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-mono">{sub.code || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
