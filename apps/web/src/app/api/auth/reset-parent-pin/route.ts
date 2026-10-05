import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // ── Auth gate: only principals can call this ──────────────────────────────
    const callerClient = await createServerSupabaseClient();
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = await createServerSupabaseAdmin();
    const { data: callerProfile } = await supabaseAdmin
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerProfile || callerProfile.role !== 'principal') {
      return NextResponse.json({ error: 'Forbidden – principals only' }, { status: 403 });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { parent_id } = await request.json();
    if (!parent_id) return NextResponse.json({ error: 'parent_id is required' }, { status: 400 });

    // Verify target user is a parent in the same school
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('role, school_id, full_name, phone')
      .eq('id', parent_id)
      .single();

    if (!targetUser) return NextResponse.json({ error: 'Parent not found' }, { status: 404 });
    if (targetUser.role !== 'parent') return NextResponse.json({ error: 'Target user is not a parent' }, { status: 400 });
    if (targetUser.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'Cross-school access denied' }, { status: 403 });
    }

    // Generate a new 6-digit PIN
    const newPin = String(Math.floor(100000 + Math.random() * 900000));

    // Update via Admin API (bypasses RLS, works on auth.users)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(parent_id, {
      password: newPin,
    });

    if (authError) {
      return NextResponse.json({ error: `Failed to reset PIN: ${authError.message}` }, { status: 500 });
    }

    // Keep login_pin in sync so principals can always export/view current credentials
    await supabaseAdmin.from('users').update({ login_pin: newPin }).eq('id', parent_id);

    return NextResponse.json({ new_pin: newPin, parent_name: targetUser.full_name, phone: targetUser.phone });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
