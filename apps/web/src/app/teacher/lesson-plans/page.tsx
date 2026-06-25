'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTeacherLessonPlans, getTeacherSubjectsAndSections, createLessonPlan, getUserProfile } from '@school-erp/supabase/queries';

export default function LessonPlansPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({ 
    subject_id: '', section_id: '', week_start_date: '', 
    topics: '', learning_objectives: '', resources_used: '', homework_given: '' 
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    
    const data = await getTeacherLessonPlans(supabase, userId);
    setPlans(data);

    // Combine class teacher sections + subject-assigned sections for full access
    const { data: classSecs } = await supabase
      .from('sections')
      .select('id, name, classes(name)')
      .eq('class_teacher_id', userId);

    const assgn = await getTeacherSubjectsAndSections(supabase, userId);
    if (assgn || classSecs) {
      const secMap = new Map<string, { id: string; name: string; class_name: string }>();
      const subMap = new Map<string, { id: string; name: string }>();

      // Add class teacher sections first
      (classSecs || []).forEach((s: any) => {
        secMap.set(s.id as string, { id: s.id as string, name: s.name as string, class_name: (s.classes as any)?.name || '' });
      });

      // Add subject-assigned sections and subjects
      (assgn || []).forEach((a: Record<string, unknown>) => {
        const sec = a.sections as Record<string, unknown>;
        const sub = a.subjects as Record<string, string>;
        if (sec) secMap.set(sec.id as string, { id: sec.id as string, name: sec.name as string, class_name: (sec.classes as Record<string, string>)?.name || '' });
        if (sub) subMap.set(sub.id as string, { id: sub.id as string, name: sub.name as string });
      });
      setSections(Array.from(secMap.values()));
      setSubjects(Array.from(subMap.values()));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!form.subject_id || !form.section_id || !form.week_start_date || !form.topics) return;
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    
    const userData = await getUserProfile(supabase, userId);
    
    await createLessonPlan(supabase, {
      ...form,
      teacher_id: userId,
      school_id: userData?.school_id,
      status: 'planned'
    });
    
    setShowAdd(false); 
    setForm({ subject_id: '', section_id: '', week_start_date: '', topics: '', learning_objectives: '', resources_used: '', homework_given: '' });
    fetchAll(); setSaving(false);
  };

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Lesson Plans</h2><p className="text-gray-500 text-sm mt-1">Weekly lesson planning and syllabus tracking</p></div>
        <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg transition-all" style={{ background: '#0F766E' }}>
          {showAdd ? 'Cancel' : '+ New Lesson Plan'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border p-6 animate-fade-in" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-semibold text-lg mb-4">Create Lesson Plan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select className={inputCls} value={form.subject_id} onChange={e => setForm({...form, subject_id: e.target.value})}>
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={form.section_id} onChange={e => setForm({...form, section_id: e.target.value})}>
              <option value="">Select Section</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
            </select>
            <input type="date" className={inputCls} value={form.week_start_date} onChange={e => setForm({...form, week_start_date: e.target.value})} placeholder="Week Start Date" />
            <div className="md:col-span-2">
              <input type="text" className={inputCls} value={form.topics} onChange={e => setForm({...form, topics: e.target.value})} placeholder="Topics to cover (comma separated)" />
            </div>
            <div className="md:col-span-2">
              <textarea className={inputCls} value={form.learning_objectives} onChange={e => setForm({...form, learning_objectives: e.target.value})} placeholder="Learning Objectives" rows={2} />
            </div>
            <textarea className={inputCls} value={form.resources_used} onChange={e => setForm({...form, resources_used: e.target.value})} placeholder="Resources Used" rows={2} />
            <textarea className={inputCls} value={form.homework_given} onChange={e => setForm({...form, homework_given: e.target.value})} placeholder="Homework Given" rows={2} />
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={handleCreate} disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0F766E' }}>
              {saving ? 'Saving...' : 'Save Lesson Plan'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="skeleton h-64 rounded-2xl" /> : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-4xl mb-3">📖</p>
          <p className="text-gray-500 text-sm">No lesson plans created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map(p => (
            <div key={p.id} className="bg-white border rounded-2xl p-5 hover:shadow-md transition-shadow" style={{ borderColor: '#E2E8F0' }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-gray-900">{(p.subjects as any)?.name} - {(p.sections as any)?.name}</h4>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">Week of {new Date(p.week_start_date).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.status === 'planned' ? 'bg-blue-50 text-blue-700' : p.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {p.status}
                </span>
              </div>
              <div className="space-y-2 mt-4 text-sm text-gray-600">
                <p><span className="font-semibold text-gray-900">Topics:</span> {p.topics}</p>
                {p.learning_objectives && <p><span className="font-semibold text-gray-900">Objectives:</span> {p.learning_objectives}</p>}
                {p.homework_given && <p><span className="font-semibold text-gray-900">Homework:</span> {p.homework_given}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
