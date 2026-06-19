'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
// ── reorder helper ───────────────────────────────────────────────────────────
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [item] = a.splice(from, 1);
  a.splice(to, 0, item);
  return a;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ClassRow   { id:string; name:string; numeric_order:number; }
interface SectionRow { id:string; name:string; class_id:string; }
interface StudentRow { id:string; full_name:string; class_id:string; section_id:string|null; roll_number:number|null; class_name?:string; section_name?:string; }

interface Change {
  student_id:    string;
  full_name:     string;
  old_class_id:  string;
  old_class_name:string;
  old_section_id:string|null;
  old_section_name:string;
  new_class_id:  string|null;  // null = graduate
  new_class_name:string;
  new_section_id:string|null;
  graduate:      boolean;
}

interface UndoRecord {
  student_id:    string;
  old_class_id:  string;
  old_section_id:string|null;
  was_active:    boolean;
}

type Step = 'idle'|'previewing'|'confirming'|'promoting'|'done'|'undoing';

const IS:React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS:React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };

const UNDO_KEY = 'promotion_undo';

export default function PromotionPage() {
  const supabase = createClient();
  const [classes,  setClasses]  = useState<ClassRow[]>([]);
  const [reorderedClasses, setReorderedClasses] = useState<ClassRow[]>([]);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderSaved,  setOrderSaved]  = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [step,     setStep]     = useState<Step>('idle');
  const [changes,  setChanges]  = useState<Change[]>([]);
  const [error,    setError]    = useState('');
  const [progress, setProgress] = useState(0);
  const [undoData, setUndoData] = useState<UndoRecord[]|null>(null);
  const [undoDone, setUndoDone] = useState(false);
  const [initLoad, setInitLoad] = useState(true);

  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) { setInitLoad(false); return; }
      const { data:u } = await supabase.from('users').select('school_id').eq('id',uid).single();
      if (!u?.school_id) { setInitLoad(false); return; }
      setSchoolId(u.school_id);
      const { data:yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',u.school_id).maybeSingle();
      const yid = yr?.id;
      const [{ data:c }, { data:sec }, { data:sts }] = await Promise.all([
        yid ? supabase.from('classes').select('id,name,numeric_order').eq('academic_year_id',yid).order('numeric_order') : supabase.from('classes').select('id,name,numeric_order').eq('school_id',u.school_id).order('numeric_order'),
        yid ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id',yid) : supabase.from('sections').select('id,name,class_id').eq('school_id',u.school_id),
        supabase.from('students').select('id,full_name,class_id,section_id,roll_number,classes(name),sections(name)').eq('school_id',u.school_id).eq('is_active',true),
      ]);
      if (c)   { setClasses(c); setReorderedClasses(c); }
      if (sec) setSections(sec);
      if (sts) setStudents(sts.map((s:any) => ({ ...s, class_name:s.classes?.name, section_name:s.sections?.name })));
      // Check for existing undo data
      const saved = localStorage.getItem(`${UNDO_KEY}_${u.school_id}`);
      if (saved) { try { setUndoData(JSON.parse(saved)); } catch {} }
      setInitLoad(false);
    })();
  }, [supabase]);

  // ── save class order ────────────────────────────────────────────────────────
  const saveOrder = async () => {
    setOrderSaving(true); setOrderSaved(false);
    await Promise.all(reorderedClasses.map((c, i) =>
      supabase.from('classes').update({ numeric_order: i + 1 }).eq('id', c.id)
    ));
    // Re-sync local classes state
    setClasses(reorderedClasses.map((c, i) => ({ ...c, numeric_order: i + 1 })));
    setOrderSaving(false); setOrderSaved(true);
    setTimeout(() => setOrderSaved(false), 3000);
  };

  // ── compute preview ───────────────────────────────────────────────────────
  const buildPreview = useCallback(() => {
    if (!classes.length || !students.length) return;
    setError('');
    const classMap = new Map(classes.map(c => [c.id, c]));
    const secMap   = new Map(sections.map(s => [s.id, s]));
    // Build sections indexed by class_id + name
    const secByClassAndName = new Map<string, SectionRow>();
    sections.forEach(s => secByClassAndName.set(`${s.class_id}||${s.name.toLowerCase()}`, s));

    const sorted = [...classes].sort((a,b) => a.numeric_order - b.numeric_order);
    const nextClassMap = new Map<string,ClassRow|null>(); // class_id -> next class (or null = last)
    sorted.forEach((c,i) => nextClassMap.set(c.id, i < sorted.length - 1 ? sorted[i+1] : null));

    const result: Change[] = students
      .filter(s => nextClassMap.has(s.class_id)) // only students whose class is in the promotion order
      .map(s => {
        // Use live DB-joined class name as source of truth for display
        const displayClassName = s.class_name ?? classMap.get(s.class_id)?.name ?? '?';
        const nextClass = nextClassMap.get(s.class_id) ?? null;
        const graduate  = nextClass === null;
        const currSec   = s.section_id ? secMap.get(s.section_id) : null;
        let newSectionId: string|null = null;
        if (!graduate && nextClass && currSec) {
          const match = secByClassAndName.get(`${nextClass.id}||${currSec.name.toLowerCase()}`);
          newSectionId = match?.id ?? null;
        }
        return {
          student_id:      s.id,
          full_name:       s.full_name,
          old_class_id:    s.class_id,
          old_class_name:  displayClassName,
          old_section_id:  s.section_id ?? null,
          old_section_name:currSec?.name ?? '—',
          new_class_id:    graduate ? null : nextClass!.id,
          new_class_name:  graduate ? '🎓 Graduated' : nextClass!.name,
          new_section_id:  newSectionId,
          graduate,
        };
      });

    // Students whose class is NOT in the promotion order (different academic year, etc.)
    const skipped = students.filter(s => !nextClassMap.has(s.class_id));
    if (skipped.length > 0) {
      setError(`⚠ ${skipped.length} student(s) skipped — their class is not in the promotion order above (${[...new Set(skipped.map(s => s.class_name || s.class_id))].join(', ')}). Add those classes to the order first.`);
    }

    setChanges(result);
    setStep('confirming');
  }, [classes, sections, students]);

  // ── run promotion ──────────────────────────────────────────────────────────
  const runPromotion = async () => {
    setStep('promoting');
    setProgress(0);
    setError('');

    // Build undo data before changing anything
    const undo: UndoRecord[] = students.map(s => ({
      student_id:    s.id,
      old_class_id:  s.class_id,
      old_section_id:s.section_id ?? null,
      was_active:    true,
    }));
    localStorage.setItem(`${UNDO_KEY}_${schoolId}`, JSON.stringify(undo));
    setUndoData(undo);

    const total = changes.length;
    let done = 0;

    // Chunk into batches of 20
    const BATCH = 20;
    for (let i = 0; i < changes.length; i += BATCH) {
      const batch = changes.slice(i, i + BATCH);
      await Promise.all(batch.map(ch => {
        if (ch.graduate) {
          return supabase.from('students').update({ is_active: false }).eq('id', ch.student_id);
        } else {
          return supabase.from('students').update({ class_id: ch.new_class_id, section_id: ch.new_section_id }).eq('id', ch.student_id);
        }
      }));
      done += batch.length;
      setProgress(Math.round((done / total) * 100));
    }

    setStep('done');
    setUndoDone(false);
  };

  // ── undo ──────────────────────────────────────────────────────────────────
  const runUndo = async () => {
    if (!undoData) return;
    setStep('undoing');
    setProgress(0);
    const BATCH = 20;
    const total = undoData.length;
    let done = 0;
    for (let i = 0; i < undoData.length; i += BATCH) {
      const batch = undoData.slice(i, i + BATCH);
      await Promise.all(batch.map(u =>
        supabase.from('students').update({ class_id: u.old_class_id, section_id: u.old_section_id, is_active: u.was_active }).eq('id', u.student_id)
      ));
      done += batch.length;
      setProgress(Math.round((done / total) * 100));
    }
    localStorage.removeItem(`${UNDO_KEY}_${schoolId}`);
    setUndoData(null);
    setUndoDone(true);
    setStep('idle');
    setChanges([]);
  };

  const promote  = changes.filter(c => !c.graduate);
  const graduate = changes.filter(c => c.graduate);

  if (initLoad) return <div style={{ padding:40, textAlign:'center', color:'#94A3B8' }}>Loading...</div>;

  const PBar = ({ pct }: { pct:number }) => (
    <div style={{ height:10, background:'#E2E8F0', borderRadius:99, overflow:'hidden', margin:'12px 0' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#1E3A8A,#3B82F6)', borderRadius:99, transition:'width 0.3s' }}/>
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>🎓 Class Promotion</h2>
        <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Move all students to their next class at the end of the academic year</p>
      </div>

      {/* Undo available */}
      {undoData && !undoDone && step === 'idle' && (
        <div style={{ padding:'14px 18px', background:'#FFFBEB', border:'2px solid #FDE68A', borderRadius:12, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:13, fontWeight:800, color:'#92400E', margin:0 }}>↩ Previous promotion can be undone</p>
            <p style={{ fontSize:12, color:'#B45309', marginTop:3 }}>{undoData.length} students were promoted. Click Undo to revert all changes.</p>
          </div>
          <button onClick={() => { setStep('confirming'); setChanges([]); }}
            style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#D97706,#F59E0B)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            ↩ Undo Promotion
          </button>
        </div>
      )}

      {undoDone && (
        <div style={{ padding:'14px 18px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#15803D', margin:0 }}>✅ Promotion undone! All students restored to previous classes.</p>
        </div>
      )}

      {/* Info cards */}
      <div className="stat-cards-container">
        {[
          { label:'Active Students', value:students.length, icon:'🎓', color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
          { label:'Classes', value:classes.length, icon:'🏫', color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
          { label:'Graduating (last class)', value:classes.length > 0 ? students.filter(s => {
              const sorted = [...classes].sort((a,b) => a.numeric_order - b.numeric_order);
              return s.class_id === sorted[sorted.length-1]?.id;
            }).length : 0, icon:'📜', color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
        ].map((c,i) => (
          <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'16px 18px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <p style={{ fontSize:11, fontWeight:700, color:c.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{c.label}</p>
              <span style={{ fontSize:18 }}>{c.icon}</span>
            </div>
            <p style={{ fontSize:26, fontWeight:800, color:'#0F172A', margin:0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', padding:'18px 22px' }}>
        <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>📋 What happens when you promote:</p>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[
            { icon:'✅', text:'Students move to the next class (e.g., Class 6 → Class 7)' },
            { icon:'🔗', text:'If their section name exists in the new class, they\'re assigned to it automatically' },
            { icon:'💰', text:'All fee records and dues are preserved exactly as-is' },
            { icon:'📊', text:'All marks, attendance, and history remain linked to each student' },
            { icon:'📜', text:`Last class students (${classes.length > 0 ? [...classes].sort((a,b)=>a.numeric_order-b.numeric_order).pop()?.name : '—'}) are marked as Graduated — data preserved, not deleted` },
            { icon:'↩',  text:'An Undo button lets you reverse the entire promotion instantly if done by mistake' },
          ].map(({ icon, text }, i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{icon}</span>
              <p style={{ fontSize:13, color:'#475569', margin:0 }}>{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Class Order Panel ─────────────────────────────────────────────────── */}
      {step === 'idle' && (
        <div style={{ background:'white', borderRadius:14, border:'2px solid #E8ECF0', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div>
              <p style={{ fontSize:14, fontWeight:800, color:'#0F172A', margin:0 }}>📋 Set the Class Progression Order</p>
              <p style={{ fontSize:12, color:'#64748B', marginTop:4 }}>
                This defines which class students go to next. Arrange from <strong>lowest to highest</strong>.
                Students in the <strong style={{ color:'#7C3AED' }}>last class</strong> will graduate.
              </p>
            </div>
            {orderSaved
              ? <span style={{ fontSize:12, fontWeight:700, color:'#15803D', background:'#F0FDF4', padding:'5px 14px', borderRadius:99, border:'1px solid #BBF7D0', whiteSpace:'nowrap' }}>✅ Order saved!</span>
              : <button onClick={saveOrder} disabled={orderSaving}
                  style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:12, fontWeight:700, cursor:orderSaving?'not-allowed':'pointer', opacity:orderSaving?0.7:1, whiteSpace:'nowrap' }}>
                  {orderSaving ? 'Saving...' : '💾 Save Order'}
                </button>
            }
          </div>

          {/* Example banner */}
          <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, fontSize:12, color:'#15803D' }}>
            <strong>Example for a real school:</strong> Class 1 → Class 2 → Class 3 → ... → Class 10 → 🎓 Graduates
          </div>

          {/* Flow chain */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {reorderedClasses.map((cls, i) => {
              const isLast = i === reorderedClasses.length - 1;
              const isFirst = i === 0;
              const nextCls = reorderedClasses[i + 1];
              const studentCount = students.filter(s => s.class_id === cls.id).length;
              return (
                <div key={cls.id}>
                  {/* Class row */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:isLast?'#FDF4FF':'#F8FAFC', border:`2px solid ${isLast?'#DDD6FE':'#E2E8F0'}`, borderRadius:12 }}>
                    {/* Step number */}
                    <div style={{ width:32, height:32, borderRadius:'50%', background:isLast?'linear-gradient(135deg,#7C3AED,#A855F7)':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>
                      {i + 1}
                    </div>

                    {/* Class info */}
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:14, fontWeight:700, color:'#0F172A', margin:0 }}>{cls.name}</p>
                      <p style={{ fontSize:11, color:'#94A3B8', margin:'2px 0 0' }}>
                        {studentCount} student{studentCount !== 1 ? 's' : ''} currently in this class
                      </p>
                    </div>

                    {/* What happens */}
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {isLast
                        ? <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:99, background:'#EDE9FE', color:'#7C3AED' }}>🎓 Graduates (leaves school)</span>
                        : <span style={{ fontSize:12, fontWeight:600, padding:'4px 12px', borderRadius:99, background:'#EFF6FF', color:'#1D4ED8' }}>
                            Goes to → <strong>{nextCls?.name}</strong>
                          </span>
                      }
                    </div>

                    {/* Move buttons */}
                    <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
                      <button onClick={() => setReorderedClasses(r => moveItem(r, i, i-1))} disabled={isFirst} title="Move up"
                        style={{ width:26, height:24, borderRadius:5, border:'1px solid #E2E8F0', background:'white', cursor:isFirst?'not-allowed':'pointer', fontSize:12, opacity:isFirst?0.25:1, display:'flex', alignItems:'center', justifyContent:'center' }}>↑</button>
                      <button onClick={() => setReorderedClasses(r => moveItem(r, i, i+1))} disabled={isLast} title="Move down"
                        style={{ width:26, height:24, borderRadius:5, border:'1px solid #E2E8F0', background:'white', cursor:isLast?'not-allowed':'pointer', fontSize:12, opacity:isLast?0.25:1, display:'flex', alignItems:'center', justifyContent:'center' }}>↓</button>
                    </div>
                  </div>

                  {/* Connector arrow between rows */}
                  {!isLast && (
                    <div style={{ display:'flex', justifyContent:'center', padding:'2px 0', color:'#CBD5E1', fontSize:18, lineHeight:1 }}>↓</div>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ fontSize:11, color:'#94A3B8', margin:0 }}>
            ⚠ If you reorder the classes above, click <strong>Save Order</strong> before clicking Promote.
          </p>
        </div>
      )}


      {/* Main action */}
      {step === 'idle' && (
        <button onClick={buildPreview} disabled={students.length === 0}
          style={{ padding:'16px 32px', background:students.length===0?'#E2E8F0':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:students.length===0?'#94A3B8':'white', border:'none', borderRadius:14, fontSize:16, fontWeight:800, cursor:students.length===0?'not-allowed':'pointer', boxShadow:students.length===0?'none':'0 8px 24px rgba(59,130,246,0.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>🎓</span>
          Promote All Students to Next Class
        </button>
      )}

      {/* Promoting progress */}
      {(step === 'promoting' || step === 'undoing') && (
        <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', padding:'28px 24px' }}>
          <p style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:'0 0 4px' }}>{step === 'undoing' ? '↩ Undoing Promotion...' : '🎓 Promoting Students...'}</p>
          <p style={{ fontSize:13, color:'#64748B', marginBottom:0 }}>{progress}% complete — do not close this page</p>
          <PBar pct={progress}/>
          <p style={{ fontSize:12, color:'#94A3B8', margin:0 }}>Processing {changes.length || (undoData?.length ?? 0)} students in batches...</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div style={{ background:'#F0FDF4', borderRadius:14, border:'2px solid #BBF7D0', padding:'28px 24px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🎉</div>
          <p style={{ fontSize:18, fontWeight:800, color:'#15803D', margin:0 }}>Promotion Complete!</p>
          <p style={{ fontSize:13, color:'#475569', marginTop:8 }}>{promote.length} students promoted · {graduate.length} students graduated</p>
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:18 }}>
            <button onClick={() => { setStep('idle'); setChanges([]); window.location.reload(); }}
              style={{ padding:'10px 22px', borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, cursor:'pointer', color:'#475569' }}>Done</button>
            <button onClick={runUndo}
              style={{ padding:'10px 22px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#D97706,#F59E0B)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              ↩ Undo This Promotion
            </button>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL ─────────────────────────────────────────────────── */}
      {step === 'confirming' && (
        <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.65)', backdropFilter:'blur(6px)' }}>
          <div style={{ width:'100%', maxWidth:660, background:'white', borderRadius:20, boxShadow:'0 32px 80px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column', maxHeight:'90vh' }}>
            {/* Modal header */}
            {undoData && changes.length === 0 ? (
              // Undo confirmation
              <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid #FEF3C7', background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderRadius:'20px 20px 0 0' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <div>
                    <p style={{ fontSize:17, fontWeight:800, color:'#92400E', margin:0 }}>↩ Undo Class Promotion?</p>
                    <p style={{ fontSize:13, color:'#78350F', marginTop:4 }}>{undoData.length} students will be returned to their previous classes</p>
                  </div>
                  <button onClick={() => setStep('idle')} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid #FDE68A', background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B' }}>✕</button>
                </div>
              </div>
            ) : (
              <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid #DBEAFE', background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', borderRadius:'20px 20px 0 0' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <div>
                    <p style={{ fontSize:17, fontWeight:800, color:'#1E3A8A', margin:0 }}>🎓 Confirm Class Promotion</p>
                    <p style={{ fontSize:13, color:'#1D4ED8', marginTop:4 }}>{promote.length} students promoted · {graduate.length} students graduating</p>
                  </div>
                  <button onClick={() => setStep('idle')} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid #BFDBFE', background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B' }}>✕</button>
                </div>
              </div>
            )}

            {/* Preview list */}
            {changes.length > 0 && (
              <div style={{ overflowY:'auto', flex:1, padding:'16px 26px' }}>
                {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626', marginBottom:12 }}>{error}</div>}

                {/* Stats */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                  <div style={{ padding:'12px 16px', background:'#EFF6FF', border:'1px solid #DBEAFE', borderRadius:10 }}>
                    <p style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' }}>Will be promoted</p>
                    <p style={{ fontSize:22, fontWeight:800, color:'#1E3A8A', margin:0 }}>{promote.length} students</p>
                  </div>
                  <div style={{ padding:'12px 16px', background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:10 }}>
                    <p style={{ fontSize:11, fontWeight:700, color:'#7C3AED', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' }}>Will graduate</p>
                    <p style={{ fontSize:22, fontWeight:800, color:'#6D28D9', margin:0 }}>{graduate.length} students</p>
                  </div>
                </div>

                {/* Warning */}
                <div style={{ padding:'12px 16px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, marginBottom:16 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#92400E', margin:'0 0 4px' }}>⚠ Please verify before confirming</p>
                  <p style={{ fontSize:12, color:'#B45309', margin:0 }}>Fee balances, marks, and attendance are <strong>not affected</strong>. You can undo this promotion immediately after if needed.</p>
                </div>

                {/* Change list */}
                <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 8px' }}>Preview of changes</p>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {/* Header */}
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'6px 12px', background:'#F8FAFC', borderRadius:8, gap:8 }}>
                    {['Student','Current Class','New Class / Status'].map(h => (
                      <p key={h} style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{h}</p>
                    ))}
                  </div>
                  {changes.map(ch => (
                    <div key={ch.student_id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'8px 12px', background:ch.graduate?'#FDF4FF':'#F8FAFC', borderRadius:8, gap:8, border:`1px solid ${ch.graduate?'#EDE9FE':'#F1F5F9'}`, alignItems:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:26, height:26, borderRadius:'50%', background:ch.graduate?'linear-gradient(135deg,#7C3AED,#A855F7)':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{ch.full_name.charAt(0)}</div>
                        <span style={{ fontSize:12, fontWeight:600, color:'#0F172A' }}>{ch.full_name}</span>
                      </div>
                      <p style={{ fontSize:12, color:'#475569', margin:0 }}>{ch.old_class_name} {ch.old_section_name !== '—' ? `· ${ch.old_section_name}` : ''}</p>
                      <p style={{ fontSize:12, fontWeight:700, color:ch.graduate?'#7C3AED':'#1D4ED8', margin:0 }}>{ch.new_class_name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Undo preview */}
            {undoData && changes.length === 0 && (
              <div style={{ padding:'16px 26px' }}>
                <div style={{ padding:'14px 16px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10 }}>
                  <p style={{ fontSize:13, color:'#92400E', margin:0 }}>This will reverse all {undoData.length} student class changes from the last promotion. All students return to their previous class and section exactly.</p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ padding:'14px 26px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={() => setStep('idle')} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              {undoData && changes.length === 0 ? (
                <button onClick={runUndo} style={{ flex:1, padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#D97706,#F59E0B)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                  ↩ Yes, Undo Promotion
                </button>
              ) : (
                <button onClick={runPromotion} style={{ flex:1, padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span>🎓</span> Yes, Promote {changes.length} Students
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
