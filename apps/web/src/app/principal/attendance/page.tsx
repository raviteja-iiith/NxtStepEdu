'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';
import { 
  Users, CheckCircle2, XCircle, Clock, Calendar as CalendarIcon, 
  Download, AlertTriangle, ChevronRight, CheckCircle, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

export default function PrincipalAttendancePage() {
  const supabase = createClient();
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
  const [sections, setSections] = useState<any[]>([]);
  const [missingSections, setMissingSections] = useState<any[]>([]);
  const [classStats, setClassStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (u?.school_id) {
        setSchoolId(u.school_id);
        const [attResult, secResult] = await Promise.all([
          supabase.from('attendance').select('status, section_id').eq('school_id', u.school_id).eq('date', selectedDate),
          supabase.from('sections').select('id, name, class_id, classes(name)').eq('school_id', u.school_id),
        ]);

        if (secResult.data) {
          setSections(secResult.data);
        }

        if (attResult.data && secResult.data) {
          const present = attResult.data.filter((a: any) => a.status === 'present').length;
          const absent = attResult.data.filter((a: any) => a.status === 'absent').length;
          const late = attResult.data.filter((a: any) => a.status === 'late').length;
          const total = attResult.data.length;
          
          setStats({ present, absent, late, total });

          const reportedSectionIds = new Set(attResult.data.map((a: any) => a.section_id));
          
          // Find missing sections
          const missing = secResult.data
            .filter((s: any) => !reportedSectionIds.has(s.id))
            .sort((a, b) => (a.classes?.name || '').localeCompare(b.classes?.name || '') || a.name.localeCompare(b.name));
            
          setMissingSections(missing);
          
          // Calculate class-wise stats
          const classDataMap = new Map();
          attResult.data.forEach((att: any) => {
            const sec = secResult.data.find((s: any) => s.id === att.section_id);
            if (sec && sec.classes) {
              const cName = sec.classes.name;
              if (!classDataMap.has(cName)) {
                classDataMap.set(cName, { name: cName, present: 0, absent: 0, late: 0, total: 0 });
              }
              const cData = classDataMap.get(cName);
              cData[att.status]++;
              cData.total++;
            }
          });
          
          const sortedClassStats = Array.from(classDataMap.values()).sort((a, b) => a.name.localeCompare(b.name));
          setClassStats(sortedClassStats);
        } else {
          setStats({ present: 0, absent: 0, late: 0, total: 0 });
          setMissingSections(secResult.data || []);
          setClassStats([]);
        }
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
      XLSX.writeFile(wb, `Attendance_${selectedDate}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const pct = (n: number) => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
  
  const COLORS = { present: '#10B981', absent: '#EF4444', late: '#F59E0B' };
  const pieData = [
    { name: 'Present', value: stats.present, color: COLORS.present },
    { name: 'Absent', value: stats.absent, color: COLORS.absent },
    { name: 'Late', value: stats.late, color: COLORS.late },
  ].filter(d => d.value > 0);

  const totalSections = sections.length;
  const reportedSections = totalSections - missingSections.length;
  const coveragePct = totalSections > 0 ? Math.round((reportedSections / totalSections) * 100) : 0;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: 48, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header Section */}
      <div style={{ 
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, 
        backgroundColor: '#fff', padding: 24, borderRadius: 24, border: '1px solid #F1F5F9', 
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', 
        position: 'relative', overflow: 'hidden' 
      }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 256, height: 256, background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDFA 100%)', borderRadius: '50%', filter: 'blur(40px)', opacity: 0.6, pointerEvents: 'none' }} />
        
        <div style={{ position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Attendance Overview</h1>
          <p style={{ color: '#64748B', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, fontSize: 14 }}>
            <CalendarIcon size={16} />
            School-wide attendance for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, position: 'relative', zIndex: 10 }}>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ 
              padding: '10px 16px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', 
              borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#1E293B', outline: 'none', cursor: 'pointer' 
            }}
          />
          <button
            onClick={exportAttendance}
            disabled={exporting || loading || stats.total === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: (exporting || loading || stats.total === 0) ? 'not-allowed' : 'pointer',
              border: 'none', transition: 'all 0.2s',
              background: (exporting || loading || stats.total === 0) ? '#F1F5F9' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: (exporting || loading || stats.total === 0) ? '#94A3B8' : '#FFF',
              boxShadow: (exporting || loading || stats.total === 0) ? 'none' : '0 10px 15px -3px rgba(5, 150, 105, 0.3)'
            }}
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {[
          { label: 'Total Marked', value: stats.total, color: '#4F46E5', bg: '#EEF2FF', border: '#E0E7FF', icon: Users },
          { label: 'Present', value: stats.present, color: '#10B981', bg: '#ECFDF5', border: '#D1FAE5', icon: CheckCircle2, pct: pct(stats.present) },
          { label: 'Absent', value: stats.absent, color: '#EF4444', bg: '#FEF2F2', border: '#FEE2E2', icon: XCircle, pct: pct(stats.absent) },
          { label: 'Late', value: stats.late, color: '#F59E0B', bg: '#FFFBEB', border: '#FEF3C7', icon: Clock, pct: pct(stats.late) },
        ].map((card, i) => (
          <div key={i} style={{ 
            backgroundColor: '#FFF', padding: 24, borderRadius: 24, border: '1px solid #F1F5F9', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' 
          }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 128, height: 128, backgroundColor: card.bg, borderRadius: '50%', filter: 'blur(30px)', opacity: 0.5 }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, position: 'relative', zIndex: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: card.bg, border: `1px solid ${card.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <card.icon size={24} color={card.color} />
              </div>
              {card.pct !== undefined && !loading && stats.total > 0 && (
                <div style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, backgroundColor: card.bg, color: card.color }}>
                  {card.pct}%
                </div>
              )}
            </div>
            
            <div style={{ position: 'relative', zIndex: 10 }}>
              <h3 style={{ color: '#64748B', fontWeight: 500, fontSize: 14, margin: '0 0 4px' }}>{card.label}</h3>
              <p style={{ fontSize: 30, fontWeight: 900, color: '#0F172A', margin: 0 }}>
                {loading ? '...' : card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
        
        {/* Left Column: Charts */}
        <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ backgroundColor: '#FFF', padding: 24, borderRadius: 24, border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <BarChart3 size={20} color="#4F46E5" />
              <h3 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', margin: 0 }}>Class-wise Attendance</h3>
            </div>
            
            {loading ? (
              <div style={{ height: 280, backgroundColor: '#F8FAFC', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#94A3B8', fontWeight: 500 }}>Loading chart data...</p>
              </div>
            ) : classStats.length > 0 ? (
              <div style={{ height: 280, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13, fontWeight: 500, paddingTop: 10 }} />
                    <Bar dataKey="present" name="Present" stackId="a" fill={COLORS.present} radius={[0, 0, 4, 4]} />
                    <Bar dataKey="late" name="Late" stackId="a" fill={COLORS.late} />
                    <Bar dataKey="absent" name="Absent" stackId="a" fill={COLORS.absent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #F1F5F9', borderRadius: 12 }}>
                <PieChartIcon size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
                <p style={{ color: '#64748B', fontWeight: 500, margin: 0 }}>No attendance data to display</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Submission Status */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          <div style={{ backgroundColor: '#FFF', padding: 24, borderRadius: 24, border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontWeight: 700, color: '#0F172A', margin: 0 }}>Submission Status</h3>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, backgroundColor: coveragePct === 100 ? '#D1FAE5' : '#FEF3C7', color: coveragePct === 100 ? '#047857' : '#B45309' }}>
                {coveragePct}% Complete
              </span>
            </div>
            
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px' }}>
              <strong style={{ color: '#0F172A' }}>{reportedSections}</strong> out of <strong style={{ color: '#0F172A' }}>{totalSections}</strong> sections marked
            </p>
            
            <div style={{ height: 12, width: '100%', backgroundColor: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, transition: 'width 1s ease-out', backgroundColor: coveragePct === 100 ? '#10B981' : '#6366F1', width: `${coveragePct}%` }} />
            </div>
          </div>

          <div style={{ backgroundColor: '#FFF', padding: 24, borderRadius: 24, border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', height: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {missingSections.length > 0 ? <AlertTriangle size={20} color="#F59E0B" /> : <CheckCircle size={20} color="#10B981" />}
              <h3 style={{ fontWeight: 700, color: '#0F172A', margin: 0 }}>Pending Sections</h3>
              {missingSections.length > 0 && (
                <span style={{ marginLeft: 'auto', backgroundColor: '#FFE4E6', color: '#E11D48', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                  {missingSections.length}
                </span>
              )}
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[1, 2, 3].map(i => <div key={i} style={{ height: 48, backgroundColor: '#F8FAFC', borderRadius: 12 }} />)}
                </div>
              ) : missingSections.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {missingSections.map(sec => (
                    <div key={sec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#475569', border: '1px solid #E2E8F0' }}>
                          {sec.classes?.name.substring(0, 2) || '?'}
                        </div>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{sec.classes?.name} - {sec.name}</p>
                          <p style={{ fontSize: 12, color: '#F43F5E', fontWeight: 500, margin: 0 }}>Pending</p>
                        </div>
                      </div>
                      <ChevronRight size={16} color="#94A3B8" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 24 }}>
                  <div style={{ width: 64, height: 64, backgroundColor: '#ECFDF5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <CheckCircle2 size={32} color="#10B981" />
                  </div>
                  <h4 style={{ fontWeight: 700, color: '#0F172A', fontSize: 14, margin: '0 0 4px' }}>All Caught Up!</h4>
                  <p style={{ fontSize: 12, color: '#64748B', margin: 0, maxWidth: 180 }}>Every section has submitted attendance for today.</p>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
