'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as XLSX from 'xlsx';

interface Student { id: string; full_name: string; roll_number: number | null; }
interface Section { id: string; name: string; class_name: string; }

const AVATAR_COLORS = [
  { bg: '#EFF6FF', color: '#1D4ED8' },
  { bg: '#F0FDF4', color: '#16A34A' },
  { bg: '#F5F3FF', color: '#7C3AED' },
  { bg: '#FFFBEB', color: '#D97706' },
  { bg: '#FDF2F8', color: '#BE185D' },
  { bg: '#F0FDFA', color: '#0F766E' },
];

export default function TeacherStudentsPage() {
  const supabase = createClient();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [search, setSearch] = useState('');

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      // Get sections where this teacher is class teacher
      const { data: classSecs } = await supabase
        .from('sections')
        .select('id, name, classes(name)')
        .eq('class_teacher_id', userId);

      const classSectionIds = new Set((classSecs || []).map((s: any) => s.id as string));

      // Also get subject-assigned sections (a subject teacher needs to see their students too)
      const { data: asgn } = await supabase
        .from('teacher_section_assignments')
        .select('section_id')
        .eq('teacher_id', userId);

      const subjectOnlyIds = [...new Set((asgn || []).map((a: any) => a.section_id as string))]
        .filter(id => !classSectionIds.has(id));

      let subjectOnlySecs: any[] = [];
      if (subjectOnlyIds.length > 0) {
        const { data: secs } = await supabase
          .from('sections').select('id, name, classes(name)').in('id', subjectOnlyIds);
        subjectOnlySecs = secs || [];
      }

      const allSections = [...(classSecs || []), ...subjectOnlySecs];
      const formatted = allSections.map((s: any) => ({
        id: s.id as string,
        name: s.name as string,
        class_name: (s.classes as any)?.name || '',
      }));
      setSections(formatted);

      if (formatted.length === 1) {
        setSelectedSection(formatted[0].id);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  // When selectedSection changes, fetch the students for that section
  useEffect(() => {
    if (!selectedSection) { setStudents([]); return; }
    setLoadingStudents(true);
    setSearch('');
    supabase
      .from('students')
      .select('id, full_name, roll_number')
      .eq('section_id', selectedSection)
      .neq('is_active', false)
      .order('roll_number')
      .then(({ data }: { data: { id: string; full_name: string; roll_number: number | null }[] | null }) => {
        setStudents(data || []);
        setLoadingStudents(false);
      });
  }, [supabase, selectedSection]);

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSection(sectionId);
  };

  const selectedSec = sections.find(s => s.id === selectedSection);
  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    String(s.roll_number ?? '').includes(search)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>My Students</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Students in your class section(s)</p>
        </div>
        {selectedSection && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '1px solid #BFDBFE' }}>
            <span style={{ fontSize: 16 }}>👨‍🎓</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8' }}>{students.length} Student{students.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      {!loading && sections.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sections.map((sec, i) => {
            const isActive = selectedSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => handleSectionSelect(sec.id)}
                style={{
                  padding: isMobile ? '9px 14px' : '10px 20px',
                  borderRadius: 12,
                  border: isActive ? 'none' : '1px solid #E2E8F0',
                  background: isActive ? 'linear-gradient(135deg,#1E3A8A,#3B82F6)' : 'white',
                  color: isActive ? 'white' : '#475569',
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 4px 14px rgba(59,130,246,0.35)' : '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: isActive ? 'rgba(255,255,255,0.2)' : '#EFF6FF',
                  color: isActive ? 'white' : '#1D4ED8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                }}>
                  {sec.class_name.replace(/[^0-9]/g, '') || i + 1}
                </span>
                Class {sec.class_name} — Sec {sec.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 52, borderRadius: 12, background: '#F1F5F9' }} />
          ))}
        </div>
      )}

      {/* No class assigned */}
      {!loading && sections.length === 0 && (
        <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E8ECF0', padding: '50px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏫</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>No class assigned yet</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Ask the principal to assign you as a class teacher</p>
        </div>
      )}

      {/* Prompt to select */}
      {!loading && sections.length > 0 && !selectedSection && (
        <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E8ECF0', padding: '50px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👆</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>Select a class above</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Tap a class tab to view its students</p>
        </div>
      )}

      {/* Student list card */}
      {selectedSection && !loadingStudents && (
        <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>

          {/* Card header with search */}
          <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg,#F8FAFC,#EFF6FF)', borderBottom: '1px solid #E8ECF0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Class {selectedSec?.class_name} — Section {selectedSec?.name}
                </p>
                <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{students.length} enrolled student{students.length !== 1 ? 's' : ''}</p>
              </div>
              {!isMobile && students.length > 0 && (
                <button
                  onClick={() => {
                    const data = students.map((s, i) => ({
                      '#': i + 1,
                      'Roll No': s.roll_number ?? '',
                      'Student Name': s.full_name,
                      'Class': selectedSec?.class_name ?? '',
                      'Section': selectedSec?.name ?? '',
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 4 }, { wch: 8 }, { wch: 26 }, { wch: 10 }, { wch: 10 }];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Students');
                    const sName = `${selectedSec?.class_name || 'Class'}_${selectedSec?.name || 'Sec'}`;
                    XLSX.writeFile(wb, `Students_${sName}_${new Date().toISOString().slice(0,10)}.xlsx`);
                  }}
                  style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#065F46,#059669)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                >
                  📥 Export Excel
                </button>
              )}
            </div>
            {/* Full-width search on mobile */}
            <div style={{ position: 'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search by name or roll no..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Mobile: Card list */}
          {filtered.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
              No students match your search
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {filtered.map((s, i) => {
                const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    {/* Avatar */}
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: ac.bg, color: ac.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
                      {s.full_name.charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</p>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>Roll: <strong style={{ color: '#475569' }}>{s.roll_number ?? '—'}</strong></p>
                    </div>
                    {/* Action button — icon only on mobile */}
                    <button
                      onClick={() => router.push(`/teacher/students/${s.id}/analysis`)}
                      style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #DDD6FE', background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color: '#7C3AED', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop: Table */
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ textAlign: 'left', padding: '11px 20px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '11px 20px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Student</th>
                  <th style={{ textAlign: 'left', padding: '11px 20px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Roll No.</th>
                  <th style={{ textAlign: 'right', padding: '11px 20px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid #F1F5F9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFF')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '13px 20px', fontSize: 12, color: '#CBD5E1', fontWeight: 600 }}>
                        {String(i + 1).padStart(2, '0')}
                      </td>
                      <td style={{ padding: '13px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: ac.bg, color: ac.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                            {s.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{s.full_name}</p>
                            <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>Class {selectedSec?.class_name} · Section {selectedSec?.name}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '13px 20px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '4px 10px', borderRadius: 7, fontFamily: 'monospace' }}>
                          {s.roll_number ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => router.push(`/teacher/students/${s.id}/analysis`)}
                          style={{ padding: '7px 16px', borderRadius: 9, border: '1px solid #DDD6FE', background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color: '#7C3AED', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(124,58,237,0.25)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                          Analysis
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Loading students skeleton */}
      {loadingStudents && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ height: 62, borderRadius: 12, background: '#F1F5F9' }} />
          ))}
        </div>
      )}
    </div>
  );
}
