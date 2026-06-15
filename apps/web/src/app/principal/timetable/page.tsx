'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TimetableSlot { id: string; section_id: string; subject_id: string; teacher_id: string; day_of_week: number; period_number: number; start_time: string; end_time: string; room: string | null; subject_name?: string; teacher_name?: string; }
interface Section { id: string; name: string; class_name: string; }
interface Subject { id: string; name: string; }
interface Teacher { id: string; full_name: string; }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_COLORS = ['#EFF6FF', '#F0FDF4', '#FFFBEB', '#FFF1F2', '#F5F3FF', '#F0FDFA'];

export default function TimetablePage() {
  const supabase = createClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState(8);
  const [showSlotModal, setShowSlotModal] = useState<{ day: number; period: number } | null>(null);
  const [slotForm, setSlotForm] = useState({ subject_id: '', teacher_id: '', start_time: '08:00', end_time: '08:45', room: '' });
  const [conflict, setConflict] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStructure = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId).single();
    const schoolId = userRow?.school_id;
    if (!schoolId) { setLoading(false); return; }

    // Academic year is optional — always fall back to school_id
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', schoolId).maybeSingle();

    // Sections: try with academic year, fall back to all sections in school
    let secQuery = supabase.from('sections').select('id, name, classes(name)').eq('school_id', schoolId);
    if (yr?.id) secQuery = secQuery.eq('academic_year_id', yr.id);
    const { data: secWithYear } = await secQuery;
    // If no sections found with year filter, load ALL sections for this school
    let secData = secWithYear;
    if (!secData || secData.length === 0) {
      const { data: allSec } = await supabase.from('sections').select('id, name, classes(name)').eq('school_id', schoolId);
      secData = allSec;
    }
    if (secData) setSections(secData.map((s: Record<string, unknown>) => ({ id: s.id as string, name: s.name as string, class_name: (s.classes as Record<string, string>)?.name || '' })));

    // Subjects: same fallback pattern
    let subQuery = supabase.from('subjects').select('id, name').eq('school_id', schoolId);
    if (yr?.id) subQuery = subQuery.eq('academic_year_id', yr.id);
    const { data: subWithYear } = await subQuery;
    let subData = subWithYear;
    if (!subData || subData.length === 0) {
      const { data: allSub } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId);
      subData = allSub;
    }
    if (subData) setSubjects(subData);

    const { data: t } = await supabase.from('users').select('id, full_name').eq('school_id', schoolId).eq('role', 'teacher').eq('is_active', true).order('full_name');
    if (t) setTeachers(t);
    setLoading(false);
  }, [supabase]);

  const fetchSlots = useCallback(async () => {
    if (!selectedSection) return;
    const { data } = await supabase
      .from('timetable')
      .select('*, subjects(name), users!timetable_teacher_id_fkey(full_name)')
      .eq('section_id', selectedSection);
    if (data) setSlots(data.map((s: Record<string, unknown>) => ({
      ...s,
      subject_name: (s.subjects as Record<string, string>)?.name,
      teacher_name: (s['users!timetable_teacher_id_fkey'] as Record<string, string>)?.full_name
        || (s.users as Record<string, string>)?.full_name,
    })) as TimetableSlot[]);
  }, [supabase, selectedSection]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const checkConflict = async (teacherId: string, day: number, period: number) => {
    if (!teacherId) { setConflict(''); return; }
    const { data } = await supabase.from('timetable').select('*, sections(name, classes(name))').eq('teacher_id', teacherId).eq('day_of_week', day).eq('period_number', period).neq('section_id', selectedSection);
    if (data && data.length > 0) {
      const s = data[0];
      const secName = (s.sections as Record<string, unknown>)?.name;
      const clsName = ((s.sections as Record<string, unknown>)?.classes as Record<string, string>)?.name;
      setConflict(`⚠️ This teacher is already assigned to ${clsName} - ${secName} at this time slot.`);
    } else {
      setConflict('');
    }
  };

  const handleSaveSlot = async () => {
    if (!slotForm.subject_id || !slotForm.teacher_id || !showSlotModal || conflict) return;
    setSaving(true);
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    // Remove existing slot at this position
    await supabase.from('timetable').delete().eq('section_id', selectedSection).eq('day_of_week', showSlotModal.day).eq('period_number', showSlotModal.period);
    // Insert new
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    await supabase.from('timetable').insert({
      school_id: userData?.school_id, section_id: selectedSection, subject_id: slotForm.subject_id,
      teacher_id: slotForm.teacher_id, day_of_week: showSlotModal.day, period_number: showSlotModal.period,
      start_time: slotForm.start_time, end_time: slotForm.end_time, room: slotForm.room || null,
      academic_year_id: yr?.id,
    });
    setShowSlotModal(null);
    fetchSlots();
    setSaving(false);
  };

  const deleteSlot = async (id: string) => {
    await supabase.from('timetable').delete().eq('id', id);
    fetchSlots();
  };

  const getSlot = (day: number, period: number) => slots.find(s => s.day_of_week === day && s.period_number === period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Timetable Management</h2><p className="text-gray-500 text-sm mt-1">Configure weekly schedules with conflict detection</p></div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500">Periods:</label>
          <input type="number" min={4} max={12} value={periods} onChange={e => setPeriods(parseInt(e.target.value) || 8)} className="w-16 px-3 py-1.5 border rounded-lg text-sm text-center" style={{ borderColor: '#E2E8F0' }} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="px-4 py-2.5 border rounded-xl text-sm font-medium" style={{ borderColor: '#E2E8F0' }}>
          <option value="">Select Section...</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
        </select>
        {selectedSection && <span className="text-sm text-gray-500">Click any cell to assign a subject</span>}
      </div>

      {loading ? (
        <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : !selectedSection ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-4xl mb-3">🗓️</p><p className="text-gray-500">Select a section to manage its timetable</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-x-auto" style={{ borderColor: '#E2E8F0' }}>
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-left w-24">Period</th>
                {DAYS.map((d, i) => <th key={d} className="px-2 py-3 text-xs font-semibold uppercase text-center" style={{ color: '#1E40AF', background: DAY_COLORS[i] }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periods }, (_, p) => p + 1).map(period => (
                <tr key={period} className="border-t" style={{ borderColor: '#F1F5F9' }}>
                  <td className="px-4 py-2 text-sm font-bold text-gray-500 text-center">{period}</td>
                  {DAYS.map((_, dayIdx) => {
                    const day = dayIdx + 1;
                    const slot = getSlot(day, period);
                    return (
                      <td key={dayIdx} className="px-1 py-1">
                        {slot ? (
                          <div className="p-2 rounded-lg text-center cursor-pointer group relative transition-all hover:shadow-md" style={{ background: DAY_COLORS[dayIdx], minHeight: '60px' }}
                            onClick={() => { setShowSlotModal({ day, period }); setSlotForm({ subject_id: slot.subject_id, teacher_id: slot.teacher_id, start_time: slot.start_time, end_time: slot.end_time, room: slot.room || '' }); setConflict(''); }}>
                            <p className="text-xs font-bold text-gray-900">{slot.subject_name}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{slot.teacher_name}</p>
                            {slot.room && <p className="text-[10px] text-gray-400">📍 {slot.room}</p>}
                            <button onClick={e => { e.stopPropagation(); deleteSlot(slot.id); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity">✕</button>
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg text-center cursor-pointer border-2 border-dashed transition-all hover:border-blue-300 hover:bg-blue-50/50" style={{ borderColor: '#E2E8F0', minHeight: '60px' }}
                            onClick={() => { setShowSlotModal({ day, period }); setSlotForm({ subject_id: '', teacher_id: '', start_time: `${String(7 + period).padStart(2, '0')}:00`, end_time: `${String(7 + period).padStart(2, '0')}:45`, room: '' }); setConflict(''); }}>
                            <span className="text-gray-300 text-xs">+</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slot Modal */}
      {showSlotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">{DAYS[showSlotModal.day - 1]} — Period {showSlotModal.period}</h3>
              <button onClick={() => setShowSlotModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {conflict && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ background: '#FEF2F2', color: '#DC2626' }}>{conflict}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <select value={slotForm.subject_id} onChange={e => setSlotForm(f => ({ ...f, subject_id: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }}>
                  <option value="">Select...</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Teacher *</label>
                <select value={slotForm.teacher_id} onChange={e => { setSlotForm(f => ({ ...f, teacher_id: e.target.value })); checkConflict(e.target.value, showSlotModal.day, showSlotModal.period); }} className="w-full px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: conflict ? '#DC2626' : '#E2E8F0' }}>
                  <option value="">Select...</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label><input type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">End Time</label><input type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Room</label><input type="text" value={slotForm.room} onChange={e => setSlotForm(f => ({ ...f, room: e.target.value }))} className="w-full px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }} placeholder="e.g. Room 201" /></div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowSlotModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleSaveSlot} disabled={saving || !!conflict || !slotForm.subject_id || !slotForm.teacher_id} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#1E40AF' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
