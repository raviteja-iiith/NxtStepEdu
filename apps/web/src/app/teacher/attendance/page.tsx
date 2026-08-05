'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSectionStudents, getStudentAttendance, getUserProfile } from '@school-erp/supabase/queries';
import { createNotification } from '@/components/NotificationBell';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import * as XLSX from 'xlsx';

interface Student { id: string; full_name: string; roll_number: number | null; }
interface Section { id: string; name: string; class_name: string; }

type Status = 'present' | 'absent' | 'late' | 'excused';

export default function AttendancePage() {
  const supabase = createClient();
  const isMobile = useIsMobile();
  
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  // Ref to ensure we only auto-select the first section once on initial load
  const hasAutoSelected = useRef(false);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: classSecs } = await supabase
        .from('sections')
        .select('id, name, classes(name)')
        .eq('class_teacher_id', userId);

      const allSections = [...(classSecs || [])];
      
      setSections(allSections.map((s: any) => ({
        id: s.id as string,
        name: s.name as string,
        class_name: s.classes?.name as string
      })));
      
      // Auto-select the first section only on initial mount (not on re-fetches)
      if (allSections.length > 0 && !hasAutoSelected.current) {
        hasAutoSelected.current = true;
        setSelectedSection(allSections[0].id as string);
      }
    }
    setLoading(false);
  // Intentionally omit selectedSection — we use a ref to guard auto-selection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const fetchStudents = useCallback(async () => {
    if (!selectedSection) return;
    setLoadingStudents(true);
    const data = await getSectionStudents(supabase, selectedSection);
    
    if (data) {
      setStudents(data);
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
    setLoadingStudents(false);
  }, [supabase, selectedSection, date]);

  useEffect(() => { fetchSections(); }, [fetchSections]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  useRealtimeTable('attendance', selectedSection ? `section_id=eq.${selectedSection}` : null, fetchStudents);

  const markAll = (status: Status) => {
    const map: Record<string, Status> = {};
    students.forEach(s => { map[s.id] = status; });
    setAttendance(map);
  };

  const handleSubmit = async () => {
    if (Object.keys(attendance).length === 0) return;
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
              body:         `Absent on ${new Date(date).toLocaleDateString()}. Please contact the school if this is incorrect.`,
              link:         '/parent/attendance',
            })
          ));
        }
      }

      setSaved(true);
      setAlreadyMarked(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const statusConfig: Record<Status, { label: string; fullLabel: string; bg: string; color: string; border: string }> = {
    present: { label: 'P', fullLabel: 'Present', bg: '#F0FDF4', color: '#16A34A', border: '#DCFCE7' },
    late: { label: 'L', fullLabel: 'Late', bg: '#FFFBEB', color: '#D97706', border: '#FEF3C7' },
    excused: { label: 'E', fullLabel: 'Excused', bg: '#EFF6FF', color: '#1D4ED8', border: '#DBEAFE' },
    absent: { label: 'A', fullLabel: 'Absent', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  };

  const counts = { present: 0, late: 0, excused: 0, absent: 0 };
  Object.values(attendance).forEach(s => { if (counts[s] !== undefined) counts[s]++; });

  return (
    <div style={{ paddingBottom: isMobile ? 100 : 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header Area */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 16, background: 'white', padding: 24, borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Mark Attendance</h2>
          <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0 0' }}>Daily attendance for your assigned class</p>
        </div>
        
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: 12, marginTop: isMobile ? 16 : 0 }}>
          <div style={{ position: 'relative', width: isMobile ? '100%' : 'auto' }}>
            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} 
              style={{ width: '100%', appearance: 'none', padding: '12px 40px 12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#0F172A', outline: 'none', cursor: 'pointer', minWidth: 180 }}>
              <option value="" disabled>Select Section...</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
            </select>
            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748B' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          
          <input type="date" value={date} onChange={e => setDate(e.target.value)} 
            max={new Date().toISOString().split('T')[0]}
            style={{ width: isMobile ? '100%' : 'auto', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#0F172A', outline: 'none' }} />
        </div>
      </div>

      {!selectedSection ? (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 400 }}>
          <div style={{ width: 80, height: 80, background: '#F8FAFC', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid #E2E8F0', fontSize: 32 }}>📋</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>Select a section</h3>
          <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, margin: 0 }}>Choose a section from the dropdown above to start marking daily attendance.</p>
        </div>
      ) : loading || loadingStudents ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 20, display: 'flex', alignItems: 'center', gap: 16, opacity: 0.7 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9 flex-shrink-0' }}></div>
              <div style={{ flex: 1, height: 16, background: '#F1F5F9', borderRadius: 4, maxWidth: 200 }}></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1,2,3,4].map(j => <div key={j} style={{ width: 40, height: 40, borderRadius: 12, background: '#F1F5F9' }}></div>)}
              </div>
            </div>
          ))}
        </div>
      ) : students.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 40, marginBottom: 12 }}>📭</span>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>No students found</h3>
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>There are no active students in this section.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Quick Actions & Status Banner */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 16, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick Mark</span>
              <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                <button onClick={() => markAll('present')} style={{ flex: isMobile ? 1 : 'none', padding: '8px 16px', borderRadius: 10, background: '#F0FDF4', color: '#16A34A', border: '1px solid #DCFCE7', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>All Present</button>
                <button onClick={() => markAll('absent')} style={{ flex: isMobile ? 1 : 'none', padding: '8px 16px', borderRadius: 10, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>All Absent</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '10px 16px', background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
              {(Object.keys(counts) as Status[]).map((k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 60 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusConfig[k].color }}></span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}: <span style={{ color: statusConfig[k].color }}>{counts[k]}</span></span>
                </div>
              ))}
            </div>
          </div>

          {alreadyMarked && (
            <div style={{ padding: 16, borderRadius: 16, border: '1px solid #FEF3C7', background: '#FFFBEB', color: '#92400E', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>⚠️</div>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Attendance Already Marked</h4>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, opacity: 0.8 }}>You are currently editing the saved attendance for {new Date(date).toLocaleDateString()}.</p>
              </div>
            </div>
          )}

          {/* Student List View */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', padding: '14px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 12, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <div>Roll No</div>
                <div>Student Name</div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}>Status</div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {students.map((s, i) => {
                const currentStatus = attendance[s.id] || 'present';
                return (
                  <div key={s.id} style={{ display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : 'row', gridTemplateColumns: isMobile ? 'none' : '80px 1fr auto', gap: isMobile ? 12 : 0, padding: isMobile ? 20 : '14px 24px', alignItems: 'center', borderBottom: '1px solid #F1F5F9' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: isMobile ? '100%' : 'auto' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F8FAFC', color: '#64748B', fontFamily: 'monospace', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #E2E8F0' }}>
                        {s.roll_number || i + 1}
                      </div>
                      {isMobile && <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{s.full_name}</span>}
                    </div>
                    
                    {!isMobile && <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{s.full_name}</span>}
                    
                    <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end', marginTop: isMobile ? 4 : 0 }}>
                      {(Object.keys(statusConfig) as Status[]).map(status => {
                        const isSelected = currentStatus === status;
                        const config = statusConfig[status];
                        return (
                          <button key={status} onClick={() => setAttendance(a => ({ ...a, [s.id]: status }))}
                            style={{
                              flex: isMobile ? 1 : 'none',
                              width: isMobile ? 'auto' : 44,
                              height: isMobile ? 40 : 44,
                              borderRadius: 12,
                              fontSize: isMobile ? 12 : 14,
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isSelected ? config.color : 'white',
                              color: isSelected ? 'white' : '#64748B',
                              border: `2px solid ${isSelected ? config.color : '#E2E8F0'}`,
                              boxShadow: isSelected ? `0 4px 12px ${config.color}40` : '0 1px 2px rgba(0,0,0,0.05)',
                              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                              zIndex: isSelected ? 10 : 1,
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}>
                            <span style={{ display: isMobile ? 'none' : 'block' }}>{config.label}</span>
                            <span style={{ display: isMobile ? 'block' : 'none' }}>{config.fullLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Bar */}
          <div style={{ position: isMobile ? 'fixed' : 'static', bottom: isMobile ? 0 : 'auto', left: 0, right: 0, padding: isMobile ? 16 : 0, background: isMobile ? 'white' : 'transparent', borderTop: isMobile ? '1px solid #E2E8F0' : 'none', zIndex: 40, boxShadow: isMobile ? '0 -4px 20px rgba(0,0,0,0.05)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'space-between', gap: 16 }}>
              {!isMobile && (
                <p style={{ fontSize: 14, fontWeight: 700, color: '#64748B', margin: 0 }}>{students.length} students <span style={{ margin: '0 8px', opacity: 0.5 }}>•</span> {new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: isMobile ? '100%' : 'auto' }}>
                {saved && !isMobile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, padding: '8px 16px', background: '#F0FDF4', color: '#15803D', borderRadius: 12, border: '1px solid #DCFCE7' }}>
                    <span>✅</span> Saved successfully!
                  </div>
                )}
                {!isMobile && students.length > 0 && (
                  <button
                    onClick={() => {
                      const sectionLabel = sections.find(s => s.id === selectedSection);
                      const sectionName = sectionLabel ? `${sectionLabel.class_name}_${sectionLabel.name}` : 'Section';
                      const data = students.map(s => ({
                        'Roll No': s.roll_number ?? '',
                        'Student Name': s.full_name,
                        'Status': (attendance[s.id] || 'present').charAt(0).toUpperCase() + (attendance[s.id] || 'present').slice(1),
                      }));
                      const summary = [{ 'Roll No': '', 'Student Name': `Present: ${counts.present}  Absent: ${counts.absent}  Late: ${counts.late}  Excused: ${counts.excused}`, 'Status': '' }];
                      const ws = XLSX.utils.json_to_sheet([...data, {}, ...summary]);
                      ws['!cols'] = [{ wch: 8 }, { wch: 26 }, { wch: 12 }];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
                      XLSX.writeFile(wb, `Attendance_${sectionName}_${date}.xlsx`);
                    }}
                    style={{ padding: '10px 18px', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #065F46, #059669)', cursor: 'pointer', boxShadow: '0 4px 12px rgba(5,150,105,0.3)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
                  >
                    📥 Export Excel
                  </button>
                )}
                <button onClick={handleSubmit} disabled={saving} style={{ width: isMobile ? '100%' : 'auto', padding: '14px 32px', borderRadius: 12, fontSize: 14, fontWeight: 800, color: 'white', background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {saving ? 'Submitting...' : alreadyMarked ? 'Update Attendance' : 'Submit Attendance'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
