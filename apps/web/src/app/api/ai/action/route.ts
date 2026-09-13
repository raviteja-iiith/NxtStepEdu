// AI Copilot — Confirmed Actions Endpoint
// Handles destructive/modifying operations AFTER user has clicked "Confirm" in the UI.
// Each action validates: authentication + school ownership before executing.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const db = svc();

  // 1. Authenticate
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

  // 2. Get role + school_id
  const { data: userData } = await db.from('users').select('role,school_id,full_name').eq('id', user.id).single();
  if (!userData?.school_id) return NextResponse.json({ error: 'User profile not found.' }, { status: 403 });
  const { role, school_id: schoolId, full_name: userName } = userData;

  if (!['principal', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
  }

  // 3. Parse body
  const { action, params = {} } = await req.json().catch(() => ({}));
  if (!action) return NextResponse.json({ error: 'No action specified.' }, { status: 400 });

  // 4. Execute action (with ownership check)
  try {
    switch (action) {

      // ── Approve Leave ────────────────────────────────────────────────────
      case 'approve_leave': {
        const { leave_id } = params;
        if (!leave_id) return NextResponse.json({ error: 'leave_id required.' }, { status: 400 });

        // Verify leave belongs to this school
        const { data: lr } = await db.from('leave_requests')
          .select('id,school_id,requester_id,leave_type,from_date,to_date,status')
          .eq('id', leave_id).single();
        if (!lr) return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
        if (lr.school_id !== schoolId) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
        if (lr.status !== 'pending') return NextResponse.json({ error: `Leave is already ${lr.status}.` }, { status: 400 });

        // Approve
        await db.from('leave_requests').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', leave_id);

        // Notify the requester
        try {
          await db.from('notifications').insert({
            school_id: schoolId,
            recipient_id: lr.requester_id,
            type: 'message',
            title: 'Leave Approved',
            body: `Your leave request (${new Date(lr.from_date).toLocaleDateString('en-IN')} – ${new Date(lr.to_date).toLocaleDateString('en-IN')}) has been approved by ${userName}.`,
            link: null,
          });
        } catch {} // notification failure should not block action

        return NextResponse.json({ success: true, message: `Leave approved for ${params.requester_name || 'staff member'}.` });
      }

      // ── Reject Leave ─────────────────────────────────────────────────────
      case 'reject_leave': {
        const { leave_id } = params;
        if (!leave_id) return NextResponse.json({ error: 'leave_id required.' }, { status: 400 });

        const { data: lr } = await db.from('leave_requests')
          .select('id,school_id,requester_id,leave_type,from_date,to_date,status')
          .eq('id', leave_id).single();
        if (!lr) return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
        if (lr.school_id !== schoolId) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
        if (lr.status !== 'pending') return NextResponse.json({ error: `Leave is already ${lr.status}.` }, { status: 400 });

        await db.from('leave_requests').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', leave_id);

        try {
          await db.from('notifications').insert({
            school_id: schoolId,
            recipient_id: lr.requester_id,
            type: 'message',
            title: 'Leave Rejected',
            body: `Your leave request (${new Date(lr.from_date).toLocaleDateString('en-IN')} – ${new Date(lr.to_date).toLocaleDateString('en-IN')}) has been rejected by ${userName}.`,
            link: null,
          });
        } catch {}

        return NextResponse.json({ success: true, message: `Leave rejected for ${params.requester_name || 'staff member'}.` });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[AI Action]', action, err.message);
    return NextResponse.json({ error: 'Action failed. Please try again.' }, { status: 500 });
  }
}
