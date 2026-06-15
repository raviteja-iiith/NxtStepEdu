'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Exam { id: string; name: string; exam_type: string; exam_date: string; total_marks: number; is_published: boolean; subject_name?: string; }
interface Mark { id: string; marks_obtained: number | null; is_absent: boolean; remarks: string | null; exam: Exam | null; }
interface Assignment { id: string; title: string; description: string | null; deadline: string; max_marks: number | null; subject_name?: string; }

export default function AcademicsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<'exams' | 'marks' | 'assignments'>('exams');
  const [exams, setExams] = useState<Exam[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const fetchStudentLink = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const { data: link } = await supabase
      .from('student_parent_links')
      .select('student_id, students(full_name, section_id)')
      .eq('parent_id', userId)
      .limit(1)
      .maybeSingle();
    if (link) {
      setStudentId(link.student_id);
      setSectionId((link.students as any)?.section_id || '');
    }
  }, [supabase]);

  const fetchData = useCallback(async () => {
    if (!sectionId && !studentId) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // Fetch upcoming exams for this section
    if (sectionId) {
      const { data: examData } = await supabase
        .from('exams')
        .select('id, name, exam_type, exam_date, total_marks, is_published, subjects(name)')
        .eq('section_id', sectionId)
        .eq('is_published', true)
        .gte('exam_date', today)
        .order('exam_date');
      if (examData) setExams(examData.map((e: any) => ({ ...e, subject_name: e.subjects?.name })));
    }

    // Fetch marks for this student
    if (studentId) {
      const { data: markData } = await supabase
        .from('marks')
        .select('id, marks_obtained, is_absent, remarks, exams(id, name, exam_type, exam_date, total_marks, is_published, subjects(name))')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (markData) setMarks(markData.map((m: any) => ({ ...m, exam: m.exams ? { ...m.exams, subject_name: m.exams.subjects?.name } : null })));

      // Fetch assignments for student's section
      if (sectionId) {
        const { data: asgns } = await supabase
          .from('assignments')
          .select('id, title, description, deadline, max_marks, subjects(name)')
          .eq('section_id', sectionId)
          .eq('is_published', true)
          .order('deadline', { ascending: false })
          .limit(20);
        if (asgns) setAssignments(asgns.map((a: any) => ({ ...a, subject_name: a.subjects?.name })));
      }
    }

    setLoading(false);
  }, [supabase, studentId, sectionId]);

  useEffect(() => { fetchStudentLink(); }, [fetchStudentLink]);
  useEffect(() => { if (studentId || sectionId) fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Academics</h2>
        <p className="text-gray-500 text-sm mt-1">Exams, results, assignments, and performance</p>
      </div>
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {[{ key: 'exams' as const, label: '📝 Upcoming Exams' }, { key: 'marks' as const, label: '📊 Results' }, { key: 'assignments' as const, label: '📚 Assignments' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#7C3AED' : '#64748B', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : tab === 'exams' ? (
        exams.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-3xl mb-2">📝</p>
            <p className="text-gray-400 text-sm">No upcoming exams scheduled</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exams.map(e => (
              <div key={e.id} className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E2E8F0' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">{e.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{e.subject_name} • {e.exam_type?.replace('_', ' ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-purple-600">{new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{e.total_marks} marks</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'marks' ? (
        marks.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-3xl mb-2">📊</p>
            <p className="text-gray-400 text-sm">No marks have been entered yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {marks.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between" style={{ borderColor: '#E2E8F0' }}>
                <div>
                  <p className="font-bold text-gray-900">{m.exam?.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{m.exam?.subject_name} • {new Date(m.exam?.exam_date || '').toLocaleDateString('en-IN')}</p>
                  {m.remarks && <p className="text-xs text-gray-400 mt-1">Remarks: {m.remarks}</p>}
                </div>
                <div className="text-right">
                  {m.is_absent ? (
                    <span className="px-3 py-1 bg-red-100 text-red-600 text-sm font-semibold rounded-full">Absent</span>
                  ) : (
                    <>
                      <p className="text-2xl font-black text-purple-600">{m.marks_obtained ?? '—'}</p>
                      <p className="text-xs text-gray-400">/ {m.exam?.total_marks}</p>
                      {m.marks_obtained != null && m.exam?.total_marks && (
                        <p className="text-xs font-semibold mt-0.5" style={{ color: (m.marks_obtained / m.exam.total_marks) >= 0.4 ? '#16A34A' : '#DC2626' }}>
                          {Math.round((m.marks_obtained / m.exam.total_marks) * 100)}%
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        assignments.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-3xl mb-2">📚</p>
            <p className="text-gray-400 text-sm">No assignments published yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E2E8F0' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{a.subject_name}</p>
                    {a.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-gray-400">Deadline</p>
                    <p className="text-sm font-bold" style={{ color: new Date(a.deadline) < new Date() ? '#DC2626' : '#7C3AED' }}>
                      {new Date(a.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                    {a.max_marks && <p className="text-xs text-gray-400 mt-0.5">{a.max_marks} marks</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
