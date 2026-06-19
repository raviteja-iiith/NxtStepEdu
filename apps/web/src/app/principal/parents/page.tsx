'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Parent { id: string; full_name: string; phone: string | null; email: string | null; is_active: boolean; student_name?: string; }

const IS = { width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:10,fontSize:13,outline:'none',background:'white',boxSizing:'border-box' as const,fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block',fontSize:12,fontWeight:600,color:'#475569',marginBottom:5 };

export default function PrincipalParentsPage() {
  const supabase = createClient();
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchParents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!cu?.school_id) { setLoading(false); return; }
    const { data } = await supabase.from('users').select('id, full_name, phone, email, is_active').eq('school_id', cu.school_id).eq('role', 'parent').order('full_name');
    if (data) {
      const ids = data.map((p: any) => p.id);
      const { data: links } = await supabase.from('student_parent_links').select('parent_id, students(full_name)').in('parent_id', ids);
      const map: Record<string,string> = {};
      if (links) links.forEach((l: any) => { map[l.parent_id] = l.students?.full_name || ''; });
      setParents(data.map((p: any) => ({ ...p, student_name: map[p.id] || '' })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchParents(); }, [fetchParents]);
  const filtered = parents.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()) || (p.phone||'').includes(search) || (p.student_name||'').toLowerCase().includes(search.toLowerCase()));
  const activeCount = parents.filter(p => p.is_active).length;

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Parent Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Parents linked to students in your school</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="three-col-stats">
        {[{ label:'Total Parents', value:parents.length, color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
          { label:'Active', value:activeCount, color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
          { label:'Linked to Students', value:parents.filter(p=>p.student_name).length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' }
        ].map((s,i) => (
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
              {loading ? <span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position:'relative', maxWidth:400 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Search by name, phone or student..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...IS, paddingLeft:36 }}/>
      </div>

      {/* List */}
      <div className="list-table-container">
        <div className="parent-list-grid header-row" style={{ padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
          {['Parent','Phone','Child','Status'].map(h => (
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{h}</p>
          ))}
        </div>
        {loading ? (
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24 }}>👨‍👩‍👧</div>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No parents yet</p>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Parents are added when teacher accounts are created</p>
          </div>
        ) : filtered.map((p, idx) => (
          <div key={p.id} className="parent-list-grid" style={{ padding:'14px 20px', borderBottom:idx<filtered.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg, #7C3AED, #A78BFA)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>
                {p.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{p.full_name}</p>
                {p.email && <p style={{ fontSize:11, color:'#94A3B8', margin:'1px 0 0' }}>{p.email}</p>}
              </div>
            </div>
            <p style={{ fontSize:13, color:'#475569', margin:0 }}>{p.phone||'—'}</p>
            <p style={{ fontSize:13, color:p.student_name?'#334155':'#CBD5E1', margin:0, fontStyle:p.student_name?'normal':'italic' }}>{p.student_name||'Not linked'}</p>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, background:p.is_active?'#F0FDF4':'#FEF2F2', color:p.is_active?'#16A34A':'#DC2626', width:'fit-content' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:p.is_active?'#16A34A':'#DC2626' }}/>
              {p.is_active?'Active':'Inactive'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
