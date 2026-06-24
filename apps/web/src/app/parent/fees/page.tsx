'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParent } from '@/context/ParentContext';

interface Fee {
  id: string;
  amount: number;
  discount_amount: number;
  status: string;
  due_date: string | null;
  fee_structures: { name: string; fee_type: string } | null;
  payment_date?: string | null;
  amount_paid?: number;
}

interface PaymentRecord {
  id: string;
  amount_paid: number;
  payment_mode: string;
  payment_date: string;
  notes: string | null;
}

interface ReceiptData {
  fee: Fee;
  studentName: string;
  className: string;
  sectionName: string;
  schoolName: string;
  payments: PaymentRecord[];
}

const P = { fontFamily: "'Inter', sans-serif" };
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const statusCfg: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  paid:            { bg: '#F0FDF4', color: '#16A34A', label: 'Paid',           dot: '#22C55E' },
  pending:         { bg: '#FFFBEB', color: '#D97706', label: 'Pending',        dot: '#F59E0B' },
  overdue:         { bg: '#FEF2F2', color: '#DC2626', label: 'Overdue',        dot: '#EF4444' },
  partially_paid:  { bg: '#EFF6FF', color: '#2563EB', label: 'Partially Paid', dot: '#60A5FA' },
  waived:          { bg: '#F5F3FF', color: '#7C3AED', label: 'Waived',         dot: '#A78BFA' },
};

// ─── Receipt Modal ────────────────────────────────────────────────────────────
function FeeReceiptModal({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const fee = data.fee;
  const netAmount = fee.amount - (fee.discount_amount || 0);
  const totalPaid = data.payments.reduce((s, p) => s + p.amount_paid, 0);
  const balance = Math.max(0, netAmount - totalPaid);
  const isPaid = fee.status === 'paid';
  const receiptNo = `RCP-${fee.id.slice(-8).toUpperCase()}`;
  const printDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const printContents = printRef.current?.innerHTML;
    if (!printContents) return;
    const win = window.open('', '_blank', 'width=700,height=900');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fee Receipt — ${receiptNo}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:'Inter',sans-serif; background:white; padding:32px; }
            @media print { body { padding:0; } @page { margin:20mm; } }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.7)', backdropFilter:'blur(6px)' }}>
      <div style={{ width:'100%', maxWidth:580, background:'white', borderRadius:20, boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        {/* Modal header */}
        <div style={{ padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #E8ECF0', background:'#F8FAFC' }}>
          <p style={{ fontWeight:800, color:'#0F172A', fontSize:15, margin:0 }}>🧾 Fee Receipt</p>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)' }}>
              🖨️ Print
            </button>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>

        {/* Scrollable receipt area */}
        <div style={{ overflowY:'auto', padding:24 }}>
          <div ref={printRef}>
            {/* Receipt */}
            <div style={{ fontFamily:"'Inter',sans-serif", background:'white', maxWidth:520, margin:'0 auto', border:'1px solid #E2E8F0', borderRadius:14, overflow:'hidden' }}>

              {/* Header stripe */}
              <div style={{ background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', padding:'24px 28px', color:'white', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:-20, right:-20, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
                <div style={{ position:'absolute', bottom:-30, left:60, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }} />
                <p style={{ fontSize:20, fontWeight:900, margin:'0 0 2px', letterSpacing:'-0.02em' }}>🏫 {data.schoolName}</p>
                <p style={{ fontSize:12, opacity:0.75, margin:0 }}>Official Fee Receipt</p>
                <div style={{ marginTop:16, display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
                  <div>
                    <p style={{ fontSize:10, opacity:0.65, margin:'0 0 2px', textTransform:'uppercase', letterSpacing:'0.06em' }}>Student</p>
                    <p style={{ fontSize:15, fontWeight:800, margin:0 }}>{data.studentName}</p>
                    <p style={{ fontSize:12, opacity:0.8, margin:'2px 0 0' }}>{data.className} — {data.sectionName}</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:10, opacity:0.65, margin:'0 0 2px', textTransform:'uppercase', letterSpacing:'0.06em' }}>Receipt No.</p>
                    <p style={{ fontSize:13, fontWeight:800, fontFamily:'monospace', margin:0 }}>{receiptNo}</p>
                    <p style={{ fontSize:11, opacity:0.75, margin:'2px 0 0' }}>Printed: {printDate}</p>
                  </div>
                </div>
              </div>

              {/* WATERMARK */}
              <div style={{ position:'relative', padding:'22px 28px', borderBottom:'1px dashed #E2E8F0' }}>
                <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%) rotate(-30deg)', fontSize:72, fontWeight:900, color:isPaid ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)', letterSpacing:4, pointerEvents:'none', userSelect:'none', whiteSpace:'nowrap' }}>
                  {isPaid ? 'PAID' : 'PARTIAL'}
                </div>
                <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 14px' }}>Fee Details</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {[
                    ['Fee Name', (fee.fee_structures as any)?.name || 'Fee'],
                    ['Fee Type', (fee.fee_structures as any)?.fee_type?.replace('_',' ') || '—'],
                    ['Gross Amount', fmt(fee.amount)],
                    ...(fee.discount_amount > 0 ? [['Discount', `- ${fmt(fee.discount_amount)}`]] : []),
                    ['Net Amount', fmt(netAmount)],
                    ...(fee.due_date ? [['Due Date', new Date(fee.due_date).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})]] : []),
                  ].map(([label, value]) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, color:'#64748B' }}>{label}</span>
                      <span style={{ fontSize:13, fontWeight:700, color: label === 'Net Amount' ? '#0F172A' : label === 'Discount' ? '#7C3AED' : '#1E293B' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment records */}
              {data.payments.length > 0 && (
                <div style={{ padding:'18px 28px', borderBottom:'1px dashed #E2E8F0' }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 12px' }}>Payment History</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {data.payments.map((p, i) => (
                      <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#F8FAFC', borderRadius:8, border:'1px solid #F1F5F9' }}>
                        <div>
                          <p style={{ fontSize:12, fontWeight:700, color:'#0F172A', margin:0 }}>Payment #{i + 1}</p>
                          <p style={{ fontSize:11, color:'#94A3B8', margin:'2px 0 0', textTransform:'capitalize' }}>{p.payment_mode.replace('_',' ')} · {new Date(p.payment_date).toLocaleDateString('en-IN')}</p>
                          {p.notes && <p style={{ fontSize:10, color:'#CBD5E1', margin:'2px 0 0' }}>{p.notes}</p>}
                        </div>
                        <p style={{ fontSize:14, fontWeight:800, color:'#16A34A', margin:0 }}>{fmt(p.amount_paid)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={{ padding:'18px 28px', background:'#F8FAFC' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'#64748B' }}>Total Paid</span>
                  <span style={{ fontSize:15, fontWeight:800, color:'#16A34A' }}>{fmt(totalPaid)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <span style={{ fontSize:13, color:'#64748B' }}>Balance Due</span>
                  <span style={{ fontSize:15, fontWeight:800, color: balance > 0 ? '#DC2626' : '#16A34A' }}>{fmt(balance)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:12, borderTop:'1px solid #E2E8F0' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>Status</span>
                  <span style={{ padding:'5px 14px', borderRadius:99, fontSize:12, fontWeight:800,
                    background: statusCfg[fee.status]?.bg || '#F1F5F9',
                    color: statusCfg[fee.status]?.color || '#64748B' }}>
                    {statusCfg[fee.status]?.label || fee.status}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:'12px 28px', borderTop:'1px solid #E2E8F0', background:'white', textAlign:'center' }}>
                <p style={{ fontSize:10, color:'#CBD5E1', margin:0 }}>This is a computer-generated receipt and does not require a physical signature.</p>
                <p style={{ fontSize:10, color:'#CBD5E1', margin:'3px 0 0' }}>NxtStepEdu School Management System</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ParentFeesPage() {
  const supabase = createClient();
  const { selectedChild, loading: childLoading } = useParent();
  const [fees, setFees] = useState<Fee[]>([]);
  const [feePayments, setFeePayments] = useState<Record<string, PaymentRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [schoolName, setSchoolName] = useState('Your School');

  const studentName = selectedChild?.student_name || '';

  const fetchFees = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    const studentId = selectedChild.student_id;

    // Fetch school name
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: profile } = await supabase.from('users').select('school_id').eq('id', userData.user.id).single();
      if (profile?.school_id) {
        const { data: school } = await supabase.from('schools').select('name').eq('id', profile.school_id).single();
        if (school?.name) setSchoolName(school.name);
      }
    }

    const { data } = await supabase
      .from('fees').select('id, amount, discount_amount, status, due_date, fee_structures(name, fee_type)')
      .eq('student_id', studentId).order('due_date', { ascending: false });

    if (data) {
      const feeIds = (data as any[]).map(f => f.id);
      const { data: payments } = feeIds.length > 0
        ? await supabase.from('fee_payments').select('id, fee_id, amount_paid, payment_mode, payment_date, notes').in('fee_id', feeIds).order('payment_date', { ascending: false })
        : { data: [] };

      // Group payments per fee
      const pmByFee: Record<string, PaymentRecord[]> = {};
      const pmTotals: Record<string, { total_paid: number; last_date: string | null }> = {};
      (payments ?? []).forEach((p: any) => {
        if (!pmTotals[p.fee_id]) pmTotals[p.fee_id] = { total_paid: 0, last_date: null };
        pmTotals[p.fee_id].total_paid += (p.amount_paid || 0);
        if (!pmTotals[p.fee_id].last_date || p.payment_date > pmTotals[p.fee_id].last_date!) {
          pmTotals[p.fee_id].last_date = p.payment_date;
        }
        if (!pmByFee[p.fee_id]) pmByFee[p.fee_id] = [];
        pmByFee[p.fee_id].push({ id: p.id, amount_paid: p.amount_paid, payment_mode: p.payment_mode, payment_date: p.payment_date, notes: p.notes });
      });
      setFeePayments(pmByFee);

      setFees((data as any[]).map(f => ({
        ...f,
        amount_paid:  pmTotals[f.id]?.total_paid  ?? 0,
        payment_date: pmTotals[f.id]?.last_date   ?? null,
      })));
    }
    setLoading(false);
  }, [supabase, selectedChild]);

  useEffect(() => {
    if (!childLoading && selectedChild) fetchFees();
    else if (!childLoading && !selectedChild) setLoading(false);
  }, [fetchFees, selectedChild, childLoading]);

  const totalPending = fees
    .filter(f => f.status === 'pending' || f.status === 'overdue' || f.status === 'partially_paid')
    .reduce((a, f) => a + Math.max(0, (f.amount - (f.discount_amount || 0)) - (f.amount_paid || 0)), 0);
  const totalPaid = fees.reduce((a, f) => a + (f.amount_paid || 0), 0);
  const nextDue = fees.find(f => (f.status === 'pending' || f.status === 'partially_paid') && f.due_date);

  const summaryCards = [
    { label: 'Total Pending', value: fmt(totalPending), color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '⚠️' },
    { label: 'Paid This Year', value: fmt(totalPaid),   color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: '✅' },
    { label: 'Next Due Date',  value: nextDue?.due_date ? new Date(nextDue.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: '📅' },
  ];

  function openReceipt(fee: Fee) {
    if (!selectedChild) return;
    setReceipt({
      fee,
      studentName: selectedChild.student_name,
      className: selectedChild.class_name,
      sectionName: selectedChild.section_name,
      schoolName,
      payments: feePayments[fee.id] || [],
    });
  }

  return (
    <div style={{ ...P, display: 'flex', flexDirection: 'column', gap: 32 }}>
      {receipt && <FeeReceiptModal data={receipt} onClose={() => setReceipt(null)} />}

      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Fee Management</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>
          {studentName ? `Fee dues and payment history for ${studentName}` : 'View dues and payment history'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="stat-cards-container">
        {loading
          ? [1,2,3].map(i => <div key={i} style={{ height: 96, background: '#F8FAFC', borderRadius: 18, border: '1px solid #F1F5F9' }} />)
          : summaryCards.map((c, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 18, padding: '22px 24px', border: `1px solid ${c.border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{c.label}</p>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
              </div>
              <p style={{ fontSize: 26, fontWeight: 900, color: c.color, letterSpacing: '-0.02em', margin: 0 }}>{c.value}</p>
            </div>
          ))
        }
      </div>

      {/* Fee List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>Fee Records</h3>
        {loading
          ? [1,2,3].map(i => <div key={i} style={{ height: 80, background: '#F8FAFC', borderRadius: 16, border: '1px solid #F1F5F9' }} />)
          : fees.length === 0
          ? (
            <div style={{ background: 'white', borderRadius: 20, padding: '56px 32px', textAlign: 'center', border: '1px solid #E8ECF0' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>✅</p>
              <p style={{ fontWeight: 700, color: '#475569', fontSize: 16, margin: '0 0 6px' }}>No fee records found</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Fee records will appear here once your school creates fee structures</p>
            </div>
          )
          : fees.map(f => {
            const netAmount = f.amount - (f.discount_amount || 0);
            const cfg = statusCfg[f.status] || statusCfg.pending;
            const dueDate = f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
            const canPrint = f.status === 'paid' || f.status === 'partially_paid';
            return (
              <div key={f.id} style={{ background: 'white', borderRadius: 18, padding: '20px 24px', border: '1px solid #E8ECF0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, border: `1px solid ${cfg.dot}33` }}>💳</div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{(f.fee_structures as any)?.name || 'Fee'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      {(f.fee_structures as any)?.fee_type && <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'capitalize' }}>{(f.fee_structures as any).fee_type.replace('_', ' ')}</span>}
                      {dueDate && <span style={{ fontSize: 11, color: '#64748B' }}>Due: {dueDate}</span>}
                      {f.payment_date && <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>Paid: {new Date(f.payment_date).toLocaleDateString('en-IN')}</span>}
                      {(f.discount_amount ?? 0) > 0 && <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>Discount: {fmt(f.discount_amount)}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 20, fontWeight: 900, color: '#1E40AF', letterSpacing: '-0.02em', margin: 0 }}>{fmt(netAmount)}</p>
                    {((f.amount_paid || 0) > 0) && f.status !== 'paid' && (
                      <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 600, margin: '2px 0 0' }}>
                        {fmt(f.amount_paid || 0)} paid · {fmt(Math.max(0, f.amount - (f.discount_amount||0) - (f.amount_paid || 0)))} remaining
                      </p>
                    )}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.dot}44`, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                    {cfg.label}
                  </span>
                  {canPrint && (
                    <button
                      onClick={() => openReceipt(f)}
                      style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid #DBEAFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display:'flex', alignItems:'center', gap:5, transition:'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#DBEAFE'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='#EFF6FF'; }}
                    >
                      🖨️ Receipt
                    </button>
                  )}
                  {(f.status === 'pending' || f.status === 'overdue') && (
                    <button style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124,58,237,0.3)', whiteSpace: 'nowrap' }}>
                      Pay Now
                    </button>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
