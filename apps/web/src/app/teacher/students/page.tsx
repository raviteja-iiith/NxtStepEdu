'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getTeacherSections, getSectionStudents } from '@school-erp/supabase/queries';

interface Student { id: string; full_name: string; roll_number: number | null; }
interface Section { id: string; name: string; class_name: string; }

export default function TeacherStudentsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      // "My Students" = sections where this teacher is the CLASS TEACHER
      // (assigned via Principal → Classes & Sections page)
      const { data: classSecs } = await supabase
        .from('sections')
        .select('id, name, classes(name)')
        .eq('class_teacher_id', userId);

      setSections((classSecs || []).map((s: any) => ({
        id: s.id as string,
        name: s.name as string,
        class_name: (s.classes as any)?.name || '',
      })));
    }
    setLoading(false);
  }, [supabase]);


  useEffect(() => { fetchSections(); }, [fetchSections]);

  const handleSectionChange = async (sectionId: string) => {
    setSelectedSection(sectionId);
    if (!sectionId) { setStudents([]); return; }
    setLoadingStudents(true);
    // Use neq false to catch students where is_active is null or true
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Students</h2>
          <p className="text-gray-500 text-sm mt-1">Students in your assigned sections</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={selectedSection}
          onChange={e => handleSectionChange(e.target.value)}
          className="px-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: '#E2E8F0' }}
        >
          <option value="">Select Section...</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
        </select>
        {selectedSection && <span className="text-sm text-gray-500">{students.length} student{students.length !== 1 ? 's' : ''}</span>}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : !selectedSection ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-4xl mb-3">👨‍🎓</p>
          <p className="text-gray-600 font-semibold">Select a section above</p>
          <p className="text-sm text-gray-400 mt-1">Choose one of your assigned sections to view student list</p>
        </div>
      ) : loadingStudents ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-600 font-semibold">No students in {selectedSec?.class_name} - {selectedSec?.name}</p>
          <p className="text-sm text-gray-400 mt-1">Students appear here once they are enrolled in this section</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-sm">{selectedSec?.class_name} — Section {selectedSec?.name}</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Roll No.</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Student Name</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {students.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-500 font-mono">{s.roll_number ?? i + 1}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#F0FDFA', color: '#0F766E' }}>
                        {s.full_name.charAt(0)}
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{s.full_name}</p>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => router.push(`/teacher/students/${s.id}/analysis`)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #DDD6FE', background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color: '#7C3AED', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      📊 Analysis
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
