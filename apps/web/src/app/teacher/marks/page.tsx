'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function MarksPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Record<string, unknown>[]>([]);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [marks, setMarks] = useState<Record<string, { marks: string; absent: boolean; remarks: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchExams = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    // First get teacher's subjects
    const { data: assignments } = await supabase.from('teacher_section_assignments').select('subject_id, section_id').eq('teacher_id', userId);
    
    if (assignments && assignments.length > 0) {
      const subjectIds = [...new Set(assignments.map((a: Record<string, any>) => a.subject_id).filter(Boolean))];
      const sectionIds = [...new Set(assignments.map((a: Record<string, any>) => a.section_id).filter(Boolean))];
      
      if (subjectIds.length > 0) {
        // Fetch exams: match by subject AND (section matches OR section is null meaning all sections)
        const { data } = await supabase.from('exams')
          .select('*, subjects(name), classes(name)')
          .eq('is_published', true)
          .in('subject_id', subjectIds)
          .order('exam_date', { ascending: false });

        // Filter client-side: include exams where section_id is null OR in teacher's sections
        const filtered = (data || []).filter((e: Record<string, any>) =>
          !e.section_id || sectionIds.includes(e.section_id)
        );
        setExams(filtered);
      }
    }
    setLoading(false); // Always called regardless of assignments
  }, [supabase]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const selectExam = async (examId: string) => {
    setSelectedExam(examId);
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;
    
    let stds: Record<string, unknown>[] | null = null;
    if (exam.section_id) {
      // Section-specific exam: fetch students from that section
      const { data } = await supabase.from('students').select('id, full_name, roll_number').eq('section_id', exam.section_id as string).eq('is_active', true).order('roll_number');
      stds = data;
    } else if (exam.class_id) {
      // Whole-class exam: fetch all students in the class
      const { data } = await supabase.from('students').select('id, full_name, roll_number').eq('class_id', exam.class_id as string).eq('is_active', true).order('roll_number');
      stds = data;
    }
    if (stds) setStudents(stds);
    const { data: existing } = await supabase.from('marks').select('student_id, marks_obtained, is_absent, remarks').eq('exam_id', examId);
    const map: Record<string, { marks: string; absent: boolean; remarks: string }> = {};
    stds?.forEach((s: Record<string, unknown>) => {
      const e = existing?.find((m: Record<string, unknown>) => m.student_id === s.id);
      map[s.id as string] = { marks: e ? String(e.marks_obtained || '') : '', absent: !!e?.is_absent, remarks: e?.remarks as string || '' };
    });
    setMarks(map);
  };

  const handleSave = async () => {
    setSaving(true); setSaveStatus('idle');
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setSaving(false); return; }
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', userId).single();
    // Delete existing marks for this exam then reinsert (upsert pattern)
    const { error: delError } = await supabase.from('marks').delete().eq('exam_id', selectedExam);
    if (delError) { setSaveStatus('error'); setSaving(false); return; }
    const records = Object.entries(marks).map(([studentId, m]) => ({
      exam_id: selectedExam, student_id: studentId, school_id: userData?.school_id,
      marks_obtained: m.absent ? null : (m.marks ? parseFloat(m.marks) : null),
      is_absent: m.absent, remarks: m.remarks || null, entered_by: userId,
    }));
    const { error: insertError } = await supabase.from('marks').insert(records);
    if (insertError) { setSaveStatus('error'); } else { setSaveStatus('success'); setTimeout(() => setSaveStatus('idle'), 3000); }
    setSaving(false);
  };

  const exam = exams.find(e => e.id === selectedExam);

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">Marks Entry</h2><p className="text-gray-500 text-sm mt-1">Enter marks for published exams</p></div>
      <select value={selectedExam} onChange={e => selectExam(e.target.value)} className="px-4 py-2.5 border rounded-xl text-sm font-medium" style={{ borderColor: '#E2E8F0' }}>
        <option value="">Select Exam...</option>{exams.map(e => <option key={e.id as string} value={e.id as string}>{e.name as string} — {(e.subjects as Record<string, string>)?.name} ({(e.classes as Record<string, string>)?.name})</option>)}
      </select>
      {!selectedExam ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}><p className="text-3xl mb-2">📊</p><p className="text-gray-400">Select an exam to enter marks</p></div>
      ) : loading ? <div className="skeleton h-64 rounded-2xl" /> : (
        <>
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#F8FAFC' }}>
              <span className="text-sm font-medium text-gray-500">Total Marks: {exam?.total_marks as number} | Pass: {exam?.passing_marks as number || '—'}</span>
              <span className="text-sm text-gray-500">{students.length} students</span>
            </div>
            <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {students.map((s, i) => (
                <div key={s.id as string} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-6">{(s.roll_number as number) || i + 1}</span>
                  <span className="text-sm font-medium text-gray-900 flex-1">{s.full_name as string}</span>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={marks[s.id as string]?.absent || false} onChange={e => setMarks(m => ({ ...m, [s.id as string]: { ...m[s.id as string], absent: e.target.checked, marks: e.target.checked ? '' : m[s.id as string]?.marks || '' } }))} />Absent</label>
                  <input type="number" placeholder="Marks" disabled={marks[s.id as string]?.absent} value={marks[s.id as string]?.marks || ''} onChange={e => setMarks(m => ({ ...m, [s.id as string]: { ...m[s.id as string], marks: e.target.value } }))}
                    className="w-20 px-3 py-1.5 border rounded-lg text-sm text-center disabled:opacity-40" style={{ borderColor: '#E2E8F0' }} min={0} max={exam?.total_marks as number} />
                  <input type="text" placeholder="Remarks" value={marks[s.id as string]?.remarks || ''} onChange={e => setMarks(m => ({ ...m, [s.id as string]: { ...m[s.id as string], remarks: e.target.value } }))}
                    className="w-32 px-3 py-1.5 border rounded-lg text-sm" style={{ borderColor: '#E2E8F0' }} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end items-center gap-4">
            {saveStatus === 'success' && <span className="text-sm font-medium" style={{ color: '#16A34A' }}>✅ Marks saved successfully!</span>}
            {saveStatus === 'error' && <span className="text-sm font-medium" style={{ color: '#DC2626' }}>❌ Failed to save. Try again.</span>}
            <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#0F766E' }}>{saving ? 'Saving...' : 'Save Marks'}</button>
          </div>
        </>
      )}
    </div>
  );
}
