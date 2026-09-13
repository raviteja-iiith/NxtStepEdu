'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createNotification } from '@/components/NotificationBell';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  type: 'teaching'; // discriminator
}

interface StaffMember {
  id: string;
  full_name: string;
  designation: string;
  department: string | null;
  phone: string | null;
  email: string | null;
  joining_date: string | null;
  is_active: boolean;
  created_at: string;
  type: 'non_teaching'; // discriminator
  role: string; // maps to designation for display uniformity
}

type AnyStaff = Employee | StaffMember;

interface LeaveRequest {
  id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  created_at: string;
  requester_id?: string;
  requester?: { full_name: string; role: string };
}

// Payroll for teaching staff (teacher_id → users)
interface PayrollRecord {
  id: string;
  teacher_id: string;
  month: number;
  year: number;
  basic: number;
  hra: number;
  ta: number;
  da: number;
  other_allowance: number;
  deductions: number;
  net_salary: number;
  payment_status: string;
  payment_date: string | null;
  created_at: string;
  employee?: { full_name: string; role: string };
}

// Payroll for non-teaching staff (staff_member_id → staff_members)
interface StaffPayrollRecord {
  id: string;
  staff_member_id: string;
  month: number;
  year: number;
  basic: number;
  hra: number;
  ta: number;
  da: number;
  other_allowance: number;
  deductions: number;
  net_salary: number;
  payment_status: string;
  payment_date: string | null;
  created_at: string;
  employee?: { full_name: string; designation: string };
}

// Unified payroll display row
interface PayrollRow {
  id: string;
  staff_id: string;
  name: string;
  role: string;
  month: number;
  year: number;
  basic: number;
  hra: number;
  ta: number;
  da: number;
  other_allowance: number;
  deductions: number;
  net_salary: number;
  payment_status: string;
  kind: 'teaching' | 'non_teaching';
  raw: PayrollRecord | StaffPayrollRecord;
}

interface SalaryStructure {
  id: string;
  employee_id: string;
  basic: number;
  hra: number;
  ta: number;
  da: number;
  other_allowance: number;
  deductions: number;
  effective_from: string;
}

interface StaffSalaryStructure {
  id: string;
  staff_member_id: string;
  basic: number;
  hra: number;
  ta: number;
  da: number;
  other_allowance: number;
  deductions: number;
  effective_from: string;
}

interface PayrollTrend {
  label: string;
  total: number;
  month: number;
  year: number;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  width: '100%', padding: '9px 13px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 13, outline: 'none', background: 'white',
  boxSizing: 'border-box', fontFamily: 'inherit',
};
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LEAVE_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#14B8A6','#F97316'];

const DESIGNATIONS = [
  'Driver','Cleaner','Security Guard','Peon / Office Boy','Gardener',
  'Cook / Canteen Staff','Electrician','Plumber','Lab Assistant',
  'Library Assistant','Receptionist','Accountant / Clerk','IT Support','Other',
];
const DEPARTMENTS = [
  'Transport','Housekeeping','Security','Administration','Canteen',
  'Maintenance','Library','Laboratory','Accounts','IT','General',
];

function fmt(n: number) { return `₹${(n || 0).toLocaleString('en-IN')}`; }
function fmtL(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return fmt(n);
}

const netCalc = (s: { basic:number; hra:number; ta:number; da:number; other_allowance:number; deductions:number }) =>
  (s.basic || 0) + (s.hra || 0) + (s.ta || 0) + (s.da || 0) + (s.other_allowance || 0) - (s.deductions || 0);

// ─── Add/Edit Non-Teaching Staff Modal ────────────────────────────────────────
function StaffMemberModal({ existing, schoolId, createdBy, onSave, onClose }: {
  existing: StaffMember | null; schoolId: string; createdBy: string;
  onSave: (s: StaffMember) => void; onClose: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState({
    full_name: existing?.full_name ?? '',
    designation: existing?.designation ?? '',
    department: existing?.department ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    joining_date: existing?.joining_date ?? new Date().toISOString().split('T')[0],
    is_active: existing?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.designation) { setError('Name and Designation are required.'); return; }
    setSaving(true); setError('');
    const payload = { ...form, school_id: schoolId, created_by: createdBy };
    let data: any, err: any;
    if (existing?.id) {
      ({ data, error: err } = await supabase.from('staff_members').update(payload).eq('id', existing.id).select().single());
    } else {
      ({ data, error: err } = await supabase.from('staff_members').insert(payload).select().single());
    }
    if (err) { setError(err.message); setSaving(false); return; }
    onSave({ ...data, type: 'non_teaching', role: data.designation } as StaffMember);
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.65)',backdropFilter:'blur(5px)' }}>
      <div style={{ width:'100%',maxWidth:500,background:'white',borderRadius:18,boxShadow:'0 24px 64px rgba(0,0,0,0.2)',display:'flex',flexDirection:'column',maxHeight:'92vh' }}>
        <div style={{ padding:'20px 24px 14px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div>
            <h3 style={{ fontSize:16,fontWeight:800,color:'#0F172A',margin:0 }}>{existing ? 'Edit' : 'Add'} Non-Teaching Staff</h3>
            <p style={{ fontSize:12,color:'#94A3B8',marginTop:3 }}>Drivers, cleaners, security guards, etc.</p>
          </div>
          <button onClick={onClose} style={{ width:30,height:30,borderRadius:'50%',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',color:'#64748B',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto',padding:'18px 24px',display:'flex',flexDirection:'column',gap:12 }}>
          <div>
            <label style={LBL}>Full Name *</label>
            <input value={form.full_name} onChange={e => setForm(p=>({...p,full_name:e.target.value}))} style={IS} placeholder="e.g. Rajan Kumar" />
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={LBL}>Designation *</label>
              <select value={form.designation} onChange={e => setForm(p=>({...p,designation:e.target.value}))} style={IS}>
                <option value="">— Select —</option>
                {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Department</label>
              <select value={form.department} onChange={e => setForm(p=>({...p,department:e.target.value}))} style={IS}>
                <option value="">— Select —</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={LBL}>Phone</label>
              <input value={form.phone} onChange={e => setForm(p=>({...p,phone:e.target.value}))} style={IS} placeholder="Phone number" />
            </div>
            <div>
              <label style={LBL}>Email</label>
              <input value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} style={IS} placeholder="Email (optional)" />
            </div>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={LBL}>Joining Date</label>
              <input type="date" value={form.joining_date} onChange={e => setForm(p=>({...p,joining_date:e.target.value}))} style={IS} />
            </div>
            <div>
              <label style={LBL}>Status</label>
              <select value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm(p=>({...p,is_active:e.target.value==='active'}))} style={IS}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          {error && <p style={{ fontSize:13,color:'#DC2626',padding:'8px 12px',background:'#FEF2F2',borderRadius:8,margin:0 }}>{error}</p>}
        </div>
        <div style={{ padding:'14px 24px',borderTop:'1px solid #F1F5F9',display:'flex',gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:11,borderRadius:10,border:'1px solid #E2E8F0',background:'white',fontSize:13,fontWeight:600,color:'#64748B',cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:2,padding:11,borderRadius:10,border:'none',background:saving?'#94A3B8':'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer' }}>
            {saving ? 'Saving...' : existing ? '💾 Save Changes' : '➕ Add Staff Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Salary Structure Modal (works for both teaching & non-teaching) ───────────
function SalaryStructureModal({ staffName, staffRole, existing, onSave, onClose }: {
  staffName: string; staffRole: string;
  existing: { basic:number; hra:number; ta:number; da:number; other_allowance:number; deductions:number } | null;
  onSave: (vals: { basic:number; hra:number; ta:number; da:number; other_allowance:number; deductions:number }) => Promise<string|null>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    basic: String(existing?.basic ?? 0),
    hra: String(existing?.hra ?? 0),
    ta: String(existing?.ta ?? 0),
    da: String(existing?.da ?? 0),
    other_allowance: String(existing?.other_allowance ?? 0),
    deductions: String(existing?.deductions ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const gross = ['basic','hra','ta','da','other_allowance'].reduce((s,k) => s+(parseFloat((form as any)[k])||0), 0);
  const net = gross - (parseFloat(form.deductions)||0);

  const handleSave = async () => {
    setSaving(true); setError('');
    const vals = {
      basic: parseFloat(form.basic)||0, hra: parseFloat(form.hra)||0,
      ta: parseFloat(form.ta)||0, da: parseFloat(form.da)||0,
      other_allowance: parseFloat(form.other_allowance)||0,
      deductions: parseFloat(form.deductions)||0,
    };
    const err = await onSave(vals);
    if (err) { setError(err); setSaving(false); }
    else { setSaving(false); onClose(); }
  };

  return (
    <div style={{ position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.65)',backdropFilter:'blur(5px)' }}>
      <div style={{ width:'100%',maxWidth:480,background:'white',borderRadius:18,boxShadow:'0 24px 64px rgba(0,0,0,0.2)',display:'flex',flexDirection:'column',maxHeight:'92vh' }}>
        <div style={{ padding:'20px 24px 14px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div>
            <h3 style={{ fontSize:16,fontWeight:800,color:'#0F172A',margin:0 }}>Salary Structure</h3>
            <p style={{ fontSize:12,color:'#94A3B8',marginTop:3 }}>{staffName} · {staffRole}</p>
          </div>
          <button onClick={onClose} style={{ width:30,height:30,borderRadius:'50%',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',color:'#64748B',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto',padding:'18px 24px',display:'flex',flexDirection:'column',gap:12 }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            {[['basic','Basic Salary'],['hra','HRA'],['ta','Transport Allow.'],['da','DA'],['other_allowance','Other Allowance'],['deductions','Deductions']].map(([k,l]) => (
              <div key={k}>
                <label style={LBL}>{l}</label>
                <input type="number" value={(form as any)[k]} onChange={e => setForm(p=>({...p,[k]:e.target.value}))} style={IS} placeholder="0" min="0" />
              </div>
            ))}
          </div>
          <div style={{ background:'#F8FAFC',borderRadius:10,padding:'12px 16px',border:'1px solid #E2E8F0' }}>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}>
              <span style={{ fontSize:13,color:'#64748B' }}>Gross Earnings</span>
              <span style={{ fontSize:13,fontWeight:700,color:'#16A34A' }}>{fmt(gross)}</span>
            </div>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}>
              <span style={{ fontSize:13,color:'#64748B' }}>Deductions</span>
              <span style={{ fontSize:13,fontWeight:700,color:'#DC2626' }}>- {fmt(parseFloat(form.deductions)||0)}</span>
            </div>
            <div style={{ display:'flex',justifyContent:'space-between',paddingTop:8,borderTop:'1px solid #E2E8F0' }}>
              <span style={{ fontSize:13,fontWeight:700,color:'#0F172A' }}>Net Salary</span>
              <span style={{ fontSize:14,fontWeight:800,color:'#1E40AF' }}>{fmt(Math.max(0, net))}</span>
            </div>
          </div>
          {error && <p style={{ fontSize:13,color:'#DC2626',padding:'8px 12px',background:'#FEF2F2',borderRadius:8,margin:0 }}>{error}</p>}
        </div>
        <div style={{ padding:'14px 24px',borderTop:'1px solid #F1F5F9',display:'flex',gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:11,borderRadius:10,border:'1px solid #E2E8F0',background:'white',fontSize:13,fontWeight:600,color:'#64748B',cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:2,padding:11,borderRadius:10,border:'none',background:saving?'#94A3B8':'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer' }}>
            {saving ? 'Saving...' : '💾 Save Structure'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payslip Modal ────────────────────────────────────────────────────────────
function PayslipModal({ row, schoolName, onClose }: {
  row: PayrollRow; schoolName: string; onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const gross = row.basic + row.hra + row.ta + row.da + row.other_allowance;

  const handlePrint = () => {
    const contents = printRef.current?.innerHTML;
    if (!contents) return;
    const win = window.open('', '_blank', 'width=700,height=900');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Payslip — ${row.name} — ${FULL_MONTHS[row.month-1]} ${row.year}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;background:white;padding:32px;}@media print{body{padding:0;}@page{margin:15mm;}}</style>
      </head><body>${contents}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div style={{ position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.7)',backdropFilter:'blur(6px)' }}>
      <div style={{ width:'100%',maxWidth:580,background:'white',borderRadius:20,boxShadow:'0 32px 80px rgba(0,0,0,0.3)',overflow:'hidden',maxHeight:'90vh',display:'flex',flexDirection:'column' }}>
        <div style={{ padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #E8ECF0',background:'#F8FAFC' }}>
          <p style={{ fontWeight:800,color:'#0F172A',fontSize:15,margin:0 }}>📄 Payslip Preview</p>
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={handlePrint} style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:12,fontWeight:700,cursor:'pointer' }}>🖨️ Print / Save PDF</button>
            <button onClick={onClose} style={{ width:30,height:30,borderRadius:'50%',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',color:'#64748B',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY:'auto',padding:20 }}>
          <div ref={printRef}>
            <div style={{ fontFamily:"'Inter',sans-serif",background:'white',border:'1px solid #E2E8F0',borderRadius:14,overflow:'hidden' }}>
              <div style={{ background:'linear-gradient(135deg,#1E3A8A,#3B82F6)',padding:'20px 24px',color:'white' }}>
                <p style={{ fontSize:17,fontWeight:900,margin:'0 0 2px' }}>🏫 {schoolName}</p>
                <p style={{ fontSize:11,opacity:0.7,margin:0 }}>Official Payslip — {FULL_MONTHS[row.month-1]} {row.year}</p>
                <div style={{ marginTop:14,display:'flex',justifyContent:'space-between' }}>
                  <div>
                    <p style={{ fontSize:10,opacity:0.6,margin:'0 0 2px',textTransform:'uppercase',letterSpacing:'0.06em' }}>Employee</p>
                    <p style={{ fontSize:14,fontWeight:800,margin:0 }}>{row.name}</p>
                    <p style={{ fontSize:11,opacity:0.8,margin:'2px 0 0',textTransform:'capitalize' }}>{row.role}</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:10,opacity:0.6,margin:'0 0 2px',textTransform:'uppercase',letterSpacing:'0.06em' }}>Net Salary</p>
                    <p style={{ fontSize:20,fontWeight:900,margin:0 }}>{fmt(row.net_salary)}</p>
                    <p style={{ fontSize:10,opacity:0.75,margin:'2px 0 0',textTransform:'capitalize' }}>Status: {row.payment_status}</p>
                  </div>
                </div>
              </div>
              <div style={{ padding:'18px 24px' }}>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16 }}>
                  <div>
                    <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em',margin:'0 0 10px' }}>Earnings</p>
                    {[['Basic',row.basic],['HRA',row.hra],['Transport Allow.',row.ta],['DA',row.da],['Other Allowance',row.other_allowance]].map(([l,v]) => (
                      <div key={String(l)} style={{ display:'flex',justifyContent:'space-between',marginBottom:6,paddingBottom:6,borderBottom:'1px solid #F8FAFC' }}>
                        <span style={{ fontSize:13,color:'#64748B' }}>{l}</span>
                        <span style={{ fontSize:13,fontWeight:600,color:'#0F172A' }}>{fmt(Number(v))}</span>
                      </div>
                    ))}
                    <div style={{ display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:8,borderTop:'2px solid #E2E8F0' }}>
                      <span style={{ fontSize:13,fontWeight:700,color:'#0F172A' }}>Gross</span>
                      <span style={{ fontSize:13,fontWeight:800,color:'#16A34A' }}>{fmt(gross)}</span>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em',margin:'0 0 10px' }}>Deductions</p>
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6,paddingBottom:6,borderBottom:'1px solid #F8FAFC' }}>
                      <span style={{ fontSize:13,color:'#64748B' }}>Total Deductions</span>
                      <span style={{ fontSize:13,fontWeight:600,color:'#DC2626' }}>{fmt(row.deductions)}</span>
                    </div>
                    <div style={{ marginTop:40 }}>
                      <div style={{ padding:'14px 16px',background:'#F0FDF4',borderRadius:10,border:'1px solid #DCFCE7',textAlign:'center' }}>
                        <p style={{ fontSize:11,color:'#16A34A',fontWeight:700,margin:'0 0 4px' }}>NET SALARY</p>
                        <p style={{ fontSize:22,fontWeight:900,color:'#15803D',margin:0 }}>{fmt(row.net_salary)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding:'10px 24px',borderTop:'1px solid #E2E8F0',textAlign:'center' }}>
                <p style={{ fontSize:10,color:'#CBD5E1',margin:0 }}>Computer-generated payslip — NxtStepEdu School Management System</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Workforce Health Score ────────────────────────────────────────────────────
function computeHealthScore(data: {
  pendingLeaves: number; totalStaff: number;
  approvedPayroll: number; totalPayroll: number;
  staffWithStructure: number; lastMonthTotal: number; thisMonthTotal: number;
}): { score: number; factors: { label: string; status: 'good'|'warn'|'bad'; note: string }[] } {
  const f: { label: string; status: 'good'|'warn'|'bad'; note: string; pts: number }[] = [];

  const leavePct = data.totalStaff > 0 ? data.pendingLeaves / data.totalStaff : 0;
  f.push({ label:'Leave Management', pts: leavePct<0.1?25:leavePct<0.25?14:4,
    status: leavePct<0.1?'good':leavePct<0.25?'warn':'bad',
    note: data.pendingLeaves===0?'No pending leaves':`${data.pendingLeaves} leave request(s) pending` });

  const strPct = data.totalStaff>0 ? data.staffWithStructure/data.totalStaff : 0;
  f.push({ label:'Salary Setup', pts: strPct>=0.9?25:strPct>=0.5?14:4,
    status: strPct>=0.9?'good':strPct>=0.5?'warn':'bad',
    note: strPct>=1?'All staff configured':`${data.staffWithStructure}/${data.totalStaff} staff configured` });

  const prPct = data.totalPayroll>0 ? data.approvedPayroll/data.totalPayroll : 0;
  f.push({ label:'Payroll Status', pts: data.totalPayroll===0?10:prPct>=0.8?25:prPct>=0.5?14:4,
    status: data.totalPayroll===0?'warn':prPct>=0.8?'good':prPct>=0.5?'warn':'bad',
    note: data.totalPayroll===0?'No payroll run yet':`${data.approvedPayroll}/${data.totalPayroll} approved` });

  const change = data.lastMonthTotal>0 ? Math.abs(data.thisMonthTotal-data.lastMonthTotal)/data.lastMonthTotal : 0;
  f.push({ label:'Payroll Stability', pts: change<0.05?25:change<0.15?14:data.lastMonthTotal===0?15:4,
    status: change<0.05?'good':change<0.15?'warn':'bad',
    note: data.lastMonthTotal===0?'No previous month data':`${Math.round(change*100)}% change vs last month` });

  const score = Math.min(100, f.reduce((s,x)=>s+x.pts,0));
  return { score, factors: f.map(({label,status,note})=>({label,status,note})) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function HRPage() {
  const supabase = createClient();
  const now = new Date();

  const [activeTab, setActiveTab] = useState<'overview'|'employees'|'leave'|'payroll'|'simulator'>('overview');
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);

  // Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([]);
  const [staffSalaryStructures, setStaffSalaryStructures] = useState<StaffSalaryStructure[]>([]);
  const [payrollTrend, setPayrollTrend] = useState<PayrollTrend[]>([]);

  // Payroll
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [monthPayroll, setMonthPayroll] = useState<PayrollRecord[]>([]);
  const [monthStaffPayroll, setMonthStaffPayroll] = useState<StaffPayrollRecord[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string|null>(null);
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [runPayrollResult, setRunPayrollResult] = useState('');

  // UI state
  const [leaveUpdating, setLeaveUpdating] = useState<string|null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [empView, setEmpView] = useState<'card'|'list'>('card');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffMember|null>(null);
  const [showSalaryFor, setShowSalaryFor] = useState<AnyStaff|null>(null);
  const [showPayslip, setShowPayslip] = useState<PayrollRow|null>(null);

  // Simulator
  const [simHike, setSimHike] = useState(5);
  const [simBonus, setSimBonus] = useState(0);
  const [simNewHires, setSimNewHires] = useState(0);
  const [simAvgSalary, setSimAvgSalary] = useState(35000);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data: u } = await supabase.from('users').select('school_id, schools(name)').eq('id', user.id).single();
    if (!u?.school_id) { setLoading(false); return; }
    const sid = u.school_id as string;
    setSchoolId(sid);
    setSchoolName((u as any).schools?.name || 'School');

    const [empsRes, staffRes, leavesRes, salStructRes, staffSalStructRes] = await Promise.all([
      supabase.from('users').select('id,full_name,role,email,phone,is_active,last_login_at,created_at')
        .eq('school_id', sid).in('role', ['teacher','principal']).order('full_name'),
      supabase.from('staff_members').select('*').eq('school_id', sid).eq('is_active', true).order('full_name'),
      supabase.from('leave_requests')
        .select('id,leave_type,from_date,to_date,reason,status,created_at,requester_id,users!leave_requests_requester_id_fkey(full_name,role)')
        .eq('school_id', sid).order('created_at', { ascending: false }),
      supabase.from('salary_structures').select('*').eq('school_id', sid),
      supabase.from('staff_salary_structures').select('*').eq('school_id', sid),
    ]);

    if (empsRes.data) setEmployees(empsRes.data.map((e:any) => ({ ...e, type: 'teaching' })) as Employee[]);
    if (staffRes.data) setStaffMembers(staffRes.data.map((s:any) => ({ ...s, type: 'non_teaching', role: s.designation })) as StaffMember[]);
    if (leavesRes.data) {
      setLeaveRequests(leavesRes.data.map((l: any) => ({
        ...l, requester: l['users!leave_requests_requester_id_fkey'] || l.users,
      })));
    }
    if (salStructRes.data) setSalaryStructures(salStructRes.data as SalaryStructure[]);
    if (staffSalStructRes.data) setStaffSalaryStructures(staffSalStructRes.data as StaffSalaryStructure[]);

    // Payroll trend (last 6 months) — combine teaching + non-teaching
    const trendMonths: PayrollTrend[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      trendMonths.push({ label:`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, month: d.getMonth()+1, year: d.getFullYear(), total: 0 });
    }
    const [trendT, trendS] = await Promise.all([
      supabase.from('payroll').select('month,year,net_salary').eq('school_id', sid)
        .in('month', trendMonths.map(t=>t.month)).in('year', [...new Set(trendMonths.map(t=>t.year))]),
      supabase.from('staff_payroll').select('month,year,net_salary').eq('school_id', sid)
        .in('month', trendMonths.map(t=>t.month)).in('year', [...new Set(trendMonths.map(t=>t.year))]),
    ]);
    const combined = [...(trendT.data||[]), ...(trendS.data||[])];
    combined.forEach((r:any) => {
      const slot = trendMonths.find(t => t.month===r.month && t.year===r.year);
      if (slot) slot.total += r.net_salary || 0;
    });
    setPayrollTrend(trendMonths);
    setLoading(false);
  }, [supabase]);

  const fetchMonthPayroll = useCallback(async () => {
    if (!schoolId) return;
    setPayrollLoading(true);
    const prevM = selMonth === 1 ? 12 : selMonth - 1;
    const prevY = selMonth === 1 ? selYear - 1 : selYear;

    const [curT, curS, prevT, prevS] = await Promise.all([
      supabase.from('payroll').select('*,users!payroll_teacher_id_fkey(full_name,role)')
        .eq('school_id', schoolId).eq('month', selMonth).eq('year', selYear),
      supabase.from('staff_payroll').select('*,staff_members!staff_payroll_staff_member_id_fkey(full_name,designation)')
        .eq('school_id', schoolId).eq('month', selMonth).eq('year', selYear),
      supabase.from('payroll').select('net_salary').eq('school_id', schoolId).eq('month', prevM).eq('year', prevY),
      supabase.from('staff_payroll').select('net_salary').eq('school_id', schoolId).eq('month', prevM).eq('year', prevY),
    ]);

    if (curT.data) setMonthPayroll(curT.data.map((r:any) => ({
      ...r, employee: r['users!payroll_teacher_id_fkey'] || r.users,
    })) as PayrollRecord[]);
    if (curS.data) setMonthStaffPayroll(curS.data.map((r:any) => ({
      ...r, employee: r['staff_members!staff_payroll_staff_member_id_fkey'] || r.staff_members,
    })) as StaffPayrollRecord[]);

    const prevTotal =
      (prevT.data||[]).reduce((s:number,r:any)=>s+(r.net_salary||0),0) +
      (prevS.data||[]).reduce((s:number,r:any)=>s+(r.net_salary||0),0);
    setPrevMonthTotal(prevTotal);
    setPayrollLoading(false);
  }, [supabase, schoolId, selMonth, selYear]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (schoolId) fetchMonthPayroll(); }, [fetchMonthPayroll, schoolId]);

  // ─── Leave update ──────────────────────────────────────────────────────────
  const updateLeaveStatus = async (id: string, status: 'approved'|'rejected') => {
    setLeaveUpdating(id);
    await supabase.from('leave_requests').update({ status }).eq('id', id);
    const leave = leaveRequests.find(l => l.id === id);
    if (leave?.requester_id) {
      await createNotification(supabase, {
        recipient_id: leave.requester_id, school_id: schoolId,
        type: 'leave_update',
        title: `Leave ${status === 'approved' ? 'Approved ✅' : 'Rejected ❌'}`,
        body: `Your ${leave.leave_type?.replace(/_/g,' ')} leave (${new Date(leave.from_date).toLocaleDateString('en-IN')} – ${new Date(leave.to_date).toLocaleDateString('en-IN')}) has been ${status}.`,
        link: '/teacher/leave',
      });
    }
    await fetchData();
    setLeaveUpdating(null);
  };

  // ─── Salary structure save handlers ───────────────────────────────────────
  const saveSalaryStructure = async (staff: AnyStaff, vals: Omit<SalaryStructure,'id'|'employee_id'|'effective_from'>) => {
    const date = new Date().toISOString().split('T')[0];
    if (staff.type === 'teaching') {
      const existing = salaryStructures.find(s => s.employee_id === staff.id);
      const payload = { school_id: schoolId, employee_id: staff.id, ...vals, effective_from: date, updated_at: new Date().toISOString() };
      let data: any, err: any;
      if (existing) ({ data, error: err } = await supabase.from('salary_structures').update(payload).eq('id', existing.id).select().single());
      else ({ data, error: err } = await supabase.from('salary_structures').insert(payload).select().single());
      if (err) return err.message as string;
      setSalaryStructures(prev => { const idx=prev.findIndex(s=>s.employee_id===staff.id); const n=[...prev]; idx>=0?n[idx]=data:n.push(data); return n; });
    } else {
      const existing = staffSalaryStructures.find(s => s.staff_member_id === staff.id);
      const payload = { school_id: schoolId, staff_member_id: staff.id, ...vals, effective_from: date, updated_at: new Date().toISOString() };
      let data: any, err: any;
      if (existing) ({ data, error: err } = await supabase.from('staff_salary_structures').update(payload).eq('id', existing.id).select().single());
      else ({ data, error: err } = await supabase.from('staff_salary_structures').insert(payload).select().single());
      if (err) return err.message as string;
      setStaffSalaryStructures(prev => { const idx=prev.findIndex(s=>s.staff_member_id===staff.id); const n=[...prev]; idx>=0?n[idx]=data:n.push(data); return n; });
    }
    return null;
  };

  // ─── Run payroll ──────────────────────────────────────────────────────────
  const handleRunPayroll = async () => {
    if (!schoolId) return;
    setRunningPayroll(true); setRunPayrollResult('');
    let created = 0, skipped = 0, errors = 0;

    // Teaching staff
    for (const emp of employees) {
      const struct = salaryStructures.find(s => s.employee_id === emp.id);
      if (!struct) { skipped++; continue; }
      const payload = {
        school_id: schoolId, teacher_id: emp.id,
        month: selMonth, year: selYear,
        basic: struct.basic, hra: struct.hra, ta: struct.ta, da: struct.da,
        other_allowance: struct.other_allowance, deductions: struct.deductions,
        payment_status: 'pending',
      };
      const { error } = await supabase.from('payroll').upsert(payload, { onConflict: 'teacher_id,month,year', ignoreDuplicates: true });
      error ? errors++ : created++;
    }

    // Non-teaching staff
    for (const sm of staffMembers) {
      const struct = staffSalaryStructures.find(s => s.staff_member_id === sm.id);
      if (!struct) { skipped++; continue; }
      const payload = {
        school_id: schoolId, staff_member_id: sm.id,
        month: selMonth, year: selYear,
        basic: struct.basic, hra: struct.hra, ta: struct.ta, da: struct.da,
        other_allowance: struct.other_allowance, deductions: struct.deductions,
        payment_status: 'pending',
      };
      const { error } = await supabase.from('staff_payroll').upsert(payload, { onConflict: 'staff_member_id,month,year', ignoreDuplicates: true });
      error ? errors++ : created++;
    }

    await fetchMonthPayroll();
    setRunPayrollResult(`✅ Done: ${created} records created, ${skipped} skipped (no salary structure set), ${errors} errors.`);
    setRunningPayroll(false);
  };

  // ─── Approve / Mark Paid ──────────────────────────────────────────────────
  const updatePayrollStatus = async (row: PayrollRow, status: 'approved'|'paid') => {
    setUpdatingId(row.id);
    const upd: any = { payment_status: status };
    if (status === 'paid') upd.payment_date = now.toISOString().split('T')[0];
    const table = row.kind === 'teaching' ? 'payroll' : 'staff_payroll';
    await supabase.from(table).update(upd).eq('id', row.id);
    await fetchMonthPayroll();
    setUpdatingId(null);
  };

  // ─── Derived values ────────────────────────────────────────────────────────
  const allPayrollRows = useMemo((): PayrollRow[] => {
    const teaching: PayrollRow[] = monthPayroll.map(r => ({
      id: r.id, staff_id: r.teacher_id, name: r.employee?.full_name || '—',
      role: r.employee?.role || 'teacher', month: r.month, year: r.year,
      basic: r.basic, hra: r.hra, ta: r.ta, da: r.da, other_allowance: r.other_allowance,
      deductions: r.deductions, net_salary: r.net_salary, payment_status: r.payment_status,
      kind: 'teaching', raw: r,
    }));
    const nonTeaching: PayrollRow[] = monthStaffPayroll.map(r => ({
      id: r.id, staff_id: r.staff_member_id, name: r.employee?.full_name || '—',
      role: r.employee?.designation || 'staff', month: r.month, year: r.year,
      basic: r.basic, hra: r.hra, ta: r.ta, da: r.da, other_allowance: r.other_allowance,
      deductions: r.deductions, net_salary: r.net_salary, payment_status: r.payment_status,
      kind: 'non_teaching', raw: r,
    }));
    return [...teaching, ...nonTeaching].sort((a,b) => a.name.localeCompare(b.name));
  }, [monthPayroll, monthStaffPayroll]);

  const thisMonthTotal = useMemo(() => allPayrollRows.reduce((s,r)=>s+r.net_salary,0), [allPayrollRows]);
  const payrollPctChange = prevMonthTotal > 0 ? ((thisMonthTotal - prevMonthTotal) / prevMonthTotal * 100) : 0;
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');
  const totalStaff = employees.length + staffMembers.length;
  const staffWithStruct = salaryStructures.length + staffSalaryStructures.length;
  const empOnLeave = useMemo(() => {
    const today = now.toISOString().split('T')[0];
    return leaveRequests.filter(l => l.status==='approved' && l.from_date<=today && l.to_date>=today).length;
  }, [leaveRequests]);
  const approvedPayroll = allPayrollRows.filter(r => r.payment_status !== 'pending').length;
  const paidPayroll = allPayrollRows.filter(r => r.payment_status === 'paid').length;

  const health = computeHealthScore({
    pendingLeaves: pendingLeaves.length, totalStaff,
    approvedPayroll, totalPayroll: allPayrollRows.length,
    staffWithStructure: staffWithStruct, lastMonthTotal: prevMonthTotal, thisMonthTotal,
  });

  const leaveTypeDist = useMemo(() => {
    const map = new Map<string, number>();
    leaveRequests.forEach(l => map.set(l.leave_type, (map.get(l.leave_type)||0)+1));
    return Array.from(map.entries()).map(([name,value]) => ({ name: name.replace(/_/g,' '), value }));
  }, [leaveRequests]);

  const allStaff: AnyStaff[] = [...employees, ...staffMembers];
  const filteredStaff = allStaff.filter(s =>
    s.full_name.toLowerCase().includes(empSearch.toLowerCase()) ||
    s.role.toLowerCase().includes(empSearch.toLowerCase())
  );

  const statusSty: Record<string,{bg:string;color:string}> = {
    pending:  { bg:'#FFFBEB', color:'#D97706' },
    approved: { bg:'#F0FDF4', color:'#16A34A' },
    rejected: { bg:'#FEF2F2', color:'#DC2626' },
    paid:     { bg:'#EFF6FF', color:'#1D4ED8' },
  };

  const tabs = [
    { key:'overview' as const, label:'🏛 Command Center' },
    { key:'employees' as const, label:'👥 All Staff' },
    { key:'leave' as const, label:`🏖 Leave${pendingLeaves.length>0?` (${pendingLeaves.length})`:''}`},
    { key:'payroll' as const, label:'💰 Payroll' },
    { key:'simulator' as const, label:'🔮 Simulator' },
  ];

  const yearOptions = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1];

  if (loading) {
    return (
      <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:90,borderRadius:16 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:12 }}>
        <div>
          <h2 style={{ fontSize:22,fontWeight:800,color:'#0F172A',letterSpacing:'-0.02em',margin:0 }}>HR & Payroll</h2>
          <p style={{ fontSize:13,color:'#94A3B8',marginTop:4 }}>Workforce Command Center · {totalStaff} staff ({employees.length} teaching, {staffMembers.length} non-teaching)</p>
        </div>
        <button onClick={() => setShowAddStaff(true)}
          style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:11,border:'none',background:'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 12px rgba(59,130,246,0.4)' }}>
          ➕ Add Non-Teaching Staff
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{ display:'flex',gap:2,padding:4,borderRadius:14,background:'#F1F5F9',overflowX:'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ flex:'1 1 auto',minWidth:'fit-content',padding:'9px 14px',borderRadius:10,border:'none',fontSize:13,fontWeight:activeTab===t.key?700:500,cursor:'pointer',
              background:activeTab===t.key?'white':'transparent',
              color:activeTab===t.key?'#1E40AF':'#64748B',
              boxShadow:activeTab===t.key?'0 1px 4px rgba(0,0,0,0.1)':'none',
              transition:'all 0.15s',whiteSpace:'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div style={{ display:'flex',flexDirection:'column',gap:18 }}>

          {/* KPI Row */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:14 }}>
            {[
              { label:'Total Staff', value:totalStaff, sub:`${employees.length} teaching · ${staffMembers.length} support`, icon:'👥', color:'#6366F1', bg:'#EEF2FF' },
              { label:'Active Today', value:employees.filter(e=>e.is_active).length+staffMembers.length, sub:'Teaching + non-teaching', icon:'✅', color:'#16A34A', bg:'#F0FDF4' },
              { label:'On Leave Today', value:empOnLeave, sub:'Approved leave active', icon:'🏖', color:'#D97706', bg:'#FFFBEB' },
              { label:'Monthly Payroll', value:fmtL(thisMonthTotal), sub:prevMonthTotal>0?`${payrollPctChange>=0?'+':''}${payrollPctChange.toFixed(1)}% vs last month`:'No prior month data', icon:'💰', color:'#1D4ED8', bg:'#EFF6FF' },
              { label:'Pending Actions', value:pendingLeaves.length, sub:'Leave requests', icon:pendingLeaves.length>0?'⚠️':'✅', color:pendingLeaves.length>0?'#DC2626':'#16A34A', bg:pendingLeaves.length>0?'#FEF2F2':'#F0FDF4' },
            ].map((c,i) => (
              <div key={i} style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:18,boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:10 }}>
                  <span style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em' }}>{c.label}</span>
                  <span style={{ fontSize:20 }}>{c.icon}</span>
                </div>
                <p style={{ fontSize:26,fontWeight:900,color:'#0F172A',letterSpacing:'-0.02em',margin:'0 0 4px' }}>{c.value}</p>
                <p style={{ fontSize:11,color:c.color,fontWeight:600,margin:0 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Health Score + Payroll Trend */}
          <div style={{ display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start' }}>
            {/* Health Score */}
            <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:22 }}>
              <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 14px' }}>Workforce Health</p>
              <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:18 }}>
                <div style={{ position:'relative',width:76,height:76,flexShrink:0 }}>
                  <svg viewBox="0 0 36 36" style={{ width:76,height:76,transform:'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F1F5F9" strokeWidth="3"/>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={health.score>=75?'#16A34A':health.score>=50?'#D97706':'#DC2626'} strokeWidth="3" strokeDasharray={`${health.score} ${100-health.score}`} strokeLinecap="round"/>
                  </svg>
                  <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column' }}>
                    <span style={{ fontSize:17,fontWeight:900,color:'#0F172A',lineHeight:1 }}>{health.score}</span>
                    <span style={{ fontSize:9,color:'#94A3B8',fontWeight:600 }}>/100</span>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize:14,fontWeight:800,color:health.score>=75?'#15803D':health.score>=50?'#D97706':'#DC2626',margin:'0 0 3px' }}>
                    {health.score>=75?'🟢 Healthy':health.score>=50?'🟡 Moderate':'🔴 Needs Attention'}
                  </p>
                  <p style={{ fontSize:11,color:'#94A3B8',margin:0 }}>4 factors scored</p>
                </div>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {health.factors.map((f,i) => (
                  <div key={i} style={{ display:'flex',alignItems:'flex-start',gap:7 }}>
                    <span style={{ fontSize:11,marginTop:1 }}>{f.status==='good'?'✅':f.status==='warn'?'⚠️':'❌'}</span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <p style={{ fontSize:12,fontWeight:700,color:'#0F172A',margin:0 }}>{f.label}</p>
                      <p style={{ fontSize:11,color:'#64748B',margin:'1px 0 0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payroll Trend */}
            <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:22 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4 }}>
                <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',margin:0 }}>Total Payroll Trend</p>
                {payrollPctChange!==0 && prevMonthTotal>0 && (
                  <span style={{ fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:99,background:payrollPctChange>0?'#FEF2F2':'#F0FDF4',color:payrollPctChange>0?'#DC2626':'#16A34A' }}>
                    {payrollPctChange>0?'↑':'↓'} {Math.abs(payrollPctChange).toFixed(1)}%
                  </span>
                )}
              </div>
              <p style={{ fontSize:13,color:'#64748B',margin:'0 0 16px' }}>Last 6 months (teaching + non-teaching)</p>
              {payrollTrend.some(t=>t.total>0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={payrollTrend} margin={{ top:5,right:10,left:0,bottom:0 }}>
                    <defs>
                      <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill:'#94A3B8',fontSize:11 }}/>
                    <YAxis axisLine={false} tickLine={false} tick={{ fill:'#94A3B8',fontSize:11 }} tickFormatter={v=>v>=100000?`${(v/100000).toFixed(0)}L`:v>=1000?`${(v/1000).toFixed(0)}K`:v} width={38}/>
                    <Tooltip formatter={(v:any)=>[fmt(v),'Total Payroll']} contentStyle={{ borderRadius:12,border:'none',boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}/>
                    <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2.5} fill="url(#payGrad)" dot={{ r:4,fill:'#3B82F6',strokeWidth:2,stroke:'white' }}/>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:200,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',border:'2px dashed #E2E8F0',borderRadius:12 }}>
                  <span style={{ fontSize:32,marginBottom:8 }}>📊</span>
                  <p style={{ fontSize:13,color:'#64748B',margin:0 }}>Payroll trend appears after first payroll run</p>
                </div>
              )}
            </div>
          </div>

          {/* Attention + Leave Distribution */}
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
            {/* Needs Attention */}
            <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:22 }}>
              <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 14px' }}>Needs Your Attention</p>
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {pendingLeaves.length>0 && (
                  <div role="button" onClick={()=>setActiveTab('leave')} style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'#FFFBEB',border:'1px solid #FDE68A' }}>
                    <span style={{ fontSize:16 }}>🟠</span>
                    <p style={{ fontSize:13,color:'#92400E',fontWeight:600,margin:0 }}>{pendingLeaves.length} leave request{pendingLeaves.length>1?'s':''} pending approval</p>
                  </div>
                )}
                {totalStaff-staffWithStruct>0 && (
                  <div role="button" onClick={()=>setActiveTab('employees')} style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'#FEF2F2',border:'1px solid #FEE2E2' }}>
                    <span style={{ fontSize:16 }}>🔴</span>
                    <p style={{ fontSize:13,color:'#991B1B',fontWeight:600,margin:0 }}>{totalStaff-staffWithStruct} staff missing salary structure</p>
                  </div>
                )}
                {allPayrollRows.filter(r=>r.payment_status==='pending').length>0 && (
                  <div role="button" onClick={()=>setActiveTab('payroll')} style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'#FFF7ED',border:'1px solid #FED7AA' }}>
                    <span style={{ fontSize:16 }}>🟡</span>
                    <p style={{ fontSize:13,color:'#9A3412',fontWeight:600,margin:0 }}>{allPayrollRows.filter(r=>r.payment_status==='pending').length} payroll record(s) awaiting approval</p>
                  </div>
                )}
                {staffMembers.length===0 && (
                  <div role="button" onClick={()=>setShowAddStaff(true)} style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'#EFF6FF',border:'1px solid #BFDBFE' }}>
                    <span style={{ fontSize:16 }}>💡</span>
                    <p style={{ fontSize:13,color:'#1E40AF',fontWeight:600,margin:0 }}>No non-teaching staff yet — add drivers, cleaners, etc.</p>
                  </div>
                )}
                {pendingLeaves.length===0 && totalStaff-staffWithStruct===0 && allPayrollRows.filter(r=>r.payment_status==='pending').length===0 && staffMembers.length>0 && (
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'28px 0',textAlign:'center' }}>
                    <div style={{ width:48,height:48,borderRadius:12,background:'#F0FDF4',border:'1px solid #DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10,fontSize:22 }}>✅</div>
                    <p style={{ fontWeight:700,color:'#15803D',fontSize:14,margin:0 }}>All clear!</p>
                    <p style={{ fontSize:12,color:'#94A3B8',marginTop:4 }}>No pending actions</p>
                  </div>
                )}
              </div>
            </div>

            {/* Leave Distribution */}
            <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:22 }}>
              <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 14px' }}>Leave Distribution</p>
              {leaveTypeDist.length>0 ? (
                <div style={{ display:'flex',alignItems:'center',gap:16 }}>
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={leaveTypeDist} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" paddingAngle={2}>
                        {leaveTypeDist.map((_,i)=><Cell key={i} fill={LEAVE_COLORS[i%LEAVE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v:any,n:any)=>[v,n]} contentStyle={{ borderRadius:10,border:'none',boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex:1,display:'flex',flexDirection:'column',gap:7 }}>
                    {leaveTypeDist.map((d,i)=>(
                      <div key={i} style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <div style={{ width:8,height:8,borderRadius:'50%',background:LEAVE_COLORS[i%LEAVE_COLORS.length],flexShrink:0 }}/>
                          <span style={{ fontSize:12,color:'#64748B',textTransform:'capitalize' }}>{d.name}</span>
                        </div>
                        <span style={{ fontSize:12,fontWeight:700,color:'#0F172A' }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'28px 0',textAlign:'center' }}>
                  <span style={{ fontSize:32,marginBottom:8 }}>🏖</span>
                  <p style={{ fontSize:13,color:'#64748B',margin:0 }}>No leave requests yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ ALL STAFF ═════════════════════════════════════════════════════════ */}
      {activeTab === 'employees' && (
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          {/* Controls */}
          <div style={{ display:'flex',gap:10,flexWrap:'wrap',alignItems:'center' }}>
            <input value={empSearch} onChange={e=>setEmpSearch(e.target.value)} placeholder="Search by name or role..." style={{ ...IS,maxWidth:260 }}/>
            <div style={{ display:'flex',gap:2,padding:3,borderRadius:9,background:'#F1F5F9' }}>
              {(['card','list'] as const).map(v=>(
                <button key={v} onClick={()=>setEmpView(v)} style={{ padding:'6px 14px',borderRadius:7,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',background:empView===v?'white':'transparent',color:empView===v?'#1E40AF':'#64748B',boxShadow:empView===v?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                  {v==='card'?'⊞ Cards':'≡ List'}
                </button>
              ))}
            </div>
            <button onClick={()=>setShowAddStaff(true)} style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:13,fontWeight:700,cursor:'pointer' }}>
              ➕ Non-Teaching Staff
            </button>
            <button onClick={()=>{
              const data = filteredStaff.map((s,i)=>({
                '#':i+1,'Name':s.full_name,'Type':s.type==='teaching'?'Teaching':'Non-Teaching',
                'Role/Designation':s.role,'Phone':s.phone??'','Email':s.email??'','Active':s.is_active?'Yes':'No',
              }));
              const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb,ws,'Staff'); XLSX.writeFile(wb,`Staff_${new Date().toISOString().slice(0,10)}.xlsx`);
            }} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:10,border:'none',background:'#059669',color:'white',fontSize:13,fontWeight:700,cursor:'pointer' }}>
              📥 Export
            </button>
          </div>

          {/* Section badges */}
          <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
            {[
              { label:`${employees.length} Teaching Staff`, bg:'#EEF2FF', color:'#6366F1' },
              { label:`${staffMembers.length} Non-Teaching Staff`, bg:'#FFF7ED', color:'#D97706' },
              { label:`${staffWithStruct} Salary Configured`, bg:'#EFF6FF', color:'#1D4ED8' },
              { label:`${totalStaff-staffWithStruct} Need Setup`, bg:'#FEF2F2', color:'#DC2626' },
            ].map((b,i)=><span key={i} style={{ fontSize:12,fontWeight:700,padding:'5px 12px',borderRadius:99,background:b.bg,color:b.color }}>{b.label}</span>)}
          </div>

          {/* Teaching section heading */}
          {filteredStaff.some(s=>s.type==='teaching') && (
            <p style={{ fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.08em',margin:'4px 0 -4px' }}>📚 Teaching & Principal</p>
          )}

          {empView === 'card' ? (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:14 }}>
              {filteredStaff.map(s => {
                const hasSalary = s.type==='teaching'
                  ? salaryStructures.some(x=>x.employee_id===s.id)
                  : staffSalaryStructures.some(x=>x.staff_member_id===s.id);
                const struct = s.type==='teaching'
                  ? salaryStructures.find(x=>x.employee_id===s.id)
                  : staffSalaryStructures.find(x=>x.staff_member_id===s.id);
                const isNT = s.type==='non_teaching';
                const sectionDivider = filteredStaff.indexOf(s) > 0 && filteredStaff[filteredStaff.indexOf(s)-1].type==='teaching' && isNT;
                return (
                  <div key={s.id}>
                    {sectionDivider && (
                      <div style={{ gridColumn:'1/-1',marginBottom:4 }}>
                        <p style={{ fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.08em',margin:'8px 0 0' }}>🧹 Non-Teaching & Support</p>
                      </div>
                    )}
                    <div style={{ background:'white',borderRadius:16,border:`1px solid ${isNT?'#FED7AA':'#E8ECF0'}`,padding:18,boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:14 }}>
                        <div style={{ width:44,height:44,borderRadius:12,background:isNT?'linear-gradient(135deg,#D97706,#F59E0B)':'linear-gradient(135deg,#6366F1,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color:'white',flexShrink:0 }}>
                          {s.full_name.charAt(0)}
                        </div>
                        <div style={{ flex:1,minWidth:0 }}>
                          <p style={{ fontSize:14,fontWeight:700,color:'#0F172A',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{s.full_name}</p>
                          <p style={{ fontSize:12,color:'#64748B',margin:'2px 0 0',textTransform:'capitalize' }}>{s.role}</p>
                        </div>
                        <span style={{ fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:99,flexShrink:0,background:isNT?'#FFF7ED':'#EEF2FF',color:isNT?'#D97706':'#6366F1' }}>
                          {isNT?'Support':'Teaching'}
                        </span>
                      </div>
                      {s.phone && <p style={{ fontSize:12,color:'#64748B',margin:'0 0 4px' }}>📞 {s.phone}</p>}
                      {s.email && <p style={{ fontSize:12,color:'#64748B',margin:'0 0 4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>✉️ {s.email}</p>}
                      {(s as StaffMember).department && <p style={{ fontSize:12,color:'#64748B',margin:'0 0 4px' }}>🏢 {(s as StaffMember).department}</p>}
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12 }}>
                        <div style={{ display:'flex',gap:6 }}>
                          <span style={{ fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:6,background:hasSalary?'#EFF6FF':'#FEF2F2',color:hasSalary?'#1D4ED8':'#DC2626' }}>
                            {hasSalary?`💰 ${fmt(netCalc(struct!))}/mo`:'⚠ No salary'}
                          </span>
                        </div>
                        <div style={{ display:'flex',gap:6 }}>
                          {isNT && (
                            <button onClick={()=>setEditStaff(s as StaffMember)} style={{ fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:7,border:'1px solid #E2E8F0',background:'white',color:'#64748B',cursor:'pointer' }}>✏️ Edit</button>
                          )}
                          <button onClick={()=>setShowSalaryFor(s)} style={{ fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:7,border:'1px solid #BFDBFE',background:'#EFF6FF',color:'#1E40AF',cursor:'pointer' }}>
                            {hasSalary?'Edit Salary':'Set Salary'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredStaff.length===0 && (
                <div style={{ padding:'40px 0',textAlign:'center' }}>
                  <p style={{ fontSize:32 }}>👥</p>
                  <p style={{ fontSize:14,color:'#64748B',marginTop:8 }}>No staff found</p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background:'white',borderRadius:16,border:'1px solid #E2E8F0',overflow:'hidden' }}>
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead><tr style={{ background:'#F8FAFC' }}>
                  {['Name','Type','Role/Designation','Contact','Net Salary','Actions'].map(h=>(
                    <th key={h} style={{ textAlign:'left',padding:'10px 16px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredStaff.map(s=>{
                    const hasSalary = s.type==='teaching'?salaryStructures.some(x=>x.employee_id===s.id):staffSalaryStructures.some(x=>x.staff_member_id===s.id);
                    const struct = s.type==='teaching'?salaryStructures.find(x=>x.employee_id===s.id):staffSalaryStructures.find(x=>x.staff_member_id===s.id);
                    const isNT = s.type==='non_teaching';
                    return (
                      <tr key={s.id} style={{ borderTop:'1px solid #F1F5F9',background:isNT?'#FFFBF5':'white' }}>
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                            <div style={{ width:32,height:32,borderRadius:9,background:isNT?'linear-gradient(135deg,#D97706,#F59E0B)':'linear-gradient(135deg,#6366F1,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'white' }}>{s.full_name.charAt(0)}</div>
                            <p style={{ fontSize:13,fontWeight:600,color:'#0F172A',margin:0 }}>{s.full_name}</p>
                          </div>
                        </td>
                        <td style={{ padding:'12px 16px' }}><span style={{ fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:99,background:isNT?'#FFF7ED':'#EEF2FF',color:isNT?'#D97706':'#6366F1' }}>{isNT?'Support':'Teaching'}</span></td>
                        <td style={{ padding:'12px 16px',fontSize:13,color:'#64748B',textTransform:'capitalize' }}>{s.role}</td>
                        <td style={{ padding:'12px 16px',fontSize:13,color:'#64748B' }}>{s.phone||s.email||'—'}</td>
                        <td style={{ padding:'12px 16px',fontSize:13,fontWeight:700,color:hasSalary?'#1E40AF':'#DC2626' }}>{hasSalary?fmt(netCalc(struct!)):'—'}</td>
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex',gap:6 }}>
                            {isNT && <button onClick={()=>setEditStaff(s as StaffMember)} style={{ fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:7,border:'1px solid #E2E8F0',background:'white',color:'#64748B',cursor:'pointer' }}>✏️ Edit</button>}
                            <button onClick={()=>setShowSalaryFor(s)} style={{ fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:7,border:'1px solid #BFDBFE',background:'#EFF6FF',color:'#1E40AF',cursor:'pointer' }}>{hasSalary?'Edit Salary':'Set Salary'}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ LEAVE REQUESTS ════════════════════════════════════════════════════ */}
      {activeTab === 'leave' && (
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          {/* Summary */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10 }}>
            {[
              { label:'Total',v:leaveRequests.length,bg:'#F1F5F9',c:'#0F172A' },
              { label:'Pending',v:leaveRequests.filter(l=>l.status==='pending').length,bg:'#FFFBEB',c:'#D97706' },
              { label:'Approved',v:leaveRequests.filter(l=>l.status==='approved').length,bg:'#F0FDF4',c:'#16A34A' },
              { label:'Rejected',v:leaveRequests.filter(l=>l.status==='rejected').length,bg:'#FEF2F2',c:'#DC2626' },
            ].map((c,i)=>(
              <div key={i} style={{ background:c.bg,borderRadius:12,padding:'14px 16px',border:'1px solid #E2E8F0' }}>
                <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 6px' }}>{c.label}</p>
                <p style={{ fontSize:24,fontWeight:800,color:c.c,margin:0 }}>{c.v}</p>
              </div>
            ))}
          </div>
          <div style={{ display:'flex',justifyContent:'flex-end' }}>
            <button onClick={()=>{
              const data=leaveRequests.map((l,i)=>{
                const days=Math.ceil((new Date(l.to_date).getTime()-new Date(l.from_date).getTime())/86400000)+1;
                return {'#':i+1,'Staff':l.requester?.full_name??'','Type':(l.leave_type??'').replace(/_/g,' '),'From':new Date(l.from_date).toLocaleDateString('en-IN'),'To':new Date(l.to_date).toLocaleDateString('en-IN'),'Days':days,'Reason':l.reason??'','Status':l.status};
              });
              const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb,ws,'Leaves');XLSX.writeFile(wb,`LeaveRequests_${new Date().toISOString().slice(0,10)}.xlsx`);
            }} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:10,border:'none',background:'#059669',color:'white',fontSize:13,fontWeight:700,cursor:'pointer' }}>
              📥 Export Excel
            </button>
          </div>
          <div style={{ background:'white',borderRadius:16,border:'1px solid #E2E8F0',overflow:'hidden' }}>
            {leaveRequests.length===0?(
              <div style={{ padding:'48px 0',textAlign:'center' }}><p style={{ fontSize:32 }}>🏖</p><p style={{ fontSize:14,color:'#64748B',marginTop:8 }}>No leave requests yet</p></div>
            ):(
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead><tr style={{ background:'#F8FAFC' }}>
                  {['Staff','Type','Duration','Reason','Status','Action'].map(h=>(
                    <th key={h} style={{ textAlign:'left',padding:'10px 16px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {leaveRequests.map(l=>{
                    const days=Math.ceil((new Date(l.to_date).getTime()-new Date(l.from_date).getTime())/86400000)+1;
                    return (
                      <tr key={l.id} style={{ borderTop:'1px solid #F1F5F9' }}>
                        <td style={{ padding:'12px 16px' }}>
                          <p style={{ fontSize:13,fontWeight:600,color:'#0F172A',margin:0 }}>{l.requester?.full_name||'—'}</p>
                          <p style={{ fontSize:11,color:'#94A3B8',margin:'2px 0 0',textTransform:'capitalize' }}>{l.requester?.role}</p>
                        </td>
                        <td style={{ padding:'12px 16px',fontSize:13,color:'#64748B',textTransform:'capitalize' }}>{l.leave_type?.replace(/_/g,' ')}</td>
                        <td style={{ padding:'12px 16px' }}>
                          <p style={{ fontSize:13,color:'#0F172A',margin:0 }}>{new Date(l.from_date).toLocaleDateString('en-IN')}</p>
                          <p style={{ fontSize:11,color:'#94A3B8',margin:'2px 0 0' }}>{days} day{days!==1?'s':''}</p>
                        </td>
                        <td style={{ padding:'12px 16px',fontSize:13,color:'#64748B',maxWidth:160 }}>
                          <p style={{ margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{l.reason||'—'}</p>
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          <span style={{ fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:99,textTransform:'capitalize',...(statusSty[l.status]||statusSty.pending) }}>{l.status}</span>
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          {l.status==='pending'?(
                            <div style={{ display:'flex',gap:6 }}>
                              <button onClick={()=>updateLeaveStatus(l.id,'approved')} disabled={leaveUpdating===l.id} style={{ fontSize:12,fontWeight:700,padding:'5px 11px',borderRadius:8,border:'none',background:'#16A34A',color:'white',cursor:leaveUpdating===l.id?'not-allowed':'pointer',opacity:leaveUpdating===l.id?0.5:1 }}>✓ Approve</button>
                              <button onClick={()=>updateLeaveStatus(l.id,'rejected')} disabled={leaveUpdating===l.id} style={{ fontSize:12,fontWeight:700,padding:'5px 11px',borderRadius:8,border:'none',background:'#DC2626',color:'white',cursor:leaveUpdating===l.id?'not-allowed':'pointer',opacity:leaveUpdating===l.id?0.5:1 }}>✗ Reject</button>
                            </div>
                          ):<span style={{ fontSize:12,color:'#94A3B8' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══ PAYROLL ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'payroll' && (
        <div style={{ display:'flex',flexDirection:'column',gap:18 }}>
          {/* Month/Year + Run Payroll */}
          <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:20 }}>
            <div style={{ display:'flex',flexWrap:'wrap',alignItems:'flex-end',gap:12 }}>
              <div>
                <label style={LBL}>Month</label>
                <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))} style={{ ...IS,width:140 }}>
                  {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Year</label>
                <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))} style={{ ...IS,width:110 }}>
                  {yearOptions.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ marginLeft:'auto',display:'flex',gap:10,alignItems:'flex-end' }}>
                <button onClick={handleRunPayroll} disabled={runningPayroll||totalStaff===0}
                  style={{ padding:'10px 20px',borderRadius:11,border:'none',fontWeight:700,fontSize:13,cursor:(runningPayroll||totalStaff===0)?'not-allowed':'pointer',background:(runningPayroll||totalStaff===0)?'#F1F5F9':'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:(runningPayroll||totalStaff===0)?'#94A3B8':'white' }}>
                  {runningPayroll?'⏳ Processing...':`▶ Run Payroll for ${MONTHS[selMonth-1]} ${selYear}`}
                </button>
                {allPayrollRows.length>0&&(
                  <button onClick={()=>{
                    const data=allPayrollRows.map((r,i)=>({'#':i+1,'Name':r.name,'Type':r.kind==='teaching'?'Teaching':'Non-Teaching','Role':r.role,'Basic':r.basic,'HRA':r.hra,'TA':r.ta,'DA':r.da,'Other':r.other_allowance,'Deductions':r.deductions,'Net Salary':r.net_salary,'Status':r.payment_status}));
                    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb,ws,`Payroll ${MONTHS[selMonth-1]} ${selYear}`);XLSX.writeFile(wb,`Payroll_${MONTHS[selMonth-1]}_${selYear}.xlsx`);
                  }} style={{ padding:'10px 16px',borderRadius:11,border:'1px solid #E2E8F0',fontWeight:700,fontSize:13,cursor:'pointer',background:'white',color:'#64748B',display:'flex',alignItems:'center',gap:6 }}>
                    📥 Export
                  </button>
                )}
              </div>
            </div>
            {runPayrollResult&&(
              <div style={{ marginTop:12,padding:'10px 14px',borderRadius:9,background:'#F0FDF4',border:'1px solid #DCFCE7' }}>
                <p style={{ fontSize:13,color:'#15803D',fontWeight:600,margin:0 }}>{runPayrollResult}</p>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          {payrollLoading?(
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12 }}>
              {[1,2,3,4].map(i=><div key={i} className="skeleton" style={{ height:80,borderRadius:12 }}/>)}
            </div>
          ):(
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12 }}>
              {[
                { label:'Total Payroll',v:fmtL(thisMonthTotal),sub:`${allPayrollRows.length} records`,bg:'#EFF6FF',c:'#1D4ED8' },
                { label:'Gross Earnings',v:fmtL(allPayrollRows.reduce((s,r)=>s+r.basic+r.hra+r.ta+r.da+r.other_allowance,0)),sub:'Before deductions',bg:'#F0FDF4',c:'#16A34A' },
                { label:'Total Deductions',v:fmtL(allPayrollRows.reduce((s,r)=>s+r.deductions,0)),sub:'PF, Tax, etc.',bg:'#FEF2F2',c:'#DC2626' },
                { label:'Paid',v:`${paidPayroll}/${allPayrollRows.length}`,sub:'Released',bg:'#EFF6FF',c:'#6366F1' },
              ].map((c,i)=>(
                <div key={i} style={{ background:c.bg,borderRadius:12,padding:'14px 16px',border:'1px solid #E2E8F0' }}>
                  <p style={{ fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 6px' }}>{c.label}</p>
                  <p style={{ fontSize:22,fontWeight:900,color:c.c,margin:'0 0 2px' }}>{c.v}</p>
                  <p style={{ fontSize:11,color:'#94A3B8',margin:0 }}>{c.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* Payroll Table */}
          <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',overflow:'hidden' }}>
            <div style={{ padding:'16px 20px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10 }}>
              <h3 style={{ fontWeight:700,color:'#0F172A',margin:0 }}>{FULL_MONTHS[selMonth-1]} {selYear} Payroll</h3>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                {[['pending','Pending','#D97706'],['approved','Approved','#16A34A'],['paid','Paid','#1D4ED8']].map(([s,l,c])=>(
                  <span key={s} style={{ fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:99,background:s==='pending'?'#FFFBEB':s==='approved'?'#F0FDF4':'#EFF6FF',color:c }}>
                    {allPayrollRows.filter(r=>r.payment_status===s).length} {l}
                  </span>
                ))}
              </div>
            </div>
            {payrollLoading?(
              <div style={{ padding:'20px',display:'flex',flexDirection:'column',gap:10 }}>
                {[1,2,3].map(i=><div key={i} className="skeleton" style={{ height:56,borderRadius:10 }}/>)}
              </div>
            ):allPayrollRows.length===0?(
              <div style={{ padding:'56px 0',textAlign:'center' }}>
                <p style={{ fontSize:40,marginBottom:12 }}>💰</p>
                <p style={{ fontSize:15,fontWeight:700,color:'#0F172A',margin:0 }}>No payroll for {FULL_MONTHS[selMonth-1]} {selYear}</p>
                <p style={{ fontSize:13,color:'#94A3B8',marginTop:6,margin:'8px auto 0',maxWidth:360 }}>Set salary structures for staff, then click "Run Payroll" to generate records.</p>
              </div>
            ):(
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead><tr style={{ background:'#F8FAFC' }}>
                  {['Name','Type','Basic','Allowances','Deductions','Net','Status','Actions'].map(h=>(
                    <th key={h} style={{ textAlign:'left',padding:'10px 16px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {allPayrollRows.map(r=>(
                    <tr key={r.id} style={{ borderTop:'1px solid #F1F5F9',background:r.kind==='non_teaching'?'#FFFBF5':'white' }}>
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ display:'flex',alignItems:'center',gap:9 }}>
                          <div style={{ width:32,height:32,borderRadius:9,background:r.kind==='non_teaching'?'linear-gradient(135deg,#D97706,#F59E0B)':'linear-gradient(135deg,#6366F1,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'white',flexShrink:0 }}>
                            {r.name.charAt(0)}
                          </div>
                          <div>
                            <p style={{ fontSize:13,fontWeight:600,color:'#0F172A',margin:0 }}>{r.name}</p>
                            <p style={{ fontSize:11,color:'#94A3B8',margin:'1px 0 0',textTransform:'capitalize' }}>{r.role}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:99,background:r.kind==='non_teaching'?'#FFF7ED':'#EEF2FF',color:r.kind==='non_teaching'?'#D97706':'#6366F1' }}>
                          {r.kind==='non_teaching'?'Support':'Teaching'}
                        </span>
                      </td>
                      <td style={{ padding:'12px 16px',fontSize:13,color:'#0F172A',fontWeight:600 }}>{fmt(r.basic)}</td>
                      <td style={{ padding:'12px 16px',fontSize:13,color:'#16A34A',fontWeight:600 }}>{fmt(r.hra+r.ta+r.da+r.other_allowance)}</td>
                      <td style={{ padding:'12px 16px',fontSize:13,color:'#DC2626' }}>{fmt(r.deductions)}</td>
                      <td style={{ padding:'12px 16px',fontSize:14,fontWeight:800,color:'#1E40AF' }}>{fmt(r.net_salary)}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:99,textTransform:'capitalize',...(statusSty[r.payment_status]||statusSty.pending) }}>
                          {r.payment_status}
                        </span>
                      </td>
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                          <button onClick={()=>setShowPayslip(r)} style={{ fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:7,border:'1px solid #E2E8F0',background:'white',color:'#64748B',cursor:'pointer',whiteSpace:'nowrap' }}>📄</button>
                          {r.payment_status==='pending'&&(
                            <button onClick={()=>updatePayrollStatus(r,'approved')} disabled={updatingId===r.id} style={{ fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:7,border:'none',background:'#16A34A',color:'white',cursor:'pointer',whiteSpace:'nowrap',opacity:updatingId===r.id?0.5:1 }}>✓ Approve</button>
                          )}
                          {r.payment_status==='approved'&&(
                            <button onClick={()=>updatePayrollStatus(r,'paid')} disabled={updatingId===r.id} style={{ fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:7,border:'none',background:'#1D4ED8',color:'white',cursor:'pointer',whiteSpace:'nowrap',opacity:updatingId===r.id?0.5:1 }}>Mark Paid</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══ SIMULATOR ════════════════════════════════════════════════════════ */}
      {activeTab === 'simulator' && (
        <div style={{ display:'flex',flexDirection:'column',gap:20 }}>
          <div style={{ background:'linear-gradient(135deg,#F5F3FF,#EFF6FF)',borderRadius:16,border:'1px solid #DDD6FE',padding:'16px 20px',display:'flex',alignItems:'center',gap:12 }}>
            <span style={{ fontSize:24,flexShrink:0 }}>🔮</span>
            <div>
              <p style={{ fontSize:14,fontWeight:700,color:'#5B21B6',margin:0 }}>Payroll Simulator — Scenario Planning</p>
              <p style={{ fontSize:13,color:'#7C3AED',margin:'3px 0 0' }}>Read-only planning tool. <strong>No data is changed.</strong> Explore scenarios before making decisions.</p>
            </div>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
            {/* Inputs */}
            <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:24 }}>
              <h3 style={{ fontSize:15,fontWeight:700,color:'#0F172A',margin:'0 0 20px' }}>Scenario Inputs</h3>
              <div style={{ display:'flex',flexDirection:'column',gap:18 }}>
                {[
                  { label:'Salary Hike %', val:simHike, setter:setSimHike, min:0, max:25, step:0.5, color:'#6366F1', disp:`${simHike}%` },
                  { label:'One-time Bonus per staff', val:simBonus, setter:setSimBonus, min:0, max:50000, step:1000, color:'#16A34A', disp:fmt(simBonus) },
                  { label:'Hypothetical new hires', val:simNewHires, setter:setSimNewHires, min:0, max:20, step:1, color:'#D97706', disp:`${simNewHires}` },
                ].map(s=>(
                  <div key={s.label}>
                    <label style={{ display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:600,color:'#374151',marginBottom:8 }}>
                      <span>{s.label}</span><span style={{ color:s.color,fontWeight:700 }}>{s.disp}</span>
                    </label>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.val} onChange={e=>s.setter(Number(e.target.value))} style={{ width:'100%',accentColor:s.color }}/>
                  </div>
                ))}
                {simNewHires>0&&(
                  <div>
                    <label style={{ display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:600,color:'#374151',marginBottom:8 }}>
                      <span>Avg. salary for new hires</span><span style={{ color:'#D97706',fontWeight:700 }}>{fmt(simAvgSalary)}</span>
                    </label>
                    <input type="range" min={10000} max={100000} step={1000} value={simAvgSalary} onChange={e=>setSimAvgSalary(Number(e.target.value))} style={{ width:'100%',accentColor:'#D97706' }}/>
                  </div>
                )}
              </div>
            </div>
            {/* Results */}
            {(()=>{
              const base = thisMonthTotal>0 ? thisMonthTotal : [...salaryStructures,...staffSalaryStructures].reduce((s,st)=>s+netCalc(st),0);
              const hikeAmt = base*simHike/100;
              const bonusAmt = totalStaff*simBonus;
              const newHireAmt = simNewHires*simAvgSalary;
              const newTotal = base+hikeAmt+bonusAmt+newHireAmt;
              const diff = newTotal-base;
              return (
                <div style={{ background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:24 }}>
                  <h3 style={{ fontSize:15,fontWeight:700,color:'#0F172A',margin:'0 0 20px' }}>Projected Impact</h3>
                  <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                    {[
                      { label:'Current Monthly Payroll', v:fmt(base), c:'#64748B' },
                      { label:`Salary Hike (${simHike}%)`, v:`+ ${fmt(hikeAmt)}`, c:'#6366F1' },
                      { label:`Bonus (${totalStaff} staff × ${fmt(simBonus)})`, v:`+ ${fmt(bonusAmt)}`, c:'#16A34A' },
                      { label:`New Hires (${simNewHires} × ${fmt(simAvgSalary)})`, v:`+ ${fmt(newHireAmt)}`, c:'#D97706' },
                    ].map((row,i)=>(
                      <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'10px 14px',borderRadius:10,background:'#F8FAFC',border:'1px solid #F1F5F9' }}>
                        <span style={{ fontSize:13,color:'#64748B' }}>{row.label}</span>
                        <span style={{ fontSize:13,fontWeight:700,color:row.c }}>{row.v}</span>
                      </div>
                    ))}
                    <div style={{ padding:'14px 16px',borderRadius:12,background:'linear-gradient(135deg,#EFF6FF,#F0FDF4)',border:'1px solid #BFDBFE',marginTop:4 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8 }}>
                        <span style={{ fontSize:14,fontWeight:700,color:'#0F172A' }}>New Monthly Payroll</span>
                        <span style={{ fontSize:16,fontWeight:900,color:'#1E40AF' }}>{fmt(newTotal)}</span>
                      </div>
                      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}>
                        <span style={{ fontSize:13,color:'#64748B' }}>Monthly increase</span>
                        <span style={{ fontSize:13,fontWeight:700,color:diff>0?'#DC2626':'#16A34A' }}>{diff>=0?'+':''}{fmt(diff)}</span>
                      </div>
                      <div style={{ display:'flex',justifyContent:'space-between' }}>
                        <span style={{ fontSize:13,color:'#64748B' }}>Annual impact</span>
                        <span style={{ fontSize:14,fontWeight:800,color:diff*12>0?'#DC2626':'#16A34A' }}>{diff*12>=0?'+':''}{fmt(diff*12)}</span>
                      </div>
                    </div>
                    {base===0&&<p style={{ fontSize:12,color:'#94A3B8',textAlign:'center',margin:0 }}>⚠ Set salary structures or run payroll for accurate baseline.</p>}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {(showAddStaff || editStaff) && (
        <StaffMemberModal
          existing={editStaff}
          schoolId={schoolId}
          createdBy={userId}
          onSave={saved => {
            setStaffMembers(prev => {
              const idx = prev.findIndex(s=>s.id===saved.id);
              if (idx>=0) { const n=[...prev]; n[idx]=saved; return n; }
              return [...prev, saved];
            });
            setShowAddStaff(false); setEditStaff(null);
          }}
          onClose={() => { setShowAddStaff(false); setEditStaff(null); }}
        />
      )}

      {showSalaryFor && (
        <SalaryStructureModal
          staffName={showSalaryFor.full_name}
          staffRole={showSalaryFor.role}
          existing={
            showSalaryFor.type==='teaching'
              ? (salaryStructures.find(s=>s.employee_id===showSalaryFor.id) || null)
              : (staffSalaryStructures.find(s=>s.staff_member_id===showSalaryFor.id) || null)
          }
          onSave={async vals => await saveSalaryStructure(showSalaryFor, vals)}
          onClose={() => setShowSalaryFor(null)}
        />
      )}

      {showPayslip && (
        <PayslipModal row={showPayslip} schoolName={schoolName} onClose={() => setShowPayslip(null)} />
      )}

    </div>
  );
}
