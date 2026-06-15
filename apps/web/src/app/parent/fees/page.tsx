'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// fees table has: amount, discount_amount, status, due_date, fee_structure_id
// fee_payments table has: amount_paid, payment_date (the actual payment transaction)
interface Fee {
  id: string;
  amount: number;
  discount_amount: number;
  status: string;
  due_date: string | null;
  fee_structures: { name: string; fee_type: string } | null;
  // Latest payment info (if any)
  payment_date?: string | null;
  amount_paid?: number;
}

export default function ParentFeesPage() {
  const supabase = createClient();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');

  const fetchFees = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    // Get linked student — use maybeSingle() to avoid error when no link exists
    const { data: link } = await supabase
      .from('student_parent_links')
      .select('student_id, students(full_name)')
      .eq('parent_id', userId)
      .limit(1)
      .maybeSingle();

    if (!link) { setLoading(false); return; }

    setStudentName((link.students as any)?.full_name || '');
    const studentId = link.student_id;

    // Query fees table (has amount, status, due_date, fee_structure_id)
    const { data } = await supabase
      .from('fees')
      .select('id, amount, discount_amount, status, due_date, fee_structures(name, fee_type)')
      .eq('student_id', studentId)
      .order('due_date', { ascending: false });

    if (data) {
      // Enrich with payment info where available
      const feeIds = (data as Array<{ id: string }>).map(f => f.id);
      const { data: payments } = feeIds.length > 0
        ? await supabase
            .from('fee_payments')
            .select('fee_id, amount_paid, payment_date')
            .in('fee_id', feeIds)
        : { data: [] };

      const paymentMap: Record<string, { amount_paid: number; payment_date: string }> = {};
      if (payments) {
        payments.forEach((p: { fee_id: string; amount_paid: number; payment_date: string }) => {
          paymentMap[p.fee_id] = { amount_paid: p.amount_paid, payment_date: p.payment_date };
        });
      }

      setFees((data as Array<{ id: string; amount: number; discount_amount: number; status: string; due_date: string | null; fee_structures: { name: string; fee_type: string } | null }>).map(f => ({
        ...f,
        fee_structures: f.fee_structures as any,
        amount_paid: paymentMap[f.id]?.amount_paid,
        payment_date: paymentMap[f.id]?.payment_date,
      })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchFees(); }, [fetchFees]);

  const totalPending = fees
    .filter(f => f.status === 'pending' || f.status === 'overdue')
    .reduce((a, f) => a + Math.max(0, (f.amount - (f.discount_amount || 0)) - (f.amount_paid || 0)), 0);
  const totalPaid = fees
    .filter(f => f.status === 'paid')
    .reduce((a, f) => a + (f.amount_paid || f.amount), 0);
  const nextDue = fees.find(f => f.status === 'pending' && f.due_date);

  const statusStyles: Record<string, { bg: string; color: string }> = {
    paid: { bg: '#F0FDF4', color: '#16A34A' },
    pending: { bg: '#FFFBEB', color: '#D97706' },
    overdue: { bg: '#FEF2F2', color: '#DC2626' },
    partially_paid: { bg: '#EFF6FF', color: '#2563EB' },
    waived: { bg: '#F5F3FF', color: '#7C3AED' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Fee Management</h2>
        <p className="text-gray-500 text-sm mt-1">
          {studentName ? `Fees for ${studentName}` : 'View dues and payment history'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Total Pending', value: `₹${totalPending.toLocaleString('en-IN')}`, color: '#DC2626' },
            { label: 'Paid This Year', value: `₹${totalPaid.toLocaleString('en-IN')}`, color: '#16A34A' },
            { label: 'Next Due', value: nextDue?.due_date ? new Date(nextDue.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', color: '#D97706' },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E2E8F0' }}>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)
        ) : fees.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-4xl mb-3">✅</p>
            <p className="text-gray-600 font-semibold">No fee records found</p>
            <p className="text-sm text-gray-400 mt-1">Fee records will appear here once your school creates fee structures</p>
          </div>
        ) : fees.map((f) => {
          const netAmount = f.amount - (f.discount_amount || 0);
          const style = statusStyles[f.status] || statusStyles.pending;
          return (
            <div key={f.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between" style={{ borderColor: '#E2E8F0' }}>
              <div>
                <p className="font-bold text-gray-900">{(f.fee_structures as any)?.name || 'Fee'}</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{(f.fee_structures as any)?.fee_type?.replace('_', ' ')}</p>
                {f.due_date && <p className="text-sm text-gray-500 mt-0.5">Due: {new Date(f.due_date).toLocaleDateString('en-IN')}</p>}
                {f.payment_date && <p className="text-xs text-green-600 mt-0.5">Paid on: {new Date(f.payment_date).toLocaleDateString('en-IN')}</p>}
                {f.discount_amount > 0 && <p className="text-xs text-purple-600 mt-0.5">Discount: ₹{f.discount_amount.toLocaleString('en-IN')}</p>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-bold text-lg" style={{ color: '#1E40AF' }}>₹{netAmount.toLocaleString('en-IN')}</p>
                  {f.amount_paid && f.status !== 'paid' && (
                    <p className="text-xs text-green-600">₹{f.amount_paid.toLocaleString('en-IN')} paid</p>
                  )}
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={style}>{f.status.replace('_', ' ')}</span>
                </div>
                {(f.status === 'pending' || f.status === 'overdue') && (
                  <button className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#7C3AED' }}>Pay Now</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
