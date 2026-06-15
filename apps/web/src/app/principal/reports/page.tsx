'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalParents: number;
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
  feesPending: number;
  feesCollected: number;
  totalExams: number;
  pendingLeaves: number;
  totalAnnouncements: number;
  totalSections: number;
}

export default function ReportsPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    setSchoolId(u.school_id);
    const sid = u.school_id;

    // Run all counts in parallel
    const today = new Date().toISOString().split('T')[0];

    const [
      { count: totalStudents },
      { count: totalTeachers },
      { count: totalParents },
      { count: presentToday },
      { count: absentToday },
      { data: feeData },
      { count: totalExams },
      { count: pendingLeaves },
      { count: totalAnnouncements },
      { count: totalSections },
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('is_active', true),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('role', 'teacher').eq('is_active', true),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('role', 'parent').eq('is_active', true),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('date', today).eq('status', 'present'),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('date', today).eq('status', 'absent'),
      supabase.from('fees').select('amount, discount_amount, status').eq('school_id', sid),
      supabase.from('exams').select('*', { count: 'exact', head: true }).eq('school_id', sid),
      supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'pending'),
      supabase.from('announcements').select('*', { count: 'exact', head: true }).eq('school_id', sid),
      supabase.from('sections').select('*', { count: 'exact', head: true }).eq('school_id', sid),
    ]);

    // Calculate fees
    let feesCollected = 0, feesPending = 0;
    if (feeData) {
      feeData.forEach((f: any) => {
        const net = (f.amount || 0) - (f.discount_amount || 0);
        if (f.status === 'paid') feesCollected += net;
        else if (f.status === 'pending' || f.status === 'overdue') feesPending += net;
      });
    }

    const attendedToday = (presentToday || 0) + (absentToday || 0);
    const attendanceRate = attendedToday > 0 ? Math.round(((presentToday || 0) / attendedToday) * 100) : 0;

    setStats({
      totalStudents: totalStudents || 0,
      totalTeachers: totalTeachers || 0,
      totalParents: totalParents || 0,
      presentToday: presentToday || 0,
      absentToday: absentToday || 0,
      attendanceRate,
      feesCollected,
      feesPending,
      totalExams: totalExams || 0,
      pendingLeaves: pendingLeaves || 0,
      totalAnnouncements: totalAnnouncements || 0,
      totalSections: totalSections || 0,
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const statCards = stats ? [
    { icon: '👨‍🎓', label: 'Total Students', value: stats.totalStudents, color: '#1E40AF', bg: '#EFF6FF' },
    { icon: '👨‍🏫', label: 'Teachers', value: stats.totalTeachers, color: '#0F766E', bg: '#F0FDF4' },
    { icon: '👨‍👩‍👧', label: 'Parents', value: stats.totalParents, color: '#7C3AED', bg: '#F5F3FF' },
    { icon: '🏫', label: 'Sections', value: stats.totalSections, color: '#D97706', bg: '#FFFBEB' },
    { icon: '✅', label: 'Present Today', value: stats.presentToday, color: '#16A34A', bg: '#F0FDF4' },
    { icon: '❌', label: 'Absent Today', value: stats.absentToday, color: '#DC2626', bg: '#FEF2F2' },
    { icon: '📊', label: 'Attendance Rate', value: `${stats.attendanceRate}%`, color: '#1E40AF', bg: '#EFF6FF' },
    { icon: '📋', label: 'Total Exams', value: stats.totalExams, color: '#7C3AED', bg: '#F5F3FF' },
    { icon: '💰', label: 'Fees Collected', value: `₹${stats.feesCollected.toLocaleString('en-IN')}`, color: '#16A34A', bg: '#F0FDF4' },
    { icon: '⚠️', label: 'Fees Pending', value: `₹${stats.feesPending.toLocaleString('en-IN')}`, color: '#DC2626', bg: '#FEF2F2' },
    { icon: '🏖️', label: 'Pending Leaves', value: stats.pendingLeaves, color: '#D97706', bg: '#FFFBEB' },
    { icon: '📢', label: 'Announcements', value: stats.totalAnnouncements, color: '#0F766E', bg: '#F0FDF4' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">School Reports</h2><p className="text-gray-500 text-sm mt-1">Live statistics from your school database</p></div>
        <button onClick={fetchStats} className="px-4 py-2 rounded-xl text-sm font-semibold border text-gray-700 hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {statCards.map((c, i) => (
            <div key={i} className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all" style={{ borderColor: '#E2E8F0' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: c.bg }}>{c.icon}</div>
              </div>
              <p className="text-2xl font-black" style={{ color: c.color }}>{c.value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Today's Snapshot */}
      {stats && (
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-800 mb-4">Today&apos;s Snapshot — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Attendance Bar */}
            <div className="p-4 rounded-xl" style={{ background: '#F8FAFC' }}>
              <p className="text-sm font-semibold text-gray-700 mb-3">Attendance</p>
              <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${stats.attendanceRate}%`, background: stats.attendanceRate >= 75 ? '#16A34A' : stats.attendanceRate >= 50 ? '#D97706' : '#DC2626' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>✅ {stats.presentToday} present</span>
                <span>❌ {stats.absentToday} absent</span>
              </div>
            </div>

            {/* Fee Collection */}
            <div className="p-4 rounded-xl" style={{ background: '#F8FAFC' }}>
              <p className="text-sm font-semibold text-gray-700 mb-3">Fee Collection</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Collected</span>
                  <span className="font-bold text-green-600">₹{stats.feesCollected.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-bold text-red-500">₹{stats.feesPending.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="p-4 rounded-xl" style={{ background: '#F8FAFC' }}>
              <p className="text-sm font-semibold text-gray-700 mb-3">Pending Actions</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Leave Requests</span>
                  <span className="font-bold" style={{ color: stats.pendingLeaves > 0 ? '#D97706' : '#16A34A' }}>{stats.pendingLeaves}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Exams Scheduled</span>
                  <span className="font-bold text-blue-600">{stats.totalExams}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
