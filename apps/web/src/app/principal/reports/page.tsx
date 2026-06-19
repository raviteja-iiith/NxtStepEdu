'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Stats { totalStudents:number; totalTeachers:number; totalParents:number; presentToday:number; absentToday:number; attendanceRate:number; feesPending:number; feesCollected:number; totalExams:number; pendingLeaves:number; totalAnnouncements:number; totalSections:number; }

export default function ReportsPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats|null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    const sid = u.school_id;
    const today = new Date().toISOString().split('T')[0];
    const [{ count:ts },{ count:tt },{ count:tp },{ count:pt },{ count:at },{ data:fd },{ count:te },{ count:pl },{ count:ta },{ count:tsec }] = await Promise.all([
      supabase.from('students').select('*',{count:'exact',head:true}).eq('school_id',sid).eq('is_active',true),
      supabase.from('users').select('*',{count:'exact',head:true}).eq('school_id',sid).eq('role','teacher').eq('is_active',true),
      supabase.from('users').select('*',{count:'exact',head:true}).eq('school_id',sid).eq('role','parent').eq('is_active',true),
      supabase.from('attendance').select('*',{count:'exact',head:true}).eq('school_id',sid).eq('date',today).eq('status','present'),
      supabase.from('attendance').select('*',{count:'exact',head:true}).eq('school_id',sid).eq('date',today).eq('status','absent'),
      supabase.from('fees').select('amount, discount_amount, status').eq('school_id',sid),
      supabase.from('exams').select('*',{count:'exact',head:true}).eq('school_id',sid),
      supabase.from('leave_requests').select('*',{count:'exact',head:true}).eq('school_id',sid).eq('status','pending'),
      supabase.from('announcements').select('*',{count:'exact',head:true}).eq('school_id',sid),
      supabase.from('sections').select('*',{count:'exact',head:true}).eq('school_id',sid),
    ]);
    let feesCollected=0, feesPending=0;
    if (fd) fd.forEach((f:any) => { const net=(f.amount||0)-(f.discount_amount||0); if(f.status==='paid') feesCollected+=net; else if(['pending','overdue'].includes(f.status)) feesPending+=net; });
    const total=(pt||0)+(at||0);
    setStats({ totalStudents:ts||0, totalTeachers:tt||0, totalParents:tp||0, presentToday:pt||0, absentToday:at||0, attendanceRate:total>0?Math.round(((pt||0)/total)*100):0, feesCollected, feesPending, totalExams:te||0, pendingLeaves:pl||0, totalAnnouncements:ta||0, totalSections:tsec||0 });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  const dateStr = new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});

  const groups = stats ? [
    { title:'People', color:'#1D4ED8', items:[
      { label:'Students', value:stats.totalStudents, icon:'🎓', color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
      { label:'Teachers', value:stats.totalTeachers, icon:'👨‍🏫', color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
      { label:'Parents', value:stats.totalParents, icon:'👨‍👩‍👧', color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
      { label:'Sections', value:stats.totalSections, icon:'🏫', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
    ]},
    { title:'Attendance Today', color:'#16A34A', items:[
      { label:'Present', value:stats.presentToday, icon:'✅', color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
      { label:'Absent', value:stats.absentToday, icon:'❌', color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2' },
      { label:'Rate', value:`${stats.attendanceRate}%`, icon:'📊', color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
      { label:'Exams', value:stats.totalExams, icon:'📋', color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
    ]},
    { title:'Finance & Actions', color:'#DC2626', items:[
      { label:'Fees Collected', value:`₹${stats.feesCollected.toLocaleString('en-IN')}`, icon:'💰', color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
      { label:'Fees Pending', value:`₹${stats.feesPending.toLocaleString('en-IN')}`, icon:'⚠️', color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2' },
      { label:'Leave Requests', value:stats.pendingLeaves, icon:'🏖️', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
      { label:'Announcements', value:stats.totalAnnouncements, icon:'📢', color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
    ]},
  ] : [];

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>School Reports</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Live statistics from your school database</p>
        </div>
        <button onClick={fetchStats} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 18px', border:'1px solid #E2E8F0', borderRadius:10, background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>

      {/* Grouped Stat Sections */}
      {loading ? (
        <div className="stat-cards-container">
          {Array.from({length:12}).map((_,i)=><div key={i} style={{ height:90, background:'#F1F5F9', borderRadius:12 }}/>)}
        </div>
      ) : groups.map((g,gi) => (
        <div key={gi}>
          <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>{g.title}</p>
          <div className="stat-cards-container">
            {g.items.map((c,i) => (
              <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'16px 18px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:c.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{c.label}</p>
                  <span style={{ fontSize:18 }}>{c.icon}</span>
                </div>
                <p style={{ fontSize:26, fontWeight:800, color:'#0F172A', margin:0, letterSpacing:'-0.02em' }}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Today's Snapshot */}
      {stats && (
        <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9' }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:0 }}>Today&apos;s Snapshot</h3>
            <p style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>{dateStr}</p>
          </div>
          <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
            {/* Attendance */}
            <div style={{ padding:'16px 18px', background:'#F8FAFC', borderRadius:12, border:'1px solid #F1F5F9' }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>Attendance</p>
              <div style={{ height:8, background:'#E2E8F0', borderRadius:99, overflow:'hidden', marginBottom:10 }}>
                <div style={{ height:'100%', borderRadius:99, width:`${stats.attendanceRate}%`, background:stats.attendanceRate>=75?'#16A34A':stats.attendanceRate>=50?'#D97706':'#DC2626', transition:'width 0.5s' }}/>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748B' }}>
                <span>✅ {stats.presentToday} present</span>
                <span style={{ fontWeight:700, color:'#0F172A' }}>{stats.attendanceRate}%</span>
                <span>❌ {stats.absentToday} absent</span>
              </div>
            </div>
            {/* Fees */}
            <div style={{ padding:'16px 18px', background:'#F8FAFC', borderRadius:12, border:'1px solid #F1F5F9' }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>Fee Collection</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[{ label:'Collected', value:`₹${stats.feesCollected.toLocaleString('en-IN')}`, color:'#16A34A' },
                  { label:'Pending', value:`₹${stats.feesPending.toLocaleString('en-IN')}`, color:'#DC2626' }
                ].map((item,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:13, color:'#64748B' }}>{item.label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Actions */}
            <div style={{ padding:'16px 18px', background:'#F8FAFC', borderRadius:12, border:'1px solid #F1F5F9' }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>Pending Actions</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[{ label:'Leave Requests', value:stats.pendingLeaves, color:stats.pendingLeaves>0?'#D97706':'#16A34A' },
                  { label:'Exams Scheduled', value:stats.totalExams, color:'#1D4ED8' }
                ].map((item,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:13, color:'#64748B' }}>{item.label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
