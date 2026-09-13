// AI Copilot — Streaming Chat Endpoint (v3 — hardened)
// Speed: Groq primary → Gemini fallback (both paths)
// Reliability: snapshot queries individually fail-safe; LLM has auto-fallback
// Pre-loads full school context so AI answers basic questions without tool calls

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeTool, getToolsForRole } from '../tools';

const MAX_TOOL_ROUNDS = 3;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

type LLMProvider = 'groq' | 'gemini';

// Groq free tier models that support tool calling — rotate through all on 429
const GROQ_MODELS_WITH_TOOLS = [
  'qwen/qwen3.6-27b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
];

// Per-model cooldown cache: tracks when each model was rate-limited
// Models are skipped for 60s after a 429 to avoid wasting time on retries
const modelCooldown = new Map<string, number>(); // model -> timestamp when cooldown expires
const COOLDOWN_MS = 60_000;

function isModelCooling(model: string): boolean {
  const expiry = modelCooldown.get(model);
  if (!expiry) return false;
  if (Date.now() > expiry) { modelCooldown.delete(model); return false; }
  return true;
}
function markModelCooling(model: string) {
  modelCooldown.set(model, Date.now() + COOLDOWN_MS);
  console.warn(`[AI Copilot] Model ${model} rate-limited — cooling down for 60s`);
}
function getAvailableGroqModels(): string[] {
  return GROQ_MODELS_WITH_TOOLS.filter(m => !isModelCooling(m));
}

function getLLMUrl(provider: LLMProvider) {
  return provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
}
function getLLMKey(provider: LLMProvider) {
  return provider === 'groq'
    ? (process.env.GROQ_API_KEY ?? '')
    : (process.env.GEMINI_API_KEY ?? '');
}
function getLLMModel(provider: LLMProvider) {
  return provider === 'groq' ? (getAvailableGroqModels()[0] ?? GROQ_MODELS_WITH_TOOLS[0]) : 'gemini-2.5-flash';
}

// Determine provider order: Groq first if key present
function providerOrder(): LLMProvider[] {
  const order: LLMProvider[] = [];
  if (process.env.GROQ_API_KEY)   order.push('groq');
  if (process.env.GEMINI_API_KEY) order.push('gemini');
  return order.length > 0 ? order : ['groq'];
}

/**
 * callLLM: tries all available Groq models (skipping rate-limited ones) before falling back to Gemini.
 * Uses a cooldown cache so already-throttled models are skipped instantly.
 */
async function callLLM(messages: any[], tools: any[]): Promise<any> {
  let lastErr: Error = new Error('No LLM provider configured');

  // Try available Groq models (skipping any that are in cooldown)
  if (process.env.GROQ_API_KEY) {
    for (const model of getAvailableGroqModels()) {
      try {
        const hasTool = tools.length > 0;
        const body: any = { model, messages, temperature: hasTool ? 0 : 0.2, max_tokens: hasTool ? 300 : 512 };
        if (hasTool) { body.tools = tools; body.tool_choice = 'auto'; }
        const resp = await fetch(getLLMUrl('groq'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getLLMKey('groq')}` },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          const err = new Error(`groq/${model} HTTP ${resp.status}: ${txt.slice(0, 200)}`);
          if (resp.status === 429) markModelCooling(model);
          throw err;
        }
        return await resp.json();
      } catch (e: any) {
        lastErr = e;
      }
    }
  }

  // Gemini fallback
  if (process.env.GEMINI_API_KEY) {
    try {
      const body: any = { model: 'gemini-2.5-flash', messages, temperature: 0.2, max_tokens: 512 };
      if (tools.length > 0) { body.tools = tools; body.tool_choice = 'auto'; }
      const resp = await fetch(getLLMUrl('gemini'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getLLMKey('gemini')}` },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`gemini HTTP ${resp.status}: ${txt.slice(0, 200)}`);
      }
      return await resp.json();
    } catch (e: any) {
      console.error(`[AI Copilot] ${e.message}`);
      lastErr = e;
    }
  }

  throw lastErr;
}

async function* streamLLM(messages: any[]): AsyncGenerator<string> {
  let lastErr: Error = new Error('No LLM provider');

  async function tryStream(url: string, key: string, model: string) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 512, stream: true }),
    });
    if (!resp.ok || !resp.body) throw new Error(`stream ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return resp.body.getReader();
  }

  async function* readStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
    const dec = new TextDecoder();
    let buf = '';
    let textBuf = '';
    let inThink = false;     // inside <think>...</think>
    let inToolCall = false;  // inside <tool_call>...</tool_call>

    // Returns true if the buffer enters a suppressed block, updating state
    function processBuffer(): string {
      let out = '';
      while (textBuf.length > 0) {
        if (inThink) {
          const end = textBuf.indexOf('</think>');
          if (end !== -1) { inThink = false; textBuf = textBuf.slice(end + '</think>'.length); }
          else { textBuf = ''; }
        } else if (inToolCall) {
          const end = textBuf.indexOf('</tool_call>');
          if (end !== -1) { inToolCall = false; textBuf = textBuf.slice(end + '</tool_call>'.length); }
          else { textBuf = ''; }
        } else {
          // Find the earliest suppressed block opener
          const thinkStart = textBuf.indexOf('<think>');
          const toolStart  = textBuf.indexOf('<tool_call>');
          let firstStart = -1;
          let firstTag = '';
          if (thinkStart !== -1 && (toolStart === -1 || thinkStart <= toolStart)) {
            firstStart = thinkStart; firstTag = '<think>';
          } else if (toolStart !== -1) {
            firstStart = toolStart; firstTag = '<tool_call>';
          }

          if (firstStart !== -1) {
            out += textBuf.slice(0, firstStart);
            if (firstTag === '<think>') inThink = true;
            else inToolCall = true;
            textBuf = textBuf.slice(firstStart + firstTag.length);
          } else {
            // No suppressed block — emit safely, hold tail in case tag spans chunks
            const safe = textBuf.slice(0, Math.max(0, textBuf.length - 20));
            out += safe;
            textBuf = textBuf.slice(safe.length);
            break;
          }
        }
      }
      return out;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.replace(/^data: /, '').trim();
        if (!t || t === '[DONE]') continue;
        try {
          const token: string | undefined = JSON.parse(t)?.choices?.[0]?.delta?.content;
          if (!token) continue;
          textBuf += token;
          const visible = processBuffer();
          if (visible) yield visible;
        } catch { /* partial chunk */ }
      }
    }
    // Flush remaining visible text
    if (!inThink && !inToolCall && textBuf) yield textBuf;
  }

  // Try available Groq models in rotation (cooldown models skipped instantly)
  if (process.env.GROQ_API_KEY) {
    for (const model of getAvailableGroqModels()) {
      try {
        const reader = await tryStream(getLLMUrl('groq'), getLLMKey('groq'), model);
        yield* readStream(reader);
        return;
      } catch (e: any) {
        if (e.message.includes('429') || e.message.includes('Rate limit')) markModelCooling(model);
        console.warn(`[AI Copilot stream] groq/${model}: ${e.message.slice(0,80)}`);
        lastErr = e;
      }
    }
  }

  // Gemini fallback
  if (process.env.GEMINI_API_KEY) {
    try {
      const reader = await tryStream(getLLMUrl('gemini'), getLLMKey('gemini'), 'gemini-2.5-flash');
      yield* readStream(reader);
      return;
    } catch (e: any) {
      console.error(`[AI Copilot stream] gemini: ${e.message}`);
      lastErr = e;
    }
  }

  throw lastErr;
}

// ─── Safe query helper ────────────────────────────────────────────────────────
// Uses `any` so Supabase's lazy PostgrestFilterBuilder is accepted alongside Promise

async function safeQuery(fn: () => any): Promise<{ data: any; count: number }> {
  try {
    const r = await fn();
    return { data: r.data ?? null, count: r.count ?? 0 };
  } catch {
    return { data: null, count: 0 };
  }
}

// ─── School snapshot ──────────────────────────────────────────────────────────
// Fetches all key school metrics in parallel, individually fail-safe.
// Injected into the system prompt so AI can answer basic questions instantly.

async function fetchPrincipalSnapshot(schoolId: string, db: ReturnType<typeof svc>): Promise<string> {
  const now      = new Date();
  const month    = now.getMonth() + 1;
  const year     = now.getFullYear();
  const todayStr = now.toISOString().split('T')[0];

  // All queries in parallel, each individually fail-safe
  const [
    schoolR, teachersR, ntStaffR, studentsR,
    attR, leaveR, payrollR, ntPayrollR, feesR, sectionsR,
  ] = await Promise.all([
    safeQuery(() => db.from('schools').select('name,phone,email,address').eq('id', schoolId).single()),
    safeQuery(() => db.from('users').select('id,full_name,role,is_active').eq('school_id', schoolId).in('role', ['teacher','principal'])),
    safeQuery(() => (db as any).from('staff_members').select('id,full_name,designation,department,is_active').eq('school_id', schoolId)),
    safeQuery(() => db.from('students').select('id', { count: 'exact', head: true } as any).eq('school_id', schoolId)),
    safeQuery(() => db.from('attendance').select('status').eq('school_id', schoolId).eq('date', todayStr)),
    safeQuery(() => db.from('leave_requests')
      .select('id,status,leave_type,from_date,to_date,requester_id')
      .eq('school_id', schoolId).in('status', ['pending','approved'])
      .order('created_at', { ascending: false }).limit(30)),
    safeQuery(() => db.from('payroll').select('net_salary,payment_status').eq('school_id', schoolId).eq('month', month).eq('year', year)),
    safeQuery(() => (db as any).from('staff_payroll').select('net_salary,payment_status').eq('school_id', schoolId).eq('month', month).eq('year', year)),
    safeQuery(() => db.from('fees').select('total_amount,paid_amount,status').eq('school_id', schoolId)),
    safeQuery(() => db.from('sections').select('id,name,class_id,classes(name)').eq('school_id', schoolId)),
  ]);

  // Get leave requester names separately (avoid complex join)
  const leaveList  = (leaveR.data as any[]) ?? [];
  const teacherList = (teachersR.data as any[]) ?? [];
  const ntList      = (ntStaffR.data as any[]) ?? [];
  const attList     = (attR.data as any[]) ?? [];
  const payList     = [...((payrollR.data as any[]) ?? []), ...((ntPayrollR.data as any[]) ?? [])];
  const feeList     = (feesR.data as any[]) ?? [];
  const sectionList = (sectionsR.data as any[]) ?? [];
  const school      = (schoolR.data as any);

  // Fetch requester names for pending leaves
  const pendingLeaves  = leaveList.filter((l: any) => l.status === 'pending');
  const approvedLeaves = leaveList.filter((l: any) => l.status === 'approved');
  let leaveNamesMap: Record<string, string> = {};
  if (pendingLeaves.length > 0) {
    const ids = pendingLeaves.map((l: any) => l.requester_id).filter(Boolean);
    if (ids.length > 0) {
      try {
        const { data: nameRows } = await db.from('users').select('id,full_name').in('id', ids);
        (nameRows ?? []).forEach((r: any) => { leaveNamesMap[r.id] = r.full_name; });
      } catch {}
      try {
        const { data: staffNameRows } = await (db as any).from('staff_members').select('id,full_name').in('id', ids);
        (staffNameRows ?? []).forEach((r: any) => { leaveNamesMap[r.id] = r.full_name; });
      } catch {}
    }
  }

  // Compute derived stats
  const present = attList.filter((a: any) => a.status === 'present').length;
  const absent  = attList.filter((a: any) => a.status === 'absent').length;
  const late    = attList.filter((a: any) => a.status === 'late').length;
  const attTot  = attList.length;
  const attPct  = attTot > 0 ? Math.round(present / attTot * 100) : null;

  const payTotal   = payList.reduce((s: number, r: any) => s + (r.net_salary || 0), 0);
  const payPending = payList.filter((r: any) => r.payment_status === 'pending').length;
  const payPaid    = payList.filter((r: any) => r.payment_status === 'paid').length;

  const feeTotal = feeList.reduce((s: number, f: any) => s + (f.total_amount || 0), 0);
  const feePaid  = feeList.reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);

  const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${Math.round(n).toLocaleString('en-IN')}`;

  // Build classes list
  const classSections: Record<string, string[]> = {};
  sectionList.forEach((s: any) => {
    const cn = (s.classes as any)?.name || s.class_id;
    if (!classSections[cn]) classSections[cn] = [];
    classSections[cn].push(s.name);
  });

  // NT staff by designation
  const ntByDesig: Record<string, number> = {};
  ntList.forEach((s: any) => { ntByDesig[s.designation || 'Other'] = (ntByDesig[s.designation || 'Other'] || 0) + 1; });

  let snap = `\n\n=== LIVE SCHOOL DATA (real-time — answer basic questions from this, no tool call needed) ===\n`;
  snap += `School: ${school?.name ?? 'N/A'}`;
  if (school?.phone) snap += ` | ${school.phone}`;
  if (school?.email) snap += ` | ${school.email}`;
  snap += '\n';
  snap += `Date: ${now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}\n\n`;

  snap += `STAFF:\n`;
  snap += `• Teachers: ${teacherList.filter((t: any) => t.role === 'teacher').length}`;
  snap += ` | Active: ${teacherList.filter((t: any) => t.role === 'teacher' && t.is_active).length}\n`;
  if (ntList.length > 0) {
    snap += `• Support staff: ${ntList.length} (${Object.entries(ntByDesig).map(([k,v]) => `${v} ${k}`).join(', ')})\n`;
  }
  snap += `• Total workforce: ${teacherList.length + ntList.length}\n`;
  snap += `• Students: ${studentsR.count ?? 0} enrolled\n`;

  if (Object.keys(classSections).length > 0) {
    snap += `• Classes & sections: ${Object.entries(classSections).map(([c, ss]) => `${c}(${ss.join(',')})`).join(' | ')}\n`;
  }

  snap += `\nATTENDANCE — ${todayStr}:\n`;
  if (attTot > 0) {
    snap += `• ${attPct}% attendance | ${present} present, ${absent} absent, ${late} late (${attTot} total)\n`;
  } else {
    snap += `• Not yet recorded for today\n`;
  }

  snap += `\nLEAVE:\n`;
  snap += `• Pending approval: ${pendingLeaves.length}\n`;
  if (pendingLeaves.length > 0) {
    snap += `• Pending list:\n`;
    pendingLeaves.slice(0, 8).forEach((l: any) => {
      const name = leaveNamesMap[l.requester_id] || 'Unknown';
      snap += `  - ${name}: ${(l.leave_type || '').replace(/_/g,' ')} | ${l.from_date} to ${l.to_date} | leave_id:${l.id}\n`;
    });
  }
  snap += `• On approved leave today: ${approvedLeaves.length}\n`;

  snap += `\nPAYROLL — ${MONTHS[month-1]} ${year}:\n`;
  if (payList.length > 0) {
    snap += `• Total: ${fmt(payTotal)} across ${payList.length} records\n`;
    snap += `• ${payPending} pending approval, ${payPaid} paid, ${payList.length - payPending - payPaid} approved\n`;
  } else {
    snap += `• No payroll records for this month yet\n`;
  }

  snap += `\nFEES:\n`;
  if (feeList.length > 0) {
    snap += `• Collected: ${fmt(feePaid)} / ${fmt(feeTotal)} (${feeTotal > 0 ? Math.round(feePaid/feeTotal*100) : 0}%)\n`;
    snap += `• Pending: ${fmt(feeTotal - feePaid)} from ${feeList.filter((f:any) => f.status !== 'paid').length} students\n`;
  } else {
    snap += `• No fee records found\n`;
  }

  snap += `\nFor TRENDS, DATE RANGES, PAYSLIPS, SPECIFIC SEARCHES → use tools.\n`;
  snap += `=== END LIVE DATA ===\n`;

  return snap;
}

// ─── Teacher Snapshot ─────────────────────────────────────────────────────────
async function fetchTeacherSnapshot(schoolId: string, userId: string, db: ReturnType<typeof svc>): Promise<string> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [teacherR, classesR] = await Promise.all([
    safeQuery(() => db.from('users').select('full_name,email').eq('id', userId).single()),
    safeQuery(() => db.from('sections').select('id,name,classes(name)').eq('class_teacher_id', userId)),
  ]);

  let snap = `\n\n=== LIVE TEACHER DATA (real-time — answer basic questions from this) ===\n`;
  snap += `Date: ${now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}\n\n`;
  snap += `Teacher: ${teacherR.data?.full_name ?? 'Unknown'}\n`;
  
  const sections = classesR.data ?? [];
  if (sections.length > 0) {
    snap += `Class Teacher for: ${sections.map((s:any) => `${s.classes?.name} - ${s.name}`).join(', ')}\n`;
  }
  
  snap += `\nFor detailed class attendance, student marks, or lesson plans → use tools.\n`;
  snap += `=== END LIVE DATA ===\n`;
  return snap;
}

// ─── Parent Snapshot ──────────────────────────────────────────────────────────
async function fetchParentSnapshot(schoolId: string, userId: string, db: ReturnType<typeof svc>): Promise<string> {
  const now = new Date();

  // Find students linked to this parent
  const { data: students } = await safeQuery(() => db.from('students').select('id,full_name,roll_number,sections(name,classes(name))').eq('parent_id', userId));
  
  let snap = `\n\n=== LIVE PARENT DATA (real-time — answer basic questions from this) ===\n`;
  snap += `Date: ${now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}\n\n`;
  
  const kids = students ?? [];
  if (kids.length === 0) {
    snap += `No children found linked to your account.\n`;
  } else {
    snap += `Children:\n`;
    kids.forEach((k:any) => {
      snap += `- ${k.full_name} (Roll: ${k.roll_number || 'N/A'}, Class: ${(k.sections as any)?.classes?.name || '?'} - ${(k.sections as any)?.name || '?'})\n`;
    });
  }

  snap += `\nFor detailed attendance, fees, marks, or remarks for your children → use tools.\n`;
  snap += `=== END LIVE DATA ===\n`;
  return snap;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(userName: string, role: string, page: string, pageLabel: string, snapshot: string): string {
  return `You are the AI Copilot for a school management system (NxtStepEdu).
User: ${userName} (${role.charAt(0).toUpperCase() + role.slice(1)})
Current page: ${pageLabel}
${snapshot}
Rules:
1. Use LIVE SCHOOL DATA above to answer instantly — only call tools for trends, date ranges, or detailed drill-downs.
2. NEVER invent data. If something isn't in the snapshot, use the get_database_schema and query_database_with_sql tools to fetch the exact data using raw SQL.
3. Responses should be SHORT and structured: bullets, bold numbers, avoid long paragraphs.
4. Format currency as ₹X.XXL or ₹X,XX,XXX.
5. "this page" = ${pageLabel}.
6. navigate_to tool for navigation requests.
7. approve/reject leave → always use tool (triggers confirmation before acting).
8. NLP to SQL: If asked a question that requires database querying (e.g. "list of exams", "students by class"), ALWAYS call get_database_schema first, then call query_database_with_sql with a valid PostgreSQL SELECT query to retrieve and present the data.`;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sse(type: string, payload: Record<string, any>): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const db = svc();

  // 1. Auth
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  if (!token) return errSSE('Not authenticated.');

  let body: any = {};
  const [authRes] = await Promise.all([
    db.auth.getUser(token),
    req.json().then(j => { body = j; }).catch(() => {}),
  ]);

  const user = authRes.data?.user;
  if (!user) return errSSE('Invalid session.');

  const { data: ud } = await db.from('users').select('role,school_id,full_name').eq('id', user.id).single();
  if (!ud?.school_id) return errSSE('User profile not found.');

  const { role, school_id: schoolId, full_name: userName } = ud;
  if (!['principal','teacher','parent'].includes(role)) return errSSE('AI Copilot not available for your role.');

  const { messages: clientMsgs = [], context = {} } = body as { messages: any[]; context: any };
  const { page = '/', pageLabel = '' } = context;
  const label = pageLabel || page.split('/').filter(Boolean).pop() || 'Dashboard';

  // 2. Fetch snapshot + tools in parallel
  let snapshotPromise;
  if (role === 'principal') snapshotPromise = fetchPrincipalSnapshot(schoolId, db);
  else if (role === 'teacher') snapshotPromise = fetchTeacherSnapshot(schoolId, user.id, db);
  else if (role === 'parent') snapshotPromise = fetchParentSnapshot(schoolId, user.id, db);
  else snapshotPromise = Promise.resolve('No snapshot available.');

  const [snapshot, tools] = await Promise.all([
    snapshotPromise,
    Promise.resolve(getToolsForRole(role)),
  ]);

  const sysPrompt = buildSystemPrompt(userName, role, page, label, snapshot);
  const llmMsgs: any[] = [
    { role: 'system', content: sysPrompt },
    ...clientMsgs.slice(-10),
  ];

  // 3. SSE stream
  const enc = new TextEncoder();
  // eslint-disable-next-line prefer-const
  let ctrl!: ReadableStreamController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });

  (async () => {
    const emit = (ev: string) => { try { ctrl.enqueue(enc.encode(ev)); } catch {} };

    try {
      // Agentic tool loop
      let round = 0;
      while (round < MAX_TOOL_ROUNDS) {
        round++;
        const resp   = await callLLM(llmMsgs, tools);
        const choice = resp?.choices?.[0];
        if (!choice) throw new Error('Empty response from LLM');

        const { message, finish_reason } = choice;
        const toolCalls: any[] = message?.tool_calls ?? [];

        if (!toolCalls.length || finish_reason === 'stop') {
          if (message?.content) {
            emit(sse('text', { content: message.content }));
          }
          emit(sse('done', {}));
          ctrl.close();
          return;
        }

        llmMsgs.push(message);

        for (const tc of toolCalls) {
          const name = tc.function?.name ?? '';
          let params: Record<string, any> = {};
          try { params = JSON.parse(tc.function?.arguments ?? '{}'); } catch {}

          emit(sse('tool_status', { message: toolLabel(name, params) }));

          let result;
          try { result = await executeTool(name, params, schoolId, user.id, role, token); }
          catch (e: any) { result = { success: false, error: e.message }; }

          if (result.confirmRequired && result.confirmData) {
            emit(sse('confirm', { confirmData: result.confirmData }));
            llmMsgs.push({ role: 'tool', tool_call_id: tc.id, content: 'Requires user confirmation.' });
            const cr = await callLLM([
              ...llmMsgs,
              { role: 'system', content: 'Very briefly (1 sentence) tell the user what action requires confirmation and to click the button below.' },
            ], []);
            const rawTxt = cr?.choices?.[0]?.message?.content ?? '';
            const txt = rawTxt.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            if (txt) emit(sse('text', { content: txt }));
            emit(sse('done', {}));
            ctrl.close();
            return;
          }

          if (result.chartData)       emit(sse('chart',   { chartData: result.chartData }));
          if (result.tableData)       emit(sse('table',   { tableData: result.tableData }));
          if (result.actions?.length) emit(sse('actions', { actions:   result.actions   }));

          llmMsgs.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({
              success: result.success,
              summary: result.summary,
              data: result.data ? JSON.stringify(result.data).slice(0, 1200) : null,
              error: result.error,
            }),
          });
        }
      }

      // Stream final response
      try {
        for await (const token of streamLLM(llmMsgs)) {
          emit(sse('text', { content: token }));
        }
      } catch {
        const fallback = [...llmMsgs].reverse().find(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim());
        if (fallback?.content) emit(sse('text', { content: fallback.content }));
        else emit(sse('error', { message: "Couldn't generate a response. Please try again." }));
      }

      emit(sse('done', {}));
    } catch (err: any) {
      console.error('[AI Copilot fatal]', err.message);
      emit(sse('error', { message: "Something went wrong. Please try again." }));
      emit(sse('done', {}));
    } finally {
      try { ctrl.close(); } catch {}
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toolLabel(name: string, p: Record<string, any>): string {
  const m: Record<string,string> = {
    get_dashboard_summary: '📊 Loading overview...',
    get_staff:             '👥 Fetching staff...',
    get_attendance:        '📋 Checking attendance...',
    get_attendance_trend:  '📈 Analyzing attendance...',
    get_leave_requests:    '🏖 Loading leave requests...',
    approve_leave:         '✓ Preparing approval...',
    reject_leave:          '✗ Preparing rejection...',
    get_payroll:           '💰 Fetching payroll...',
    get_payroll_trend:     '📈 Analyzing payroll trend...',
    get_fee_summary:       '💳 Loading fees...',
    get_students:          '🎓 Fetching students...',
    get_student_performance: '📝 Analyzing performance...',
    query_database_with_sql: '⚙️ Executing query...',
    get_database_schema: '📚 Inspecting schema...',
    navigate_to:           `🔗 Opening ${p?.label ?? 'page'}...`,
  };
  return m[name] ?? `🔍 Running ${name}...`;
}

function errSSE(msg: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type:'error', message: msg })}\n\ndata: ${JSON.stringify({ type:'done' })}\n\n`,
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
  );
}
