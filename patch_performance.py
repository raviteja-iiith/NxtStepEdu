import re

with open('apps/web/src/app/api/ai/tools.ts', 'r') as f:
    content = f.read()

# 1. Add Tool Definition
definition = """
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
"""
content = content.replace("export const TOOL_DEFINITIONS = [", "export const TOOL_DEFINITIONS = [\n" + definition)

# 2. Add to executeTool switch
perf_case = """
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
"""

content = content.replace("  switch (toolName) {", "  switch (toolName) {\n" + perf_case)


# 3. Add to Arrays
content = content.replace(
    "'get_students', 'navigate_to',",
    "'get_students', 'get_student_performance', 'navigate_to',"
)
content = content.replace(
    "'get_fee_summary', 'navigate_to',",
    "'get_fee_summary', 'get_student_performance', 'navigate_to',"
)

# 4. Also add to toolLabel inside route.ts ? 
# Let's patch route.ts for toolLabel as well
with open('apps/web/src/app/api/ai/tools.ts', 'w') as f:
    f.write(content)

with open('apps/web/src/app/api/ai/chat/route.ts', 'r') as f:
    route_content = f.read()
    
route_content = route_content.replace(
    "get_students:          '🎓 Fetching students...',",
    "get_students:          '🎓 Fetching students...',\n    get_student_performance: '📝 Analyzing performance...',",
)

with open('apps/web/src/app/api/ai/chat/route.ts', 'w') as f:
    f.write(route_content)

