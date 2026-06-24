'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
      const { data: classSecs } = await supabase
        .from('sections')
        .select('id, name, classes(name)')
        .eq('class_teacher_id', userId);

      const formatted = (classSecs || []).map((s: any) => ({
        id: s.id as string,
        name: s.name as string,
        class_name: (s.classes as any)?.name || '',
      }));
      setSections(formatted);

      // Auto-select first section if only one
      if (formatted.length === 1) {
        handleSectionSelect(formatted[0].id);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  const handleSectionSelect = async (sectionId: string) => {
    setSelectedSection(sectionId);
    setSearch('');
    if (!sectionId) { setStudents([]); return; }
    setLoadingStudents(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, roll_number')
      .eq('section_id', sectionId)
      .neq('is_active', false)
      .order('roll_number');
    setStudents(data || []);
    setLoadingStudents(false);
  };

  const selectedSec = sections.find(s => s.id === selectedSection);
  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    String(s.roll_number ?? '').includes(search)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>My Students</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Students in your class section(s)</p>
        </div>
        {selectedSection && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '1px solid #BFDBFE' }}>
            <span style={{ fontSize: 18 }}>👨‍🎓</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8' }}>{students.length} Student{students.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      {!loading && sections.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {sections.map((sec, i) => {
            const isActive = selectedSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => handleSectionSelect(sec.id)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 12,
                  border: isActive ? 'none' : '1px solid #E2E8F0',
                  background: isActive ? 'linear-gradient(135deg,#1E3A8A,#3B82F6)' : 'white',
                  color: isActive ? 'white' : '#475569',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 4px 14px rgba(59,130,246,0.35)' : '0 1px 3px rgba(0,0,0,0.06)',
                  transform: isActive ? 'translateY(-1px)' : 'none',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: isActive ? 'rgba(255,255,255,0.2)' : '#EFF6FF',
                  color: isActive ? 'white' : '#1D4ED8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                }}>
                  {sec.class_name.replace(/[^0-9]/g, '') || i + 1}
                </span>
                Class {sec.class_name} — Section {sec.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: 'linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
          ))}
        </div>
      )}

      {/* No class teacher assigned */}
      {!loading && sections.length === 0 && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #E8ECF0', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>🏫</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>No class assigned yet</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Ask the principal to assign you as a class teacher in Classes &amp; Sections</p>
        </div>
      )}

      {/* Prompt to select */}
      {!loading && sections.length > 0 && !selectedSection && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #E8ECF0', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>Select a class above</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Click on a class tab to view its students</p>
        </div>
      )}

      {/* Student list */}
      {selectedSection && !loadingStudents && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          {/* Card header */}
          <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#F8FAFC,#EFF6FF)', borderBottom: '1px solid #E8ECF0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Class {selectedSec?.class_name} — Section {selectedSec?.name}
              </p>
              <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{students.length} enrolled student{students.length !== 1 ? 's' : ''}</p>
            </div>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 32, paddingRight: 14, paddingTop: 8, paddingBottom: 8, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', width: 200, fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
              No students match your search
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ textAlign: 'left', padding: '12px 24px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '12px 24px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Student</th>
                  <th style={{ textAlign: 'left', padding: '12px 24px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Roll No.</th>
                  <th style={{ textAlign: 'right', padding: '12px 24px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFF')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 24px', fontSize: 12, color: '#CBD5E1', fontWeight: 600 }}>
                        {String(i + 1).padStart(2, '0')}
                      </td>
                      <td style={{ padding: '14px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 11, background: ac.bg, color: ac.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                            {s.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{s.full_name}</p>
                            <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>Class {selectedSec?.class_name} · Section {selectedSec?.name}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 24px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '4px 10px', borderRadius: 7, fontFamily: 'monospace' }}>
                          {s.roll_number ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                        <button
                          onClick={() => router.push(`/teacher/students/${s.id}/analysis`)}
                          style={{ padding: '7px 16px', borderRadius: 9, border: '1px solid #DDD6FE', background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color: '#7C3AED', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(124,58,237,0.25)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
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
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 64, borderRadius: 12, background: 'linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)', backgroundSize: '200% 100%' }} />
          ))}
        </div>
      )}
    </div>
  );
}
