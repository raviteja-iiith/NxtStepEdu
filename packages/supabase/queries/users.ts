import { SupabaseClient } from '@supabase/supabase-js';

export async function getUserProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) throw error;
  return data;
}

export async function getDashboardStats(supabase: SupabaseClient, schoolId: string) {
  const { count: students } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_active', true);
    
  const { count: teachers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true);
    
  const { count: parents } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'parent')
    .eq('is_active', true);
    
  return { students: students || 0, teachers: teachers || 0, parents: parents || 0 };
}

export async function getSchoolEmployees(supabase: SupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*, teacher_profiles(*)')
    .eq('school_id', schoolId)
    .in('role', ['teacher', 'principal']) // staff roles
    .eq('is_active', true)
    .order('full_name');
    
  if (error) throw error;
  return data || [];
}

export async function getParentDashboardStats(supabase: SupabaseClient, parentId: string) {
  // First get the linked student — use maybeSingle() to avoid error when no link exists
  const { data: link } = await supabase
    .from('student_parent_links')
    .select('student_id, students(full_name, section_id)')
    .eq('parent_id', parentId)
    .limit(1)
    .maybeSingle();
    
  if (!link) return { studentName: '', attendanceToday: '—', monthlyAttendance: '—%', pendingFees: '₹0', examsCount: 0 };
  
  const studentId = link.student_id;
  const sectionId = (link.students as any)?.section_id;
  
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  // Today's attendance — use maybeSingle() to avoid error when no attendance record exists
  const { data: todayAtt } = await supabase
    .from('attendance')
    .select('status')
    .eq('student_id', studentId)
    .eq('date', today)
    .maybeSingle();
    
  // Monthly attendance calculation
  const { data: monthlyAtt } = await supabase
    .from('attendance')
    .select('status')
    .eq('student_id', studentId)
    .gte('date', firstOfMonth)
    .lte('date', today);
    
  let monthlyAttendance = '—%';
  if (monthlyAtt && monthlyAtt.length > 0) {
    const presentCount = monthlyAtt.filter((a: { status: string }) => a.status === 'present' || a.status === 'late').length;
    monthlyAttendance = `${Math.round((presentCount / monthlyAtt.length) * 100)}%`;
  }
    
  // Pending Fees — use fees table (has amount, status, due_date)
  // fee_payments only stores payment transactions, not the fee amount/status
  const { data: fees } = await supabase
    .from('fees')
    .select('amount, discount_amount')
    .eq('student_id', studentId)
    .in('status', ['pending', 'overdue']);
    
  const totalFees = fees ? fees.reduce((acc, f) => acc + Math.max(0, (f.amount || 0) - (f.discount_amount || 0)), 0) : 0;
  
  // Upcoming Exams
  const { count: examsCount } = await supabase
    .from('exams')
    .select('*', { count: 'exact', head: true })
    .eq('section_id', sectionId || '')
    .eq('is_published', true)
    .gte('exam_date', today);
    
  return {
    studentName: (link.students as any)?.full_name || 'Student',
    attendanceToday: todayAtt 
      ? (todayAtt.status === 'present' ? '✅ Present' 
        : todayAtt.status === 'absent' ? '❌ Absent' 
        : todayAtt.status === 'late' ? '🕐 Late' : '📋 Excused')
      : '—',
    monthlyAttendance,
    pendingFees: `₹${totalFees.toLocaleString('en-IN')}`,
    examsCount: examsCount || 0
  };
}

export async function getPrincipalDashboardStats(supabase: SupabaseClient, schoolId: string) {
  const today = new Date().toISOString().split('T')[0];

  const { count: totalStudents } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_active', true);
    
  const { count: totalTeachers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true);

  // Today's attendance — count present vs total marked
  const { count: markedToday } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('date', today);

  const { count: presentToday } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('date', today)
    .eq('status', 'present');

  const attendanceToday = markedToday && markedToday > 0
    ? `${Math.round(((presentToday || 0) / markedToday) * 100)}%`
    : 'Not Taken';  // distinguish "no attendance recorded today" from an error

  // ── Fee Deficit: actual unpaid balance (amount - payments made) ──────────
  // Do NOT just sum fees.amount for status=pending/overdue — that ignores
  // payments already made on partially_paid fees. Must subtract real payments.
  const { data: feeData } = await supabase
    .from('fees')
    .select('id, amount, discount_amount')
    .eq('school_id', schoolId)
    .not('status', 'eq', 'paid')   // include pending, overdue, partially_paid, waived
    .not('status', 'eq', 'waived');

  let pendingFeesTotal = 0;
  if (feeData && feeData.length > 0) {
    const feeIds = feeData.map((f: any) => f.id);
    // Fetch all non-voided payments for these fees
    const { data: payments } = await supabase
      .from('fee_payments')
      .select('fee_id, amount_paid, is_voided')
      .in('fee_id', feeIds);

    // Build a map of fee_id → total paid (excluding voided)
    const paidMap = new Map<string, number>();
    (payments ?? []).forEach((p: any) => {
      if (!p.is_voided) {
        paidMap.set(p.fee_id, (paidMap.get(p.fee_id) ?? 0) + (p.amount_paid ?? 0));
      }
    });

    // Sum actual remaining balances
    pendingFeesTotal = feeData.reduce((acc: number, f: any) => {
      const gross = Math.max(0, (f.amount || 0) - (f.discount_amount || 0));
      const paid  = paidMap.get(f.id) ?? 0;
      return acc + Math.max(0, gross - paid);
    }, 0);
  }

  const pendingFees = `₹${pendingFeesTotal.toLocaleString('en-IN')}`;
    
  return {
    totalStudents: totalStudents || 0,
    totalTeachers: totalTeachers || 0,
    attendanceToday,
    pendingFees,
  };
}
