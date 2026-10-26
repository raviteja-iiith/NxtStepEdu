import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SMS_GATE_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase
    .from('users').select('role, school_id').eq('id', user.id).single();
  if (!caller || caller.role !== 'principal') {
    return NextResponse.json({ error: 'Only principals can send attendance SMS' }, { status: 403 });
  }

  const schoolId = caller.school_id;

  // ── Body ────────────────────────────────────────────────────────────────────
  const { smsUsername, smsPassword, absentStudents, date, msgTemplate } = await req.json() as {
    smsUsername: string;
    smsPassword: string;
    absentStudents: { studentName: string; parentPhone: string; parentId: string; sectionLabel?: string }[];
    date: string;
    msgTemplate?: string;
  };

  const DEFAULT_TEMPLATE = 'Dear Parent, {studentName} was marked ABSENT on {date}. Please contact the school if this is incorrect. - {schoolName}';
  const template = msgTemplate?.trim() || DEFAULT_TEMPLATE;

  if (!smsUsername || !smsPassword)
    return NextResponse.json({ error: 'SMS Gateway username and password are required.' }, { status: 400 });
  if (!absentStudents?.length)
    return NextResponse.json({ error: 'No absent students provided.' }, { status: 400 });

  const admin = await createServerSupabaseAdmin();

  const { data: school } = await admin.from('schools').select('name, attendance_sms_enabled').eq('id', schoolId).single();
  if (!school?.attendance_sms_enabled)
    return NextResponse.json({ error: 'SMS attendance not enabled for your school.' }, { status: 403 });

  const formattedDate = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const authHeader = 'Basic ' + Buffer.from(`${smsUsername}:${smsPassword}`).toString('base64');
  const total = absentStudents.length;

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let sent = 0, failed = 0, skipped = 0;
      const logRows: any[] = [];

      for (let i = 0; i < absentStudents.length; i++) {
        const s = absentStudents[i];

        if (!s.parentPhone?.trim()) {
          skipped++;
          logRows.push({ school_id: schoolId, sms_username: smsUsername, student_id: null, parent_id: s.parentId || null, phone_number: null, message: null, status: 'skipped', error_message: 'No phone number', sms_type: 'attendance_absent' });
          send({ type: 'progress', done: i + 1, total, studentName: s.studentName, status: 'skipped', reason: 'No phone' });
          continue;
        }

        const phone = s.parentPhone.replace(/\D/g, '');
        const formattedPhone = phone.length === 10 ? `+91${phone}` : `+${phone}`;
        const message = template
          .replace(/{studentName}/g, s.studentName)
          .replace(/{date}/g, formattedDate)
          .replace(/{schoolName}/g, school.name)
          .replace(/{section}/g, s.sectionLabel || '');

        let status: 'sent' | 'failed' = 'sent';
        let errorMessage: string | null = null;

        try {
          const res = await fetch(SMS_GATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [formattedPhone] }),
            signal: AbortSignal.timeout(20000),
          });

          if (![200, 201, 202].includes(res.status)) {
            status = 'failed';
            try { const j = await res.json(); errorMessage = j?.message || `HTTP ${res.status}`; }
            catch { errorMessage = `HTTP ${res.status}`; }

            if (res.status === 401) {
              send({ type: 'error', message: 'Invalid credentials — check your SMS Gateway username and password.' });
              controller.close(); return;
            }
          }
        } catch (err: any) {
          status = 'failed';
          errorMessage = err?.message ?? 'Network error';
        }

        if (status === 'sent') sent++; else failed++;
        logRows.push({ school_id: schoolId, sms_username: smsUsername, parent_id: s.parentId || null, phone_number: formattedPhone, message, status, error_message: errorMessage, sms_type: 'attendance_absent', created_by: user.id });
        send({ type: 'progress', done: i + 1, total, studentName: s.studentName, status, error: errorMessage });

        await new Promise(r => setTimeout(r, 150));
      }

      if (logRows.length > 0) await admin.from('sms_logs').insert(logRows);
      send({ type: 'done', sent, failed, skipped, total });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
