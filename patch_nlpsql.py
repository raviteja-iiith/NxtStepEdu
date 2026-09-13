import re

with open('apps/web/src/app/api/ai/chat/route.ts', 'r') as f:
    route_content = f.read()

# Pass token to executeTool
route_content = route_content.replace(
    "try { result = await executeTool(name, params, schoolId, user.id, role); }",
    "try { result = await executeTool(name, params, schoolId, user.id, role, token); }"
)
route_content = route_content.replace(
    "get_student_performance: '📝 Analyzing performance...',",
    "get_student_performance: '📝 Analyzing performance...',\n    query_database_with_sql: '⚙️ Executing query...',\n    get_database_schema: '📚 Inspecting schema...',",
)

with open('apps/web/src/app/api/ai/chat/route.ts', 'w') as f:
    f.write(route_content)


with open('apps/web/src/app/api/ai/tools.ts', 'r') as f:
    tools_content = f.read()

# Update executeTool signature
tools_content = tools_content.replace(
    "  role: string\n): Promise<ToolResult> {",
    "  role: string,\n  token: string\n): Promise<ToolResult> {"
)

# Add getUserClient
user_client_code = """
function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}
"""
tools_content = tools_content.replace("// ─── Shared helpers", user_client_code + "\n// ─── Shared helpers")


# Add new tools to TOOL_DEFINITIONS
new_tools = """
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
      description: 'Execute a raw SQL query against the database to fetch custom insights. The query MUST be a read-only SELECT statement. It will be executed under the user\\'s Row Level Security context. You must call get_database_schema first if you do not know the schema.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The Postgres SQL SELECT query to execute' },
        },
        required: ['query'],
      },
    },
  },
"""
tools_content = tools_content.replace("export const TOOL_DEFINITIONS = [", "export const TOOL_DEFINITIONS = [\n" + new_tools)


# Add new tool cases to executeTool
new_cases = """
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
"""
tools_content = tools_content.replace("  switch (toolName) {", "  switch (toolName) {\n" + new_cases)


# Add to ROLE arrays
tools_content = tools_content.replace(
    "navigate_to',",
    "navigate_to', 'get_database_schema', 'query_database_with_sql',"
)

with open('apps/web/src/app/api/ai/tools.ts', 'w') as f:
    f.write(tools_content)

