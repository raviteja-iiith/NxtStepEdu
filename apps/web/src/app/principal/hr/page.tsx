'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

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

interface Employee {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

export default function HRPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<'employees' | 'leave' | 'payroll'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    setSchoolId(u.school_id);

    // Fetch employees (teachers + principal)
    const { data: emps } = await supabase.from('users')
      .select('id, full_name, role, email, phone, is_active, last_login_at')
      .eq('school_id', u.school_id)
      .in('role', ['teacher', 'principal'])
      .order('full_name');
    if (emps) setEmployees(emps as Employee[]);

    // Fetch leave requests for school staff
    const { data: leaves } = await supabase.from('leave_requests')
      .select('id, leave_type, from_date, to_date, reason, status, created_at, requester_id, users!leave_requests_requester_id_fkey(full_name, role)')
      .eq('school_id', u.school_id)
      .order('created_at', { ascending: false });

    if (leaves) {
      setLeaveRequests(leaves.map((l: any) => ({
        ...l,
        requester: l['users!leave_requests_requester_id_fkey'] || l.users,
      })));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateLeaveStatus = async (id: string, status: 'approved' | 'rejected') => {
    setUpdating(id);
    await supabase.from('leave_requests').update({ status }).eq('id', id);
    // Notify the teacher about the decision
    const leave = leaveRequests.find(l => l.id === id);
    if (leave?.requester_id) {
      const { createNotification } = await import('@/components/NotificationBell');
      await createNotification(supabase, {
        recipient_id: leave.requester_id,
        school_id: schoolId,
        type: 'leave_update',
        title: `Leave Request ${status === 'approved' ? 'Approved ✅' : 'Rejected ❌'}`,
        body: `Your ${leave.leave_type} leave from ${new Date(leave.from_date).toLocaleDateString('en-IN')} to ${new Date(leave.to_date).toLocaleDateString('en-IN')} has been ${status}.`,
        link: '/teacher/leave',
      });
    }
    fetchData();
    setUpdating(null);
  };

  // Compute leave summary by type
  const leaveSummary = leaveRequests.reduce((acc, l) => {
    if (!acc[l.leave_type]) acc[l.leave_type] = { pending: 0, approved: 0, rejected: 0 };
    acc[l.leave_type][l.status as 'pending' | 'approved' | 'rejected'] = (acc[l.leave_type][l.status as 'pending' | 'approved' | 'rejected'] || 0) + 1;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  const statusStyle: Record<string, { bg: string; color: string }> = {
    pending:  { bg: '#FFFBEB', color: '#D97706' },
    approved: { bg: '#F0FDF4', color: '#16A34A' },
    rejected: { bg: '#FEF2F2', color: '#DC2626' },
  };

  const tabs = [
    { key: 'employees' as const, label: '👥 Employees' },
    { key: 'leave' as const, label: '🏖️ Leave Requests' },
    { key: 'payroll' as const, label: '💰 Payroll' },
  ];

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">HR Management</h2><p className="text-gray-500 text-sm mt-1">Staff records, leave approvals, and payroll</p></div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#1E40AF' : '#64748B', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* EMPLOYEES TAB */}
      {tab === 'employees' && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          {loading ? <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
            <table className="w-full">
              <thead><tr style={{ background: '#F8FAFC' }}>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Contact</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Last Login</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr></thead>
              <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {employees.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400"><p className="text-3xl mb-2">👥</p><p className="text-sm">No staff found.</p></td></tr>
                ) : employees.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#EFF6FF', color: '#1E40AF' }}>{e.full_name.charAt(0)}</div>
                        <p className="text-sm font-semibold text-gray-900">{e.full_name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className="text-xs font-medium px-2 py-1 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{e.role}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{e.phone || e.email || '—'}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{e.last_login_at ? new Date(e.last_login_at).toLocaleDateString('en-IN') : 'Never'}</td>
                    <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: e.is_active ? '#F0FDF4' : '#FEF2F2', color: e.is_active ? '#16A34A' : '#DC2626' }}>{e.is_active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* LEAVE REQUESTS TAB */}
      {tab === 'leave' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          {Object.keys(leaveSummary).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(leaveSummary).map(([type, counts]) => (
                <div key={type} className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E2E8F0' }}>
                  <p className="text-xs text-gray-500 capitalize mb-1">{type.replace(/_/g, ' ')}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FFFBEB', color: '#D97706' }}>{counts.pending || 0} pending</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#F0FDF4', color: '#16A34A' }}>{counts.approved || 0} approved</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h3 className="font-bold text-gray-800">All Leave Requests</h3>
            </div>
            {loading ? <div className="p-8 space-y-3">{[1,2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div> :
              leaveRequests.length === 0 ? (
                <div className="p-12 text-center text-gray-400"><p className="text-3xl mb-2">🏖️</p><p className="text-sm">No leave requests yet.</p></div>
              ) : (
                <table className="w-full">
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Reason</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr></thead>
                  <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                    {leaveRequests.map(l => {
                      const days = Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1;
                      return (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-gray-900">{l.requester?.full_name || '—'}</p>
                            <p className="text-xs text-gray-400 capitalize">{l.requester?.role}</p>
                          </td>
                          <td className="px-6 py-4 text-sm capitalize text-gray-700">{l.leave_type?.replace(/_/g, ' ')}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <p>{new Date(l.from_date).toLocaleDateString('en-IN')}</p>
                            <p className="text-xs text-gray-400">{days} day{days !== 1 ? 's' : ''}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 max-w-[180px]">
                            <p className="truncate">{l.reason || '—'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize"
                              style={statusStyle[l.status] || statusStyle.pending}>{l.status}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {l.status === 'pending' ? (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => updateLeaveStatus(l.id, 'approved')} disabled={updating === l.id}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                                  style={{ background: '#16A34A' }}>✓ Approve</button>
                                <button onClick={() => updateLeaveStatus(l.id, 'rejected')} disabled={updating === l.id}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                                  style={{ background: '#DC2626' }}>✗ Reject</button>
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
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

      {/* PAYROLL TAB */}
      {tab === 'payroll' && (
        <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-4xl mb-4">💰</p>
          <h3 className="font-bold text-gray-800 mb-2">Payroll Module</h3>
          <p className="text-sm text-gray-500 mb-1">Staff count: <strong>{employees.length}</strong></p>
          <p className="text-xs text-gray-400">Payroll processing with salary components will be available in the next update.</p>
          <p className="text-xs text-gray-400 mt-1">Basic + HRA + TA + DA + Allowances − Deductions = Net Salary</p>
        </div>
      )}
    </div>
  );
}
