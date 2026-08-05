'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

export default function PrincipalAttendancePage() {
  const supabase = createClient();
  const [stats, setStats] = useState<{ present: number; absent: number; late: number; total: number }>({ present: 0, absent: 0, late: 0, total: 0 });
  const [totalSections, setTotalSections] = useState(0);
  const [reportedSections, setReportedSections] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const today = new Date().toISOString().split('T')[0];

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (u?.school_id) {
        setSchoolId(u.school_id);
        const [attResult, secResult] = await Promise.all([
          supabase.from('attendance').select('status, section_id').eq('school_id', u.school_id).eq('date', selectedDate),
          supabase.from('sections').select('id', { count: 'exact', head: true }).eq('school_id', u.school_id),
        ]);

        if (attResult.data) {
          const present = attResult.data.filter((a: { status: string }) => a.status === 'present').length;
          const absent = attResult.data.filter((a: { status: string }) => a.status === 'absent').length;
          const late = attResult.data.filter((a: { status: string }) => a.status === 'late').length;
          const uniqueSections = new Set(attResult.data.map((a: any) => a.section_id as string)).size;
          setStats({ present, absent, late, total: attResult.data.length });
          setReportedSections(uniqueSections);
        } else {
          setStats({ present: 0, absent: 0, late: 0, total: 0 });
          setReportedSections(0);
        }
        setTotalSections(secResult.count || 0);
      }
    }
    setLoading(false);
  }, [supabase, selectedDate]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const exportAttendance = async () => {
    if (!schoolId) return;
    setExporting(true);
    try {
      const { data: attRecords } = await supabase
        .from('attendance')
        .select('student_id, section_id, status, students(full_name, roll_number), sections(name, classes(name))')
        .eq('school_id', schoolId)
        .eq('date', selectedDate)
        .order('section_id');

      if (!attRecords || attRecords.length === 0) {
        alert('No attendance data found for this date.');
        return;
      }

      const data = (attRecords as any[]).map((r, i) => ({
        '#': i + 1,
        'Class': r.sections?.classes?.name ?? '',
        'Section': r.sections?.name ?? '',
        'Student Name': r.students?.full_name ?? '',
        'Roll No': r.students?.roll_number ?? '',
        'Status': r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '',
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 10 }, { wch: 26 }, { wch: 8 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      XLSX.writeFile(wb, `Attendance_SchoolWide_${selectedDate}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const pct = (n: number) => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance Overview</h2>
          <p className="text-slate-500 text-sm mt-1">
            School-wide attendance for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#0F172A', outline: 'none', background: '#F8FAFC' }}
          />
          <button
            onClick={exportAttendance}
            disabled={exporting || loading || stats.total === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 10, border: 'none',
              background: (exporting || loading || stats.total === 0) ? '#F1F5F9' : 'linear-gradient(135deg,#065F46,#059669)',
              color: (exporting || loading || stats.total === 0) ? '#94A3B8' : 'white',
              fontSize: 13, fontWeight: 700,
              cursor: (exporting || loading || stats.total === 0) ? 'not-allowed' : 'pointer',
              boxShadow: (!exporting && !loading && stats.total > 0) ? '0 4px 12px rgba(5,150,105,0.3)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {exporting ? '⏳ Exporting…' : '📥 Export Excel'}
          </button>
        </div>
      </div>

      {/* Section Coverage Banner */}
      {!loading && (
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${reportedSections === totalSections && totalSections > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <span className="text-2xl">{reportedSections === totalSections && totalSections > 0 ? '✅' : '⚠️'}</span>
          <div>
            <p className={`font-bold text-sm ${reportedSections === totalSections && totalSections > 0 ? 'text-green-800' : 'text-amber-800'}`}>
              {reportedSections} of {totalSections} sections have reported attendance
            </p>
            <p className={`text-xs mt-0.5 ${reportedSections === totalSections && totalSections > 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {totalSections - reportedSections > 0
                ? `${totalSections - reportedSections} section(s) yet to mark attendance`
                : 'All sections have marked attendance'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Students Marked', value: stats.total, color: 'bg-slate-100 text-slate-700', icon: '👥' },
          { label: 'Present', value: stats.present, color: 'bg-green-100 text-green-700', icon: '✅' },
          { label: 'Absent', value: stats.absent, color: 'bg-red-100 text-red-700', icon: '❌' },
          { label: 'Late', value: stats.late, color: 'bg-amber-100 text-amber-700', icon: '🕐' },
        ].map((card, i) => (
          <div key={i} className={`rounded-2xl p-5 ${card.color}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{card.icon}</span>
              <p className="text-sm font-semibold opacity-80">{card.label}</p>
            </div>
            <p className="text-4xl font-black">
              {loading ? <span className="inline-block w-16 h-10 bg-current opacity-10 rounded animate-pulse" /> : card.value}
            </p>
            {!loading && stats.total > 0 && i > 0 && <p className="text-xs opacity-60 mt-1">{pct(card.value)}% of marked students</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-800 mb-4">Attendance Rate</h3>
        {loading ? (
          <div className="h-4 bg-slate-100 rounded-full animate-pulse" />
        ) : (
          <div className="space-y-3">
            {[
              { label: 'Present', value: stats.present, color: 'bg-green-500' },
              { label: 'Absent',  value: stats.absent,  color: 'bg-red-400' },
              { label: 'Late',    value: stats.late,    color: 'bg-amber-400' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-sm text-slate-500 w-20">{row.label}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color} rounded-full transition-all duration-700`} style={{ width: `${pct(row.value)}%` }} />
                </div>
                <span className="text-sm font-bold text-slate-700 w-12 text-right">{pct(row.value)}%</span>
              </div>
            ))}
          </div>
        )}
        {!loading && stats.total === 0 && (
          <div className="py-8 text-center text-slate-400 text-sm">No attendance has been marked for this date yet.</div>
        )}
      </div>
    </div>
  );
}
