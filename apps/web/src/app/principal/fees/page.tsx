'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface FeeStructure { id:string; name:string; fee_type:string; amount:number; due_date:string|null; is_recurring:boolean; recurring_interval:string|null; class_name?:string; }
interface ClassItem { id:string; name:string; }
const FEE_TYPES=['tuition','transport','hostel','examination','activity','library','uniform','miscellaneous'];
const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:5 };
const overlay: React.CSSProperties = { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' };

const FEE_TYPE_COLORS: Record<string,{bg:string;color:string}> = { tuition:{bg:'#EFF6FF',color:'#1D4ED8'}, transport:{bg:'#F0FDF4',color:'#16A34A'}, hostel:{bg:'#F5F3FF',color:'#7C3AED'}, examination:{bg:'#FFFBEB',color:'#D97706'}, activity:{bg:'#FDF2F8',color:'#BE185D'}, library:{bg:'#F0FDFA',color:'#0F766E'}, uniform:{bg:'#FEF2F2',color:'#DC2626'}, miscellaneous:{bg:'#F8FAFC',color:'#475569'} };

export default function FeesPage() {
  const supabase = createClient();
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [tab, setTab] = useState<'structures'|'collection'>('structures');
  const [collectionStats, setCollectionStats] = useState({ collected:0, pending:0, overdue:0 });
  const [form, setForm] = useState({ name:'', fee_type:'tuition', class_id:'', amount:'', due_date:'', is_recurring:false, recurring_interval:'monthly' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const userId=(await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: ud } = await supabase.from('users').select('school_id').eq('id',userId).single();
    if (!ud?.school_id) { setLoading(false); return; }
    const schoolId=ud.school_id;
    const { data } = await supabase.from('fee_structures').select('*,classes(name)').eq('school_id',schoolId).order('created_at',{ascending:false});
    if (data) setStructures(data.map((f:any)=>({...f,class_name:f.classes?.name})) as FeeStructure[]);
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).maybeSingle();
    if (yr) { const { data: c } = await supabase.from('classes').select('id,name').eq('academic_year_id',yr.id).order('numeric_order'); if (c) setClasses(c); }
    const m=new Date().getMonth(), y=new Date().getFullYear();
    const ms=new Date(y,m,1).toISOString().split('T')[0], me=new Date(y,m+1,0).toISOString().split('T')[0];
    const { data: payments } = await supabase.from('fee_payments').select('amount_paid').eq('school_id',schoolId).gte('payment_date',ms).lte('payment_date',me+'T23:59:59');
    const collected=payments?payments.reduce((a:number,p:any)=>a+(p.amount_paid||0),0):0;
    const { data: pf } = await supabase.from('fees').select('amount,discount_amount').eq('school_id',schoolId).in('status',['pending','partially_paid']);
    const pending=pf?pf.reduce((a:number,f:any)=>a+Math.max(0,(f.amount||0)-(f.discount_amount||0)),0):0;
    const { data: of_ } = await supabase.from('fees').select('amount,discount_amount').eq('school_id',schoolId).eq('status','overdue');
    const overdue=of_?of_.reduce((a:number,f:any)=>a+Math.max(0,(f.amount||0)-(f.discount_amount||0)),0):0;
    setCollectionStats({collected,pending,overdue});
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.name||!form.amount) { setFormError('Name and amount required'); return; }
    setSaving(true); setFormError('');
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).maybeSingle();
    const { data: ud } = await supabase.from('users').select('school_id').eq('id',(await supabase.auth.getUser()).data.user?.id||'').single();
    const { error } = await supabase.from('fee_structures').insert({ name:form.name, fee_type:form.fee_type, class_id:form.class_id||null, amount:parseFloat(form.amount), due_date:form.due_date||null, is_recurring:form.is_recurring, recurring_interval:form.is_recurring?form.recurring_interval:null, academic_year_id:yr?.id, school_id:ud?.school_id, created_by:(await supabase.auth.getUser()).data.user?.id });
    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowAdd(false); setForm({name:'',fee_type:'tuition',class_id:'',amount:'',due_date:'',is_recurring:false,recurring_interval:'monthly'});
    fetchData(); setSaving(false);
  };

  const totalAmount=structures.reduce((a,f)=>a+f.amount,0);

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Fee Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Fee structures, collection, and defaulters</p>
        </div>
        <button onClick={()=>{setShowAdd(true);setFormError('');}} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          <span style={{fontSize:16}}>+</span> Add Fee Structure
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:4, background:'#F1F5F9', borderRadius:12, width:'fit-content' }}>
        {[{key:'structures' as const,label:'Fee Structures'},{key:'collection' as const,label:'Collection Overview'}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{ padding:'8px 18px', borderRadius:9, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', background:tab===t.key?'white':'transparent', color:tab===t.key?'#1D4ED8':'#64748B', boxShadow:tab===t.key?'0 1px 3px rgba(0,0,0,0.08)':'none', transition:'all 0.15s' }}>{t.label}</button>
        ))}
      </div>

      {tab==='structures' ? (
        <>
          {/* Stats Row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
            {[{ label:'Fee Structures', value:structures.length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
              { label:'Total Amount', value:`₹${totalAmount.toLocaleString('en-IN')}`, color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
              { label:'Recurring', value:structures.filter(f=>f.is_recurring).length, color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' }
            ].map((s,i)=>(
              <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
                <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
                <p style={{ fontSize:26, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
                  {loading?<span style={{ display:'inline-block', width:50, height:26, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/>:s.value}
                </p>
              </div>
            ))}
          </div>
          <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 120px 120px 100px 110px 110px', padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
              {['Fee Name','Type','Class','Amount','Due Date','Recurring'].map(h=>(
                <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{h}</p>
              ))}
            </div>
            {loading ? (
              <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
                {[1,2,3].map(i=><div key={i} style={{ height:48, background:'#F8FAFC', borderRadius:8 }}/>)}
              </div>
            ) : structures.length===0 ? (
              <div style={{ padding:'60px 24px', textAlign:'center' }}>
                <div style={{ width:52, height:52, borderRadius:14, background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:22 }}>💰</div>
                <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No fee structures yet</p>
                <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Add Fee Structure</strong> to create one</p>
              </div>
            ) : structures.map((f,idx)=>{
              const tc=FEE_TYPE_COLORS[f.fee_type]||{bg:'#F1F5F9',color:'#475569'};
              return (
                <div key={f.id} style={{ display:'grid', gridTemplateColumns:'2fr 120px 120px 100px 110px 110px', padding:'14px 20px', borderBottom:idx<structures.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
                  <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{f.name}</p>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:99, background:tc.bg, color:tc.color, textTransform:'capitalize', width:'fit-content' }}>{f.fee_type}</span>
                  <p style={{ fontSize:13, color:'#475569', margin:0 }}>{f.class_name||'All Classes'}</p>
                  <p style={{ fontSize:13, fontWeight:800, color:'#1D4ED8', margin:0 }}>₹{f.amount.toLocaleString('en-IN')}</p>
                  <p style={{ fontSize:13, color:'#475569', margin:0 }}>{f.due_date?new Date(f.due_date).toLocaleDateString('en-IN'):'—'}</p>
                  {f.is_recurring ? <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:99, background:'#EFF6FF', color:'#1D4ED8', textTransform:'capitalize', width:'fit-content' }}>{f.recurring_interval}</span> : <span style={{ fontSize:12, color:'#CBD5E1', fontStyle:'italic' }}>One-time</span>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
            {[{ label:'Collected This Month', value:`₹${collectionStats.collected.toLocaleString('en-IN')}`, color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7', icon:'✅' },
              { label:'Pending Dues', value:`₹${collectionStats.pending.toLocaleString('en-IN')}`, color:'#D97706', bg:'#FFFBEB', border:'#FDE68A', icon:'⏳' },
              { label:'Overdue Amount', value:`₹${collectionStats.overdue.toLocaleString('en-IN')}`, color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2', icon:'⚠️' }
            ].map((c,i)=>(
              <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:14, padding:'20px 22px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:c.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{c.label}</p>
                  <span style={{ fontSize:20 }}>{c.icon}</span>
                </div>
                <p style={{ fontSize:26, fontWeight:800, color:'#0F172A', margin:0 }}>
                  {loading?<span style={{ display:'inline-block', width:80, height:26, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/>:c.value}
                </p>
              </div>
            ))}
          </div>
          <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', padding:'20px 24px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize:13, color:'#64748B', margin:0, lineHeight:1.6 }}>
              Fee collection summary reflects all payments recorded in the system. Create fee structures and record payments to see detailed breakdowns here.
            </p>
          </div>
        </div>
      )}

      {/* Add Fee Modal */}
      {showAdd && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:460, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div><h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Add Fee Structure</h3><p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Define a new fee for the school</p></div>
              <button onClick={()=>setShowAdd(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'20px 28px' }}>
              {formError && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{formError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div><label style={LS}>Fee Name <span style={{color:'#EF4444'}}>*</span></label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder='e.g. "Term 1 Tuition"' style={IS}/></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Fee Type</label>
                    <select value={form.fee_type} onChange={e=>setForm(f=>({...f,fee_type:e.target.value}))} style={IS}>{FEE_TYPES.map(t=><option key={t} value={t} className="capitalize">{t}</option>)}</select>
                  </div>
                  <div><label style={LS}>Class</label>
                    <select value={form.class_id} onChange={e=>setForm(f=>({...f,class_id:e.target.value}))} style={IS}><option value="">All Classes</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Amount (₹) <span style={{color:'#EF4444'}}>*</span></label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={IS}/></div>
                  <div><label style={LS}>Due Date</label><input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} style={IS}/></div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #F1F5F9' }}>
                  <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e=>setForm(f=>({...f,is_recurring:e.target.checked}))} style={{ width:16, height:16, accentColor:'#3B82F6' }}/>
                  <label htmlFor="recurring" style={{ fontSize:13, fontWeight:600, color:'#334155', flex:1, cursor:'pointer' }}>Recurring Fee</label>
                  {form.is_recurring && <select value={form.recurring_interval} onChange={e=>setForm(f=>({...f,recurring_interval:e.target.value}))} style={{ ...IS, width:'auto', padding:'6px 10px' }}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select>}
                </div>
              </div>
            </div>
            <div style={{ padding:'0 28px 24px', display:'flex', gap:10 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving?'Creating...':'Create Fee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
