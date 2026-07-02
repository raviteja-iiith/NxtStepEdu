import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SMS_GATE_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';

function buildSmsMessage(
  parentName: string,
  studentName: string,
  examName: string,
  examDate: string,
  subjects: { name: string; obtained: number | null; total: number; isAbsent: boolean }[],
  schoolName: string
): string {
  const dateStr = examDate
    ? new Date(examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const totalObtained = subjects
    .filter(s => !s.isAbsent && s.obtained !== null)
    .reduce((sum, s) => sum + (s.obtained ?? 0), 0);
  const grandTotal = subjects.reduce((sum, s) => sum + s.total, 0);
  const pct = grandTotal > 0 ? Math.round((totalObtained / grandTotal) * 100) : 0;

  // Determine pass/fail: pass if >= 35% overall (standard threshold)
  const hasMissingMarks = subjects.some(s => !s.isAbsent && s.obtained === null);
  const allAbsent = subjects.every(s => s.isAbsent);
  const result = allAbsent ? 'ABSENT' : hasMissingMarks ? 'PENDING' : pct >= 35 ? 'PASS' : 'FAIL';

  const subjectLines = subjects
    .map(s => {
      if (s.isAbsent) return `${s.name}: Absent`;
      if (s.obtained === null) return `${s.name}: Not Entered`;
      return `${s.name}: ${s.obtained}/${s.total}`;
    })
    .join('\n');

  return (
    `Dear ${parentName},\n` +
    `${studentName}'s result for ${examName}${dateStr ? ` (${dateStr})` : ''}:\n\n` +
    `${subjectLines}\n\n` +
    `Overall: ${totalObtained}/${grandTotal} (${pct}%)\n` +
    `Result: ${result}\n\n` +
    `- ${schoolName}`
  );
}

export async function POST(req: Request) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role, school_id, full_name')
    .eq('id', user.id)
    .single();

  if (!caller || caller.role !== 'principal') {
    return NextResponse.json({ error: 'Access denied — only principals can send SMS' }, { status: 403 });
  }

  const schoolId = caller.school_id;

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = await req.json();
  const {
    smsUsername,
    smsPassword,
    examName,
    examDate,
    examIds,          // string[]
    classId,
    sectionId,        // string | null
  } = body as {
    smsUsername: string;
    smsPassword: string;
    examName: string;
    examDate: string;
    examIds: string[];
    classId: string;
    sectionId: string | null;
  };

  if (!smsUsername || !smsPassword) {
    return NextResponse.json({ error: 'SMS credentials are required' }, { status: 400 });
  }
  if (!examIds || examIds.length === 0) {
    return NextResponse.json({ error: 'No exam IDs provided' }, { status: 400 });
  }

  // ── Use admin client so we can read across RLS boundaries (parent phone etc.) ─
  const admin = await createServerSupabaseAdmin();

  // ── School name ─────────────────────────────────────────────────────────────
  const { data: school } = await admin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single();
  const schoolName = school?.name ?? 'School';

  // ── Fetch exam subject info (name + total_marks per examId) ─────────────────
  const { data: examsData } = await admin
    .from('exams')
    .select('id, total_marks, passing_marks, subjects(name)')
    .in('id', examIds);

  const examMap = new Map(
    (examsData ?? []).map((e: any) => [
      e.id,
      { subjectName: e.subjects?.name ?? 'Unknown', total: e.total_marks as number },
    ])
  );

  // ── Fetch students ───────────────────────────────────────────────────────────
  let studentsQuery = admin
    .from('students')
    .select('id, full_name, roll_number')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .eq('class_id', classId);
  if (sectionId) studentsQuery = studentsQuery.eq('section_id', sectionId);
  const { data: students } = await studentsQuery.order('roll_number');

  if (!students || students.length === 0) {
    return NextResponse.json({ error: 'No students found for the selected class/section' }, { status: 400 });
  }

  // ── Fetch all marks for the exam group in one query ─────────────────────────
  const { data: allMarks } = await admin
    .from('marks')
    .select('exam_id, student_id, marks_obtained, is_absent')
    .in('exam_id', examIds);

  // Build map: studentId -> examId -> mark
  const marksMap = new Map<string, Map<string, { obtained: number | null; isAbsent: boolean }>>();
  for (const m of allMarks ?? []) {
    if (!marksMap.has(m.student_id)) marksMap.set(m.student_id, new Map());
    marksMap.get(m.student_id)!.set(m.exam_id, {
      obtained: m.marks_obtained,
      isAbsent: !!m.is_absent,
    });
  }

  // ── Fetch all parent links for students in one query ────────────────────────
  const studentIds = students.map((s: any) => s.id);
  const { data: parentLinks } = await admin
    .from('student_parent_links')
    .select('student_id, parent_id, is_primary_contact')
    .in('student_id', studentIds);

  // For each student, pick primary parent (or first)
  const primaryParentMap = new Map<string, string>(); // studentId -> parentId
  for (const link of parentLinks ?? []) {
    const existing = primaryParentMap.get(link.student_id);
    if (!existing || link.is_primary_contact) {
      primaryParentMap.set(link.student_id, link.parent_id);
    }
  }

  // Fetch parent user records (phone + name) for all parent IDs
  const parentIds = [...new Set(primaryParentMap.values())];
  const { data: parentUsers } = parentIds.length > 0
    ? await admin.from('users').select('id, phone, full_name').in('id', parentIds)
    : { data: [] };

  const parentUserMap = new Map(
    (parentUsers ?? []).map((u: any) => [u.id, { phone: u.phone as string | null, name: u.full_name as string }])
  );

  // ── Stream SSE ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const total = students.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let sent = 0;
      let failed = 0;
      let skipped = 0;
      const logRows: any[] = [];

      for (let i = 0; i < students.length; i++) {
        const student = students[i] as any;
        const parentId = primaryParentMap.get(student.id);
        const parent = parentId ? parentUserMap.get(parentId) : null;
        const phone = parent?.phone?.trim() ?? null;
        const parentName = parent?.name ?? 'Parent';

        // Build subject rows for this student
        const subjectRows = examIds.map(eid => {
          const info = examMap.get(eid);
          const mark = marksMap.get(student.id)?.get(eid);
          return {
            name: info?.subjectName ?? 'Unknown',
            obtained: mark?.obtained ?? null,
            total: info?.total ?? 0,
            isAbsent: mark?.isAbsent ?? false,
          };
        });

        // Skip if no phone
        if (!phone) {
          skipped++;
          logRows.push({
            school_id: schoolId,
            exam_name: examName,
            exam_date: examDate || null,
            class_id: classId,
            section_id: sectionId || null,
            sms_username: smsUsername,
            student_id: student.id,
            parent_id: parentId ?? null,
            phone_number: null,
            message: null,
            status: 'skipped',
            error_message: 'No phone number on parent account',
            created_by: user.id,
          });
          send({ type: 'progress', done: i + 1, total, studentName: student.full_name, status: 'skipped', reason: 'No phone number' });
          continue;
        }

        const message = buildSmsMessage(parentName, student.full_name, examName, examDate, subjectRows, schoolName);

        // Ensure phone is in +91 format
        let formattedPhone = phone;
        if (!phone.startsWith('+')) {
          formattedPhone = phone.length === 10 ? `+91${phone}` : `+${phone}`;
        }

        // ── Send to SMS Gate ────────────────────────────────────────────────
        let smsStatus: 'sent' | 'failed' = 'sent';
        let errorMessage: string | null = null;

        try {
          const smsRes = await fetch(SMS_GATE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Basic ' + Buffer.from(`${smsUsername}:${smsPassword}`).toString('base64'),
            },
            body: JSON.stringify({
              textMessage: { text: message },
              phoneNumbers: [formattedPhone],
            }),
            signal: AbortSignal.timeout(20000),
          });

          if (![200, 201, 202].includes(smsRes.status)) {
            smsStatus = 'failed';
            let detail = `HTTP ${smsRes.status}`;
            try {
              const json = await smsRes.json();
              detail = json?.message || JSON.stringify(json) || detail;
            } catch {}
            errorMessage = detail;

            if (smsRes.status === 401) {
              // Invalid credentials — abort entire batch
              send({ type: 'error', message: 'Authentication failed — check your SMS Gateway username and password.' });
              controller.close();
              return;
            }
          }
        } catch (err: any) {
          smsStatus = 'failed';
          errorMessage = err?.message ?? 'Network error';
        }

        if (smsStatus === 'sent') sent++;
        else failed++;

        logRows.push({
          school_id: schoolId,
          exam_name: examName,
          exam_date: examDate || null,
          class_id: classId,
          section_id: sectionId || null,
          sms_username: smsUsername,
          student_id: student.id,
          parent_id: parentId ?? null,
          phone_number: formattedPhone,
          message,
          status: smsStatus,
          error_message: errorMessage,
          created_by: user.id,
        });

        send({ type: 'progress', done: i + 1, total, studentName: student.full_name, status: smsStatus, error: errorMessage });

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 150));
      }

      // ── Bulk insert logs ────────────────────────────────────────────────────
      if (logRows.length > 0) {
        await admin.from('sms_logs').insert(logRows);
      }

      send({ type: 'done', sent, failed, skipped, total });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
