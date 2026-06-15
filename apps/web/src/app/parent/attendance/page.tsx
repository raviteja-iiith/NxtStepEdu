'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ParentAttendancePage() {
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(new Date().getFullYear());
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [attendanceMap, setAttendanceMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchStudentLink = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const { data: link } = await supabase
      .from('student_parent_links')
      .select('student_id, students(full_name)')
      .eq('parent_id', userId)
      .limit(1)
      .maybeSingle();
    if (link) {
      setStudentId(link.student_id);
      setStudentName((link.students as any)?.full_name || '');
    }
  }, [supabase]);

  const fetchAttendance = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${new Date(selectedYear, selectedMonth + 1, 0).getDate()}`;
    
    const { data } = await supabase
      .from('attendance')
      .select('date, status')
      .eq('student_id', studentId)
      .gte('date', startDate)
      .lte('date', endDate);

    const map: Record<number, string> = {};
    if (data) {
      data.forEach((a: { date: string; status: string }) => {
        const day = new Date(a.date).getDate();
        map[day] = a.status;
      });
    }
    setAttendanceMap(map);
    setLoading(false);
  }, [supabase, studentId, selectedMonth, selectedYear]);

  useEffect(() => { fetchStudentLink(); }, [fetchStudentLink]);
  useEffect(() => { if (studentId) fetchAttendance(); }, [fetchAttendance, studentId]);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const colorMap: Record<string, string> = {
    present: '#16A34A', absent: '#DC2626', late: '#D97706',
    excused: '#1E40AF', holiday: '#94A3B8',
  };
  const bgMap: Record<string, string> = {
    present: '#F0FDF4', absent: '#FEF2F2', late: '#FFFBEB',
    excused: '#EFF6FF', holiday: '#F1F5F9',
  };

  const presentCount = Object.values(attendanceMap).filter(s => s === 'present').length;
  const absentCount = Object.values(attendanceMap).filter(s => s === 'absent').length;
  const lateCount = Object.values(attendanceMap).filter(s => s === 'late').length;
  const totalMarked = Object.keys(attendanceMap).length;
  const attendancePct = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Attendance</h2>
        <p className="text-gray-500 text-sm mt-1">
          {studentName ? `Attendance calendar for ${studentName}` : "View your child's attendance calendar"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'This Month', value: `${attendancePct}%`, color: '#16A34A' },
          { label: 'Present Days', value: presentCount, color: '#0F766E' },
          { label: 'Absent Days', value: absentCount, color: '#DC2626' },
          { label: 'Late Days', value: lateCount, color: '#D97706' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>
              {loading ? <span className="inline-block w-12 h-7 bg-slate-100 rounded animate-pulse" /> : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelectedMonth(m => (m - 1 + 12) % 12)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">←</button>
          <h3 className="font-bold text-gray-900">{MONTHS[selectedMonth]} {selectedYear}</h3>
          <button onClick={() => setSelectedMonth(m => (m + 1) % 12)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">→</button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="text-xs font-semibold text-gray-400 py-2">{d}</div>
          ))}
          {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} />)}
          {days.map(d => {
            const dow = new Date(selectedYear, selectedMonth, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isFuture = new Date(selectedYear, selectedMonth, d) > new Date();
            const status = attendanceMap[d];
            return (
              <div
                key={d}
                className="w-full aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all"
                style={{
                  background: status ? bgMap[status] : (isWeekend ? '#F8FAFC' : isFuture ? 'white' : '#FAFAFA'),
                  color: status ? colorMap[status] : (isWeekend ? '#94A3B8' : '#CBD5E1'),
                  border: !status && !isWeekend && !isFuture ? '1px dashed #E2E8F0' : 'none',
                  opacity: isFuture ? 0.4 : 1,
                }}
              >
                {d}
              </div>
            );
          })}
        </div>
        <div className="flex justify-center gap-4 mt-4 pt-4 border-t" style={{ borderColor: '#F1F5F9' }}>
          {[
            { status: 'present', label: 'Present' },
            { status: 'absent', label: 'Absent' },
            { status: 'late', label: 'Late' },
            { status: 'excused', label: 'Excused' },
          ].map(s => (
            <div key={s.status} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded" style={{ background: colorMap[s.status] }} />
              {s.label}
            </div>
          ))}
        </div>
        {!loading && totalMarked === 0 && !studentId && (
          <p className="text-center text-sm text-gray-400 mt-4">No student linked to your account yet.</p>
        )}
        {!loading && totalMarked === 0 && studentId && (
          <p className="text-center text-sm text-gray-400 mt-4">No attendance records for {MONTHS[selectedMonth]}.</p>
        )}
      </div>
    </div>
  );
}
