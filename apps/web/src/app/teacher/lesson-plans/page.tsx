'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getTeacherLessonPlans,
  getTeacherSubjectsAndSections,
  createLessonPlan,
  getUserProfile,
} from '@school-erp/supabase/queries';

/* ─── shared style tokens ────────────────────────────────────────────── */
const IS: React.CSSProperties = {
  width: '100%',
  padding: '9px 13px',
  border: '1px solid #E2E8F0',
  borderRadius: 9,
  fontSize: 13,
  outline: 'none',
  background: 'white',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const LS: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 5,
};

/* ─── helpers ────────────────────────────────────────────────────────── */
const toMonday = (dateStr: string): string => {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
};

const todayMonday = (): string => {
  const today = new Date();
  const iso = today.toISOString().split('T')[0];
  return toMonday(iso);
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const formatDateRange = (monday: string): string => {
  const start = new Date(monday + 'T12:00:00');
  const end = new Date(monday + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
};

const EMPTY_FORM = {
  subject_id: '',
  section_id: '',
  week_start_date: '',
  topics: '',
  learning_objectives: '',
  resources_used: '',
  homework_given: '',
};

type StatusType = 'planned' | 'in_progress' | 'completed';

const STATUS_BADGE: Record<StatusType, { bg: string; color: string; label: string }> = {
  planned: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Planned' },
  in_progress: { bg: '#FFFBEB', color: '#B45309', label: 'In Progress' },
  completed: { bg: '#F0FDF4', color: '#166534', label: 'Completed' },
};

const navBtnStyle: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 9,
  border: '1px solid #E2E8F0',
  background: 'white',
  color: '#334155',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

/* ─── tiny sub-components ─────────────────────────────────────────────── */
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #E8ECF0',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: color + '18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{value}</p>
        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      </div>
    </div>
  );
}

function FieldRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700, color: '#0F172A' }}>{label}: </span>
        {value}
      </p>
    </div>
  );
}

function ActionBtn({
  label, bg, color, border, onClick, disabled,
}: {
  label: string; bg: string; color: string; border: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 13px',
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
}

/* ─── main page component ────────────────────────────────────────────── */
export default function LessonPlansPage() {
  const supabase = createClient();

  const [plans, setPlans] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Week navigator
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<string>(todayMonday());

  // Create form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Per-card editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [editSaving, setEditSaving] = useState(false);

  // Status update / delete in-flight
  const [actionId, setActionId] = useState<string | null>(null);

  /* ── fetch ─────────────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;

    const data = await getTeacherLessonPlans(supabase, userId);
    setPlans(data);

    const { data: classSecs } = await supabase
      .from('sections')
      .select('id, name, classes(name)')
      .eq('class_teacher_id', userId);

    const assgn = await getTeacherSubjectsAndSections(supabase, userId);
    if (assgn || classSecs) {
      const secMap = new Map<string, { id: string; name: string; class_name: string }>();
      const subMap = new Map<string, { id: string; name: string }>();

      (classSecs || []).forEach((s: any) => {
        secMap.set(s.id, { id: s.id, name: s.name, class_name: s.classes?.name || '' });
      });

      (assgn || []).forEach((a: any) => {
        const sec = a.sections;
        const sub = a.subjects;
        if (sec) secMap.set(sec.id, { id: sec.id, name: sec.name, class_name: sec.classes?.name || '' });
        if (sub) subMap.set(sub.id, { id: sub.id, name: sub.name });
      });

      setSections(Array.from(secMap.values()));
      setSubjects(Array.from(subMap.values()));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── derived data ───────────────────────────────────────────────────── */
  const now = new Date();
  const thisMonthPlans = plans.filter(p => {
    const d = new Date((p.week_start_date || '').split('T')[0] + 'T12:00:00');
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const completedCount = plans.filter(p => p.status === 'completed').length;
  const pendingCount = plans.filter(p => p.status === 'planned' || p.status === 'in_progress').length;

  const weekPlans = plans.filter(p => {
    const d = (p.week_start_date || '').split('T')[0];
    return d === selectedWeekMonday;
  });

  /* ── actions ────────────────────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!form.subject_id || !form.section_id || !form.week_start_date || !form.topics) {
      alert('Subject, section, week date and topics are required.');
      return;
    }
    const snapped = toMonday(form.week_start_date);
    if (snapped !== form.week_start_date) {
      setForm(f => ({ ...f, week_start_date: snapped }));
      alert('Week start date auto-corrected to Monday: ' + snapped);
      return;
    }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const userData = await getUserProfile(supabase, userId);
    await createLessonPlan(supabase, {
      ...form,
      teacher_id: userId,
      school_id: userData?.school_id,
      status: 'planned',
    });
    setShowAdd(false);
    setForm({ ...EMPTY_FORM });
    setSaving(false);
    fetchAll();
  };

  const handleStatusUpdate = async (planId: string, status: StatusType) => {
    setActionId(planId);
    await supabase
      .from('lesson_plans')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', planId);
    setActionId(null);
    fetchAll();
  };

  const handleDelete = async (planId: string) => {
    if (!window.confirm('Delete this lesson plan? This cannot be undone.')) return;
    setActionId(planId);
    await supabase.from('lesson_plans').delete().eq('id', planId);
    setActionId(null);
    fetchAll();
  };

  const openEdit = (plan: any) => {
    setEditingId(plan.id);
    setEditForm({
      subject_id: plan.subject_id || '',
      section_id: plan.section_id || '',
      week_start_date: (plan.week_start_date || '').split('T')[0],
      topics: plan.topics || '',
      learning_objectives: plan.learning_objectives || '',
      resources_used: plan.resources_used || '',
      homework_given: plan.homework_given || '',
    });
  };

  const handleEditSave = async (planId: string) => {
    if (!editForm.topics) { alert('Topics are required.'); return; }
    setEditSaving(true);
    await supabase
      .from('lesson_plans')
      .update({
        subject_id: editForm.subject_id,
        section_id: editForm.section_id,
        week_start_date: toMonday(editForm.week_start_date),
        topics: editForm.topics,
        learning_objectives: editForm.learning_objectives,
        resources_used: editForm.resources_used,
        homework_given: editForm.homework_given,
      })
      .eq('id', planId);
    setEditingId(null);
    setEditSaving(false);
    fetchAll();
  };

  /* ── shared form fields renderer ────────────────────────────────────── */
  const renderFormFields = (
    f: typeof EMPTY_FORM,
    setF: (v: typeof EMPTY_FORM) => void,
    showWeek = true,
  ) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LS}>Subject *</label>
          <select style={IS} value={f.subject_id} onChange={e => setF({ ...f, subject_id: e.target.value })}>
            <option value="">Select Subject</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Section *</label>
          <select style={IS} value={f.section_id} onChange={e => setF({ ...f, section_id: e.target.value })}>
            <option value="">Select Section</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} - {s.name}</option>)}
          </select>
        </div>
      </div>
      {showWeek && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LS}>Week Start (Monday) *</label>
            <input
              type="date" style={IS} value={f.week_start_date}
              onChange={e => {
                const d = new Date(e.target.value + 'T12:00:00');
                const day = d.getDay();
                const diff = day === 0 ? -6 : 1 - day;
                d.setDate(d.getDate() + diff);
                setF({ ...f, week_start_date: d.toISOString().split('T')[0] });
              }}
              title="Select any day — auto-snaps to Monday"
            />
          </div>
          <div>
            <label style={LS}>Topics to Cover *</label>
            <input type="text" style={IS} value={f.topics} onChange={e => setF({ ...f, topics: e.target.value })} placeholder="e.g. Algebra, Trigonometry" />
          </div>
        </div>
      )}
      {!showWeek && (
        <div>
          <label style={LS}>Topics to Cover *</label>
          <input type="text" style={IS} value={f.topics} onChange={e => setF({ ...f, topics: e.target.value })} placeholder="e.g. Algebra, Trigonometry" />
        </div>
      )}
      <div>
        <label style={LS}>Learning Objectives</label>
        <textarea style={{ ...IS, resize: 'none' }} value={f.learning_objectives} onChange={e => setF({ ...f, learning_objectives: e.target.value })} placeholder="Objectives..." rows={2} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LS}>Resources Used</label>
          <textarea style={{ ...IS, resize: 'none' }} value={f.resources_used} onChange={e => setF({ ...f, resources_used: e.target.value })} placeholder="Textbook, PPT, Video..." rows={2} />
        </div>
        <div>
          <label style={LS}>Homework Given</label>
          <textarea style={{ ...IS, resize: 'none' }} value={f.homework_given} onChange={e => setF({ ...f, homework_given: e.target.value })} placeholder="Exercises..." rows={2} />
        </div>
      </div>
    </>
  );

  /* ── plan card ───────────────────────────────────────────────────────── */
  const PlanCard = ({ plan }: { plan: any }) => {
    const status: StatusType = plan.status as StatusType;
    const badge = STATUS_BADGE[status] || STATUS_BADGE.planned;
    const isEditing = editingId === plan.id;
    const isBusy = actionId === plan.id;
    const subjectName = plan.subjects?.name || '—';
    const sectionName = plan.sections?.name || '—';

    return (
      <div
        style={{
          background: 'white',
          border: '1px solid #E8ECF0',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          opacity: isBusy ? 0.7 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {/* card header */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: isEditing ? '1px solid #E8ECF0' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 800,
                color: '#0F172A',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subjectName}
              <span style={{ color: '#94A3B8', fontWeight: 400, margin: '0 6px' }}>·</span>
              {sectionName}
            </h4>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>
              Week of {(plan.week_start_date || '').split('T')[0] || '—'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 20,
                background: badge.bg,
                color: badge.color,
                letterSpacing: '0.03em',
              }}
            >
              {badge.label}
            </span>
            <button
              onClick={() => isEditing ? setEditingId(null) : openEdit(plan)}
              style={{
                padding: '3px 10px',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: isEditing ? '#F1F5F9' : 'white',
                color: '#475569',
              }}
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>

        {/* inline edit form */}
        {isEditing ? (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: '#FAFBFC' }}>
            {renderFormFields(editForm, setEditForm, false)}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setEditingId(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleEditSave(plan.id)}
                disabled={editSaving}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: editSaving ? '#93C5FD' : 'linear-gradient(135deg,#0F766E,#0D9488)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          /* card body */
          <div style={{ padding: '12px 20px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FieldRow icon="📚" label="Topics" value={plan.topics} />
              {plan.learning_objectives && (
                <FieldRow icon="🎯" label="Objectives" value={plan.learning_objectives} />
              )}
              {plan.resources_used && (
                <FieldRow icon="🗂️" label="Resources" value={plan.resources_used} />
              )}
              {plan.homework_given && (
                <FieldRow icon="📝" label="Homework" value={plan.homework_given} />
              )}
            </div>

            {/* action buttons */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid #F1F5F9',
                flexWrap: 'wrap',
              }}
            >
              {status === 'planned' && (
                <ActionBtn
                  label="Mark In Progress"
                  bg="#FFFBEB" color="#92400E" border="#FDE68A"
                  onClick={() => handleStatusUpdate(plan.id, 'in_progress')}
                  disabled={isBusy}
                />
              )}
              {status !== 'completed' && (
                <ActionBtn
                  label="✓ Mark Complete"
                  bg="#F0FDF4" color="#166534" border="#BBF7D0"
                  onClick={() => handleStatusUpdate(plan.id, 'completed')}
                  disabled={isBusy}
                />
              )}
              <ActionBtn
                label="Delete"
                bg="#FFF1F2" color="#BE123C" border="#FECDD3"
                onClick={() => handleDelete(plan.id)}
                disabled={isBusy}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="dashboard-container">

      {/* ── page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
            Lesson Plans
          </h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            Weekly lesson planning and syllabus tracking
          </p>
        </div>
        <button
          onClick={() => {
            if (!showAdd) setForm({ ...EMPTY_FORM, week_start_date: selectedWeekMonday });
            setShowAdd(v => !v);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: showAdd ? '#FEF2F2' : 'linear-gradient(135deg,#0F766E,#0D9488)',
            color: showAdd ? '#DC2626' : 'white',
            border: showAdd ? '1px solid #FEE2E2' : 'none',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: showAdd ? 'none' : '0 4px 12px rgba(15,118,110,0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {showAdd ? 'Cancel' : '+ New Lesson Plan'}
        </button>
      </div>

      {/* ── create form (slide-down panel) ── */}
      {showAdd && (
        <div
          style={{
            background: 'white',
            borderRadius: 18,
            border: '1px solid #E2E8F0',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Create Lesson Plan
          </h3>
          {renderFormFields(form, setForm, true)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={handleCreate}
              disabled={saving}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: saving ? '#93C5FD' : 'linear-gradient(135deg,#0F766E,#0D9488)',
                color: 'white',
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
              }}
            >
              {saving ? 'Saving…' : 'Save Lesson Plan'}
            </button>
          </div>
        </div>
      )}

      {/* ── stats bar ── */}
      {!loading && (
        <div className="three-col-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <StatCard label="This Month" value={thisMonthPlans.length} icon="📅" color="#0F766E" />
          <StatCard label="Completed" value={completedCount} icon="✅" color="#166534" />
          <StatCard label="Pending" value={pendingCount} icon="🕐" color="#92400E" />
        </div>
      )}

      {/* ── week navigator ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'white',
          border: '1px solid #E8ECF0',
          borderRadius: 14,
          padding: '12px 20px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        <button
          onClick={() => setSelectedWeekMonday(d => addDays(d, -7))}
          style={navBtnStyle}
          aria-label="Previous week"
        >
          ‹ Prev
        </button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
            {formatDateRange(selectedWeekMonday)}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8' }}>
            {weekPlans.length} plan{weekPlans.length !== 1 ? 's' : ''} this week
          </p>
        </div>
        <button
          onClick={() => setSelectedWeekMonday(d => addDays(d, 7))}
          style={navBtnStyle}
          aria-label="Next week"
        >
          Next ›
        </button>
      </div>

      {/* ── week content ── */}
      {loading ? (
        <div className="skeleton h-64 rounded-2xl" />
      ) : weekPlans.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px dashed #CBD5E1',
            borderRadius: 18,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#334155', margin: '0 0 6px' }}>
            No lesson plans for this week
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 20px' }}>
            {formatDateRange(selectedWeekMonday)}
          </p>
          <button
            onClick={() => {
              setForm({ ...EMPTY_FORM, week_start_date: selectedWeekMonday });
              setShowAdd(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg,#0F766E,#0D9488)',
              color: 'white',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(15,118,110,0.25)',
            }}
          >
            + Create plan for this week
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
          {weekPlans.map(p => <PlanCard key={p.id} plan={p} />)}
        </div>
      )}
    </div>
  );
}
