'use client';

import { useState, useEffect, useCallback } from 'react';
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

const P = { fontFamily: "'Inter', sans-serif" };
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const statusCfg: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  paid:            { bg: '#F0FDF4', color: '#16A34A', label: 'Paid',           dot: '#22C55E' },
  pending:         { bg: '#FFFBEB', color: '#D97706', label: 'Pending',        dot: '#F59E0B' },
  overdue:         { bg: '#FEF2F2', color: '#DC2626', label: 'Overdue',        dot: '#EF4444' },
  partially_paid:  { bg: '#EFF6FF', color: '#2563EB', label: 'Partially Paid', dot: '#60A5FA' },
  waived:          { bg: '#F5F3FF', color: '#7C3AED', label: 'Waived',         dot: '#A78BFA' },
};

export default function ParentFeesPage() {
  const supabase = createClient();
  const { selectedChild, loading: childLoading } = useParent();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);

  const studentName = selectedChild?.student_name || '';

  const fetchFees = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    const studentId = selectedChild.student_id;

    const { data } = await supabase
      .from('fees').select('id, amount, discount_amount, status, due_date, fee_structures(name, fee_type)')
      .eq('student_id', studentId).order('due_date', { ascending: false });

    if (data) {
      const feeIds = (data as any[]).map(f => f.id);
      const { data: payments } = feeIds.length > 0
        ? await supabase.from('fee_payments').select('fee_id, amount_paid, payment_date').in('fee_id', feeIds)
        : { data: [] };
      const pm: Record<string, any> = {};
      (payments ?? []).forEach((p: any) => { pm[p.fee_id] = p; });
      setFees((data as any[]).map(f => ({ ...f, amount_paid: pm[f.id]?.amount_paid, payment_date: pm[f.id]?.payment_date })));
    }
    setLoading(false);
  }, [supabase, selectedChild]);

  useEffect(() => {
    if (!childLoading && selectedChild) fetchFees();
    else if (!childLoading && !selectedChild) setLoading(false);
  }, [fetchFees, selectedChild, childLoading]);

  const totalPending = fees.filter(f => f.status === 'pending' || f.status === 'overdue')
    .reduce((a, f) => a + Math.max(0, (f.amount - (f.discount_amount || 0)) - (f.amount_paid || 0)), 0);
  const totalPaid = fees.filter(f => f.status === 'paid')
    .reduce((a, f) => a + (f.amount_paid || f.amount), 0);
  const nextDue = fees.find(f => f.status === 'pending' && f.due_date);

  const summaryCards = [
    { label: 'Total Pending', value: fmt(totalPending), color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '⚠️' },
    { label: 'Paid This Year', value: fmt(totalPaid),   color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: '✅' },
    { label: 'Next Due Date',  value: nextDue?.due_date ? new Date(nextDue.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: '📅' },
  ];

  return (
    <div style={{ ...P, display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Fee Management</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>
          {studentName ? `Fee dues and payment history for ${studentName}` : 'View dues and payment history'}
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 20, fontWeight: 900, color: '#1E40AF', letterSpacing: '-0.02em', margin: 0 }}>{fmt(netAmount)}</p>
                    {f.amount_paid && f.status !== 'paid' && <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 600, margin: '2px 0 0' }}>{fmt(f.amount_paid)} paid</p>}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.dot}44`, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                    {cfg.label}
                  </span>
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
