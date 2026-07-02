'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTeacherLessonPlans, getTeacherSubjectsAndSections, createLessonPlan, getUserProfile } from '@school-erp/supabase/queries';

const IS: React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };

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

  // Helper: snap any date to its week's Monday
  const toMonday = (dateStr: string): string => {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr + 'T12:00:00'); // noon to avoid UTC daylight issues
    const day = d.getDay(); // 0=Sun, 1=Mon...
    const diff = day === 0 ? -6 : 1 - day; // if Sunday go back 6, else go to Monday
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  };

  const handleCreate = async () => {
    if (!form.subject_id || !form.section_id || !form.week_start_date || !form.topics) {
      alert('Subject, section, week date and topics are required.'); return;
    }
    // Ensure the selected date is a Monday
    const snapped = toMonday(form.week_start_date);
    if (snapped !== form.week_start_date) {
      setForm(f => ({ ...f, week_start_date: snapped }));
      alert('Week start date auto-corrected to Monday: ' + snapped); return;
    }
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
    <div className="dashboard-container">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Lesson Plans</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Weekly lesson planning and syllabus tracking</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background: showAdd ? '#FEF2F2' : 'linear-gradient(135deg,#0F766E,#0D9488)', color: showAdd ? '#DC2626' : 'white', border: showAdd ? '1px solid #FEE2E2' : 'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: showAdd ? 'none' : '0 4px 12px rgba(15,118,110,0.3)', whiteSpace:'nowrap' }}>
          {showAdd ? 'Cancel' : '+ New Lesson Plan'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background:'white', borderRadius:18, border:'1px solid #E2E8F0', padding:24, display:'flex', flexDirection:'column', gap:16, boxShadow:'0 4px 12px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize:16, fontWeight:800, color:'#0F172A', margin:0 }}>Create Lesson Plan</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={LS}>Subject *</label>
              <select style={IS} value={form.subject_id} onChange={e => setForm({...form, subject_id: e.target.value})}>
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Section *</label>
              <select style={IS} value={form.section_id} onChange={e => setForm({...form, section_id: e.target.value})}>
                <option value="">Select Section</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={LS}>Week Start (Monday) *</label>
              <input
                type="date" style={IS} value={form.week_start_date}
                onChange={e => {
                  const d = new Date(e.target.value + 'T12:00:00');
                  const day = d.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  d.setDate(d.getDate() + diff);
                  setForm({...form, week_start_date: d.toISOString().split('T')[0]});
                }}
                title="Select any day — auto-snaps to Monday"
              />
            </div>
            <div>
              <label style={LS}>Topics to Cover *</label>
              <input type="text" style={IS} value={form.topics} onChange={e => setForm({...form, topics: e.target.value})} placeholder="e.g. Algebra, Trigonometry" />
            </div>
          </div>
          <div>
            <label style={LS}>Learning Objectives</label>
            <textarea style={{ ...IS, resize:'none' }} value={form.learning_objectives} onChange={e => setForm({...form, learning_objectives: e.target.value})} placeholder="Objectives..." rows={2} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={LS}>Resources Used</label>
              <textarea style={{ ...IS, resize:'none' }} value={form.resources_used} onChange={e => setForm({...form, resources_used: e.target.value})} placeholder="Textbook, PPT, Video..." rows={2} />
            </div>
            <div>
              <label style={LS}>Homework Given</label>
              <textarea style={{ ...IS, resize:'none' }} value={form.homework_given} onChange={e => setForm({...form, homework_given: e.target.value})} placeholder="Exercises..." rows={2} />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
            <button onClick={handleCreate} disabled={saving} style={{ padding:'10px 24px', borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)' }}>
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
                  <p className="text-xs text-gray-500 font-medium mt-0.5">Week of {p.week_start_date ? p.week_start_date.split('T')[0] : '—'}</p>
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
