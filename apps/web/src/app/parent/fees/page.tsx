'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParent } from '@/context/ParentContext';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

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
  rollNumber?: number | string | null;
  className: string;
  sectionName: string;
  schoolName: string;
  payments: PaymentRecord[];
}

const P = { fontFamily: "'Inter', sans-serif" };
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function numberToWordsIndian(n: number): string {
  const num = Math.round(Math.abs(n));
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(val: number): string {
    if (val < 20) return ones[val];
    const t = Math.floor(val / 10);
    const u = val % 10;
    return tens[t] + (u > 0 ? ' ' + ones[u] : '');
  }

  function threeDigits(val: number): string {
    const h = Math.floor(val / 100);
    const rem = val % 100;
    let res = '';
    if (h > 0) res += ones[h] + ' Hundred';
    if (rem > 0) res += (res ? ' ' : '') + twoDigits(rem);
    return res;
  }

  const crore = Math.floor(num / 10000000);
  let rem = num % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundreds = rem;

  const parts: string[] = [];
  if (crore > 0) parts.push(threeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(twoDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(twoDigits(thousand) + ' Thousand');
  if (hundreds > 0) parts.push(threeDigits(hundreds));

  return 'Rupees ' + parts.join(' ') + ' Only';
}

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
  const isPaid = fee.status === 'paid' || (totalPaid >= netAmount && netAmount > 0);
  const receiptNo = `RCP-${fee.id.slice(-8).toUpperCase()}`;
  const printDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const feeName = (fee.fee_structures as any)?.name || 'Tuition / Educational Fee';

  const sc = statusCfg[fee.status] || { bg: '#F1F5F9', color: '#64748B', label: fee.status, dot: '#94A3B8' };

  const handlePrint = () => {
    const printContents = printRef.current?.innerHTML;
    if (!printContents) return;
    const win = window.open('', '_blank', 'width=780,height=960');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fee Receipt — ${receiptNo}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:'Inter',sans-serif; background:white; padding:24px; color:#0F172A; }
            table { width:100%; border-collapse:collapse; }
            @media print {
              body { padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
              @page { margin:12mm; size:A4 portrait; }
            }
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
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.75)', backdropFilter:'blur(6px)' }}>
      <div style={{ width:'100%', maxWidth:640, background:'white', borderRadius:16, boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        {/* Modal header */}
        <div style={{ padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #E2E8F0', background:'#F8FAFC' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>🧾</span>
            <span style={{ fontWeight:800, color:'#0F172A', fontSize:14 }}>Official Fee Receipt</span>
            <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, background:'#EFF6FF', color:'#1E3A8A', padding:'2px 8px', borderRadius:4 }}>{receiptNo}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'none', background:'#0F2744', color:'white', fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 6px rgba(15,39,68,0.25)' }}>
              🖨️ Print Voucher
            </button>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>

        {/* Scrollable receipt area */}
        <div style={{ overflowY:'auto', padding:'20px 24px', background:'#F1F5F9' }}>
          <div ref={printRef}>
            {/* Formal Institutional Voucher Document */}
            <div style={{ fontFamily:"'Inter',sans-serif", background:'white', maxWidth:580, margin:'0 auto', border:'2px solid #0F2744', borderRadius:8, padding:'24px 28px', color:'#0F172A', boxShadow:'0 4px 16px rgba(0,0,0,0.06)' }}>

              {/* Institutional Letterhead Header */}
              <div style={{ textAlign:'center', borderBottom:'2px solid #0F2744', paddingBottom:12, marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:10, marginBottom:4 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'#0F2744', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:17, fontFamily:'serif' }}>
                    🏛
                  </div>
                  <div>
                    <h1 style={{ fontFamily:"Georgia, 'Times New Roman', serif", fontSize:19, fontWeight:900, color:'#0F2744', textTransform:'uppercase', letterSpacing:'0.04em', margin:0 }}>
                      {data.schoolName || 'INSTITUTION OF EDUCATION'}
                    </h1>
                    <p style={{ fontSize:10, fontWeight:700, color:'#475569', letterSpacing:'0.08em', textTransform:'uppercase', margin:'2px 0 0' }}>
                      Affiliated Educational Institution · Central Accounts Department
                    </p>
                  </div>
                </div>
                <div style={{ display:'inline-block', marginTop:6, padding:'4px 16px', background:'#0F2744', color:'white', borderRadius:4, fontSize:10, fontWeight:800, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                  Fee Receipt / Payment Voucher [ Parent Copy ]
                </div>
              </div>

              {/* Metadata Grid */}
              <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:14, border:'1px solid #CBD5E1', fontSize:11 }}>
                <tbody>
                  <tr style={{ background:'#F8FAFC' }}>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', width:'22%', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:9 }}>Receipt No.</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', width:'28%', fontWeight:800, fontFamily:'monospace', color:'#0F172A' }}>{receiptNo}</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', width:'22%', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:9 }}>Date of Issue</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', width:'28%', fontWeight:700, color:'#0F172A' }}>{printDate}</td>
                  </tr>
                  <tr>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:9 }}>Student Name</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:800, color:'#0F172A', textTransform:'uppercase' }}>{data.studentName}</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:9 }}>Roll Number</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:800, color:'#0F172A' }}>{data.rollNumber ?? '—'}</td>
                  </tr>
                  <tr style={{ background:'#F8FAFC' }}>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:9 }}>Class &amp; Section</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:700, color:'#0F172A' }}>{data.className} — {data.sectionName}</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:9 }}>Payment Status</td>
                    <td style={{ padding:'6px 10px', border:'1px solid #E2E8F0' }}>
                      <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:800, textTransform:'uppercase', background:sc.bg, color:sc.color, border:`1px solid ${sc.color}40` }}>
                        {sc.label}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Itemized Fee Heads Table */}
              <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12, border:'1px solid #94A3B8', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'#0F2744', color:'white', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                    <th style={{ padding:'7px 10px', border:'1px solid #0F2744', width:'8%', textAlign:'center' }}>#</th>
                    <th style={{ padding:'7px 10px', border:'1px solid #0F2744' }}>Fee Particulars / Head</th>
                    <th style={{ padding:'7px 10px', border:'1px solid #0F2744', textAlign:'right', width:'22%' }}>Assessed Fee</th>
                    <th style={{ padding:'7px 10px', border:'1px solid #0F2744', textAlign:'right', width:'22%' }}>Paid Amount</th>
                    <th style={{ padding:'7px 10px', border:'1px solid #0F2744', textAlign:'right', width:'22%' }}>Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'center', color:'#64748B' }}>01</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', fontWeight:700, color:'#0F172A' }}>{feeName}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:600 }}>{fmt(fee.amount)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:700, color:'#15803D' }}>{fmt(totalPaid)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:700, color: balance > 0 ? '#DC2626' : '#15803D' }}>{fmt(balance)}</td>
                  </tr>
                  {fee.discount_amount > 0 && (
                    <tr style={{ background:'#FEF3C7' }}>
                      <td style={{ padding:'5px 10px', border:'1px solid #CBD5E1', textAlign:'center', color:'#92400E' }}>—</td>
                      <td style={{ padding:'5px 10px', border:'1px solid #CBD5E1', fontWeight:600, color:'#92400E' }}>Institutional Concession / Discount</td>
                      <td style={{ padding:'5px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:600, color:'#92400E' }}>- {fmt(fee.discount_amount)}</td>
                      <td style={{ padding:'5px 10px', border:'1px solid #CBD5E1', textAlign:'right' }}>—</td>
                      <td style={{ padding:'5px 10px', border:'1px solid #CBD5E1', textAlign:'right' }}>—</td>
                    </tr>
                  )}
                  <tr style={{ background:'#F1F5F9', fontWeight:800, borderTop:'2px solid #0F2744' }}>
                    <td colSpan={2} style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', textTransform:'uppercase', fontSize:10, letterSpacing:'0.04em' }}>Grand Total (INR):</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right' }}>{fmt(netAmount)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', color:'#15803D' }}>{fmt(totalPaid)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', color: balance > 0 ? '#DC2626' : '#15803D' }}>{fmt(balance)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Amount in Words Box */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:4, padding:'7px 12px', marginBottom:12 }}>
                <p style={{ margin:0, fontSize:10.5, color:'#475569', lineHeight:1.5 }}>
                  <strong>Amount Received in Words:</strong>{' '}
                  <span style={{ color:'#0F172A', fontWeight:700 }}>{numberToWordsIndian(totalPaid)}</span>
                </p>
                {balance > 0 && (
                  <p style={{ margin:'3px 0 0', fontSize:10.5, color:'#DC2626', lineHeight:1.5 }}>
                    <strong>Outstanding Balance Payable:</strong>{' '}
                    <span style={{ fontWeight:700 }}>{numberToWordsIndian(balance)}</span>
                  </p>
                )}
              </div>

              {/* Payment Records Breakdown */}
              {data.payments.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <p style={{ fontSize:9.5, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 5px' }}>
                    Payment Audit Trail &amp; Transaction Details
                  </p>
                  <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #CBD5E1', fontSize:10.5 }}>
                    <thead>
                      <tr style={{ background:'#F8FAFC', color:'#475569', textAlign:'left', fontSize:9.5, textTransform:'uppercase' }}>
                        <th style={{ padding:'5px 8px', border:'1px solid #CBD5E1', width:'6%', textAlign:'center' }}>#</th>
                        <th style={{ padding:'5px 8px', border:'1px solid #CBD5E1', width:'22%' }}>Payment Date</th>
                        <th style={{ padding:'5px 8px', border:'1px solid #CBD5E1', width:'20%' }}>Mode</th>
                        <th style={{ padding:'5px 8px', border:'1px solid #CBD5E1' }}>Reference / Remarks</th>
                        <th style={{ padding:'5px 8px', border:'1px solid #CBD5E1', textAlign:'right', width:'22%' }}>Amount Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p, idx) => (
                        <tr key={p.id}>
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', textAlign:'center', color:'#64748B' }}>{idx + 1}</td>
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', color:'#0F172A' }}>{new Date(p.payment_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</td>
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', fontWeight:600, textTransform:'uppercase', color:'#1E3A8A' }}>{p.payment_mode.replace('_',' ')}</td>
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', color:'#64748B' }}>{p.notes || 'Institutional Payment Counter'}</td>
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', textAlign:'right', fontWeight:700, color:'#15803D' }}>{fmt(p.amount_paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Three-Column Formal Signatures & Stamp Area */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginTop:20, paddingTop:12, borderTop:'1px solid #E2E8F0', textAlign:'center' }}>
                <div>
                  <div style={{ height:38 }} />
                  <div style={{ borderTop:'1px dashed #64748B', width:'85%', margin:'0 auto 4px' }} />
                  <p style={{ fontSize:9.5, fontWeight:700, color:'#0F172A', textTransform:'uppercase', margin:0 }}>Parent / Depositor</p>
                  <p style={{ fontSize:8.5, color:'#94A3B8', margin:'1px 0 0' }}>Signature</p>
                </div>
                <div>
                  <div style={{ height:38 }} />
                  <div style={{ borderTop:'1px dashed #64748B', width:'85%', margin:'0 auto 4px' }} />
                  <p style={{ fontSize:9.5, fontWeight:700, color:'#0F172A', textTransform:'uppercase', margin:0 }}>Accounts Officer</p>
                  <p style={{ fontSize:8.5, color:'#94A3B8', margin:'1px 0 0' }}>Bursar Wing</p>
                </div>
                <div>
                  <div style={{ width:64, height:34, border:'1px dashed #94A3B8', borderRadius:4, margin:'0 auto 4px', display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', fontSize:7.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    [ SEAL ]
                  </div>
                  <div style={{ borderTop:'1px solid #0F172A', width:'85%', margin:'0 auto 4px' }} />
                  <p style={{ fontSize:9.5, fontWeight:800, color:'#0F172A', textTransform:'uppercase', margin:0 }}>Principal / Director</p>
                  <p style={{ fontSize:8.5, color:'#94A3B8', margin:'1px 0 0' }}>Authorized Signatory</p>
                </div>
              </div>

              {/* Footer Terms */}
              <div style={{ marginTop:14, paddingTop:8, borderTop:'1px solid #E2E8F0', fontSize:8.5, color:'#94A3B8', lineHeight:1.4 }}>
                <p style={{ margin:0 }}><strong>Notice:</strong> 1. Payments are subject to realization. 2. Fees once paid are non-refundable &amp; non-transferable under institutional policy. 3. This official voucher is generated via NxtStepEdu Central School Management System.</p>
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

    // Auto-flip pending→overdue for this student's fees where due_date has passed
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('fees')
      .update({ status: 'overdue' })
      .eq('student_id', studentId)
      .eq('status', 'pending')
      .lt('due_date', today);

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

  useRealtimeTable('fees', selectedChild?.student_id ? `student_id=eq.${selectedChild.student_id}` : null, fetchFees);
  // We can't easily filter fee_payments by student_id via postgres_changes since fee_payments only has fee_id.
  // We can either listen to all fee_payments (no filter) or not. Let's just listen to all and let it trigger a re-fetch.
  useRealtimeTable('fee_payments', null, fetchFees);

  // Compute actual due from live payment data — do NOT trust the stale DB status field
  const totalPending = fees.reduce((a, f) => {
    const netAmt = f.amount - (f.discount_amount || 0);
    const actualDue = Math.max(0, netAmt - (f.amount_paid || 0));
    return a + actualDue;
  }, 0);
  const totalPaid = fees.reduce((a, f) => a + (f.amount_paid || 0), 0);
  const nextDue = fees.find(f => {
    const netAmt = f.amount - (f.discount_amount || 0);
    return Math.max(0, netAmt - (f.amount_paid || 0)) > 0 && f.due_date;
  });

  // Helper: derive correct status from payment totals
  function deriveStatus(f: Fee): string {
    const netAmt = f.amount - (f.discount_amount || 0);
    const paid = f.amount_paid || 0;
    if (paid <= 0) return f.status ?? 'pending'; // keep pending/overdue from DB
    if (paid >= netAmt) return 'paid';
    return 'partially_paid';
  }

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
      rollNumber: selectedChild.roll_number ?? null,
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
            const paid = f.amount_paid || 0;
            const actualDue = Math.max(0, netAmount - paid);
            const derivedStatus = deriveStatus(f);
            const cfg = statusCfg[derivedStatus] || statusCfg.pending;
            const dueDate = f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
            const canPrint = paid > 0; // show receipt whenever any payment exists
            return (
              <div key={f.id} style={{ background: 'white', borderRadius: 18, padding: '20px 24px', border: '1px solid #E8ECF0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, border: `1px solid ${cfg.dot}33` }}>💳</div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{(f.fee_structures as any)?.name || 'Fee'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      {(f.fee_structures as any)?.fee_type && <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'capitalize' }}>{(f.fee_structures as any).fee_type.replace('_', ' ')}</span>}
                      {dueDate && <span style={{ fontSize: 11, color: '#64748B' }}>Due: {dueDate}</span>}
                      {f.payment_date && <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>Last paid: {new Date(f.payment_date).toLocaleDateString('en-IN')}</span>}
                      {(f.discount_amount ?? 0) > 0 && <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>Discount: {fmt(f.discount_amount)}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 20, fontWeight: 900, color: '#1E40AF', letterSpacing: '-0.02em', margin: 0 }}>{fmt(netAmount)}</p>
                    {paid > 0 && (
                      <p style={{ fontSize: 12, fontWeight: 600, margin: '2px 0 0', color: actualDue > 0 ? '#DC2626' : '#16A34A' }}>
                        {fmt(paid)} paid{actualDue > 0 ? ` · ${fmt(actualDue)} remaining` : ' · Fully paid'}
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
                  {actualDue > 0 && (
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
