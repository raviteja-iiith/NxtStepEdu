import re

with open('apps/web/src/app/api/ai/tools.ts', 'r') as f:
    content = f.read()

# 1. Signature
content = content.replace(
    '  userId: string\n): Promise<ToolResult> {',
    '  userId: string,\n  role: string\n): Promise<ToolResult> {'
)

# 2. Add role check helper
helper = """
  // ── Role Authorization Helper ──
  const assertRole = (allowed: string[]) => {
    if (!allowed.includes(role)) throw new Error(`Tool ${toolName} not allowed for role ${role}`);
  };
"""
content = content.replace('  switch (toolName) {', helper + '\n  switch (toolName) {')

# 3. get_dashboard_summary (Principal only)
content = content.replace("    case 'get_dashboard_summary': {", "    case 'get_dashboard_summary': {\n      assertRole(['principal']);")

# 4. get_staff (Principal only)
content = content.replace("    case 'get_staff': {", "    case 'get_staff': {\n      assertRole(['principal']);")

# 5. get_attendance (Principal, Teacher, Parent)
# Actually, I'll rewrite the get_attendance case using regex sub
attendance_code = """
    case 'get_attendance': {
      assertRole(['principal', 'teacher', 'parent']);
      const { date = today() } = params;
      
      let attQuery = db.from('attendance').select('status, sections(name, classes(name)), student_id, students(full_name)').eq('school_id', schoolId).eq('date', date);
      
      if (role === 'teacher') {
        const { data: sections } = await db.from('sections').select('id').eq('class_teacher_id', userId);
        if (!sections || sections.length === 0) return { success: true, data: null, summary: 'You are not assigned as a class teacher to any section.' };
        attQuery = attQuery.in('section_id', sections.map((s: any) => s.id));
      } else if (role === 'parent') {
        const { data: students } = await db.from('students').select('id').eq('parent_id', userId);
        if (!students || students.length === 0) return { success: true, data: null, summary: 'No children found.' };
        attQuery = attQuery.in('student_id', students.map((s: any) => s.id));
      }

      const { data: att } = await attQuery;

      if (!att || att.length === 0) {
        return { success: true, data: null, summary: `No attendance data recorded for ${date}.` };
      }

      const present = att.filter((a: any) => a.status === 'present').length;
      const absent = att.filter((a: any) => a.status === 'absent').length;
      const late = att.filter((a: any) => a.status === 'late').length;
      const total = att.length;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;

      const chartData = {
        chartType: 'pie' as const,
        data: [
          { name: 'Present', value: present, fill: '#16A34A' },
          { name: 'Absent', value: absent, fill: '#DC2626' },
          { name: 'Late', value: late, fill: '#D97706' },
        ],
        config: { xKey: 'name', yKeys: ['value'], colors: ['#16A34A','#DC2626','#D97706'] },
      };

      return {
        success: true,
        data: { date, present, absent, late, total, percentage: pct, records: role === 'parent' ? att : undefined },
        summary: `Attendance for ${date}: ${pct}% — ${present} present, ${absent} absent, ${late} late out of ${total} total.`,
        chartData,
        actions: [],
      };
    }
"""
content = re.sub(r"    case 'get_attendance': \{.*?(?=    // ── Attendance Trend)", attendance_code, content, flags=re.DOTALL)

# 6. get_attendance_trend (Principal, Teacher)
att_trend_code = """
    case 'get_attendance_trend': {
      assertRole(['principal', 'teacher']);
      const days = Math.min(params.days ?? 7, 30);
      const trendData: any[] = [];
      
      let sectionIds: string[] = [];
      if (role === 'teacher') {
        const { data: sections } = await db.from('sections').select('id').eq('class_teacher_id', userId);
        if (sections) sectionIds = sections.map((s: any) => s.id);
      }

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        let q = db.from('attendance').select('status').eq('school_id', schoolId).eq('date', dateStr);
        if (role === 'teacher' && sectionIds.length > 0) q = q.in('section_id', sectionIds);
        
        const { data: att } = await q;
        const total = att?.length ?? 0;
        const present = att?.filter((a: any) => a.status === 'present').length ?? 0;
        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
        trendData.push({
          date: dateStr,
          label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
          present, total, percentage: pct,
        });
      }

      const avgPct = trendData.filter(d => d.total > 0).reduce((s, d) => s + d.percentage, 0) / Math.max(1, trendData.filter(d => d.total > 0).length);

      return {
        success: true, data: trendData,
        summary: `Attendance trend for last ${days} days. Average: ${Math.round(avgPct)}%.`,
        chartData: {
          chartType: 'area' as const,
          data: trendData,
          config: { xKey: 'label', yKeys: ['percentage'], colors: ['#3B82F6'], label: 'Attendance %' },
        },
      };
    }
"""
content = re.sub(r"    case 'get_attendance_trend': \{.*?(?=    // ── Leave Requests)", att_trend_code, content, flags=re.DOTALL)


# 7. get_leave_requests (Principal, Teacher)
leave_req_code = """
    case 'get_leave_requests': {
      assertRole(['principal', 'teacher']);
      const { status = 'all', limit = 20 } = params;
      let q = db.from('leave_requests')
        .select('id,leave_type,from_date,to_date,reason,status,created_at,requester_id,users!leave_requests_requester_id_fkey(full_name,role)')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(limit);
      
      if (status !== 'all') q = q.eq('status', status);
      if (role === 'teacher') q = q.eq('requester_id', userId); // Teachers only see their own
      
      const { data } = await q;

      if (!data || data.length === 0) {
        return { success: true, data: [], summary: `No leave requests found${status !== 'all' ? ` with status "${status}"` : ''}.` };
      }

      const formatted = data.map((l: any) => ({
        ...l,
        requesterName: (l as any)['users!leave_requests_requester_id_fkey']?.full_name || 'Unknown',
        requesterRole: (l as any)['users!leave_requests_requester_id_fkey']?.role || '',
        days: Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1,
      }));

      const table = {
        headers: ['Staff', 'Type', 'Dates', 'Days', 'Status'],
        rows: formatted.map((l: any) => [
          l.requesterName,
          (l.leave_type || '').replace(/_/g, ' '),
          `${new Date(l.from_date).toLocaleDateString('en-IN')} – ${new Date(l.to_date).toLocaleDateString('en-IN')}`,
          l.days,
          l.status,
        ]),
      };

      const pending = formatted.filter((l: any) => l.status === 'pending');
      const summary = `${data.length} leave request(s) found. ${pending.length} pending approval.`
        + (pending.length > 0 ? ` Pending: ${pending.slice(0,3).map((l: any) => l.requesterName).join(', ')}${pending.length > 3 ? '...' : ''}.` : '');

      return {
        success: true, data: formatted, summary,
        tableData: table,
      };
    }
"""
content = re.sub(r"    case 'get_leave_requests': \{.*?(?=    // ── Approve Leave)", leave_req_code, content, flags=re.DOTALL)

# 8. approve/reject leave, get_payroll, get_payroll_trend
content = content.replace("    case 'approve_leave': {", "    case 'approve_leave': {\n      assertRole(['principal']);")
content = content.replace("    case 'reject_leave': {", "    case 'reject_leave': {\n      assertRole(['principal']);")
content = content.replace("    case 'get_payroll': {", "    case 'get_payroll': {\n      assertRole(['principal']);")
content = content.replace("    case 'get_payroll_trend': {", "    case 'get_payroll_trend': {\n      assertRole(['principal']);")

# 9. get_fee_summary (Principal, Parent)
fee_code = """
    case 'get_fee_summary': {
      assertRole(['principal', 'parent']);
      let q = db.from('fees').select('total_amount,paid_amount,status,due_date,student_id').eq('school_id', schoolId);
      
      if (role === 'parent') {
        const { data: students } = await db.from('students').select('id').eq('parent_id', userId);
        if (!students || students.length === 0) return { success: true, data: null, summary: 'No children found.' };
        q = q.in('student_id', students.map((s: any) => s.id));
      }
      
      const { data: fees } = await q;
      if (!fees || fees.length === 0) {
        return { success: true, data: null, summary: 'No fee records found.' };
      }

      const total = fees.reduce((s: number, f: any) => s + (f.total_amount || 0), 0);
      const collected = fees.reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
      const pending = total - collected;
      const paidCount = fees.filter((f: any) => f.status === 'paid').length;
      const pendingCount = fees.filter((f: any) => f.status === 'pending' || f.status === 'partially_paid').length;

      return {
        success: true,
        data: { total, collected, pending, paidCount, pendingCount, totalRecords: fees.length },
        summary: `Fee status: ₹${(collected/100000).toFixed(2)}L collected out of ₹${(total/100000).toFixed(2)}L total. ${pendingCount} pending records.`,
        chartData: {
          chartType: 'pie' as const,
          data: [
            { name: 'Collected', value: Math.round(collected), fill: '#16A34A' },
            { name: 'Pending', value: Math.round(pending), fill: '#DC2626' },
          ],
          config: { xKey: 'name', yKeys: ['value'], colors: ['#16A34A','#DC2626'] },
        },
      };
    }
"""
content = re.sub(r"    case 'get_fee_summary': \{.*?(?=    // ── Students)", fee_code, content, flags=re.DOTALL)

# 10. get_students (Principal, Teacher)
student_code = """
    case 'get_students': {
      assertRole(['principal', 'teacher']);
      const { search = '', limit = 20 } = params;
      let q = db.from('students').select('id,full_name,roll_number,section_id,sections(name,classes(name))')
        .eq('school_id', schoolId).limit(limit);
        
      if (role === 'teacher') {
        const { data: sections } = await db.from('sections').select('id').eq('class_teacher_id', userId);
        if (!sections || sections.length === 0) return { success: true, data: null, summary: 'You are not a class teacher for any sections.' };
        q = q.in('section_id', sections.map((s: any) => s.id));
      }

      if (search) q = q.ilike('full_name', `%${search}%`);
      const { data } = await q.order('full_name');

      if (!data) return { success: true, data: [], summary: 'Could not retrieve student data.' };

      const table = data.length > 0 ? {
        headers: ['Name', 'Roll No.', 'Class', 'Section'],
        rows: data.slice(0, limit).map((s: any) => [
          s.full_name, s.roll_number || '—',
          (s.sections as any)?.classes?.name || '—',
          (s.sections as any)?.name || '—',
        ]),
      } : undefined;

      return {
        success: true, data,
        summary: `Found ${data.length} students${search ? ` matching "${search}"` : ''}.`,
        tableData: table,
      };
    }
"""
content = re.sub(r"    case 'get_students': \{.*?(?=    // ── Navigation)", student_code, content, flags=re.DOTALL)


# 11. Replace Roles Arrays
roles_code = """
const PRINCIPAL_TOOLS = [
  'get_dashboard_summary', 'get_staff', 'get_attendance', 'get_attendance_trend',
  'get_leave_requests', 'approve_leave', 'reject_leave',
  'get_payroll', 'get_payroll_trend', 'get_fee_summary', 'get_students', 'navigate_to',
];

const TEACHER_TOOLS = [
  'get_attendance', 'get_attendance_trend', 'get_leave_requests', 'get_students', 'navigate_to',
];

const PARENT_TOOLS = [
  'get_attendance', 'get_fee_summary', 'navigate_to',
];

export function getToolsForRole(role: string) {
  const allowed = role === 'principal' ? PRINCIPAL_TOOLS : role === 'teacher' ? TEACHER_TOOLS : role === 'parent' ? PARENT_TOOLS : [];
  return TOOL_DEFINITIONS.filter(t => allowed.includes(t.function.name));
}
"""
content = re.sub(r"const PRINCIPAL_TOOLS = \[\n.*?\}\n", roles_code, content, flags=re.DOTALL)

with open('apps/web/src/app/api/ai/tools.ts', 'w') as f:
    f.write(content)

