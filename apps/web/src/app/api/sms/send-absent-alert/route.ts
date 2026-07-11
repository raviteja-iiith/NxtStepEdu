import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SMS_GATE_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';

/** Replace {TOKEN} placeholders in the template with real values. */
function buildMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase
    .from('users').select('role, school_id').eq('id', user.id).single();
  if (!caller || caller.role !== 'principal')
    return NextResponse.json({ error: 'Access denied — principals only' }, { status: 403 });

  const schoolId = caller.school_id;
  const admin = await createServerSupabaseAdmin();

  // ── Parse body ────────────────────────────────────────────────────────────────
  const { smsUsername, smsPassword, date, classId, sectionId, template } = await req.json() as {
    smsUsername: string;
    smsPassword: string;
    date: string;          // YYYY-MM-DD
    classId: string;
    sectionId: string | null;
    template: string;
  };

  if (!smsUsername || !smsPassword) return NextResponse.json({ error: 'SMS credentials required' }, { status: 400 });
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 });
  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 });
  if (!template) return NextResponse.json({ error: 'template is required' }, { status: 400 });

  // ── School name ───────────────────────────────────────────────────────────────
  const { data: school } = await admin.from('schools').select('name').eq('id', schoolId).single();
  const schoolName = school?.name ?? 'School';

  // ── Find absent students on this date ─────────────────────────────────────────
  // attendance has student_id and section_id; join with students to filter by class_id
  let attendanceQuery = admin
    .from('attendance')
    .select('student_id')
    .eq('school_id', schoolId)
    .eq('date', date)
    .eq('status', 'absent');

  // Filter by section directly if provided (attendance table has section_id)
  if (sectionId) attendanceQuery = attendanceQuery.eq('section_id', sectionId);

  const { data: absentRows } = await attendanceQuery;
  if (!absentRows || absentRows.length === 0) {
    return NextResponse.json({ error: 'No absent students found for the selected date and class.' }, { status: 400 });
  }

  const absentStudentIds = absentRows.map((r: any) => r.student_id);

  // Fetch student details — also filter by class_id here
  let studentQuery = admin
    .from('students')
    .select('id, full_name')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .eq('class_id', classId)
    .in('id', absentStudentIds);

  const { data: students } = await studentQuery;
  if (!students || students.length === 0) {
    return NextResponse.json({ error: 'No absent students found in the selected class.' }, { status: 400 });
  }

  // ── Parent links ──────────────────────────────────────────────────────────────
  const studentIds = students.map((s: any) => s.id);
  const { data: parentLinks } = await admin
    .from('student_parent_links')
    .select('student_id, parent_id, is_primary_contact')
    .in('student_id', studentIds);

  const primaryParentMap = new Map<string, string>();
  for (const link of parentLinks ?? []) {
    const existing = primaryParentMap.get(link.student_id);
    if (!existing || link.is_primary_contact) primaryParentMap.set(link.student_id, link.parent_id);
  }

  const parentIds = [...new Set(primaryParentMap.values())];
  const { data: parentUsers } = parentIds.length > 0
    ? await admin.from('users').select('id, phone, full_name').in('id', parentIds)
    : { data: [] };
  const parentUserMap = new Map((parentUsers ?? []).map((u: any) => [u.id, { phone: u.phone as string | null, name: u.full_name as string }]));

  // ── Format date for message ───────────────────────────────────────────────────
  const displayDate = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Stream SSE ────────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const total = students.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let sent = 0, failed = 0, skipped = 0;
      const logRows: any[] = [];

      for (let i = 0; i < students.length; i++) {
        const student = students[i] as any;
        const parentId = primaryParentMap.get(student.id);
        const parent = parentId ? parentUserMap.get(parentId) : null;
        const phone = parent?.phone?.trim() ?? null;
        const parentName = parent?.name ?? 'Parent';

        if (!phone) {
          skipped++;
          logRows.push({ school_id: schoolId, exam_name: `Absent Alert ${date}`, exam_date: date, class_id: classId, section_id: sectionId || null, sms_username: smsUsername, student_id: student.id, parent_id: parentId ?? null, phone_number: null, message: null, status: 'skipped', error_message: 'No phone number on parent account', created_by: user.id });
          send({ type: 'progress', done: i + 1, total, studentName: student.full_name, status: 'skipped', reason: 'No phone number' });
          continue;
        }

        const message = buildMessage(template, {
          PARENT_NAME:  parentName,
          STUDENT_NAME: student.full_name,
          DATE:         displayDate,
          SCHOOL_NAME:  schoolName,
        });

        let formattedPhone = phone;
        if (!phone.startsWith('+')) formattedPhone = phone.length === 10 ? `+91${phone}` : `+${phone}`;

        let smsStatus: 'sent' | 'failed' = 'sent';
        let errorMessage: string | null = null;

        try {
          const smsRes = await fetch(SMS_GATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from(`${smsUsername}:${smsPassword}`).toString('base64') },
            body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [formattedPhone] }),
            signal: AbortSignal.timeout(20000),
          });

          if (![200, 201, 202].includes(smsRes.status)) {
            smsStatus = 'failed';
            try { const j = await smsRes.json(); errorMessage = j?.message || `HTTP ${smsRes.status}`; } catch { errorMessage = `HTTP ${smsRes.status}`; }
            if (smsRes.status === 401) {
              send({ type: 'error', message: 'Authentication failed — check your SMS Gateway credentials.' });
              controller.close(); return;
            }
          }
        } catch (err: any) { smsStatus = 'failed'; errorMessage = err?.message ?? 'Network error'; }

        if (smsStatus === 'sent') sent++; else failed++;
        logRows.push({ school_id: schoolId, exam_name: `Absent Alert ${date}`, exam_date: date, class_id: classId, section_id: sectionId || null, sms_username: smsUsername, student_id: student.id, parent_id: parentId ?? null, phone_number: formattedPhone, message, status: smsStatus, error_message: errorMessage, created_by: user.id });
        send({ type: 'progress', done: i + 1, total, studentName: student.full_name, status: smsStatus, error: errorMessage });
        await new Promise(r => setTimeout(r, 150));
      }

      if (logRows.length > 0) await admin.from('sms_logs').insert(logRows);
      send({ type: 'done', sent, failed, skipped, total });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
