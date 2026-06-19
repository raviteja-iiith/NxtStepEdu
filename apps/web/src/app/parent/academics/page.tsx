'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useParent, ChildInfo } from '@/context/ParentContext';

interface Exam { id: string; name: string; exam_type: string; exam_date: string; total_marks: number; is_published: boolean; subject_name?: string; }
interface Mark { id: string; marks_obtained: number | null; is_absent: boolean; remarks: string | null; exam: Exam | null; }
interface Assignment { id: string; title: string; description: string | null; deadline: string; max_marks: number | null; subject_name?: string; }

function getGrade(obtained: number, total: number) {
  const pct = (obtained / total) * 100;
  if (pct >= 90) return { letter:'A+', color:'#065F46', bg:'#ECFDF5' };
  if (pct >= 75) return { letter:'A',  color:'#166534', bg:'#F0FDF4' };
  if (pct >= 60) return { letter:'B',  color:'#1D4ED8', bg:'#EFF6FF' };
  if (pct >= 45) return { letter:'C',  color:'#D97706', bg:'#FFFBEB' };
  if (pct >= 35) return { letter:'D',  color:'#EA580C', bg:'#FFF7ED' };
  return { letter:'F', color:'#DC2626', bg:'#FEF2F2' };
}

export default function AcademicsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { children, selectedChild: contextChild, setSelectedChild: setContextChild, loading: childLoading } = useParent();
  const [tab, setTab] = useState<'exams'|'marks'|'assignments'>('marks');
  // Local override: allow in-page switching while keeping context in sync
  const [localSelected, setLocalSelected] = useState<ChildInfo | null>(null);
  const selectedChild = localSelected ?? contextChild;
  const [exams, setExams] = useState<Exam[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync local selection when context changes (e.g., sidebar switcher)
  useEffect(() => { setLocalSelected(null); }, [contextChild]);

  const handleSelectChild = (child: ChildInfo) => {
    setLocalSelected(child);
    setContextChild(child);  // also update global context
    setMarks([]); setExams([]); setAssignments([]);
  };

  const linked = childLoading ? null : children.length > 0;

  const fetchData = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { section_id, student_id } = selectedChild;

    const [examRes, markRes, asgRes] = await Promise.all([
      section_id ? supabase.from('exams')
        .select('id, name, exam_type, exam_date, total_marks, is_published, subjects(name)')
        .eq('section_id', section_id).eq('is_published', true).gte('exam_date', today).order('exam_date') : Promise.resolve({ data: null }),
      supabase.from('marks')
        .select('id, marks_obtained, is_absent, remarks, exams(id,name,exam_type,exam_date,total_marks,is_published,subjects(name))')
        .eq('student_id', student_id).order('entered_at', { ascending: false }),
      section_id ? supabase.from('assignments')
        .select('id, title, description, deadline, max_marks, subjects(name)')
        .eq('section_id', section_id).eq('is_published', true).order('deadline', { ascending: false }).limit(20) : Promise.resolve({ data: null }),
    ]);

    if (examRes.data) setExams(examRes.data.map((e: any) => ({ ...e, subject_name: e.subjects?.name })));
    if (markRes.data) setMarks(markRes.data.map((m: any) => ({ ...m, exam: m.exams ? { ...m.exams, subject_name: m.exams.subjects?.name } : null })));
    if (asgRes.data) setAssignments(asgRes.data.map((a: any) => ({ ...a, subject_name: a.subjects?.name })));
    setLoading(false);
  }, [supabase, selectedChild]);

  useEffect(() => { if (selectedChild) fetchData(); }, [fetchData, selectedChild]);

  const TABS = [
    { key: 'marks' as const, label: '📊 Results' },
    { key: 'exams' as const, label: '📝 Upcoming Exams' },
    { key: 'assignments' as const, label: '📚 Assignments' },
  ];

  // Not linked state
  if (linked === false) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
        <div style={{ paddingBottom: 20, borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Academics</h2>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Exam results, upcoming tests, and assignments</p>
        </div>
        <div style={{ background:'white', border:'1px solid #FDE68A', borderRadius:16, padding:'40px 32px', textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:32, border:'1px solid #FDE68A' }}>🔗</div>
          <h3 style={{ fontSize:18, fontWeight:800, color:'#0F172A', margin:'0 0 8px' }}>Account Not Yet Linked</h3>
          <p style={{ fontSize:14, color:'#64748B', lineHeight:1.6, maxWidth:420, margin:'0 auto 20px' }}>
            Your parent account hasn&apos;t been linked to a student yet. Please contact your child&apos;s <strong>class teacher</strong> to link your account.
          </p>
          <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 20px', display:'inline-block' }}>
            <p style={{ fontSize:13, color:'#92400E', margin:0, fontWeight:600 }}>💡 Ask the teacher to go to <strong>Parent Management</strong> and add your account linked to your child.</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (linked === null) {
    return (
      <div style={{ maxWidth:700, margin:'0 auto', display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ height:28, width:200, background:'#F1F5F9', borderRadius:8 }} />
        {[1,2,3].map(i => <div key={i} style={{ height:72, background:'#F1F5F9', borderRadius:12 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Academics</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Exam results, upcoming tests, and assignments</p>
      </div>

      {/* Multi-child Tab Switcher */}
      {children.length > 1 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {children.map(child => (
            <button key={child.student_id} onClick={() => handleSelectChild(child)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 18px', borderRadius:12, border:`2px solid ${selectedChild?.student_id===child.student_id?'#3B82F6':'#E2E8F0'}`, background:selectedChild?.student_id===child.student_id?'#EFF6FF':'white', cursor:'pointer', transition:'all 0.15s' }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#6366F1,#8B5CF6)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700 }}>
                {child.student_name.charAt(0)}
              </div>
              <div style={{ textAlign:'left' }}>
                <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>{child.student_name}</p>
                <p style={{ fontSize:11, color:'#94A3B8', margin:0 }}>{child.class_name} – {child.section_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Single child header */}
      {children.length === 1 && selectedChild && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)', border:'1px solid #DBEAFE', borderRadius:12 }}>
          <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#6366F1,#8B5CF6)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700 }}>
            {selectedChild.student_name.charAt(0)}
          </div>
          <div>
            <p style={{ fontSize:15, fontWeight:800, color:'#0F172A', margin:0 }}>{selectedChild.student_name}</p>
            <p style={{ fontSize:12, color:'#6366F1', margin:0, fontWeight:600 }}>{selectedChild.class_name} – Section {selectedChild.section_name}</p>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div style={{ display:'flex', gap:4, padding:4, borderRadius:12, background:'#F1F5F9' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, padding:'9px 12px', borderRadius:9, fontSize:13, fontWeight:600, border:'none', cursor:'pointer', transition:'all 0.15s',
              background:tab===t.key?'white':'transparent', color:tab===t.key?'#7C3AED':'#64748B',
              boxShadow:tab===t.key?'0 1px 4px rgba(0,0,0,0.1)':'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:80, background:'#F1F5F9', borderRadius:12 }} />)}
        </div>
      ) : tab === 'marks' ? (
        marks.length === 0 ? (
          <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
            <p style={{ fontSize:28 }}>📊</p>
            <p style={{ fontWeight:600, color:'#475569' }}>No marks entered yet</p>
            <p style={{ fontSize:13, color:'#94A3B8' }}>Results will appear here once your child&apos;s teacher enters marks</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
              <p style={{ fontSize:13, color:'#64748B', margin:0 }}>{marks.length} result{marks.length !== 1 ? 's' : ''} found</p>
              <button
                onClick={() => router.push('/parent/academics/analysis')}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#7C3AED,#6366F1)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(124,58,237,0.3)' }}
              >
                📊 View Full Analysis
              </button>
            </div>
            {marks.map(m => {
              const pct = m.marks_obtained != null && m.exam ? Math.round((m.marks_obtained/m.exam.total_marks)*100) : null;
              const grade = m.marks_obtained != null && m.exam ? getGrade(m.marks_obtained, m.exam.total_marks) : null;
              const isPassing = m.marks_obtained != null && m.exam && m.marks_obtained >= m.exam.total_marks * 0.35;
              return (
                <div key={m.id} style={{ background:'white', border:'1px solid #E8ECF0', borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, color:'#0F172A', margin:0, fontSize:14 }}>{m.exam?.name}</p>
                    <p style={{ fontSize:12, color:'#64748B', margin:'3px 0 0' }}>
                      {m.exam?.subject_name} · {m.exam?.exam_type?.replace('_',' ')} · {m.exam?.exam_date ? new Date(m.exam.exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : ''}
                    </p>
                    {m.remarks && <p style={{ fontSize:11, color:'#94A3B8', margin:'4px 0 0' }}>Remarks: {m.remarks}</p>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginLeft:16 }}>
                    {m.is_absent ? (
                      <span style={{ fontSize:13, fontWeight:700, padding:'4px 12px', borderRadius:99, background:'#FEF2F2', color:'#DC2626', border:'1px solid #FEE2E2' }}>Absent</span>
                    ) : m.marks_obtained != null && m.exam ? (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                        <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                          <span style={{ fontSize:26, fontWeight:900, color:'#0F172A' }}>{m.marks_obtained}</span>
                          <span style={{ fontSize:13, color:'#94A3B8' }}>/{m.exam.total_marks}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          {pct != null && <span style={{ fontSize:13, fontWeight:700, color:isPassing?'#16A34A':'#DC2626' }}>{pct}%</span>}
                          {grade && <span style={{ fontSize:12, fontWeight:800, padding:'2px 8px', borderRadius:6, background:grade.bg, color:grade.color }}>{grade.letter}</span>}
                        </div>
                        <span style={{ fontSize:11, fontWeight:600, color:isPassing?'#16A34A':'#DC2626' }}>{isPassing?'✓ Pass':'✗ Fail'}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:12, color:'#CBD5E1' }}>Not entered</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'exams' ? (
        exams.length === 0 ? (
          <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
            <p style={{ fontSize:28 }}>📝</p>
            <p style={{ fontWeight:600, color:'#475569' }}>No upcoming exams</p>
            <p style={{ fontSize:13, color:'#94A3B8' }}>Upcoming exams will appear here when scheduled by the school</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {exams.map(e => {
              const daysLeft = Math.ceil((new Date(e.exam_date).getTime() - Date.now()) / 86400000);
              return (
                <div key={e.id} style={{ background:'white', border:'1px solid #E8ECF0', borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div>
                    <p style={{ fontWeight:700, color:'#0F172A', margin:0, fontSize:14 }}>{e.name}</p>
                    <p style={{ fontSize:12, color:'#64748B', margin:'3px 0 0' }}>{e.subject_name} · {e.exam_type?.replace('_',' ')}</p>
                    <p style={{ fontSize:11, color:'#94A3B8', margin:'3px 0 0' }}>Total: {e.total_marks} marks</p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginLeft:16 }}>
                    <p style={{ fontSize:15, fontWeight:800, color:'#7C3AED', margin:0 }}>{new Date(e.exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</p>
                    <p style={{ fontSize:11, fontWeight:600, margin:'4px 0 0', color:daysLeft<=3?'#DC2626':daysLeft<=7?'#D97706':'#64748B' }}>
                      {daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `in ${daysLeft} days`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        assignments.length === 0 ? (
          <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
            <p style={{ fontSize:28 }}>📚</p>
            <p style={{ fontWeight:600, color:'#475569' }}>No assignments yet</p>
            <p style={{ fontSize:13, color:'#94A3B8' }}>Assignments will appear here when published by teachers</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {assignments.map(a => {
              const isOverdue = new Date(a.deadline) < new Date();
              return (
                <div key={a.id} style={{ background:'white', border:`1px solid ${isOverdue?'#FEE2E2':'#E8ECF0'}`, borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, color:'#0F172A', margin:0, fontSize:14 }}>{a.title}</p>
                    <p style={{ fontSize:12, color:'#64748B', margin:'3px 0 0' }}>{a.subject_name}</p>
                    {a.description && <p style={{ fontSize:12, color:'#94A3B8', margin:'4px 0 0', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{a.description}</p>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginLeft:16 }}>
                    <p style={{ fontSize:11, color:'#94A3B8', margin:'0 0 3px' }}>Deadline</p>
                    <p style={{ fontSize:14, fontWeight:700, margin:0, color:isOverdue?'#DC2626':'#7C3AED' }}>{new Date(a.deadline).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</p>
                    {a.max_marks && <p style={{ fontSize:11, color:'#94A3B8', margin:'3px 0 0' }}>{a.max_marks} marks</p>}
                    {isOverdue && <span style={{ fontSize:10, fontWeight:700, color:'#DC2626', background:'#FEF2F2', padding:'2px 7px', borderRadius:99, marginTop:4, display:'inline-block' }}>OVERDUE</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
