'use client';

import {
  Area, BarChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart
} from 'recharts';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const COLORS = {
  indigo: '#6366F1', violet: '#8B5CF6', cyan: '#06B6D4', emerald: '#10B981',
  amber: '#F59E0B', rose: '#F43F5E', slate: '#64748B', sky: '#0EA5E9',
  orange: '#F97316', teal: '#14B8A6', pink: '#EC4899', lime: '#84CC16',
};

const FOUNDER_COLORS: Record<string, string> = {
  Ravi: '#6366F1', Sridhar: '#10B981', Ajay: '#F59E0B',
};

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

const fmt  = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtK = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n / 1000).toFixed(0)}K`;

function KpiCard({ label, value, sub, color, icon, trend }: {
  label: string; value: string; sub: string; color: string;
  icon: React.ReactNode; trend?: number;
}) {
  return (
    <div style={{ background:'white', borderRadius:16, padding:'22px 24px', border:'1px solid #E8ECF0',
      boxShadow:'0 2px 8px rgba(0,0,0,0.04)', display:'flex', flexDirection:'column', gap:14, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, right:0, width:80, height:80, borderRadius:'0 0 0 80px', background:`${color}10` }}/>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</p>
        <div style={{ width:38, height:38, borderRadius:11, background:`${color}15`, color, display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</div>
      </div>
      <div>
        <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', letterSpacing:'-0.03em', lineHeight:1 }}>{value}</p>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8 }}>
          {trend !== undefined && (
            <span style={{ fontSize:11, fontWeight:700, color: trend>=0?'#16A34A':'#DC2626',
              background: trend>=0?'#F0FDF4':'#FEF2F2', padding:'2px 8px', borderRadius:99 }}>
              {trend>=0?'▲':'▼'} {Math.abs(trend)}%
            </span>
          )}
          <p style={{ fontSize:12, color:'#94A3B8' }}>{sub}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children, height=280 }: { title:string; sub?:string; children:React.ReactNode; height?:number }) {
  return (
    <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', boxShadow:'0 2px 8px rgba(0,0,0,0.04)', overflow:'hidden' }}>
      <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9' }}>
        <p style={{ fontSize:15, fontWeight:700, color:'#0F172A' }}>{title}</p>
        {sub && <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>{sub}</p>}
      </div>
      <div style={{ padding:'20px 24px', height }}>{children}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#0F172A', borderRadius:12, padding:'12px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.3)', minWidth:160 }}>
      <p style={{ color:'#94A3B8', fontSize:11, fontWeight:600, marginBottom:8 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, display:'inline-block' }}/>
          <span style={{ color:'#CBD5E1', fontSize:12 }}>{p.name}:</span>
          <span style={{ color:'white', fontSize:12, fontWeight:700 }}>
            {typeof p.value === 'number' ? fmtK(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── CRUD Modal ──────────────────────────────────────────────────────────────────
function TransactionModal({ isOpen, onClose, onSave, categories, initialData }: any) {
  const [formData, setFormData] = useState(initialData || {
    txn_date: new Date().toISOString().split('T')[0],
    type: 'expense',
    category_id: '',
    party_name: '',
    amount: '',
    from_account: '',
    to_account: '',
    status: 'completed',
    note: ''
  });

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || {
        txn_date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category_id: categories.find((c:any) => c.type === 'expense')?.id || '',
        party_name: '',
        amount: '',
        from_account: '',
        to_account: '',
        status: 'completed',
        note: ''
      });
    }
  }, [isOpen, initialData, categories]);

  if (!isOpen) return null;

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const cat = categories.find((c:any) => c.id === formData.category_id);
    onSave({
      ...formData,
      amount: Number(formData.amount),
      category_name: cat ? cat.name : ''
    });
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 20, width: 500, maxWidth: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{initialData ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748B' }}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Date</label>
              <input type="date" required value={formData.txn_date} onChange={e => setFormData({...formData, txn_date: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Type</label>
              <select value={formData.type} onChange={e => {
                const newType = e.target.value;
                setFormData({...formData, type: newType, category_id: categories.find((c:any)=>c.type===newType)?.id||''});
              }} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Category</label>
            <select required value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <option value="">Select Category</option>
              {categories.filter((c:any) => c.type === formData.type).map((c:any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Party Name</label>
              <input type="text" required placeholder="Who is it for/from?" value={formData.party_name} onChange={e => setFormData({...formData, party_name: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Amount (₹)</label>
              <input type="number" required min="1" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
             <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>From Account</label>
              <input type="text" required placeholder="e.g. School, Company A/C" value={formData.from_account} onChange={e => setFormData({...formData, from_account: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            </div>
             <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>To Account</label>
              <input type="text" required placeholder="e.g. Vendor, Employee" value={formData.to_account} onChange={e => setFormData({...formData, to_account: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Note (Optional)</label>
            <input type="text" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: COLORS.indigo, color: 'white', fontWeight: 700, cursor: 'pointer' }}>Save Transaction</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
// Compute month-over-month % change: (current - prev) / prev * 100
function momTrend(revenueData: any[], key: 'revenue' | 'expenses' | 'profit'): number | undefined {
  const active = revenueData.filter(d => d[key] > 0);
  if (active.length < 2) return undefined;
  const prev = active[active.length - 2][key];
  const curr = active[active.length - 1][key];
  if (prev === 0) return undefined;
  return Math.round(((curr - prev) / prev) * 100);
}

function OverviewTab({ schools, revenueData, expenseBreakdown, schoolRevenue, founderTotal }: any) {
  const totalRevenue  = revenueData.reduce((s:any,d:any) => s+d.revenue, 0);
  const totalExpenses = revenueData.reduce((s:any,d:any) => s+d.expenses, 0);
  const totalProfit   = totalRevenue - totalExpenses;

  const revTrend  = momTrend(revenueData, 'revenue');
  const expTrend  = momTrend(revenueData, 'expenses');
  const profTrend = momTrend(revenueData, 'profit');

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <KpiCard label="Total Revenue" value={fmtK(totalRevenue)} sub="vs last month" color={COLORS.indigo} trend={revTrend}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
        <KpiCard label="Total Expenses" value={fmtK(totalExpenses)} sub="vs last month" color={COLORS.rose} trend={expTrend !== undefined ? -expTrend : undefined}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}/>
        <KpiCard label="Net Profit" value={fmtK(totalProfit)} sub="vs last month" color={COLORS.emerald} trend={profTrend}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}/>
        <KpiCard label="Founder Draws" value={fmtK(founderTotal)} sub="All time total" color={COLORS.amber}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}/>
      </div>

      <ChartCard title="Revenue vs Expenses vs Profit" sub="Monthly Trend" height={300}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={revenueData} margin={{ top:5, right:20, left:0, bottom:0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLORS.indigo} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLORS.rose} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={COLORS.rose} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
            <XAxis dataKey="month" tick={{ fontSize:11, fill:'#94A3B8' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fill:'#94A3B8' }} axisLine={false} tickLine={false} width={60}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12, color:'#64748B' }}/>
            <Area type="monotone" dataKey="revenue"  name="Revenue"  fill="url(#revGrad)" stroke={COLORS.indigo} strokeWidth={2.5} dot={false}/>
            <Area type="monotone" dataKey="expenses" name="Expenses" fill="url(#expGrad)" stroke={COLORS.rose}   strokeWidth={2}   dot={false}/>
            <Line type="monotone" dataKey="profit"   name="Profit"   stroke={COLORS.emerald} strokeWidth={2.5} dot={{ r:4, fill:COLORS.emerald }}/>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <ChartCard title="Expense Breakdown" sub="All Time Composition" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={expenseBreakdown} cx="40%" cy="50%" outerRadius={110} innerRadius={60} dataKey="value" nameKey="name" paddingAngle={3}>
                {expenseBreakdown.map((e:any,i:number) => <Cell key={i} fill={e.color}/>)}
              </Pie>
              <Tooltip formatter={(v:any) => fmt(Number(v))} contentStyle={{ borderRadius:12, border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }}/>
              <Legend iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize:11, lineHeight:'22px' }}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Party" sub="Total Inflows" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={schoolRevenue} layout="vertical" margin={{ top:0, right:20, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false}/>
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize:10, fill:'#94A3B8' }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:'#475569' }} axisLine={false} tickLine={false} width={130}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="revenue" name="Revenue" radius={[0,6,6,0]} maxBarSize={18}>
                {schoolRevenue.map((s:any,i:number) => (
                   <Cell key={i} fill={COLORS.indigo}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      
      {/* Live schools from DB */}
      {schools.length > 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9' }}>
            <p style={{ fontSize:15, fontWeight:700, color:'#0F172A' }}>Live School Accounts</p>
            <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Fetched from database — {schools.length} schools</p>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, padding:20 }}>
            {schools.map((s:any) => (
              <div key={s.id} style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'8px 14px', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:s.is_active?COLORS.emerald:'#94A3B8', flexShrink:0 }}/>
                <span style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{s.name}</span>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
                  background: s.subscription_plan==='premium'?`${COLORS.indigo}15`:s.subscription_plan==='standard'?`${COLORS.cyan}15`:`${COLORS.amber}15`,
                  color: s.subscription_plan==='premium'?COLORS.indigo:s.subscription_plan==='standard'?COLORS.cyan:COLORS.amber }}>
                  {s.subscription_plan}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Founders ─────────────────────────────────────────────────────────────────
function FoundersTab({ founders, founderDraws }: any) {
  // Aggregate draws by founder
  const founderTotals: Record<string, number> = {};
  founderDraws.forEach((d:any) => {
    founderTotals[d.party_name] = (founderTotals[d.party_name] || 0) + Number(d.amount);
  });

  const founderSummary = founders.map((f:any) => ({
    ...f,
    withdrawn: founderTotals[f.name] || 0,
    color: FOUNDER_COLORS[f.name] || COLORS.indigo
  }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
        {founderSummary.map((f:any) => (
          <div key={f.name} style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:24, boxShadow:'0 2px 8px rgba(0,0,0,0.04)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:`${f.color}08` }}/>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:`${f.color}15`, color:f.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, border:`2px solid ${f.color}30` }}>
                {f.name[0]}
              </div>
              <div>
                <p style={{ fontSize:17, fontWeight:800, color:'#0F172A' }}>{f.name}</p>
                <p style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{f.role}</p>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { label:'Equity Share',    value:`${f.equity_percentage}%`,   color:f.color       },
                { label:'Total Withdrawn', value:fmtK(f.withdrawn), color:'#16A34A'   },
                { label:'Status',          value:'Active',          color:'#16A34A'    },
              ].map((item,i) => (
                <div key={i} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px' }}>
                  <p style={{ fontSize:10, fontWeight:600, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em' }}>{item.label}</p>
                  <p style={{ fontSize:16, fontWeight:800, color:item.color, marginTop:4 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <ChartCard title="Equity Distribution" sub="Current ownership structure" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={founderSummary.map((f:any)=>({ name:`${f.name} (${f.equity_percentage}%)`, value:Number(f.equity_percentage) }))}
                cx="50%" cy="50%" outerRadius={100} dataKey="value" paddingAngle={3}
                label={({ percent }: { percent?: number }) => percent !== undefined ? `${(percent*100).toFixed(1)}%` : ''} labelLine={false}>
                {founderSummary.map((f:any,i:number) => <Cell key={i} fill={f.color}/>)}
              </Pie>
              <Tooltip formatter={(v:any) => `${v}%`} contentStyle={{ borderRadius:12, border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12 }}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Founder txns table */}
      <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9' }}>
          <p style={{ fontSize:15, fontWeight:700, color:'#0F172A' }}>Founder Transaction History</p>
          <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>All draws and personal account transfers</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                {['Date','Founder','Category','Amount','From → To','Status'].map(h => (
                  <th key={h} style={{ padding:'12px 20px', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {founderDraws.map((t:any,i:number) => (
                <tr key={i} style={{ borderBottom:'1px solid #F8FAFC' }}>
                  <td style={{ padding:'14px 20px', fontSize:12, color:'#64748B' }}>{t.txn_date}</td>
                  <td style={{ padding:'14px 20px' }}>
                    <span style={{ fontSize:12, fontWeight:700, color:FOUNDER_COLORS[t.party_name]||'#475569', background:`${FOUNDER_COLORS[t.party_name]||'#475569'}15`, padding:'4px 10px', borderRadius:8 }}>{t.party_name}</span>
                  </td>
                  <td style={{ padding:'14px 20px', fontSize:12, color:'#64748B' }}>{t.category_name}</td>
                  <td style={{ padding:'14px 20px', fontSize:13, fontWeight:700, color:'#DC2626' }}>−{fmt(t.amount)}</td>
                  <td style={{ padding:'14px 20px', fontSize:12, color:'#475569' }}>{t.from_account} → {t.to_account}</td>
                  <td style={{ padding:'14px 20px' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:99, background:'#F0FDF4', color:'#16A34A', textTransform:'uppercase' }}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Transactions ──────────────────────────────────────────────────────────────
function TransactionsTab({ transactions, revenueData, onDelete, onEdit, onAdd }: any) {
  const [filter, setFilter] = useState<'all'|'income'|'expense'|'withdrawal'>('all');
  const filtered  = filter==='all' ? transactions : transactions.filter((t:any)=>t.type===filter);
  const totalIn   = transactions.filter((t:any)=>t.type==='income').reduce((s:any,t:any)=>s+Number(t.amount),0);
  const totalOut  = transactions.filter((t:any)=>t.type!=='income').reduce((s:any,t:any)=>s+Number(t.amount),0);

  const typeStyle: Record<string, { bg:string; color:string }> = {
    income:     { bg:'#F0FDF4', color:'#16A34A' },
    expense:    { bg:'#FEF2F2', color:'#DC2626' },
    withdrawal: { bg:'#FFFBEB', color:'#B45309' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'Total Inflows',   value:fmtK(totalIn),          sub:'All income',         color:COLORS.emerald },
          { label:'Total Outflows',  value:fmtK(totalOut),         sub:'Expenses + draws',   color:COLORS.rose    },
          { label:'Net Cash Flow',   value:fmtK(totalIn-totalOut), sub:'Net position',       color:COLORS.indigo  },
          { label:'Transactions',    value:transactions.length.toString(), sub:'In ledger', color:COLORS.amber  },
        ].map((k,i) => (
          <KpiCard key={i} {...k}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>}/>
        ))}
      </div>

      <ChartCard title="Cash Flow Overview" sub="Monthly inflows vs outflows" height={280}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={revenueData} margin={{ top:5, right:20, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
            <XAxis dataKey="month" tick={{ fontSize:11, fill:'#94A3B8' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fill:'#94A3B8' }} axisLine={false} tickLine={false} width={60}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12 }}/>
            <Bar dataKey="revenue"  name="Inflows"  fill={COLORS.emerald} radius={[4,4,0,0]} maxBarSize={24}/>
            <Bar dataKey="expenses" name="Outflows" fill={COLORS.rose}    radius={[4,4,0,0]} maxBarSize={24}/>
            <Line type="monotone" dataKey="profit" name="Net" stroke={COLORS.indigo} strokeWidth={2.5} dot={{ r:3 }}/>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:15, fontWeight:700, color:'#0F172A' }}>Complete Transaction Ledger</p>
            <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>All money movements — inflows, outflows, founder draws</p>
          </div>
          <div style={{ display:'flex', gap:6, alignItems: 'center' }}>
            <button onClick={onAdd} style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:10, border:'none', cursor:'pointer', background:COLORS.emerald, color:'white', marginRight: 10 }}>+ Add Txn</button>
            {(['all','income','expense','withdrawal'] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:10, border:'1px solid', cursor:'pointer', textTransform:'capitalize',
                  background:filter===f?COLORS.indigo:'white',
                  color:filter===f?'white':'#64748B',
                  borderColor:filter===f?COLORS.indigo:'#E2E8F0' }}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                {['Date','Type','Category','Party','From → To','Amount','Status','Note','Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t:any,i:number) => {
                const tc = typeStyle[t.type] || { bg:'#F1F5F9', color:'#64748B' };
                const isIn = t.type==='income';
                return (
                  <tr key={t.id} style={{ borderBottom:'1px solid #F8FAFC' }}>
                    <td style={{ padding:'13px 16px', fontSize:12, color:'#64748B', whiteSpace:'nowrap' }}>{t.txn_date}</td>
                    <td style={{ padding:'13px 16px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:tc.bg, color:tc.color }}>{t.type}</span>
                    </td>
                    <td style={{ padding:'13px 16px', fontSize:12, color:'#475569', whiteSpace:'nowrap' }}>{t.category_name}</td>
                    <td style={{ padding:'13px 16px', fontSize:13, fontWeight:600, color:'#0F172A', whiteSpace:'nowrap' }}>{t.party_name}</td>
                    <td style={{ padding:'13px 16px', fontSize:11, color:'#64748B', whiteSpace:'nowrap' }}>{t.from_account} → {t.to_account}</td>
                    <td style={{ padding:'13px 16px', fontSize:13, fontWeight:800, color:isIn?'#16A34A':'#DC2626', whiteSpace:'nowrap' }}>
                      {isIn?'+':'−'}{fmt(t.amount)}
                    </td>
                    <td style={{ padding:'13px 16px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:99,
                        background:t.status==='completed'?'#F0FDF4':'#FFFBEB',
                        color:t.status==='completed'?'#16A34A':'#B45309', textTransform:'uppercase' }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ padding:'13px 16px', fontSize:11, color:'#94A3B8' }}>{t.note}</td>
                    <td style={{ padding:'13px 16px', whiteSpace:'nowrap' }}>
                      <button onClick={() => onEdit(t)} style={{ background: 'none', border: 'none', color: COLORS.indigo, cursor: 'pointer', marginRight: 8, fontSize: 12, fontWeight: 600 }}>Edit</button>
                      <button onClick={() => onDelete(t.id)} style={{ background: 'none', border: 'none', color: COLORS.rose, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                   <td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: 13 }}>No transactions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Expenses ─────────────────────────────────────────────────────────────────
function ExpensesTab({ expenseBreakdown, totalExp, monthlyExpenses }: any) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'Total FY Expenses', value:fmtK(totalExp),                                                                    sub:'All categories',    color:COLORS.rose   },
          { label:'Monthly Burn',      value:fmtK(Math.round(totalExp/ (monthlyExpenses.length || 1))),                          sub:'Avg monthly rate',  color:COLORS.orange },
        ].map((k,i) => (
          <KpiCard key={i} {...k}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}/>
        ))}
      </div>

      <ChartCard title="Monthly Expense Breakdown (Stacked)" sub="Category-wise spend" height={320}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyExpenses} margin={{ top:5, right:20, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
            <XAxis dataKey="month" tick={{ fontSize:11, fill:'#94A3B8' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fill:'#94A3B8' }} axisLine={false} tickLine={false} width={65}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11 }}/>
            {expenseBreakdown.map((e:any, i:number) => (
              <Bar key={i} dataKey={e.name} stackId="a" fill={e.color} maxBarSize={36}/>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <ChartCard title="Expense Category Split" sub="All Time Total" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={expenseBreakdown} cx="40%" cy="50%" outerRadius={110} innerRadius={55} dataKey="value" paddingAngle={3}>
                {expenseBreakdown.map((e:any,i:number) => <Cell key={i} fill={e.color}/>)}
              </Pie>
              <Tooltip formatter={(v:any)=>fmt(Number(v))} contentStyle={{ borderRadius:12, border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }}/>
              <Legend iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize:11, lineHeight:'22px' }}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9' }}>
            <p style={{ fontSize:15, fontWeight:700, color:'#0F172A' }}>Expense Detail</p>
            <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Category totals</p>
          </div>
          <div style={{ padding:'8px 0', overflowY: 'auto', maxHeight: 220 }}>
            {expenseBreakdown.map((e:any,i:number) => (
              <div key={i} style={{ padding:'12px 24px', display:'flex', alignItems:'center', gap:14, borderBottom:i<expenseBreakdown.length-1?'1px solid #F8FAFC':'none' }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:e.color, flexShrink:0 }}/>
                <p style={{ flex:1, fontSize:13, fontWeight:600, color:'#0F172A' }}>{e.name}</p>
                <div style={{ textAlign:'right', marginRight:12 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>{fmt(e.value)}</p>
                  <p style={{ fontSize:10, color:'#94A3B8' }}>{((e.value/totalExp)*100).toFixed(1)}%</p>
                </div>
                <div style={{ width:80, height:6, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${(e.value/(expenseBreakdown[0]?.value||1))*100}%`, background:e.color, borderRadius:99 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id:'overview',     label:'Overview',      emoji:'📊' },
  { id:'founders',     label:'Founders',      emoji:'👥' },
  { id:'transactions', label:'Transactions',  emoji:'🔄' },
  { id:'expenses',     label:'Expenses',      emoji:'📉' },
];

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [schools,   setSchools]   = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [founders, setFounders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);

  const supabase = createClient();

  const fetchData = async () => {
    setIsLoading(true);
    const [schoolsRes, txnsRes, catsRes, foundersRes] = await Promise.all([
      supabase.from('schools').select('id,name,subscription_plan,is_active'),
      supabase.from('finance_transactions').select('*').order('txn_date', { ascending: false }),
      supabase.from('finance_categories').select('*'),
      supabase.from('founder_equity').select('*')
    ]);

    if (schoolsRes.data) setSchools(schoolsRes.data);
    if (txnsRes.data) setTransactions(txnsRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    if (foundersRes.data) setFounders(foundersRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveTransaction = async (txn: any) => {
    try {
      if (txn.id) {
        await supabase.from('finance_transactions').update(txn).eq('id', txn.id);
      } else {
        await supabase.from('finance_transactions').insert([txn]);
      }
      setIsModalOpen(false);
      setEditingTxn(null);
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Failed to save transaction');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await supabase.from('finance_transactions').delete().eq('id', id);
      fetchData();
    }
  };

  const openAddModal = () => {
    setEditingTxn(null);
    setIsModalOpen(true);
  };

  const openEditModal = (txn: any) => {
    setEditingTxn(txn);
    setIsModalOpen(true);
  };

  // ─── Data Aggregations ──────────────────────────────────────────────────────
  // 1. Revenue Data (Monthly)
  const monthlyData: Record<string, any> = {};
  transactions.forEach(t => {
    const month = new Date(t.txn_date).toLocaleString('default', { month: 'short' });
    if (!monthlyData[month]) monthlyData[month] = { month, revenue: 0, expenses: 0, profit: 0 };
    if (t.type === 'income') monthlyData[month].revenue += Number(t.amount);
    if (t.type === 'expense' || t.type === 'withdrawal') monthlyData[month].expenses += Number(t.amount);
    monthlyData[month].profit = monthlyData[month].revenue - monthlyData[month].expenses;
  });
  
  // Sort by month order roughly (using the constant array)
  const revenueData = MONTHS.map(m => monthlyData[m] || { month: m, revenue: 0, expenses: 0, profit: 0 });

  // 2. Expense Breakdown
  const expTotals: Record<string, number> = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    expTotals[t.category_name] = (expTotals[t.category_name] || 0) + Number(t.amount);
  });
  const expenseBreakdown = Object.entries(expTotals).map(([name, value], i) => ({
    name, value, color: Object.values(COLORS)[i % Object.values(COLORS).length]
  })).sort((a,b) => b.value - a.value);
  const totalExp = expenseBreakdown.reduce((s,e)=>s+e.value,0);

  // 3. School Revenue
  const schoolRev: Record<string, number> = {};
  transactions.filter(t => t.type === 'income').forEach(t => {
    schoolRev[t.party_name] = (schoolRev[t.party_name] || 0) + Number(t.amount);
  });
  const schoolRevenue = Object.entries(schoolRev).map(([name, revenue]) => ({
    name, revenue
  })).sort((a,b) => b.revenue - a.revenue);

  // 4. Monthly Expenses for Stacked Chart
  const expMonthlyData: Record<string, any> = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const month = new Date(t.txn_date).toLocaleString('default', { month: 'short' });
    if (!expMonthlyData[month]) expMonthlyData[month] = { month };
    expMonthlyData[month][t.category_name] = (expMonthlyData[month][t.category_name] || 0) + Number(t.amount);
  });
  const monthlyExpenses = MONTHS.map(m => expMonthlyData[m] || { month: m }).filter(d => Object.keys(d).length > 1);

  // 5. Founders
  const founderDraws = transactions.filter(t => t.type === 'withdrawal');
  const founderTotal = founderDraws.reduce((s, t) => s + Number(t.amount), 0);

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading finance data...</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0, minHeight:'100%' }}>
      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:900, color:'#0F172A', letterSpacing:'-0.03em' }}>Finance & Payroll Hub</h1>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Complete financial visibility — revenue, payroll, founder distributions, expenses & projections</p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={openAddModal} style={{ fontSize:12, fontWeight:700, padding:'10px 18px', borderRadius:10, border:'none', background:COLORS.emerald, color:'white', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              + Add Transaction
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', gap:4, marginTop:24, background:'white', borderRadius:14, padding:6, border:'1px solid #E8ECF0', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', width:'fit-content' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13,
                fontWeight:activeTab===tab.id?700:500, transition:'all 0.18s ease',
                background:activeTab===tab.id?COLORS.indigo:'transparent',
                color:activeTab===tab.id?'white':'#64748B',
                boxShadow:activeTab===tab.id?'0 2px 12px rgba(99,102,241,0.4)':'none' }}>
              <span>{tab.emoji}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab==='overview'     && <OverviewTab schools={schools} revenueData={revenueData} expenseBreakdown={expenseBreakdown} schoolRevenue={schoolRevenue} founderTotal={founderTotal}/>}
      {activeTab==='founders'     && <FoundersTab founders={founders} founderDraws={founderDraws}/>}
      {activeTab==='transactions' && <TransactionsTab transactions={transactions} revenueData={revenueData} onDelete={handleDeleteTransaction} onEdit={openEditModal} onAdd={openAddModal}/>}
      {activeTab==='expenses'     && <ExpensesTab expenseBreakdown={expenseBreakdown} totalExp={totalExp} monthlyExpenses={monthlyExpenses}/>}
      
      <TransactionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveTransaction} categories={categories} initialData={editingTxn} />
    </div>
  );
}
