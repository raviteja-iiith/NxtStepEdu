'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTeacherSections, getSectionStudents, getStudentAttendance, getUserProfile } from '@school-erp/supabase/queries';
import { createNotification } from '@/components/NotificationBell';

interface Student { id: string; full_name: string; roll_number: number | null; }
interface Section { id: string; name: string; class_name: string; }

type Status = 'present' | 'absent' | 'late' | 'excused';

export default function AttendancePage() {
  const supabase = createClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const data = await getTeacherSections(supabase, userId);
      setSections(data);
    }
    setLoading(false);
  }, [supabase]);

  const fetchStudents = useCallback(async () => {
    if (!selectedSection) return;
    const data = await getSectionStudents(supabase, selectedSection);
    
    if (data) {
      setStudents(data);
      // Check if already marked
      const existing = await getStudentAttendance(supabase, selectedSection, date);
      if (existing && existing.length > 0) {
        setAlreadyMarked(true);
        const map: Record<string, Status> = {};
        existing.forEach((e: Record<string, unknown>) => { map[e.student_id as string] = e.status as Status; });
        setAttendance(map);
      } else {
        setAlreadyMarked(false);
        const map: Record<string, Status> = {};
        data.forEach((s: Student) => { map[s.id] = 'present'; });
        setAttendance(map);
      }
    }
  }, [supabase, selectedSection, date]);

  useEffect(() => { fetchSections(); }, [fetchSections]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const markAll = (status: Status) => {
    const map: Record<string, Status> = {};
    students.forEach(s => { map[s.id] = status; });
    setAttendance(map);
  };

  const handleSubmit = async () => {
    setSaving(true); setSaved(false);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    
    const userData = await getUserProfile(supabase, userId);

    const records = students.map(s => ({
      school_id: userData?.school_id, student_id: s.id, section_id: selectedSection,
      date, status: attendance[s.id] || 'present', marked_by: userId,
    }));
    
    try {
      const { markAttendanceBulk } = await import('@school-erp/supabase/queries');
      await markAttendanceBulk(supabase, records);

      // ── Notify parents of absent students ──────────────────────────
      const absentStudentIds = students
        .filter(s => attendance[s.id] === 'absent')
        .map(s => s.id);

      if (absentStudentIds.length > 0) {
        const { data: links } = await supabase
          .from('student_parent_links')
          .select('parent_id, students(full_name)')
          .in('student_id', absentStudentIds);

        if (links && links.length > 0) {
          await Promise.all(links.map((l: any) =>
            createNotification(supabase, {
              recipient_id: l.parent_id,
              school_id:    userData?.school_id || '',
              type:         'absent_alert',
              title:        `${l.students?.full_name || 'Your child'} was marked Absent`,
              body:         `Absent on ${date}. Please contact the school if this is incorrect.`,
              link:         '/parent/attendance',
            })
          ));
        }
      }
      // ──────────────────────────────────────────────────────────────

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const statusConfig: Record<Status, { label: string; bg: string; color: string }> = {
    present: { label: 'P', bg: '#F0FDF4', color: '#16A34A' },
    absent: { label: 'A', bg: '#FEF2F2', color: '#DC2626' },
    late: { label: 'L', bg: '#FFFBEB', color: '#D97706' },
    excused: { label: 'E', bg: '#EFF6FF', color: '#1E40AF' },
  };

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  Object.values(attendance).forEach(s => { counts[s]++; });

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">Mark Attendance</h2><p className="text-gray-500 text-sm mt-1">Daily attendance for your assigned sections</p></div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="px-4 py-2.5 border rounded-xl text-sm font-medium" style={{ borderColor: '#E2E8F0' }}>
          <option value="">Select Section...</option>{sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }} />
        {alreadyMarked && <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: '#FFFBEB', color: '#D97706' }}>⚠️ Already marked — editing mode</span>}
      </div>

      {!selectedSection ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}><p className="text-4xl mb-3">✅</p><p className="text-gray-400">Select a section to mark attendance</p></div>
      ) : loading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div> : (
        <>
          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Quick:</span>
            <button onClick={() => markAll('present')} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: '#F0FDF4', color: '#16A34A' }}>All Present</button>
            <button onClick={() => markAll('absent')} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>All Absent</button>
            <div className="ml-auto flex gap-3 text-xs">
              {Object.entries(counts).map(([k, v]) => <span key={k} className="font-medium" style={{ color: statusConfig[k as Status].color }}>{statusConfig[k as Status].label}: {v}</span>)}
            </div>
          </div>

          {/* Student List */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
            <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {students.map((s, i) => (
                <div key={s.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 w-6">{s.roll_number || i + 1}</span>
                    <span className="text-sm font-medium text-gray-900">{s.full_name}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(Object.keys(statusConfig) as Status[]).map(status => (
                      <button key={status} onClick={() => setAttendance(a => ({ ...a, [s.id]: status }))}
                        className="w-9 h-9 rounded-lg text-xs font-bold transition-all"
                        style={{
                          background: attendance[s.id] === status ? statusConfig[status].color : statusConfig[status].bg,
                          color: attendance[s.id] === status ? 'white' : statusConfig[status].color,
                          boxShadow: attendance[s.id] === status ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                          transform: attendance[s.id] === status ? 'scale(1.1)' : 'scale(1)',
                        }}>
                        {statusConfig[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{students.length} students • {date}</p>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm font-medium" style={{ color: '#16A34A' }}>✅ Saved successfully!</span>}
              <button onClick={handleSubmit} disabled={saving} className="px-8 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg transition-all" style={{ background: '#1E40AF' }}>
                {saving ? 'Submitting...' : alreadyMarked ? 'Update Attendance' : 'Submit Attendance'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
