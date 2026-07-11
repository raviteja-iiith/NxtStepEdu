import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SMS_GATE_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';

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
  const { smsUsername, smsPassword, classId, sectionId, template, dueBeforeDate } = await req.json() as {
    smsUsername: string;
    smsPassword: string;
    classId: string;
    sectionId: string | null;
    template: string;
    dueBeforeDate: string | null; // optional: only include fees due on/before this date
  };

  if (!smsUsername || !smsPassword) return NextResponse.json({ error: 'SMS credentials required' }, { status: 400 });
  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 });
  if (!template) return NextResponse.json({ error: 'template is required' }, { status: 400 });

  const { data: school } = await admin.from('schools').select('name').eq('id', schoolId).single();
  const schoolName = school?.name ?? 'School';

  // ── Fetch active students in the selected class/section ───────────────────────
  let studentQ = admin
    .from('students')
    .select('id, full_name')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .eq('class_id', classId);
  if (sectionId) studentQ = studentQ.eq('section_id', sectionId);
  const { data: students } = await studentQ.order('full_name');
  if (!students || students.length === 0)
    return NextResponse.json({ error: 'No students found for the selected class.' }, { status: 400 });

  const studentIds = students.map((s: any) => s.id);

  // ── Fetch pending/overdue fees for these students ─────────────────────────────
  // fees table: student_id, amount, discount_amount, due_date, status
  let feesQ = admin
    .from('fees')
    .select('student_id, amount, discount_amount, due_date, status, late_fee_applied, fee_structure_id, fee_structures(name, fee_type)')
    .eq('school_id', schoolId)
    .in('student_id', studentIds)
    .in('status', ['pending', 'overdue', 'partially_paid']);
  if (dueBeforeDate) feesQ = feesQ.lte('due_date', dueBeforeDate);

  const { data: feesData } = await feesQ;

  // Group fees by student — sum what they owe
  const feesByStudent = new Map<string, { totalDue: number; earliestDue: string | null; feeCount: number }>();
  for (const fee of feesData ?? []) {
    const netAmount = Number(fee.amount) - Number(fee.discount_amount ?? 0) + Number(fee.late_fee_applied ?? 0);
    const existing = feesByStudent.get(fee.student_id);
    if (!existing) {
      feesByStudent.set(fee.student_id, { totalDue: netAmount, earliestDue: fee.due_date, feeCount: 1 });
    } else {
      existing.totalDue += netAmount;
      existing.feeCount += 1;
      // Keep the earliest due date
      if (fee.due_date && (!existing.earliestDue || fee.due_date < existing.earliestDue)) {
        existing.earliestDue = fee.due_date;
      }
    }
  }

  // Only keep students who actually have dues
  const studentsWithDues = students.filter((s: any) => feesByStudent.has(s.id) && (feesByStudent.get(s.id)?.totalDue ?? 0) > 0);
  if (studentsWithDues.length === 0)
    return NextResponse.json({ error: 'No students with pending fees found in the selected class.' }, { status: 400 });

  // ── Parent links ──────────────────────────────────────────────────────────────
  const targetIds = studentsWithDues.map((s: any) => s.id);
  const { data: parentLinks } = await admin
    .from('student_parent_links')
    .select('student_id, parent_id, is_primary_contact')
    .in('student_id', targetIds);

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

  // ── Stream SSE ────────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const total = studentsWithDues.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let sent = 0, failed = 0, skipped = 0;
      const logRows: any[] = [];

      for (let i = 0; i < studentsWithDues.length; i++) {
        const student = studentsWithDues[i] as any;
        const feeInfo = feesByStudent.get(student.id)!;
        const parentId = primaryParentMap.get(student.id);
        const parent = parentId ? parentUserMap.get(parentId) : null;
        const phone = parent?.phone?.trim() ?? null;
        const parentName = parent?.name ?? 'Parent';

        // Format values
        const amountDue = `₹${feeInfo.totalDue.toFixed(0)}`;
        const dueDate = feeInfo.earliestDue
          ? new Date(feeInfo.earliestDue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'N/A';

        if (!phone) {
          skipped++;
          logRows.push({ school_id: schoolId, exam_name: 'Fee Reminder', exam_date: null, class_id: classId, section_id: sectionId || null, sms_username: smsUsername, student_id: student.id, parent_id: parentId ?? null, phone_number: null, message: null, status: 'skipped', error_message: 'No phone number on parent account', created_by: user.id });
          send({ type: 'progress', done: i + 1, total, studentName: student.full_name, status: 'skipped', reason: 'No phone number' });
          continue;
        }

        const message = buildMessage(template, {
          PARENT_NAME:  parentName,
          STUDENT_NAME: student.full_name,
          AMOUNT_DUE:   amountDue,
          DUE_DATE:     dueDate,
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
        logRows.push({ school_id: schoolId, exam_name: 'Fee Reminder', exam_date: null, class_id: classId, section_id: sectionId || null, sms_username: smsUsername, student_id: student.id, parent_id: parentId ?? null, phone_number: formattedPhone, message, status: smsStatus, error_message: errorMessage, created_by: user.id });
        send({ type: 'progress', done: i + 1, total, studentName: `${student.full_name} (${amountDue})`, status: smsStatus, error: errorMessage });
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
