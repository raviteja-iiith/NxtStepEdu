'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParent } from '@/context/ParentContext';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const P = { fontFamily: "'Inter', sans-serif" };

export default function ParentAttendancePage() {
  const supabase = createClient();
  const { selectedChild, loading: childLoading } = useParent();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [attendanceMap, setAttendanceMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const studentId   = selectedChild?.student_id || '';
  const studentName = selectedChild?.student_name || '';

  const fetchAttendance = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const endDate   = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${new Date(selectedYear, selectedMonth + 1, 0).getDate()}`;
    const { data } = await supabase.from('attendance').select('date, status')
      .eq('student_id', studentId).gte('date', startDate).lte('date', endDate);
    const map: Record<number, string> = {};
    (data ?? []).forEach((a: any) => {
      // Parse day directly from 'YYYY-MM-DD' string to avoid UTC→IST off-by-one
      const day = parseInt(a.date.split('-')[2], 10);
      map[day] = a.status;
    });
    setAttendanceMap(map);
    setLoading(false);
  }, [supabase, studentId, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!childLoading && studentId) fetchAttendance();
    else if (!childLoading && !studentId) setLoading(false);
  }, [fetchAttendance, studentId, childLoading]);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDay    = new Date(selectedYear, selectedMonth, 1).getDay();
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const colorMap: Record<string, string> = { present: '#16A34A', absent: '#DC2626', late: '#D97706', excused: '#1E40AF', holiday: '#94A3B8' };
  const bgMap:    Record<string, string> = { present: '#F0FDF4', absent: '#FEF2F2', late: '#FFFBEB', excused: '#EFF6FF',  holiday: '#F1F5F9' };

  const presentCount = Object.values(attendanceMap).filter(s => s === 'present').length;
  const absentCount  = Object.values(attendanceMap).filter(s => s === 'absent').length;
  const lateCount    = Object.values(attendanceMap).filter(s => s === 'late').length;
  const totalMarked  = Object.keys(attendanceMap).length;
  const pct          = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

  const stats = [
    { label: 'Attendance Rate', value: `${pct}%`, color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: '📈' },
    { label: 'Present Days',    value: presentCount, color: '#0F766E', bg: '#F0FDF4', border: '#A7F3D0', icon: '✅' },
    { label: 'Absent Days',     value: absentCount,  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '❌' },
    { label: 'Late Days',       value: lateCount,    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: '⏰' },
  ];

  return (
    <div style={{ ...P, display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Attendance</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>
          {studentName ? `Monthly attendance calendar for ${studentName}` : "View your child's attendance calendar"}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-container">
        {stats.map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 18, padding: '22px 24px', border: `1px solid ${s.border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{s.label}</p>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
            </div>
            <p style={{ fontSize: 32, fontWeight: 900, color: s.color, letterSpacing: '-0.02em', margin: 0 }}>
              {loading ? <span style={{ display: 'inline-block', width: 60, height: 28, background: '#F1F5F9', borderRadius: 6 }} /> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div style={{ background: 'white', borderRadius: 20, padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #E8ECF0' }}>
        {/* Month Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button onClick={() => {
            if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
            else setSelectedMonth(m => m - 1);
          }}
            style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#475569', transition: 'all 0.15s' }}>
            ‹
          </button>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>{MONTHS[selectedMonth]}</h3>
            <p style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500, margin: '2px 0 0' }}>{selectedYear}</p>
          </div>
          <button onClick={() => {
            if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
            else setSelectedMonth(m => m + 1);
          }}
            disabled={selectedMonth === currentMonth && selectedYear === currentYear}
            style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', cursor: (selectedMonth === currentMonth && selectedYear === currentYear) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#475569', opacity: (selectedMonth === currentMonth && selectedYear === currentYear) ? 0.3 : 1 }}>
            ›
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
          {days.map(d => {
            const dow = new Date(selectedYear, selectedMonth, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isFuture  = new Date(selectedYear, selectedMonth, d) > new Date();
            const status    = attendanceMap[d];
            return (
              <div key={d} style={{
                aspectRatio: '1', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: status ? 700 : 500,
                background: status ? bgMap[status] : (isWeekend ? '#F8FAFC' : isFuture ? 'white' : '#FAFAFA'),
                color: status ? colorMap[status] : (isWeekend ? '#CBD5E1' : '#94A3B8'),
                border: status ? `1.5px solid ${colorMap[status]}33` : `1px solid ${isWeekend ? 'transparent' : '#F1F5F9'}`,
                opacity: isFuture ? 0.4 : 1,
                transition: 'all 0.15s',
              }}>
                {d}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 24, paddingTop: 20, borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
          {['present','absent','late','excused'].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 12, height: 12, borderRadius: 4, background: colorMap[s] }} />
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500, textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
        </div>

        {!loading && totalMarked === 0 && (
          <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, marginTop: 20 }}>
            {studentId ? `No attendance records for ${MONTHS_SHORT[selectedMonth]}.` : 'No student linked to your account yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
