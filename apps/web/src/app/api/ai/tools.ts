// AI Copilot — Tool Registry
// All tools are server-side only (imported only in API routes).
// Each tool has: definition (for LLM), execute (server-side Supabase query), and role requirement.

import { createClient } from '@supabase/supabase-js';


function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function today() { return new Date().toISOString().split('T')[0]; }
function nowMonth() { return new Date().getMonth() + 1; }
function nowYear() { return new Date().getFullYear(); }

export type ToolRole = 'principal' | 'teacher' | 'any';

// ─── Tool Results ──────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: any;
  summary?: string;        // Short text summary for LLM context
  chartData?: any;         // If result should be visualized
  tableData?: any;         // If result should be tabulated
  actions?: any[];         // Suggested follow-up actions
  confirmRequired?: boolean;
  confirmData?: any;
  error?: string;
}

// ─── Tool Definitions (LLM function schemas) ──────────────────────────────────

export const TOOL_DEFINITIONS = [

  {
    type: 'function',
    function: {
      name: 'get_database_schema',
      description: 'Fetch the core database schema. Call this FIRST before attempting to write SQL with query_database_with_sql to ensure you understand the table structures and relationships.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_database_with_sql',
      description: 'Execute a raw SQL query against the database to fetch custom insights. The query MUST be a read-only SELECT statement. It will be executed under the user\'s Row Level Security context. You must call get_database_schema first if you do not know the schema.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The Postgres SQL SELECT query to execute' },
        },
        required: ['query'],
      },
    },
  },


  {
    type: 'function',
    function: {
      name: 'get_student_performance',
      description: 'Get academic performance insights, exam results, and marks for students. Use this to answer queries about student performance, highest/lowest scores, or exam insights.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional name of a specific student to search for' },
          limit: { type: 'number', description: 'Max results. Default: 20' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description: 'Get a comprehensive school summary for today: total staff, students, attendance rate, pending leave requests, monthly payroll total, and fee collection status. Use this as a starting point for "what needs my attention" or "give me a summary" requests.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_staff',
      description: 'Get a list of school staff. Returns both teaching staff (teachers, principal) and non-teaching staff (drivers, cleaners, etc.). Use for questions about employees, workforce, staff count.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional search term (name or role/designation)' },
          type: { type: 'string', enum: ['all', 'teaching', 'non_teaching'], description: 'Filter by staff type. Default: all' },
          limit: { type: 'number', description: 'Max results. Default: 25' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance',
      description: 'Get student attendance for a specific date. Returns present/absent/late counts and percentage. Use for questions about attendance today, on a specific date, or trends.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format. Default: today' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance_trend',
      description: 'Get attendance statistics for the last N days for trend analysis. Use for "show attendance trend" or "how has attendance been this week/month".',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look back. Default: 7, max: 30' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leave_requests',
      description: 'Get staff leave requests. Returns requester name, type, dates, reason, and status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], description: 'Filter by status. Default: all' },
          limit: { type: 'number', description: 'Max results. Default: 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_leave',
      description: 'Approve a pending leave request. IMPORTANT: This modifies data. Only call this after the user has explicitly confirmed they want to approve. Returns a confirmRequired flag first.',
      parameters: {
        type: 'object',
        properties: {
          leave_id: { type: 'string', description: 'The UUID of the leave request to approve' },
          requester_name: { type: 'string', description: 'Name of the leave requester (for confirmation UI)' },
          leave_dates: { type: 'string', description: 'Date range of the leave (e.g. "Sep 15–17") for confirmation UI' },
        },
        required: ['leave_id', 'requester_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_leave',
      description: 'Reject a pending leave request. IMPORTANT: This modifies data. Only call this after the user has explicitly confirmed.',
      parameters: {
        type: 'object',
        properties: {
          leave_id: { type: 'string', description: 'The UUID of the leave request to reject' },
          requester_name: { type: 'string', description: 'Name of the leave requester (for confirmation UI)' },
          leave_dates: { type: 'string', description: 'Date range of the leave for confirmation UI' },
        },
        required: ['leave_id', 'requester_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll',
      description: 'Get payroll records for a specific month/year including totals, status breakdown, and optionally previous month comparison.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'number', description: 'Month 1-12. Default: current month' },
          year: { type: 'number', description: 'Year. Default: current year' },
          compare_previous: { type: 'boolean', description: 'Whether to also fetch previous month data for comparison. Default: false' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_trend',
      description: 'Get monthly payroll totals for the last N months. Use for "payroll trend", "how has payroll changed", or to generate a payroll chart.',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'How many months to go back. Default: 6, max: 12' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fee_summary',
      description: 'Get fee collection statistics: total fees, amount collected, amount pending, overdue count.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_students',
      description: 'Get student list and count. Can filter by name search.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional name search' },
          limit: { type: 'number', description: 'Max results. Default: 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Navigate the user to a specific page in the application. Use for "show me", "take me to", "open" requests.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The URL path to navigate to',
            enum: [
              '/principal/dashboard',
              '/principal/attendance',
              '/principal/hr',
              '/principal/fees',
              '/principal/teachers',
              '/principal/students',
              '/principal/parents',
              '/principal/exams',
              '/principal/marks',
              '/principal/reports',
              '/principal/timetable',
              '/principal/subjects',
              '/principal/question-bank',
              '/principal/teacher-performance',
              '/principal/lesson-coverage',
              '/principal/announcements',
            ],
          },
          label: { type: 'string', description: 'Human-readable name of the destination page' },
        },
        required: ['path', 'label'],
      },
    },
  },
];

// ─── Tool Executors ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  params: Record<string, any>,
  schoolId: string,
  userId: string,
  role: string,
  token: string
): Promise<ToolResult> {
  const db = getServiceClient();


  // ── Role Authorization Helper ──
  const assertRole = (allowed: string[]) => {
    if (!allowed.includes(role)) throw new Error(`Tool ${toolName} not allowed for role ${role}`);
  };

  switch (toolName) {

    case 'get_database_schema': {
      assertRole(['principal', 'teacher', 'parent']);
      const schema = `
      Core Tables:
      - schools (id, name, ... )
      - users (id, school_id, full_name, role, phone, email, is_active)
      - students (id, school_id, parent_id, full_name, roll_number, section_id, dob, gender)
      - staff_members (id, school_id, full_name, designation, department)
      - classes (id, school_id, name)
      - sections (id, school_id, class_id, name, class_teacher_id)
      - subjects (id, school_id, class_id, name, code)
      - exams (id, school_id, name, exam_type, class_id, section_id, subject_id, exam_date)
      - marks (id, exam_id, student_id, school_id, marks_obtained, is_absent, remarks)
      - attendance (id, school_id, student_id, section_id, date, status: present|absent|late)
      - leave_requests (id, school_id, requester_id, leave_type, from_date, to_date, status, reason)
      - fees (id, school_id, student_id, academic_year_id, total_amount, paid_amount, status)
      `;
      return { success: true, data: schema, summary: 'Schema retrieved. You can now write a SQL query.' };
    }

    case 'query_database_with_sql': {
      assertRole(['principal', 'teacher', 'parent']);
      const { query } = params;
      if (!query || !query.toLowerCase().trim().startsWith('select')) {
         return { success: false, error: 'Only SELECT queries are allowed.' };
      }
      
      const userDb = getUserClient(token);
      const { data, error } = await userDb.rpc('execute_readonly_sql', { query });
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      const records = Array.isArray(data) ? data : [];
      
      let summaryStr = `Executed custom query returning ${records.length} records.`;
      
      return {
        success: true,
        data: records.slice(0, 50), // cap to 50 for LLM context limits
        summary: summaryStr,
      };
    }


    case 'get_student_performance': {
      assertRole(['principal', 'teacher', 'parent']);
      const { search = '', limit = 20 } = params;
      
      let studentsQuery = db.from('students').select('id,full_name,sections(name,classes(name))').eq('school_id', schoolId);
      
      if (role === 'teacher') {
        const { data: sections } = await db.from('sections').select('id').eq('class_teacher_id', userId);
        if (!sections || sections.length === 0) return { success: true, data: null, summary: 'You are not assigned as a class teacher to any section.' };
        studentsQuery = studentsQuery.in('section_id', sections.map((s: any) => s.id));
      } else if (role === 'parent') {
        studentsQuery = studentsQuery.eq('parent_id', userId);
      }
      
      if (search) studentsQuery = studentsQuery.ilike('full_name', `%${search}%`);
      
      const { data: students } = await studentsQuery.limit(limit);
      
      if (!students || students.length === 0) {
        return { success: true, data: null, summary: `No students found${search ? ` matching "${search}"` : ''}.` };
      }
      
      const studentIds = students.map((s: any) => s.id);
      
      // Fetch latest marks for these students
      const { data: marks } = await db.from('marks').select('marks_obtained,exams(name,exam_date),student_id').in('student_id', studentIds).order('entered_at', { ascending: false }).limit(limit * 3);
      
      if (!marks || marks.length === 0) {
        return { success: true, data: null, summary: 'No exam marks found for the relevant students.' };
      }
      
      // Compute averages
      const scores = marks.filter((m: any) => m.marks_obtained != null).map((m: any) => m.marks_obtained);
      const avg = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
      
      const table = {
        headers: ['Student', 'Exam', 'Marks'],
        rows: marks.slice(0, 15).map((m: any) => {
          const student = students.find((s: any) => s.id === m.student_id);
          return [student?.full_name || 'Unknown', (m.exams as any)?.name || 'Unknown', m.marks_obtained ?? 'Abs'];
        }),
      };
      
      return {
        success: true,
        data: { avg_score: avg, records_found: marks.length },
        summary: `Performance overview: Average marks across recent records is ${avg}. Retrieved ${marks.length} recent exam records.`,
        tableData: table,
        actions: [{ label: 'Open Exams View', icon: '📝', variant: 'primary' as const, action: 'navigate' as const, value: '/principal/exams' }],
      };
    }


    // ── Dashboard Summary ───────────────────────────────────────────────────
    case 'get_dashboard_summary': {
      assertRole(['principal']);
      const todayStr = today();
      const [teachersRes, staffRes, attRes, leaveRes, payrollRes, feesRes] = await Promise.all([
        db.from('users').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).in('role', ['teacher','principal']),
        db.from('staff_members').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true),
        db.from('attendance').select('status').eq('school_id', schoolId).eq('date', todayStr),
        db.from('leave_requests').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'pending'),
        db.from('payroll').select('net_salary,payment_status').eq('school_id', schoolId).eq('month', nowMonth()).eq('year', nowYear()),
        db.from('fees').select('total_amount,paid_amount,status').eq('school_id', schoolId),
      ]);

      const teacherCount = teachersRes.count ?? 0;
      const staffCount = staffRes.count ?? 0;
      const totalStaff = teacherCount + staffCount;

      const att = attRes.data ?? [];
      const present = att.filter((a: any) => a.status === 'present').length;
      const absent = att.filter((a: any) => a.status === 'absent').length;
      const late = att.filter((a: any) => a.status === 'late').length;
      const attTotal = att.length;
      const attPct = attTotal > 0 ? Math.round((present / attTotal) * 100) : null;

      const pendingLeaves = leaveRes.count ?? 0;

      const payroll = payrollRes.data ?? [];
      const payrollTotal = payroll.reduce((s: number, r: any) => s + (r.net_salary || 0), 0);
      const payrollPending = payroll.filter((r: any) => r.payment_status === 'pending').length;

      const fees = feesRes.data ?? [];
      const totalFees = fees.reduce((s: number, f: any) => s + (f.total_amount || 0), 0);
      const collectedFees = fees.reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
      const pendingFees = totalFees - collectedFees;

      const summary = {
        totalStaff, teacherCount, staffCount,
        attendance: { present, absent, late, total: attTotal, percentage: attPct },
        pendingLeaves,
        payroll: { monthTotal: payrollTotal, month: FULL_MONTHS[nowMonth()-1], year: nowYear(), pendingApprovals: payrollPending },
        fees: { total: totalFees, collected: collectedFees, pending: pendingFees },
      };

      const textSummary = `Staff: ${totalStaff} total (${teacherCount} teaching, ${staffCount} support). `
        + (attTotal > 0 ? `Attendance today: ${attPct}% (${present} present, ${absent} absent). ` : 'No attendance recorded today. ')
        + `Pending leave requests: ${pendingLeaves}. `
        + `${FULL_MONTHS[nowMonth()-1]} payroll total: ₹${(payrollTotal/100000).toFixed(1)}L (${payrollPending} pending approvals). `
        + `Fee collection: ₹${(collectedFees/100000).toFixed(1)}L / ₹${(totalFees/100000).toFixed(1)}L.`;

      return { success: true, data: summary, summary: textSummary };
    }

    // ── Staff ───────────────────────────────────────────────────────────────
    case 'get_staff': {
      assertRole(['principal']);
      const { search = '', type = 'all', limit = 25 } = params;
      const results: any[] = [];

      if (type !== 'non_teaching') {
        let q = db.from('users').select('id,full_name,role,phone,email,is_active,last_login_at,created_at')
          .eq('school_id', schoolId).in('role', ['teacher','principal']).limit(limit);
        if (search) q = q.ilike('full_name', `%${search}%`);
        const { data } = await q.order('full_name');
        if (data) results.push(...data.map((d: any) => ({ ...d, staffType: 'teaching' })));
      }

      if (type !== 'teaching') {
        let q = db.from('staff_members').select('id,full_name,designation,department,phone,email,is_active,joining_date')
          .eq('school_id', schoolId).eq('is_active', true).limit(limit);
        if (search) q = q.ilike('full_name', `%${search}%`);
        const { data } = await q.order('full_name');
        if (data) results.push(...data.map((d: any) => ({ ...d, role: d.designation, staffType: 'non_teaching' })));
      }

      const table = {
        headers: ['Name', 'Type', 'Role/Designation', 'Phone', 'Active'],
        rows: results.slice(0, limit).map((s: any) => [
          s.full_name, s.staffType === 'teaching' ? 'Teaching' : 'Support',
          s.role || s.designation || '—', s.phone || '—', s.is_active ? 'Yes' : 'No',
        ]),
      };

      return {
        success: true, data: results,
        summary: `Found ${results.length} staff member(s)${search ? ` matching "${search}"` : ''}.`,
        tableData: results.length > 0 ? table : undefined,
        actions: [{ label: 'Open HR & Payroll', icon: '💼', variant: 'primary' as const, action: 'navigate' as const, value: '/principal/hr' }],
      };
    }

    // ── Attendance ──────────────────────────────────────────────────────────

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
    // ── Attendance Trend ────────────────────────────────────────────────────

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
    // ── Leave Requests ──────────────────────────────────────────────────────

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
    // ── Approve Leave (returns confirmRequired) ─────────────────────────────
    case 'approve_leave': {
      assertRole(['principal']);
      const { leave_id, requester_name, leave_dates } = params;
      // Always return confirmRequired — actual execution happens via /api/ai/action
      return {
        success: true,
        data: { leave_id, requester_name, leave_dates },
        summary: `Requesting confirmation to approve ${requester_name}'s leave.`,
        confirmRequired: true,
        confirmData: {
          message: `Approve ${requester_name}'s leave request?`,
          details: leave_dates ? `Dates: ${leave_dates}` : undefined,
          confirmLabel: '✓ Approve Leave',
          action: 'approve_leave',
          params: { leave_id, requester_name, schoolId },
        },
      };
    }

    // ── Reject Leave (returns confirmRequired) ──────────────────────────────
    case 'reject_leave': {
      assertRole(['principal']);
      const { leave_id, requester_name, leave_dates } = params;
      return {
        success: true,
        data: { leave_id, requester_name, leave_dates },
        summary: `Requesting confirmation to reject ${requester_name}'s leave.`,
        confirmRequired: true,
        confirmData: {
          message: `Reject ${requester_name}'s leave request?`,
          details: leave_dates ? `Dates: ${leave_dates}` : undefined,
          confirmLabel: '✗ Reject Leave',
          action: 'reject_leave',
          params: { leave_id, requester_name, schoolId },
        },
      };
    }

    // ── Payroll ─────────────────────────────────────────────────────────────
    case 'get_payroll': {
      assertRole(['principal']);
      const { month = nowMonth(), year = nowYear(), compare_previous = false } = params;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const [r0, r1] = await Promise.all([
        db.from('payroll').select('*,users!payroll_teacher_id_fkey(full_name,role)').eq('school_id', schoolId).eq('month', month).eq('year', year),
        db.from('staff_payroll').select('*,staff_members!staff_payroll_staff_member_id_fkey(full_name,designation)').eq('school_id', schoolId).eq('month', month).eq('year', year),
      ]);

      let r2: any = null;
      let r3: any = null;
      if (compare_previous) {
        [r2, r3] = await Promise.all([
          db.from('payroll').select('net_salary,payment_status').eq('school_id', schoolId).eq('month', prevMonth).eq('year', prevYear),
          db.from('staff_payroll').select('net_salary,payment_status').eq('school_id', schoolId).eq('month', prevMonth).eq('year', prevYear),
        ]);
      }

      const results = [r0, r1, r2, r3];
      const teachingPayroll = results[0].data ?? [];
      const staffPayroll = results[1].data ?? [];
      const allPayroll = [
        ...teachingPayroll.map((r: any) => ({ ...r, name: r['users!payroll_teacher_id_fkey']?.full_name || 'Unknown', staffType: 'teaching' })),
        ...staffPayroll.map((r: any) => ({ ...r, name: r['staff_members!staff_payroll_staff_member_id_fkey']?.full_name || 'Unknown', staffType: 'support' })),
      ];

      const total = allPayroll.reduce((s, r) => s + (r.net_salary || 0), 0);
      const pending = allPayroll.filter(r => r.payment_status === 'pending').length;
      const approved = allPayroll.filter(r => r.payment_status === 'approved').length;
      const paid = allPayroll.filter(r => r.payment_status === 'paid').length;

      let prevTotal = 0;
      if (compare_previous && results[2] && results[3]) {
        const prevAll = [...(results[2].data ?? []), ...(results[3].data ?? [])];
        prevTotal = prevAll.reduce((s: number, r: any) => s + (r.net_salary || 0), 0);
      }

      const pctChange = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : 0;

      const table = allPayroll.length > 0 ? {
        headers: ['Name', 'Type', 'Basic', 'Net Salary', 'Status'],
        rows: allPayroll.slice(0, 20).map((r: any) => [
          r.name, r.staffType, `₹${(r.basic || 0).toLocaleString('en-IN')}`,
          `₹${(r.net_salary || 0).toLocaleString('en-IN')}`, r.payment_status,
        ]),
      } : undefined;

      let summaryText = `${FULL_MONTHS[month-1]} ${year} payroll: ₹${(total/100000).toFixed(2)}L total across ${allPayroll.length} records. `
        + `${pending} pending, ${approved} approved, ${paid} paid.`;
      if (compare_previous && prevTotal > 0) {
        summaryText += ` Change vs ${FULL_MONTHS[prevMonth-1]}: ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%.`;
      }

      return {
        success: true,
        data: { month, year, total, pending, approved, paid, count: allPayroll.length, prevTotal, pctChange, records: allPayroll },
        summary: summaryText,
        tableData: table,
        actions: [{ label: 'Open Payroll', icon: '💰', variant: 'primary' as const, action: 'navigate' as const, value: '/principal/hr' }],
      };
    }

    // ── Payroll Trend ───────────────────────────────────────────────────────
    case 'get_payroll_trend': {
      assertRole(['principal']);
      const nMonths = Math.min(params.months ?? 6, 12);
      const trendPoints: any[] = [];

      for (let i = nMonths - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const [tRes, sRes] = await Promise.all([
          db.from('payroll').select('net_salary').eq('school_id', schoolId).eq('month', m).eq('year', y),
          db.from('staff_payroll').select('net_salary').eq('school_id', schoolId).eq('month', m).eq('year', y),
        ]);
        const total = [...(tRes.data ?? []), ...(sRes.data ?? [])].reduce((s: number, r: any) => s + (r.net_salary || 0), 0);
        trendPoints.push({ label: `${MONTHS[m-1]} ${String(y).slice(2)}`, month: m, year: y, total });
      }

      const maxTotal = Math.max(...trendPoints.map(t => t.total));
      const nonZero = trendPoints.filter(t => t.total > 0);
      const avgTotal = nonZero.length > 0 ? nonZero.reduce((s, t) => s + t.total, 0) / nonZero.length : 0;

      return {
        success: true, data: trendPoints,
        summary: `Payroll trend for ${nMonths} months. Peak: ₹${(maxTotal/100000).toFixed(1)}L. Average: ₹${(avgTotal/100000).toFixed(1)}L.`,
        chartData: {
          chartType: 'area' as const,
          data: trendPoints,
          config: { xKey: 'label', yKeys: ['total'], colors: ['#3B82F6'], label: 'Total Payroll (₹)' },
        },
      };
    }

    // ── Fee Summary ─────────────────────────────────────────────────────────

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
    // ── Students ────────────────────────────────────────────────────────────

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
    // ── Navigation ──────────────────────────────────────────────────────────
    case 'navigate_to': {
      const { path, label } = params;
      return {
        success: true,
        data: { path, label },
        summary: `Navigating to ${label}.`,
        actions: [{
          label: `Go to ${label}`,
          icon: '→',
          variant: 'primary' as const,
          action: 'navigate' as const,
          value: path,
        }],
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ─── Role-based tool filtering ────────────────────────────────────────────────


const PRINCIPAL_TOOLS = [
  'get_dashboard_summary', 'get_staff', 'get_attendance', 'get_attendance_trend',
  'get_leave_requests', 'approve_leave', 'reject_leave',
  'get_payroll', 'get_payroll_trend', 'get_fee_summary', 'get_students', 'get_student_performance', 'navigate_to', 'get_database_schema', 'query_database_with_sql',
];

const TEACHER_TOOLS = [
  'get_attendance', 'get_attendance_trend', 'get_leave_requests', 'get_students', 'get_student_performance', 'navigate_to', 'get_database_schema', 'query_database_with_sql',
];

const PARENT_TOOLS = [
  'get_attendance', 'get_fee_summary', 'get_student_performance', 'navigate_to', 'get_database_schema', 'query_database_with_sql',
];

export function getToolsForRole(role: string) {
  const allowed = role === 'principal' ? PRINCIPAL_TOOLS : role === 'teacher' ? TEACHER_TOOLS : role === 'parent' ? PARENT_TOOLS : [];
  return TOOL_DEFINITIONS.filter(t => allowed.includes(t.function.name));
}
