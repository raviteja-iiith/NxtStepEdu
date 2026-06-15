'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface FeeStructure { id: string; name: string; fee_type: string; amount: number; due_date: string | null; is_recurring: boolean; recurring_interval: string | null; class_name?: string; }
interface ClassItem { id: string; name: string; }

const FEE_TYPES = ['tuition','transport','hostel','examination','activity','library','uniform','miscellaneous'];

export default function FeesPage() {
  const supabase = createClient();
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [tab, setTab] = useState<'structures' | 'collection'>('structures');
  const [collectionStats, setCollectionStats] = useState({ collected: 0, pending: 0, overdue: 0 });

  const [form, setForm] = useState({ name: '', fee_type: 'tuition', class_id: '', amount: '', due_date: '', is_recurring: false, recurring_interval: 'monthly' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!userData?.school_id) { setLoading(false); return; }
    const schoolId = userData.school_id;

    const { data } = await supabase.from('fee_structures').select('*, classes(name)').eq('school_id', schoolId).order('created_at', { ascending: false });
    if (data) setStructures(data.map((f: Record<string, unknown>) => ({ ...f, class_name: (f.classes as Record<string, string>)?.name })) as FeeStructure[]);
    
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    if (yr) { const { data: c } = await supabase.from('classes').select('id, name').eq('academic_year_id', yr.id).order('numeric_order'); if (c) setClasses(c); }

    // Fetch real collection stats from fees table
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const monthStart = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
    const monthEnd = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

    // Collected this month — sum of amount_paid in fee_payments for this school's fees this month
    const { data: payments } = await supabase
      .from('fee_payments')
      .select('amount_paid')
      .eq('school_id', schoolId)
      .gte('payment_date', monthStart)
      .lte('payment_date', monthEnd + 'T23:59:59');
    const collected = payments ? payments.reduce((a: number, p: any) => a + (p.amount_paid || 0), 0) : 0;

    // Pending dues — sum of (amount - discount_amount) for pending/partially_paid fees
    const { data: pendingFees } = await supabase
      .from('fees')
      .select('amount, discount_amount')
      .eq('school_id', schoolId)
      .in('status', ['pending', 'partially_paid']);
    const pending = pendingFees ? pendingFees.reduce((a: number, f: any) => a + Math.max(0, (f.amount || 0) - (f.discount_amount || 0)), 0) : 0;

    // Overdue fees
    const today = new Date().toISOString().split('T')[0];
    const { data: overdueFees } = await supabase
      .from('fees')
      .select('amount, discount_amount')
      .eq('school_id', schoolId)
      .eq('status', 'overdue');
    const overdue = overdueFees ? overdueFees.reduce((a: number, f: any) => a + Math.max(0, (f.amount || 0) - (f.discount_amount || 0)), 0) : 0;

    setCollectionStats({ collected, pending, overdue });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.name || !form.amount) { setFormError('Name and amount required'); return; }
    setSaving(true); setFormError('');
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    const { error } = await supabase.from('fee_structures').insert({
      name: form.name, fee_type: form.fee_type, class_id: form.class_id || null, amount: parseFloat(form.amount),
      due_date: form.due_date || null, is_recurring: form.is_recurring, recurring_interval: form.is_recurring ? form.recurring_interval : null,
      academic_year_id: yr?.id, school_id: userData?.school_id, created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowAdd(false); setForm({ name: '', fee_type: 'tuition', class_id: '', amount: '', due_date: '', is_recurring: false, recurring_interval: 'monthly' });
    fetchData(); setSaving(false);
  };

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Fee Management</h2><p className="text-gray-500 text-sm mt-1">Fee structures, collection, and defaulters</p></div>
        <button onClick={() => { setShowAdd(true); setFormError(''); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#1E40AF' }}>+ Add Fee Structure</button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {[{ key: 'structures' as const, label: '📋 Fee Structures' }, { key: 'collection' as const, label: '💰 Collection Overview' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#1E40AF' : '#64748B', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'structures' ? (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          {loading ? <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div> : (
            <table className="w-full">
              <thead><tr style={{ background: '#F8FAFC' }}>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Fee Name</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Class</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Due Date</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Recurring</th>
              </tr></thead>
              <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {structures.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">💰</p><p className="text-sm">No fee structures yet.</p></td></tr>
                ) : structures.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{f.name}</td>
                    <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{f.fee_type}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{f.class_name || 'All Classes'}</td>
                    <td className="px-6 py-4 text-sm font-bold" style={{ color: '#1E40AF' }}>₹{f.amount.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-6 py-4">{f.is_recurring ? <span className="text-xs font-medium px-2 py-1 rounded-full capitalize" style={{ background: '#EFF6FF', color: '#1E40AF' }}>{f.recurring_interval}</span> : <span className="text-xs text-gray-400">One-time</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Collected This Month', value: `₹${collectionStats.collected.toLocaleString('en-IN')}`, icon: '✅', bg: '#F0FDF4', color: '#16A34A' },
              { label: 'Pending Dues', value: `₹${collectionStats.pending.toLocaleString('en-IN')}`, icon: '⏳', bg: '#FFFBEB', color: '#D97706' },
              { label: 'Overdue Amount', value: `₹${collectionStats.overdue.toLocaleString('en-IN')}`, icon: '⚠️', bg: '#FEF2F2', color: '#DC2626' },
            ].map((c, i) => (
              <div key={i} className="p-6 rounded-2xl border bg-white" style={{ borderColor: '#E2E8F0' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: c.bg }}>{c.icon}</div>
                <p className="text-2xl font-bold" style={{ color: c.color }}>
                  {loading ? <span className="inline-block w-24 h-7 bg-slate-100 rounded animate-pulse" /> : c.value}
                </p>
                <p className="text-sm text-gray-600 mt-1">{c.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-sm text-gray-500 font-medium">Fee collection summary reflects all payments recorded in the system. Create fee structures and record payments to see detailed breakdowns.</p>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Add Fee Structure</h3><button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Fee Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='e.g. "Term 1 Tuition"' className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label><select value={form.fee_type} onChange={e => setForm(f => ({ ...f, fee_type: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}>{FEE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Class</label><select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="">All Classes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#F8FAFC' }}>
                <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} className="w-4 h-4" />
                <label htmlFor="recurring" className="text-sm font-medium text-gray-700">Recurring Fee</label>
                {form.is_recurring && <select value={form.recurring_interval} onChange={e => setForm(f => ({ ...f, recurring_interval: e.target.value }))} className="ml-auto px-3 py-1 border rounded-lg text-sm" style={{ borderColor: '#E2E8F0' }}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select>}
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:shadow-lg" style={{ background: '#1E40AF' }}>{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
