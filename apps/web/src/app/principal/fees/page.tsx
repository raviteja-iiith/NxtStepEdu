'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createNotification } from '@/components/NotificationBell';
import * as XLSX from 'xlsx';

// ─── Number to Words (Indian System) Helper ────────────────────────────────────
export function numberToWordsIndian(n: number): string {
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

export function mapFeeType(label: string): string {
  const l = (label || '').toLowerCase();
  if (l.includes('transport') || l.includes('bus') || l.includes('van') || l.includes('cab')) return 'transport';
  if (l.includes('hostel') || l.includes('mess') || l.includes('boarding')) return 'hostel';
  if (l.includes('exam') || l.includes('assessment') || l.includes('test')) return 'examination';
  if (l.includes('activity') || l.includes('sports') || l.includes('event') || l.includes('annual') || l.includes('cultural')) return 'activity';
  if (l.includes('lib') || l.includes('book')) return 'library';
  if (l.includes('uniform') || l.includes('dress') || l.includes('attire')) return 'uniform';
  if (l.includes('tuition') || l.includes('term') || l.includes('admission') || l.includes('coaching') || l.includes('course')) return 'tuition';
  return 'miscellaneous';
}

export const STANDARD_FEE_CATEGORIES = [
  'Tuition Fee',
  'Term 1 Fee',
  'Term 2 Fee',
  'Term 3 Fee',
  'Examination Fee',
  'Admission Fee',
  'Transport Fee',
  'Hostel / Boarding Fee',
  'Laboratory & Computer Fee',
  'Books & Stationery Fee',
  'Uniform & Attire Fee',
  'Special Coaching Fee',
  'Annual / Development Fee',
  'Miscellaneous Fee',
  'Custom Label...',
];

async function getOrCreateFeeStructure(supabase: any, schoolId: string, classId: string, label: string): Promise<string | null> {
  const cleanLabel = (label || '').trim() || 'Tuition Fee';
  try {
    let query = supabase
      .from('fee_structures')
      .select('id')
      .eq('school_id', schoolId)
      .ilike('name', cleanLabel);

    if (classId) {
      query = query.or(`class_id.eq.${classId},class_id.is.null`);
    }
    const { data: existing } = await query.limit(1);
    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    const feeType = mapFeeType(cleanLabel);
    const { data: inserted, error } = await supabase
      .from('fee_structures')
      .insert({
        school_id: schoolId,
        class_id: classId || null,
        name: cleanLabel,
        fee_type: feeType,
        amount: 0,
      })
      .select('id')
      .single();

    if (error) {
      const { data: fallback } = await supabase
        .from('fee_structures')
        .select('id')
        .eq('school_id', schoolId)
        .ilike('name', cleanLabel)
        .limit(1);
      return fallback?.[0]?.id ?? null;
    }
    return inserted?.id ?? null;
  } catch (err) {
    console.error('Error resolving fee structure:', err);
    return null;
  }
}

// ─── Fee Receipt Modal ────────────────────────────────────────────────────────
interface ReceiptInfo {
  feeId: string;
  feeAmount: number;
  feePaid: number;
  feeDue: number;
  feeStatus: string;
  studentName: string;
  rollNumber?: number | string | null;
  feeName?: string | null;
  academicYear?: string | null;
  className: string;
  sectionName: string;
  schoolName: string;
  payments: { id: string; amount_paid: number; payment_mode: string; payment_date: string; notes: string | null }[];
}

function PrincipalFeeReceiptModal({ data, onClose }: { data: ReceiptInfo; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const receiptNo = `RCP-${data.feeId.slice(-8).toUpperCase()}`;
  const printDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmt2 = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const statusMap: Record<string, { bg: string; color: string; label: string }> = {
    paid:           { bg: '#DCFCE7', color: '#15803D', label: 'Paid' },
    partially_paid: { bg: '#FEF9C3', color: '#A16207', label: 'Partially Paid' },
    pending:        { bg: '#FEF2F2', color: '#DC2626', label: 'Pending' },
    overdue:        { bg: '#FEE2E2', color: '#991B1B', label: 'Overdue' },
  };
  const sc = statusMap[data.feeStatus] ?? { bg: '#F1F5F9', color: '#64748B', label: data.feeStatus };
  const feeName = data.feeName || 'Tuition / Educational Fee';

  const handlePrint = () => {
    const contents = printRef.current?.innerHTML;
    if (!contents) return;
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
        <body>${contents}</body>
      </html>
    `);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.75)', backdropFilter:'blur(6px)' }}>
      <div style={{ width:'100%', maxWidth:640, background:'white', borderRadius:16, boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        {/* Modal action bar */}
        <div style={{ padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #E2E8F0', background:'#F8FAFC' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>🧾</span>
            <span style={{ fontWeight:800, color:'#0F172A', fontSize:14 }}>Official Institutional Fee Receipt</span>
            <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, background:'#EFF6FF', color:'#1E3A8A', padding:'2px 8px', borderRadius:4 }}>{receiptNo}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'none', background:'#0F2744', color:'white', fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 6px rgba(15,39,68,0.25)' }}>
              🖨️ Print Voucher
            </button>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>

        {/* Scrollable receipt sheet */}
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
                  Fee Receipt / Payment Voucher [ Accounts Copy ]
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
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:600 }}>{fmt2(data.feeAmount)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:700, color:'#15803D' }}>{fmt2(data.feePaid)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', fontWeight:700, color: data.feeDue > 0 ? '#DC2626' : '#15803D' }}>{fmt2(data.feeDue)}</td>
                  </tr>
                  <tr style={{ background:'#F1F5F9', fontWeight:800, borderTop:'2px solid #0F2744' }}>
                    <td colSpan={2} style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', textTransform:'uppercase', fontSize:10, letterSpacing:'0.04em' }}>Grand Total (INR):</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right' }}>{fmt2(data.feeAmount)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', color:'#15803D' }}>{fmt2(data.feePaid)}</td>
                    <td style={{ padding:'7px 10px', border:'1px solid #CBD5E1', textAlign:'right', color: data.feeDue > 0 ? '#DC2626' : '#15803D' }}>{fmt2(data.feeDue)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Amount in Words Box */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:4, padding:'7px 12px', marginBottom:12 }}>
                <p style={{ margin:0, fontSize:10.5, color:'#475569', lineHeight:1.5 }}>
                  <strong>Amount Received in Words:</strong>{' '}
                  <span style={{ color:'#0F172A', fontWeight:700 }}>{numberToWordsIndian(data.feePaid)}</span>
                </p>
                {data.feeDue > 0 && (
                  <p style={{ margin:'3px 0 0', fontSize:10.5, color:'#DC2626', lineHeight:1.5 }}>
                    <strong>Outstanding Balance Remaining:</strong>{' '}
                    <span style={{ fontWeight:700 }}>{numberToWordsIndian(data.feeDue)}</span>
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
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', color:'#64748B' }}>{p.notes || 'Counter Payment'}</td>
                          <td style={{ padding:'5px 8px', border:'1px solid #E2E8F0', textAlign:'right', fontWeight:700, color:'#15803D' }}>{fmt2(p.amount_paid)}</td>
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
                  <p style={{ fontSize:9.5, fontWeight:700, color:'#0F172A', textTransform:'uppercase', margin:0 }}>Student / Depositor</p>
                  <p style={{ fontSize:8.5, color:'#94A3B8', margin:'1px 0 0' }}>Signature</p>
                </div>
                <div>
                  <div style={{ height:38 }} />
                  <div style={{ borderTop:'1px dashed #64748B', width:'85%', margin:'0 auto 4px' }} />
                  <p style={{ fontSize:9.5, fontWeight:700, color:'#0F172A', textTransform:'uppercase', margin:0 }}>Cashier / Bursar</p>
                  <p style={{ fontSize:8.5, color:'#94A3B8', margin:'1px 0 0' }}>Accounts Department</p>
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
                <p style={{ margin:0 }}><strong>Notice:</strong> 1. Receipts are issued subject to fund realization. 2. Fees once paid are non-refundable &amp; non-transferable under institutional rules. 3. This computer-generated voucher serves as official financial record.</p>
                <p style={{ margin:'3px 0 0', textAlign:'center', letterSpacing:'0.04em' }}>NxtStepEdu Central School Management System · Institutional Accounts Ledger</p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClassItem    { id: string; name: string; }
interface SectionItem  { id: string; name: string; class_id: string; }
interface StudentFeeRow {
  student_id: string;
  full_name: string;
  roll_number: number | null;
  fee_id: string | null;       // existing fees.id if any
  current_amount: number;      // current total fee in DB (read-only display)
  amount: string;              // additive input — how much to ADD to the due
  status: string | null;
  fee_label: string;           // the fee label to assign
  current_label: string | null; // existing fee label in DB if any
  saving: boolean;
  saved: boolean;
  error: string | null;
}

// ─── Shared style tokens ──────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  width: '100%', padding: '9px 13px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 13, outline: 'none', background: 'white',
  boxSizing: 'border-box', fontFamily: 'inherit',
};
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
};

// ─── Status badge helper ──────────────────────────────────────────────────────
function statusBadge(status: string | null) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:           { bg: '#DCFCE7', color: '#15803D', label: 'Paid' },
    partially_paid: { bg: '#FEF9C3', color: '#A16207', label: 'Partial' },
    pending:        { bg: '#FEF2F2', color: '#DC2626', label: 'Pending' },
    overdue:        { bg: '#FEE2E2', color: '#991B1B', label: 'Overdue' },
  };
  const s = map[status ?? ''] ?? { bg: '#F1F5F9', color: '#64748B', label: 'N/A' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
      background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Individual Fee Manager
// ═══════════════════════════════════════════════════════════════════════════════
function TabIndividual({ schoolId, academicYearId, classes, sections }: {
  schoolId: string; academicYearId: string; classes: ClassItem[]; sections: SectionItem[];
}) {
  const supabase = createClient();
  const [selClass,   setSelClass]   = useState('');
  const [selSection, setSelSection] = useState('');
  const [rows, setRows] = useState<StudentFeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveAllBusy, setSaveAllBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fee labelling controls
  const [selCategory, setSelCategory] = useState<string>('Tuition Fee');
  const [customLabel, setCustomLabel] = useState<string>('');
  const [batchDueDate, setBatchDueDate] = useState<string>('');

  const activeLabel = selCategory === 'Custom Label...' ? customLabel.trim() : selCategory;
  const filteredSections = sections.filter(s => s.class_id === selClass);

  function showToast(msg: string, ok: boolean) {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, ok });
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  const loadStudents = useCallback(async () => {
    if (!selClass || !selSection) { setRows([]); return; }
    setLoading(true);
    // Fetch students
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, roll_number')
      .eq('class_id', selClass)
      .eq('section_id', selSection)
      .eq('is_active', true)
      .order('roll_number');

    if (!students || students.length === 0) { setRows([]); setLoading(false); return; }

    // Fetch existing fees with fee_structures to get current label
    const ids = students.map((s: any) => s.id);
    const { data: fees } = await supabase
      .from('fees')
      .select('id, student_id, amount, status, fee_structure_id, fee_structures(name, fee_type)')
      .eq('school_id', schoolId)
      .in('student_id', ids);

    const feeMap = new Map((fees ?? []).map((f: any) => [f.student_id, f]));

    setRows(students.map((s: any) => {
      const fee: any = feeMap.get(s.id);
      const existingLabel = fee?.fee_structures?.name || null;
      return {
        student_id: s.id,
        full_name: s.full_name,
        roll_number: s.roll_number,
        fee_id: fee?.id ?? null,
        current_amount: fee?.amount ?? 0,
        amount: '0',
        status: fee?.status ?? null,
        fee_label: existingLabel || activeLabel || 'Tuition Fee',
        current_label: existingLabel,
        saving: false,
        saved: false,
        error: null,
      };
    }));
    setLoading(false);
  }, [supabase, selClass, selSection, schoolId, activeLabel]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  function updateAmount(student_id: string, val: string) {
    setRows(r => r.map(row => row.student_id === student_id
      ? { ...row, amount: val, saved: false, error: null } : row));
  }

  function updateRowLabel(student_id: string, val: string) {
    setRows(r => r.map(row => row.student_id === student_id
      ? { ...row, fee_label: val, saved: false, error: null } : row));
  }

  function applyLabelToAll() {
    const l = activeLabel || 'Tuition Fee';
    setRows(r => r.map(row => ({ ...row, fee_label: l, saved: false })));
    showToast(`Applied fee label "${l}" to all ${rows.length} rows`, true);
  }

  async function saveRow(student_id: string) {
    const row = rows.find(r => r.student_id === student_id);
    if (!row) return;
    const addAmt = parseFloat(row.amount);
    if (isNaN(addAmt) || addAmt <= 0) {
      setRows(r => r.map(x => x.student_id === student_id ? { ...x, error: 'Enter an amount greater than 0' } : x));
      return;
    }
    const labelToSave = (row.fee_label || activeLabel).trim() || 'Tuition Fee';
    setRows(r => r.map(x => x.student_id === student_id ? { ...x, saving: true, error: null } : x));

    // Resolve fee_structure_id
    const structureId = await getOrCreateFeeStructure(supabase, schoolId, selClass, labelToSave);

    // ADDITIVE: new total = existing amount + what was entered
    const newTotal = row.current_amount + addAmt;

    const now = new Date();
    const defaultDueDate = batchDueDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const payload: Record<string, unknown> = {
      school_id: schoolId,
      student_id,
      amount: newTotal,
      status: row.fee_id ? (row.status ?? 'pending') : 'pending',
      due_date: defaultDueDate,
      ...(structureId ? { fee_structure_id: structureId } : {}),
      ...(academicYearId ? { academic_year_id: academicYearId } : {}),
    };

    let error: any = null;
    if (row.fee_id) {
      ({ error } = await supabase.from('fees').update(payload).eq('id', row.fee_id));
    } else {
      const { data, error: e } = await supabase.from('fees').insert(payload).select('id').single();
      error = e;
      if (!error && data) {
        setRows(r => r.map(x => x.student_id === student_id ? { ...x, fee_id: data.id } : x));
      }
    }

    if (!error) {
      const { data: links } = await supabase
        .from('student_parent_links')
        .select('parent_id')
        .eq('student_id', student_id);

      if (links && links.length > 0) {
        await Promise.all(links.map((l: any) => createNotification(supabase, {
          recipient_id: l.parent_id,
          school_id: schoolId,
          type: 'fee_reminder',
          title: `Fee Assigned: ${labelToSave} — ₹${addAmt.toLocaleString('en-IN')}`,
          body: `A fee of ₹${addAmt.toLocaleString('en-IN')} (${labelToSave}) has been added for ${row.full_name}. Total due: ₹${newTotal.toLocaleString('en-IN')}. Due date: ${new Date(defaultDueDate).toLocaleDateString('en-IN')}.`,
          link: '/parent/fees',
        })));
      }
    }

    setRows(r => r.map(x => x.student_id === student_id
      ? {
          ...x,
          saving: false,
          saved: !error,
          error: error?.message ?? null,
          current_amount: error ? x.current_amount : newTotal,
          current_label: error ? x.current_label : labelToSave,
          amount: error ? x.amount : '0',
        }
      : x));
  }

  async function saveAll() {
    // Only save rows where the principal actually entered an amount
    const toSave = rows.filter(r => !r.saving && parseFloat(r.amount) > 0);
    if (toSave.length === 0) { showToast('No fee amounts entered — type an amount in each row first', false); return; }
    setSaveAllBusy(true);
    await Promise.all(toSave.map(r => saveRow(r.student_id)));
    setSaveAllBusy(false);
    showToast(`₹ Added fee for ${toSave.length} student(s)`, true);
  }

  // Count only rows with an amount entered (> 0)
  const filledCount = rows.filter(r => parseFloat(r.amount) > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters & Fee Label Setup */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.8fr auto', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={LABEL}>Class <span style={{ color: '#EF4444' }}>*</span></label>
            <select value={selClass} onChange={e => { setSelClass(e.target.value); setSelSection(''); setRows([]); }} style={IS}>
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Section <span style={{ color: '#EF4444' }}>*</span></label>
            <select value={selSection} onChange={e => setSelSection(e.target.value)} disabled={!selClass} style={{ ...IS, opacity: selClass ? 1 : 0.5 }}>
              <option value="">Select section…</option>
              {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Default Fee Label / Purpose <span style={{ color: '#EF4444' }}>*</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={selCategory} onChange={e => setSelCategory(e.target.value)} style={{ ...IS, flex: 1, fontWeight: 600 }}>
                {STANDARD_FEE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {selCategory === 'Custom Label...' && (
                <input
                  type="text"
                  placeholder="Type fee label…"
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  style={{ ...IS, flex: 1 }}
                />
              )}
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={applyLabelToAll}
                  title="Apply this fee label to all students in table"
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #DBEAFE',
                    background: '#EFF6FF', color: '#1D4ED8', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  🏷️ Apply to All
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={LABEL}>&nbsp;</label>
            <button
              onClick={saveAll}
              disabled={saveAllBusy || filledCount === 0}
              style={{
                padding: '9px 22px', borderRadius: 9, border: 'none', cursor: filledCount === 0 ? 'not-allowed' : 'pointer',
                background: filledCount === 0 ? '#E2E8F0' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)',
                color: filledCount === 0 ? '#94A3B8' : 'white', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                boxShadow: filledCount > 0 ? '0 4px 12px rgba(59,130,246,0.3)' : 'none',
              }}>
              {saveAllBusy ? 'Saving…' : `Save All (${filledCount})`}
            </button>
          </div>
        </div>

        {/* Due date picker line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4, borderTop: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Due Date for newly added fees:</span>
            <input
              type="date"
              value={batchDueDate}
              onChange={e => setBatchDueDate(e.target.value)}
              style={{ ...IS, width: 'auto', padding: '5px 10px', fontSize: 12 }}
            />
            {!batchDueDate && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>(defaults to next month-end)</span>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: '10px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: toast.ok ? '#DCFCE7' : '#FEF2F2',
          color: toast.ok ? '#15803D' : '#DC2626',
          border: `1px solid ${toast.ok ? '#BBF7D0' : '#FEE2E2'}`,
        }}>{toast.msg}</div>
      )}

      {/* Empty / loading / table */}
      {!selClass || !selSection ? (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E8ECF0', padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎓</div>
          <p style={{ fontWeight: 700, color: '#1E293B', fontSize: 15, margin: 0 }}>Select a class and section</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Students will appear here once you select both filters</p>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: 52, background: '#F8FAFC', borderRadius: 10 }} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E8ECF0', padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 28, margin: 0 }}>📭</p>
          <p style={{ fontWeight: 600, color: '#475569', marginTop: 10 }}>No students found in this section</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Datalist for fast category suggestions */}
          <datalist id="fee-category-options">
            {STANDARD_FEE_CATEGORIES.filter(c => c !== 'Custom Label...').map(cat => (
              <option key={cat} value={cat} />
            ))}
          </datalist>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1.8fr 110px 1.5fr 160px 85px', padding: '11px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', gap: 12, alignItems: 'center' }}>
            {['Roll','Student','Status','Fee Label / Purpose','Add Fee Amount (₹)','Action'].map((h, i) => (
              <p key={i} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{h}</p>
            ))}
          </div>
          {/* Rows */}
          {rows.map((row, idx) => (
            <div key={row.student_id}
              style={{ display: 'grid', gridTemplateColumns: '48px 1.8fr 110px 1.5fr 160px 85px', padding: '12px 20px', gap: 12,
                borderBottom: idx < rows.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center',
                background: row.saved ? 'rgba(220,252,231,0.3)' : 'white', transition: 'background 0.3s' }}>
              <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>{row.roll_number ?? '—'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#1E3A8A,#3B82F6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {row.full_name.charAt(0)}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{row.full_name}</span>
              </div>
              <div>{statusBadge(row.status)}</div>

              {/* Fee Label / Purpose */}
              <div>
                <input
                  type="text"
                  list="fee-category-options"
                  placeholder="e.g. Tuition Fee"
                  value={row.fee_label}
                  onChange={e => updateRowLabel(row.student_id, e.target.value)}
                  style={{ ...IS, padding: '7px 11px', fontSize: 12, fontWeight: 600, color: '#0F172A' }}
                />
                {row.current_label && (
                  <p style={{ fontSize: 10, color: '#64748B', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Existing:</span>
                    <span style={{ fontWeight: 600, color: '#1E3A8A', background: '#EFF6FF', padding: '1px 6px', borderRadius: 4 }}>
                      {row.current_label}
                    </span>
                  </p>
                )}
              </div>

              {/* Add Fee Amount */}
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={row.amount}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                    updateAmount(row.student_id, v);
                  }}
                  onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                  style={{ ...IS, border: row.error ? '1px solid #EF4444' : '1px solid #E2E8F0', padding: '7px 11px' }}
                />
                {row.current_amount > 0 && (
                  <p style={{ fontSize: 11, color: '#64748B', margin: '3px 0 0' }}>
                    Current due: <strong style={{ color: '#DC2626' }}>₹{row.current_amount.toLocaleString('en-IN')}</strong>
                    {row.amount && parseFloat(row.amount) > 0 && (
                      <span style={{ color: '#0F172A' }}> → ₹{(row.current_amount + parseFloat(row.amount)).toLocaleString('en-IN')}</span>
                    )}
                  </p>
                )}
                {row.error && <p style={{ fontSize: 11, color: '#EF4444', margin: '3px 0 0' }}>{row.error}</p>}
              </div>

              {/* Action */}
              <button
                onClick={() => saveRow(row.student_id)}
                disabled={row.saving}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: row.saving ? 'wait' : 'pointer',
                  background: row.saved ? '#DCFCE7' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)',
                  color: row.saved ? '#15803D' : 'white',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.2s',
                }}>
                {row.saving ? '…' : row.saved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 & 3 — Placeholder stubs (to be implemented next)
// ═══════════════════════════════════════════════════════════════════════════════
function TabBulk({ schoolId, academicYearId, classes, sections }: { schoolId: string; academicYearId: string; classes: ClassItem[]; sections: SectionItem[] }) {
  const supabase = createClient();
  const [selClass,   setSelClass]   = useState('');
  const [selSection, setSelSection] = useState('');
  const [amount,     setAmount]     = useState('');
  const [label,      setLabel]      = useState('');
  const [dueDate,    setDueDate]    = useState('');
  const [applying,   setApplying]   = useState(false);
  const [result,     setResult]     = useState<{ inserted: number; skipped: number; excluded: number; errors: string[] } | null>(null);
  const [formError,  setFormError]  = useState('');
  const [students,   setStudents]   = useState<{ id: string; full_name: string; roll_number: number | null }[]>([]);
  const [loadingStu, setLoadingStu] = useState(false);
  // Set of student IDs that are EXCLUDED (unchecked)
  const [excluded,   setExcluded]   = useState<Set<string>>(new Set());

  const filteredSections = sections.filter(s => s.class_id === selClass);

  // Load student list when class+section changes
  useEffect(() => {
    setResult(null);
    setExcluded(new Set());
    if (!selClass || !selSection) { setStudents([]); return; }
    setLoadingStu(true);
    (async () => {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, roll_number')
        .eq('class_id', selClass)
        .eq('section_id', selSection)
        .eq('is_active', true)
        .order('roll_number');
      setStudents(data ?? []);
      setLoadingStu(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selClass, selSection]);

  const toggleStudent = (id: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setResult(null);
  };

  const toggleAll = (checkAll: boolean) => {
    setExcluded(checkAll ? new Set() : new Set(students.map(s => s.id)));
    setResult(null);
  };

  const includedStudents = students.filter(s => !excluded.has(s.id));
  const allChecked = excluded.size === 0 && students.length > 0;
  const someChecked = excluded.size > 0 && excluded.size < students.length;

  async function applyToAll() {
    setFormError('');
    const amt = parseFloat(amount);
    if (!selClass || !selSection)      { setFormError('Select a class and section first.'); return; }
    if (!label.trim())                  { setFormError('Enter a fee label.'); return; }
    if (isNaN(amt) || amt <= 0)        { setFormError('Enter a valid positive amount.'); return; }
    if (includedStudents.length === 0) { setFormError('No students selected — check at least one student.'); return; }

    setApplying(true);
    setResult(null);

    const studentIds = includedStudents.map(s => s.id);
    const { data: existingFees } = await supabase
      .from('fees').select('id, student_id, amount')
      .eq('school_id', schoolId).in('student_id', studentIds);

    const feeMap = new Map<string, { id: string; amount: number }>();
    (existingFees ?? []).forEach((f: any) => {
      if (!feeMap.has(f.student_id)) feeMap.set(f.student_id, { id: f.id, amount: f.amount ?? 0 });
    });

    const errors: string[] = [];
    let updated = 0, inserted = 0;
    const now2 = new Date();
    const fallbackDue = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).toISOString().split('T')[0];

    await Promise.all(includedStudents.map(async (s) => {
      const existing = feeMap.get(s.id);
      if (existing) {
        const { error } = await supabase.from('fees').update({ amount: existing.amount + amt }).eq('id', existing.id);
        if (error) errors.push(`${s.full_name}: ${error.message}`); else updated++;
      } else {
        const { error } = await supabase.from('fees').insert({
          school_id: schoolId, student_id: s.id, amount: amt, status: 'pending',
          due_date: dueDate || fallbackDue,
          ...(academicYearId ? { academic_year_id: academicYearId } : {}),
        });
        if (error) errors.push(`${s.full_name}: ${error.message}`); else inserted++;
      }
    }));

    setResult({ inserted: updated + inserted, skipped: errors.length, excluded: excluded.size, errors,
      _updated: updated, _inserted: inserted } as any);
    setApplying(false);
    if (!errors.length) { setAmount(''); setLabel(''); setDueDate(''); }

    if (!errors.length && inserted > 0) {
      const newIds = includedStudents.filter(s => !feeMap.has(s.id)).map(s => s.id);
      if (newIds.length > 0) {
        const { data: links } = await supabase.from('student_parent_links').select('parent_id').in('student_id', newIds);
        if (links) {
          const dueTxt = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
          await Promise.all(links.map((l: any) => createNotification(supabase, {
            recipient_id: l.parent_id, school_id: schoolId, type: 'fee_reminder',
            title: `New fee assigned: ${label} — \u20b9${amt.toLocaleString('en-IN')}`,
            body: dueTxt ? `Due by ${dueTxt}. Please pay on time.` : 'Please check the Fees section.',
            link: '/parent/fees',
          })));
        }
      }
    }
  }

  const canApply = selClass && selSection && label.trim() && parseFloat(amount) > 0 && includedStudents.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Form card */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', background: 'linear-gradient(135deg,#F8FAFC,#EFF6FF)' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>\u26a1 Apply Fee to Section</p>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Fill in the fee details below, then uncheck any students you want to <strong>exclude</strong> before applying.</p>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={LABEL}>Class <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={selClass} onChange={e => { setSelClass(e.target.value); setSelSection(''); }} style={IS}>
                <option value="">Select class…</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Section <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={selSection} onChange={e => setSelSection(e.target.value)} disabled={!selClass} style={{ ...IS, opacity: selClass ? 1 : 0.5 }}>
                <option value="">Select section…</option>
                {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="bottom-grid-container">
            <div>
              <label style={LABEL}>Fee Label <span style={{ color: '#EF4444' }}>*</span></label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder='e.g. "Term 2 Tuition"' style={IS} />
            </div>
            <div>
              <label style={LABEL}>Amount (\u20b9) <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={IS} />
            </div>
          </div>
          <div style={{ maxWidth: 240 }}>
            <label style={LABEL}>Due Date <span style={{ color: '#94A3B8', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={IS} />
          </div>
          {formError && (
            <div style={{ padding: '10px 14px', borderRadius: 9, background: '#FEF2F2', border: '1px solid #FEE2E2', fontSize: 13, color: '#DC2626' }}>{formError}</div>
          )}
          <button onClick={applyToAll} disabled={applying || !canApply} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
            cursor: canApply && !applying ? 'pointer' : 'not-allowed',
            background: canApply && !applying ? 'linear-gradient(135deg,#1E3A8A,#3B82F6)' : '#E2E8F0',
            color: canApply && !applying ? 'white' : '#94A3B8', alignSelf: 'flex-start',
            boxShadow: canApply && !applying ? '0 4px 12px rgba(59,130,246,0.3)' : 'none', transition: 'all 0.2s',
          }}>
            {applying ? '\u23f3 Applying\u2026' : `\u26a1 Apply to ${includedStudents.length} Student${includedStudents.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Student checklist */}
      {selClass && selSection && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked; }}
                  onChange={e => toggleAll(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1D4ED8' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Select All Students</span>
              </label>
              {students.length > 0 && (
                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99,
                  background: excluded.size > 0 ? '#FEF3C7' : '#EFF6FF',
                  color: excluded.size > 0 ? '#92400E' : '#1D4ED8', fontWeight: 700 }}>
                  {includedStudents.length} of {students.length} selected
                  {excluded.size > 0 && ` \u00b7 ${excluded.size} excluded`}
                </span>
              )}
            </div>
            {parseFloat(amount) > 0 && includedStudents.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: '#ECFDF5', border: '1px solid #BBF7D0', padding: '4px 12px', borderRadius: 99 }}>
                Total: \u20b9{(parseFloat(amount) * includedStudents.length).toLocaleString('en-IN')}
              </span>
            )}
          </div>
          {loadingStu ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
              {[1,2,3,4].map(i => <div key={i} style={{ height: 44, background: '#F8FAFC', borderRadius: 8 }} />)}
            </div>
          ) : students.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 28, margin: 0 }}>\ud83d\udcad</p>
              <p style={{ fontWeight: 600, color: '#475569', marginTop: 8 }}>No active students found in this section.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {students.map((s, idx) => {
                const checked = !excluded.has(s.id);
                return (
                  <label key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '44px 36px 1fr auto', alignItems: 'center', gap: 12,
                    padding: '10px 20px', cursor: 'pointer',
                    borderBottom: idx < students.length - 1 ? '1px solid #F8FAFC' : 'none',
                    background: checked ? 'white' : '#FAFBFC',
                    opacity: checked ? 1 : 0.55, transition: 'background 0.15s, opacity 0.15s',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)}
                      style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#1D4ED8', justifySelf: 'center' }} />
                    <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>{s.roll_number ?? '\u2014'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%',
                        background: checked ? 'linear-gradient(135deg,#1E3A8A,#3B82F6)' : '#CBD5E1',
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {s.full_name.charAt(0)}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{s.full_name}</span>
                    </div>
                    {!checked && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: '#FEE2E2', color: '#DC2626', whiteSpace: 'nowrap' }}>Excluded</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ borderRadius: 14, border: `1px solid ${result.errors.length === 0 ? '#BBF7D0' : '#FEE2E2'}`,
          background: result.errors.length === 0 ? '#DCFCE7' : '#FEF2F2', padding: '18px 22px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: result.errors.length === 0 ? '#15803D' : '#DC2626', margin: '0 0 6px' }}>
            {result.errors.length === 0 ? '\u2705 Done!' : '\u26a0\ufe0f Partially applied'}
          </p>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
            {(result as any)._updated > 0 && <><strong>{(result as any)._updated}</strong> updated (added to existing) &middot; </>}
            {(result as any)._inserted > 0 && <><strong>{(result as any)._inserted}</strong> new fees created</>}
            {result.excluded > 0 && <> &middot; <strong>{result.excluded}</strong> excluded (skipped by choice)</>}
            {result.skipped > 0 && <> &middot; <strong>{result.skipped}</strong> failed due to errors</>}
          </p>
          {result.errors.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {result.errors.map((e, i) => <li key={i} style={{ fontSize: 12, color: '#DC2626' }}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payment record (for void flow) ─────────────────────────────────────────
interface PaymentRecord {
  id: string;
  fee_id: string;
  amount_paid: number;
  payment_mode: string;
  payment_date: string;
  notes: string | null;
  is_voided: boolean;
  voided_reason: string | null;
  voided_at: string | null;
}

// ─── Aggregated per-student row ───────────────────────────────────────────────
interface FeeDetail {
  fee_id: string;
  fee_name: string;
  fee_type: string;
  amount: number;
  paid: number;
  due: number;
  status: string;
  payments: PaymentRecord[];
}
interface OverviewRow {
  student_id:   string;
  student_name: string;
  roll_number:  number | null;
  class_id:     string;
  section_id:   string;
  class_name:   string;
  section_name: string;
  total_fee:    number;
  paid:         number;
  due:          number;
  status:       string;      // worst-case status
  fee_details:  FeeDetail[]; // per-fee breakdown for history drawer
}

type SortField = 'due' | 'name' | 'status' | 'total';

function aggStatus(details: FeeDetail[]): string {
  if (details.every(d => d.status === 'paid'))    return 'paid';
  if (details.some(d => d.status === 'overdue'))  return 'overdue';
  if (details.some(d => d.status === 'partially_paid')) return 'partially_paid';
  return 'pending';
}

function TabOverview({ schoolId, classes, sections }: { schoolId: string; classes: ClassItem[]; sections: SectionItem[] }) {
  const supabase = createClient();
  const [rows,        setRows]        = useState<OverviewRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [filterClass, setFilterClass] = useState('');
  const [filterSec,   setFilterSec]   = useState('');
  const [search,      setSearch]      = useState('');
  const [sortField,   setSortField]   = useState<SortField>('due');
  const [sortAsc,     setSortAsc]     = useState(false);
  const [expanded,    setExpanded]    = useState<string | null>(null); // student_id

  // Payment modal
  const [payModal,  setPayModal]  = useState<OverviewRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode,   setPayMode]   = useState('cash');
  const [payNotes,  setPayNotes]  = useState('');
  const [paying,    setPaying]    = useState(false);
  const [payError,  setPayError]  = useState('');

  const filteredSections = sections.filter(s => s.class_id === filterClass);

  // Receipt modal
  const [receiptData, setReceiptData] = useState<ReceiptInfo | null>(null);
  const [schoolName,  setSchoolName]  = useState('School');

  // Fetch school name once
  useEffect(() => {
    if (!schoolId) return;
    supabase.from('schools').select('name').eq('id', schoolId).single()
      .then((res: any) => { if (res.data?.name) setSchoolName(res.data.name); });
  }, [supabase, schoolId]);

  function openReceipt(row: OverviewRow, detail: FeeDetail) {
    setReceiptData({
      feeId:       detail.fee_id,
      feeAmount:   detail.amount,
      feePaid:     detail.paid,
      feeDue:      detail.due,
      feeStatus:   detail.status,
      studentName: row.student_name,
      rollNumber:  row.roll_number,
      feeName:     detail.fee_name || 'Tuition / Educational Fee',
      className:   row.class_name,
      sectionName: row.section_name,
      schoolName,
      payments:    detail.payments
        .filter(p => !p.is_voided)
        .map(p => ({ id: p.id, amount_paid: p.amount_paid, payment_mode: p.payment_mode, payment_date: p.payment_date, notes: p.notes })),
    });
  }

  // Void modal state
  const [voidModal,  setVoidModal]  = useState<{ payment: PaymentRecord; feeId: string; studentName: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding,    setVoiding]    = useState(false);
  const [voidError,  setVoidError]  = useState('');
  const [voidMigrationNeeded, setVoidMigrationNeeded] = useState(false);

  // Edit fee amount state
  const [editFeeModal,   setEditFeeModal]   = useState<{ feeId: string; currentAmount: number; studentName: string } | null>(null);
  const [editFeeVal,     setEditFeeVal]     = useState('');
  const [editFeeSaving,  setEditFeeSaving]  = useState(false);
  const [editFeeError,   setEditFeeError]   = useState('');

  // ── Fee Reminder state ────────────────────────────────────────────────────
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult,  setReminderResult]  = useState<{ sent: number; skipped: number } | null>(null);

  async function sendReminders() {
    setReminderSending(true);
    setReminderResult(null);

    // 1. Get all unpaid students from the current filtered view
    const unpaid = visible.filter(r => r.status !== 'paid');
    if (unpaid.length === 0) {
      setReminderResult({ sent: 0, skipped: visible.length });
      setReminderSending(false);
      return;
    }

    // 2. Fetch fee rows with due_date for these students
    const studentIds = unpaid.map(r => r.student_id);
    const { data: feeRows } = await supabase
      .from('fees')
      .select('student_id, amount, status, due_date')
      .eq('school_id', schoolId)
      .in('student_id', studentIds)
      .neq('status', 'paid')
      .order('due_date', { ascending: true });

    // Map student_id → earliest unpaid fee info
    const feeInfoMap = new Map<string, { amount: number; due: number; due_date: string | null; status: string }>();
    (feeRows ?? []).forEach((f: any) => {
      if (!feeInfoMap.has(f.student_id)) {
        const row = visible.find(r => r.student_id === f.student_id);
        feeInfoMap.set(f.student_id, {
          amount:   row?.total_fee ?? f.amount,
          due:      row?.due ?? f.amount,
          due_date: f.due_date ?? null,
          status:   f.status,
        });
      }
    });

    // 3. Fetch parent links
    const { data: links } = await supabase
      .from('student_parent_links')
      .select('student_id, parent_id')
      .in('student_id', studentIds);

    if (!links || links.length === 0) {
      setReminderResult({ sent: 0, skipped: unpaid.length });
      setReminderSending(false);
      return;
    }

    // 4. Send one notification per parent link
    let sent = 0;
    await Promise.all(links.map(async (l: any) => {
      const info = feeInfoMap.get(l.student_id);
      const student = visible.find(r => r.student_id === l.student_id);
      if (!info || !student) return;

      const dueDateStr = info.due_date
        ? new Date(info.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

      const statusLabel = info.status === 'overdue' ? '🔴 Overdue'
        : info.status === 'partially_paid' ? '🟡 Partially Paid'
        : '🟠 Pending';

      await createNotification(supabase, {
        recipient_id: l.parent_id,
        school_id:    schoolId,
        type:         'fee_reminder',
        title:        `Fee Reminder: ₹${info.due.toLocaleString('en-IN')} due for ${student.student_name}`,
        body:         `Total Fee: ₹${info.amount.toLocaleString('en-IN')} · Amount Due: ₹${info.due.toLocaleString('en-IN')} · Status: ${statusLabel}${
          dueDateStr ? ` · Due Date: ${dueDateStr}` : ''
        }. Please visit the Fees section to clear the balance.`,
        link: '/parent/fees',
      });
      sent++;
    }));

    setReminderResult({ sent, skipped: unpaid.length - sent });
    setReminderSending(false);
    // auto-clear result after 6s
    setTimeout(() => setReminderResult(null), 6000);
  }

  const fetchOverview = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    // Auto-flip pending→overdue for all school fees where due_date has passed
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('fees')
      .update({ status: 'overdue' })
      .eq('school_id', schoolId)
      .eq('status', 'pending')
      .lt('due_date', today);

    const cMap = new Map(classes.map((c: ClassItem)   => [c.id, c.name]));
    const sMap = new Map(sections.map((s: SectionItem) => [s.id, s.name]));

    const { data: fees } = await supabase
      .from('fees')
      .select('id, amount, status, student_id, fee_structure_id, fee_structures(name, fee_type), students(full_name, class_id, section_id, roll_number)')
      .eq('school_id', schoolId);

    if (!fees || fees.length === 0) { setRows([]); setLoading(false); return; }

    const feeIds = fees.map((f: any) => f.id);

    // Try fetching with void columns; fall back gracefully if migration not run
    let rawPayments: any[] = [];
    let hasVoidColumns = true;
    const { data: p1, error: p1Err } = await supabase
      .from('fee_payments')
      .select('id, fee_id, amount_paid, payment_mode, payment_date, notes, is_voided, voided_reason, voided_at')
      .in('fee_id', feeIds)
      .order('payment_date', { ascending: false });
    if (p1Err) {
      // Migration not run — fall back to basic columns
      hasVoidColumns = false;
      setVoidMigrationNeeded(true);
      const { data: p2 } = await supabase
        .from('fee_payments')
        .select('id, fee_id, amount_paid, payment_mode, payment_date, notes')
        .in('fee_id', feeIds)
        .order('payment_date', { ascending: false });
      rawPayments = (p2 ?? []).map((p: any) => ({ ...p, is_voided: false, voided_reason: null, voided_at: null }));
    } else {
      setVoidMigrationNeeded(false);
      rawPayments = p1 ?? [];
    }

    // Build paid map (exclude voided)
    const paidMap = new Map<string, number>();
    const payMap  = new Map<string, PaymentRecord[]>();
    rawPayments.forEach((p: any) => {
      const rec: PaymentRecord = { id: p.id, fee_id: p.fee_id, amount_paid: p.amount_paid, payment_mode: p.payment_mode, payment_date: p.payment_date, notes: p.notes, is_voided: p.is_voided ?? false, voided_reason: p.voided_reason, voided_at: p.voided_at };
      if (!p.is_voided) paidMap.set(p.fee_id, (paidMap.get(p.fee_id) ?? 0) + (p.amount_paid ?? 0));
      payMap.set(p.fee_id, [...(payMap.get(p.fee_id) ?? []), rec]);
    });

    // Aggregate per student
    const studentMap = new Map<string, OverviewRow>();
    (fees as any[]).filter(f => f.students).forEach(f => {
      const feePaid = paidMap.get(f.id) ?? 0;
      const feeAmt  = f.amount ?? 0;
      // Auto-derive status from payments vs fee amount
      let derivedStatus = f.status ?? 'pending';
      if (feePaid >= feeAmt && feeAmt > 0) derivedStatus = 'paid';
      else if (feePaid > 0 && feePaid < feeAmt) derivedStatus = 'partially_paid';

      const feeName = f.fee_structures?.name || 'Tuition / Educational Fee';
      const feeType = f.fee_structures?.fee_type || 'tuition';

      const detail: FeeDetail = {
        fee_id: f.id,
        fee_name: feeName,
        fee_type: feeType,
        amount: feeAmt,
        paid: feePaid,
        due: Math.max(0, feeAmt - feePaid),
        status: derivedStatus,
        payments: payMap.get(f.id) ?? []
      };

      if (studentMap.has(f.student_id)) {
        const row = studentMap.get(f.student_id)!;
        row.total_fee += feeAmt;
        row.paid      += feePaid;
        row.due        = Math.max(0, row.total_fee - row.paid);
        row.fee_details.push(detail);
        row.status     = aggStatus(row.fee_details);
      } else {
        studentMap.set(f.student_id, {
          student_id:   f.student_id,
          student_name: f.students.full_name,
          roll_number:  f.students.roll_number ?? null,
          class_id:     f.students.class_id ?? '',
          section_id:   f.students.section_id ?? '',
          class_name:   cMap.get(f.students.class_id) ?? '—',
          section_name: sMap.get(f.students.section_id) ?? '—',
          total_fee:    feeAmt,
          paid:         feePaid,
          due:          Math.max(0, feeAmt - feePaid),
          status:       derivedStatus,
          fee_details:  [detail],
        });
      }
    });

    setRows(Array.from(studentMap.values()));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  async function confirmVoid() {
    if (!voidModal) return;
    if (!voidReason.trim()) { setVoidError('Please enter a reason for voiding this payment.'); return; }
    if (voidMigrationNeeded) { setVoidError('Run the void-payment-migration.sql in Supabase first to enable voiding.'); return; }
    setVoiding(true); setVoidError('');
    const { error } = await supabase.from('fee_payments').update({
      is_voided: true,
      voided_reason: voidReason.trim(),
      voided_at: new Date().toISOString(),
    }).eq('id', voidModal.payment.id);
    if (error) { setVoidError(`Failed: ${error.message}`); setVoiding(false); return; }
    // Recalculate fee status after void
    const { data: otherPays } = await supabase.from('fee_payments')
      .select('amount_paid, is_voided').eq('fee_id', voidModal.feeId);
    const activePaid = (otherPays ?? []).filter((p: any) => !p.is_voided).reduce((s: number, p: any) => s + (p.amount_paid ?? 0), 0);
    const { data: feeRow } = await supabase.from('fees').select('amount').eq('id', voidModal.feeId).single();
    const feeAmt = feeRow?.amount ?? 0;
    const newStatus = activePaid >= feeAmt ? 'paid' : activePaid > 0 ? 'partially_paid' : 'pending';
    await supabase.from('fees').update({ status: newStatus }).eq('id', voidModal.feeId);
    setVoiding(false); setVoidModal(null); setVoidReason('');
    fetchOverview();
  }

  async function saveEditFee() {
    if (!editFeeModal) return;
    const newAmt = parseFloat(editFeeVal);
    if (isNaN(newAmt) || newAmt <= 0) { setEditFeeError('Enter a valid positive amount.'); return; }
    setEditFeeSaving(true); setEditFeeError('');
    const { error } = await supabase.from('fees').update({ amount: newAmt }).eq('id', editFeeModal.feeId);
    if (error) { setEditFeeError(`Save failed: ${error.message}`); setEditFeeSaving(false); return; }
    // Recalculate status after amount change
    const { data: pays } = await supabase.from('fee_payments')
      .select('amount_paid, is_voided').eq('fee_id', editFeeModal.feeId);
    const paid = (pays ?? []).filter((p: any) => !p.is_voided).reduce((s: number, p: any) => s + (p.amount_paid ?? 0), 0);
    const newStatus = paid >= newAmt ? 'paid' : paid > 0 ? 'partially_paid' : 'pending';
    await supabase.from('fees').update({ status: newStatus }).eq('id', editFeeModal.feeId);
    setEditFeeSaving(false); setEditFeeModal(null);
    fetchOverview();
  }

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // Client-side filter & sort
  const visible = rows
    .filter(r => {
      if (filterClass && r.class_id   !== filterClass) return false;
      if (filterSec   && r.section_id !== filterSec)   return false;
      if (search && !r.student_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'due')    cmp = b.due - a.due;
      if (sortField === 'total')  cmp = b.total_fee - a.total_fee;
      if (sortField === 'name')   cmp = a.student_name.localeCompare(b.student_name);
      if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      return sortAsc ? -cmp : cmp;
    });

  const totalFee  = visible.reduce((s, r) => s + r.total_fee, 0);
  const totalPaid = visible.reduce((s, r) => s + r.paid, 0);
  const totalDue  = visible.reduce((s, r) => s + r.due, 0);
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortAsc(false); }
  }
  function SortBtn({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button onClick={() => toggleSort(field)} style={{ background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700,
        color: active ? '#1D4ED8' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>
        {label}<span style={{ fontSize: 10 }}>{active ? (sortAsc ? ' ▲' : ' ▼') : ' ↕'}</span>
      </button>
    );
  }

  // Pay modal helpers
  function openPay(row: OverviewRow) {
    setPayModal(row); setPayAmount(String(row.due));
    setPayMode('cash'); setPayNotes(''); setPayError('');
  }
  function closePay() { setPayModal(null); }

  async function recordPayment() {
    if (!payModal) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) { setPayError('Enter a valid positive amount.'); return; }
    if (amt > payModal.due)     { setPayError(`Cannot exceed due (${fmt(payModal.due)}).`); return; }
    setPaying(true); setPayError('');

    // Distribute across pending fees — oldest first (FIFO) to clear overdue balances first
    const pendingFees = payModal.fee_details
      .filter(d => d.due > 0)
      .sort((a, b) => a.fee_id.localeCompare(b.fee_id)); // UUIDs are creation-ordered in Supabase (uuid v4 sorted by insert order via pg)

    let remaining = amt;
    for (const fd of pendingFees) {
      if (remaining <= 0) break;
      const applying = Math.min(remaining, fd.due);
      const { error: payErr } = await supabase.from('fee_payments').insert({
        fee_id: fd.fee_id, student_id: payModal.student_id, school_id: schoolId,
        amount_paid: applying, payment_mode: payMode,
        notes: payNotes.trim() || null, payment_date: new Date().toISOString(),
      });
      if (!payErr) {
        const newPaid = fd.paid + applying;
        const newStatus = newPaid >= fd.amount ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending';
        await supabase.from('fees').update({ status: newStatus }).eq('id', fd.fee_id);
        remaining -= applying;
      }
    }
    setPaying(false); closePay(); fetchOverview();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters + Send Reminders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Class</label>
            <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterSec(''); }} style={IS}>
              <option value="">Whole School</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Section</label>
            <select value={filterSec} onChange={e => setFilterSec(e.target.value)} disabled={!filterClass} style={{ ...IS, opacity: filterClass ? 1 : 0.5 }}>
              <option value="">All Sections</option>
              {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Search Student</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type a student name…"
              style={{ ...IS, paddingLeft: 36, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394A3B8\' stroke-width=\'2\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'8\'/%3E%3Cpath d=\'m21 21-4.35-4.35\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: '12px center' }} />
          </div>
        </div>

        {/* Reminder button + Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (visible.length === 0) return;
              const data = visible.map((r, i) => ({
                '#': i + 1,
                'Student Name': r.student_name,
                'Class': r.class_name,
                'Section': r.section_name,
                'Total Fee (₹)': r.total_fee,
                'Amount Paid (₹)': r.paid,
                'Amount Due (₹)': r.due,
                'Status': r.status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
              }));
              const ws = XLSX.utils.json_to_sheet(data);
              ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Fee Report');
              const label = filterClass ? (classes.find(c => c.id === filterClass)?.name || 'Class') : 'All';
              XLSX.writeFile(wb, `Fee_Report_${label}_${new Date().toISOString().slice(0,10)}.xlsx`);
            }}
            disabled={visible.length === 0 || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 9, border: 'none',
              background: visible.length === 0 || loading ? '#F1F5F9' : 'linear-gradient(135deg,#065F46,#059669)',
              color: visible.length === 0 || loading ? '#94A3B8' : 'white',
              fontSize: 13, fontWeight: 700,
              cursor: visible.length === 0 || loading ? 'not-allowed' : 'pointer',
              boxShadow: visible.length > 0 && !loading ? '0 4px 12px rgba(5,150,105,0.3)' : 'none',
              transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}
          >
            📥 Export Excel
          </button>
          {(() => {
            const unpaidCount = visible.filter(r => r.status !== 'paid').length;
            return (
              <button
                onClick={sendReminders}
                disabled={reminderSending || loading || unpaidCount === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', borderRadius: 9, border: 'none',
                  background: unpaidCount === 0 || loading ? '#F1F5F9'
                    : reminderSending ? '#FEF3C7'
                    : 'linear-gradient(135deg,#D97706,#F59E0B)',
                  color: unpaidCount === 0 || loading ? '#94A3B8'
                    : reminderSending ? '#92400E' : 'white',
                  fontSize: 13, fontWeight: 700,
                  cursor: unpaidCount === 0 || loading || reminderSending ? 'not-allowed' : 'pointer',
                  boxShadow: unpaidCount > 0 && !loading && !reminderSending ? '0 4px 12px rgba(217,119,6,0.3)' : 'none',
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}
              >
                {reminderSending ? '⏳ Sending…' : `🔔 Send Fee Reminders${unpaidCount > 0 ? ` (${unpaidCount} students)` : ''}`}
              </button>
            );
          })()}

          {reminderResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 9,
              background: reminderResult.sent > 0 ? '#FEF3C7' : '#F1F5F9',
              border: `1px solid ${reminderResult.sent > 0 ? '#FDE68A' : '#E2E8F0'}`,
              fontSize: 13, fontWeight: 600,
              color: reminderResult.sent > 0 ? '#92400E' : '#64748B',
            }}>
              {reminderResult.sent > 0
                ? `✅ Reminders sent to ${reminderResult.sent} parent(s)`
                : '⚠️ No parent links found — no reminders sent'}
              {reminderResult.skipped > 0 && reminderResult.sent > 0 && ` · ${reminderResult.skipped} had no linked parent`}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {!loading && visible.length > 0 && (
        <div className="stat-cards-container">
          {[{ label:'Students',  value: String(visible.length), color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE', icon:'🎓' },
            { label:'Total Fees',value: fmt(totalFee),          color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1', icon:'🏫' },
            { label:'Total Paid',value: fmt(totalPaid),         color:'#15803D', bg:'#DCFCE7', border:'#BBF7D0', icon:'✅' },
            { label:'Total Due', value: fmt(totalDue),          color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2', icon:'⚠️' },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: 56, background: '#F8FAFC', borderRadius: 10 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E8ECF0', padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 28, margin: 0 }}>📭</p>
          <p style={{ fontWeight: 600, color: '#475569', marginTop: 10 }}>No fee records match your filters</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 90px 110px 110px 110px 90px 90px', padding: '11px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', gap: 12, alignItems: 'center' }}>
            <SortBtn field="name"   label="Student" />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Class</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Section</p>
            <SortBtn field="total"  label="Total Fee" />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Paid</p>
            <SortBtn field="due"    label="Due" />
            <SortBtn field="status" label="Status" />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Action</p>
          </div>

          {visible.map((row, idx) => {
            const pct = row.total_fee > 0 ? Math.round((row.paid / row.total_fee) * 100) : 0;
            const isExp = expanded === row.student_id;
            return (
              <div key={row.student_id} style={{ borderBottom: idx < visible.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                {/* Main row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 90px 110px 110px 110px 90px 90px',
                  padding: '13px 20px', gap: 12, alignItems: 'center',
                  background: row.due === 0 ? 'rgba(220,252,231,0.2)' : 'white', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : row.student_id)}>
                  {/* Student cell */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: row.due === 0 ? 'linear-gradient(135deg,#16A34A,#4ADE80)' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                      {row.student_name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>{row.student_name}</p>
                        <span style={{ fontSize: 10, color: '#94A3B8' }}>{isExp ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ width: 80, height: 4, background: '#E2E8F0', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(pct, 100)}%`,
                          background: pct >= 100 ? '#16A34A' : pct > 50 ? '#F59E0B' : '#EF4444', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{row.class_name}</p>
                  <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{row.section_name}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>{fmt(row.total_fee)}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#15803D', margin: 0 }}>{fmt(row.paid)}</p>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: row.due > 0 ? '#DC2626' : '#15803D', margin: 0 }}>{fmt(row.due)}</p>
                    {row.paid > row.total_fee && (
                      <p style={{ fontSize: 10, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 4, padding: '1px 5px', margin: '2px 0 0', display: 'inline-block', fontWeight: 700 }}>
                        Overpaid ₹{(row.paid - row.total_fee).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                  <div onClick={e => e.stopPropagation()}>{statusBadge(row.status)}</div>
                  <div onClick={e => e.stopPropagation()}>
                    <button onClick={() => openPay(row)} disabled={row.due === 0}
                      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700,
                        cursor: row.due === 0 ? 'not-allowed' : 'pointer',
                        background: row.due === 0 ? '#F1F5F9' : 'linear-gradient(135deg,#15803D,#22C55E)',
                        color: row.due === 0 ? '#94A3B8' : 'white', whiteSpace: 'nowrap' }}>
                      {row.due === 0 ? '✓ Paid' : '💰 Pay'}
                    </button>
                  </div>
                </div>

                {/* Expanded fee history + payment corrections */}
                {isExp && (
                  <div style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9', padding: '12px 24px 16px 70px' }}>
                    {row.fee_details.map((d, i) => (
                      <div key={d.fee_id} style={{ marginBottom: 14 }}>
                        {/* Fee header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'white', borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: 4, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#1E3A8A', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '2px 8px', borderRadius: 5 }}>
                              {d.fee_name || `Fee #${i + 1}`}
                            </span>
                            {d.fee_type && (
                              <span style={{ fontSize: 10, color: '#64748B', textTransform: 'capitalize' }}>
                                ({d.fee_type.replace('_', ' ')})
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', margin: 0, flex: 1 }}>{fmt(d.amount)}</p>
                          <p style={{ fontSize: 12, color: '#15803D', fontWeight: 600, margin: 0 }}>Paid {fmt(d.paid)}</p>
                          <p style={{ fontSize: 12, color: d.due > 0 ? '#DC2626' : '#15803D', fontWeight: 700, margin: 0 }}>Due {fmt(d.due)}</p>
                          <div>{statusBadge(d.status)}</div>
                          {(d.status === 'paid' || d.status === 'partially_paid') && (
                            <button
                              onClick={() => openReceipt(row, d)}
                              style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 7, border: '1px solid #DBEAFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >🖨️ Print Receipt</button>
                          )}
                          <button
                            onClick={() => { setEditFeeModal({ feeId: d.fee_id, currentAmount: d.amount, studentName: row.student_name }); setEditFeeVal(String(d.amount)); setEditFeeError(''); }}
                            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 7, border: '1px solid #DBEAFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >✏️ Edit Amount</button>
                        </div>
                        {/* Payment records */}
                        {d.payments.length > 0 && (
                          <div style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '2px 0 4px' }}>Payment Records</p>
                            {d.payments.map((pay) => (
                              <div key={pay.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: pay.is_voided ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${pay.is_voided ? '#FEE2E2' : '#BBF7D0'}`, borderRadius: 7, opacity: pay.is_voided ? 0.75 : 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: pay.is_voided ? '#DC2626' : '#15803D', textDecoration: pay.is_voided ? 'line-through' : 'none', flex: 1 }}>
                                  {fmt(pay.amount_paid)} · {pay.payment_mode.replace('_', ' ')}
                                </span>
                                <span style={{ fontSize: 11, color: '#64748B' }}>{new Date(pay.payment_date).toLocaleDateString('en-IN')}</span>
                                {pay.notes && <span style={{ fontSize: 11, color: '#94A3B8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pay.notes}</span>}
                                {pay.is_voided ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#FEE2E2', color: '#DC2626' }}>VOIDED</span>
                                ) : (
                                  <button
                                    onClick={() => { setVoidModal({ payment: pay, feeId: d.fee_id, studentName: row.student_name }); setVoidReason(''); setVoidError(''); }}
                                    style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 7, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                  >⚠ Void</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Fee Amount Modal */}
      {editFeeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 65, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #DBEAFE', background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E3A8A', margin: 0 }}>✏️ Correct Fee Amount</p>
                  <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{editFeeModal.studentName}</p>
                </div>
                <button onClick={() => setEditFeeModal(null)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', color: '#64748B', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12, color: '#92400E' }}>
                <strong>⚠ Current amount:</strong> ₹{editFeeModal.currentAmount.toLocaleString('en-IN')} — the fee balance and status will be recalculated automatically after saving.
              </div>
              {editFeeError && <div style={{ padding: '9px 13px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>{editFeeError}</div>}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Corrected Amount (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  type="number" min={1} value={editFeeVal}
                  onChange={e => setEditFeeVal(e.target.value)}
                  style={{ width: '100%', padding: '10px 13px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 15, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ padding: '0 22px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setEditFeeModal(null)} style={{ flex: 1, padding: 11, borderRadius: 9, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveEditFee} disabled={editFeeSaving}
                style={{ flex: 1, padding: 11, borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700,
                  background: editFeeSaving ? '#93C5FD' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)',
                  color: 'white', cursor: editFeeSaving ? 'not-allowed' : 'pointer' }}>
                {editFeeSaving ? 'Saving…' : '✓ Save Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>💰 Record Payment</p>
                  <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{payModal.student_name} · {payModal.class_name} {payModal.section_name}</p>
                </div>
                <button onClick={closePay} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', color: '#64748B', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                {[{ label: 'Total', value: fmt(payModal.total_fee), color: '#0F172A' },
                  { label: 'Paid',  value: fmt(payModal.paid),      color: '#15803D' },
                  { label: 'Due',   value: fmt(payModal.due),       color: '#DC2626' }]
                  .map(s => (
                    <div key={s.label} style={{ flex: 1, background: 'white', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
                      <p style={{ fontSize: 15, fontWeight: 800, color: s.color, margin: '3px 0 0' }}>{s.value}</p>
                    </div>
                  ))}
              </div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {payError && <div style={{ padding: '9px 13px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>{payError}</div>}
              <div>
                <label style={LABEL}>Amount Paid (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="number" min={1} max={payModal.due} value={payAmount} onChange={e => setPayAmount(e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LABEL}>Payment Mode</label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)} style={IS}>
                  <option value="cash">💵 Cash</option>
                  <option value="cheque">📄 Cheque</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="online">📱 Online / UPI</option>
                  <option value="dd">📋 Demand Draft</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>Notes <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. Receipt #1234, paid by father" style={IS} />
              </div>
            </div>
            <div style={{ padding: '0 24px 22px', display: 'flex', gap: 10 }}>
              <button onClick={closePay} style={{ flex: 1, padding: 11, borderRadius: 9, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button onClick={recordPayment} disabled={paying}
                style={{ flex: 1, padding: 11, borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700,
                  background: paying ? '#86EFAC' : 'linear-gradient(135deg,#15803D,#22C55E)',
                  color: 'white', cursor: paying ? 'not-allowed' : 'pointer' }}>
                {paying ? 'Recording…' : '✓ Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Void Payment Modal ─────────────────────────────── */}
      {voidModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #FEE2E2', background: 'linear-gradient(135deg,#FFF1F2,#FEE2E2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#991B1B', margin: 0 }}>⚠ Void Accidental Payment</p>
                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{voidModal.studentName}</p>
                </div>
                <button onClick={() => setVoidModal(null)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #FEE2E2', background: 'white', cursor: 'pointer', color: '#64748B', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
            {/* Payment details */}
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* What's being voided */}
              <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Payment to be Voided</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[['Amount', `₹${voidModal.payment.amount_paid.toLocaleString('en-IN')}`], ['Mode', voidModal.payment.payment_mode.replace('_', ' ')], ['Date', new Date(voidModal.payment.payment_date).toLocaleDateString('en-IN')], ['Notes', voidModal.payment.notes ?? '—']].map(([l, v]) => (
                    <div key={l}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{l}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: '2px 0 0', textTransform: 'capitalize' }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Info */}
              <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12, color: '#92400E' }}>
                <strong>ℹ Note:</strong> This payment will be <strong>voided, not deleted</strong>. The record stays in the audit trail for compliance. The fee balance will be recalculated automatically.
              </div>
              {/* Reason */}
              {voidError && <div style={{ padding: '9px 13px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>{voidError}</div>}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reason for Voiding <span style={{ color: '#EF4444' }}>*</span></label>
                <textarea
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  rows={2}
                  placeholder='e.g. "Entered twice by mistake", "Wrong student", "Incorrect amount"'
                  style={{ width: '100%', padding: '9px 13px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            {/* Actions */}
            <div style={{ padding: '0 22px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setVoidModal(null)} style={{ flex: 1, padding: 11, borderRadius: 9, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmVoid} disabled={voiding}
                style={{ flex: 1, padding: 11, borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700,
                  background: voiding ? '#FCA5A5' : 'linear-gradient(135deg,#991B1B,#DC2626)',
                  color: 'white', cursor: voiding ? 'not-allowed' : 'pointer' }}>
                {voiding ? 'Voiding…' : '⚠ Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fee Receipt Modal */}
      {receiptData && <PrincipalFeeReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />}
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — IMPORT FEES FROM EXCEL
// ═══════════════════════════════════════════════════════════════════════════════
function TabImportFees({ schoolId, academicYearId }: { schoolId: string; academicYearId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [studentMap, setStudentMap] = useState<Map<string, string>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch admission_no → student_id map once schoolId is available
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const { data } = await supabase.from('students').select('id, admission_number').eq('school_id', schoolId).eq('is_active', true);
      const m = new Map<string, string>();
      (data ?? []).forEach((s: any) => { if (s.admission_number) m.set(s.admission_number.trim(), s.id); });
      setStudentMap(m);
      setMapLoaded(true);
    })();
  }, [supabase, schoolId]);

  const handleDownloadFeeTemplate = () => {
    const header = [['Admission No', 'Total Fee Amount (₹)', 'Amount Paid (₹)', 'Due Date (YYYY-MM-DD)']];
    const sample = [['STU-2025-0001', 15000, 5000, '2025-09-30'], ['STU-2025-0002', 12000, 12000, '2025-09-30']];
    const ws = XLSX.utils.aoa_to_sheet([...header, ...sample]);
    ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Fees');
    XLSX.writeFile(wb, 'Fee_Import_Template.xlsx');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const wsName = wb.SheetNames.find(n => n.toLowerCase().includes('fee')) ?? wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        const parsed = data.map((row: any, idx: number) => {
          let err = '';
          const getVal = (keywords: string[]) => {
            const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
            return key ? row[key] : undefined;
          };
          const admNo = String(getVal(['admission no', 'admission']) ?? '').trim();
          const totalFee = parseFloat(getVal(['total fee', 'fee amount']) ?? 0);
          const amtPaid = parseFloat(getVal(['amount paid', 'paid']) ?? 0);
          let dueDate = String(getVal(['due date']) ?? '').trim();

          // Normalize date if it's an Excel serial number
          const dueDateNum = parseFloat(dueDate);
          if (!isNaN(dueDateNum) && dueDateNum > 1000) {
            const d = new Date(Math.round((dueDateNum - 25569) * 86400 * 1000));
            dueDate = d.toISOString().split('T')[0];
          }

          // Auto-derive status
          const status = !isNaN(amtPaid) && amtPaid >= totalFee ? 'paid' : !isNaN(amtPaid) && amtPaid > 0 ? 'partially_paid' : 'pending';

          if (!admNo) err = 'Missing Admission No';
          else if (!totalFee || isNaN(totalFee) || totalFee <= 0) err = 'Invalid Total Fee';
          else if (!dueDate) err = 'Missing Due Date';
          else if (!studentMap.has(admNo)) err = `Admission No '${admNo}' not found`;

          return { rowNum: idx + 2, admNo, totalFee, amtPaid: isNaN(amtPaid) ? 0 : amtPaid, status, dueDate, studentId: studentMap.get(admNo) ?? '', err };
        });
        setRows(parsed);
      } catch { setError('Failed to parse file. Ensure it matches the template.'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    const valid = rows.filter(r => !r.err);
    if (!valid.length) { setError('No valid rows to import.'); return; }
    setImporting(true); setError(''); setSuccess('');
    let inserted = 0; const errors: string[] = [];
    for (const r of valid) {
      const feePayload = {
        school_id: schoolId,
        student_id: r.studentId,
        amount: r.totalFee,
        status: r.status,
        due_date: r.dueDate,
        ...(academicYearId ? { academic_year_id: academicYearId } : {}),
      };
      const { data: feeData, error: feeErr } = await supabase.from('fees').insert(feePayload).select('id').single();
      if (feeErr) { errors.push(`Row ${r.rowNum}: ${feeErr.message}`); continue; }
      // If amount already paid, record a fee_payment
      if (r.amtPaid > 0 && feeData?.id) {
        await supabase.from('fee_payments').insert({
          fee_id: feeData.id,
          student_id: r.studentId,
          school_id: schoolId,
          amount_paid: r.amtPaid,
          payment_mode: 'cash',
          payment_date: new Date().toISOString(),
          notes: 'Imported via bulk import',
        });
      }
      inserted++;
    }
    if (errors.length) setError(errors.join('\n'));
    if (inserted) setSuccess(`✅ Successfully imported ${inserted} fee record(s)!`);
    setImporting(false);
    if (!errors.length) setRows([]);
  };

  const validCount = rows.filter(r => !r.err).length;
  const invalidCount = rows.filter(r => r.err).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Step cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ padding: 18, background: '#F8FAFC', borderRadius: 12, border: '1px dashed #CBD5E1' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>1. Download Template</p>
          <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 12px' }}>4 simple columns: Admission No, Total Fee, Amount Paid, Due Date.</p>
          <button onClick={handleDownloadFeeTemplate} style={{ display: 'inline-block', padding: '7px 14px', background: 'white', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Download .xlsx</button>
        </div>
        <div style={{ padding: 18, background: '#EFF6FF', borderRadius: 12, border: '1px dashed #93C5FD' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8', margin: '0 0 4px' }}>2. Upload Fee Data</p>
          <p style={{ fontSize: 12, color: '#3B82F6', margin: '0 0 12px' }}>{mapLoaded ? `${studentMap.size} students loaded. Select your fee Excel file.` : 'Loading students…'}</p>
          <label style={{ display: 'inline-block', padding: '7px 14px', background: '#1D4ED8', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer' }}>
            Select File
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} disabled={!mapLoaded} />
          </label>
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 9, fontSize: 13, color: '#DC2626', whiteSpace: 'pre-line' }}>{error}</div>}
      {success && <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 9, fontSize: 13, color: '#065F46', fontWeight: 600 }}>{success}</div>}

      {rows.length > 0 && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
            Preview — {validCount} valid, {invalidCount} invalid
          </p>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  {['Row','Admission No','Total (₹)','Paid (₹)','Due Date','Status','Valid?'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748B', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: r.err ? '#FEF2F2' : (i % 2 === 0 ? '#F8FAFC' : 'white'), borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '7px 12px', fontSize: 12 }}>{r.rowNum}</td>
                    <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'monospace' }}>{r.admNo}</td>
                    <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600 }}>₹{r.totalFee?.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '7px 12px', fontSize: 12 }}>₹{r.amtPaid?.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '7px 12px', fontSize: 12 }}>{r.dueDate}</td>
                    <td style={{ padding: '7px 12px', fontSize: 12 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: r.status === 'paid' ? '#DCFCE7' : r.status === 'partially_paid' ? '#FEF3C7' : '#FEF2F2', color: r.status === 'paid' ? '#15803D' : r.status === 'partially_paid' ? '#92400E' : '#DC2626' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: 12 }}>
                      {r.err ? <span style={{ color: '#DC2626', fontWeight: 600 }}>{r.err}</span> : <span style={{ color: '#059669', fontWeight: 700 }}>✓ Valid</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700,
                background: importing || validCount === 0 ? '#93C5FD' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)',
                color: 'white', cursor: importing || validCount === 0 ? 'not-allowed' : 'pointer' }}
            >
              {importing ? 'Importing…' : `Import ${validCount} Fee Record(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
type Tab = 'individual' | 'bulk' | 'overview' | 'import';

export default function FeesPage() {
  const supabase = createClient();
  const [tab, setTab]             = useState<Tab>('individual');
  const [schoolId, setSchoolId]     = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [classes, setClasses]       = useState<ClassItem[]>([]);
  const [sections, setSections]     = useState<SectionItem[]>([]);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setInitLoading(false); return; }
      const { data: u } = await supabase.from('users').select('school_id').eq('id', user.id).single();
      if (!u?.school_id) { setInitLoading(false); return; }
      setSchoolId(u.school_id);

      const { data: yr } = await supabase.from('academic_years').select('id')
        .eq('is_current', true).eq('school_id', u.school_id).maybeSingle();
      if (yr?.id) setAcademicYearId(yr.id);

      const clsQ = yr?.id
        ? supabase.from('classes').select('id,name').eq('academic_year_id', yr.id).order('numeric_order')
        : supabase.from('classes').select('id,name').eq('school_id', u.school_id).order('numeric_order');
      const secQ = yr?.id
        ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id', yr.id)
        : supabase.from('sections').select('id,name,class_id').eq('school_id', u.school_id);

      const [{ data: cls }, { data: sec }] = await Promise.all([clsQ, secQ]);
      if (cls) setClasses(cls);
      if (sec) setSections(sec);
      setInitLoading(false);
    }
    init();
  }, [supabase]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'individual', label: 'Individual Fee Manager', icon: '👤' },
    { key: 'bulk',       label: 'Bulk Add-on',            icon: '⚡' },
    { key: 'overview',   label: 'Payment Overview',        icon: '📊' },
    { key: 'import',     label: 'Import Fees',             icon: '📥' },
  ];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Fee Management</h2>
        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Assign individual fees, bulk add-ons, and view payment overview</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: '#F1F5F9', borderRadius: 14, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: tab === t.key ? 'white' : 'transparent',
              color: tab === t.key ? '#1D4ED8' : '#64748B',
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {initLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 52, background: '#F1F5F9', borderRadius: 10 }} />)}
        </div>
      ) : (
        <>
          {tab === 'individual' && <TabIndividual schoolId={schoolId} academicYearId={academicYearId} classes={classes} sections={sections} />}
          {tab === 'bulk'       && <TabBulk       schoolId={schoolId} academicYearId={academicYearId} classes={classes} sections={sections} />}
          {tab === 'overview'   && <TabOverview   schoolId={schoolId} classes={classes} sections={sections} />}
          {tab === 'import'     && <TabImportFees schoolId={schoolId} academicYearId={academicYearId} />}
        </>
      )}
    </div>
  );
}
