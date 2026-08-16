import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // ── Auth gate: only principals and teachers can call this ─────────────────
    const callerClient = await createServerSupabaseClient();
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = await createServerSupabaseAdmin();
    const { data: callerProfile } = await supabaseAdmin
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerProfile || !['principal', 'teacher'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // ──────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    const { request_id } = body;
    let { user_id } = body;

    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    // Fetch the reset request record to get full details
    const { data: reqRow } = await supabaseAdmin
      .from('password_reset_requests')
      .select('*')
      .eq('id', request_id)
      .single();
    if (!reqRow) return NextResponse.json({ error: 'Reset request not found' }, { status: 404 });

    // Security: must be same school
    if (reqRow.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'Cross-school access denied' }, { status: 403 });
    }

    // ── Resolve user_id — it may be null if the request was submitted anonymously
    user_id = user_id || reqRow.user_id;

    if (!user_id) {
      const identifier = (reqRow.user_identifier || '').trim();
      const targetRole = reqRow.role; // 'parent' or 'teacher'

      if (targetRole === 'parent') {
        // Strategy 1: Match by phone or username (exact)
        const { data: u } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('school_id', reqRow.school_id)
          .eq('role', 'parent')
          .or(`phone.eq.${identifier},username.eq.${identifier}`)
          .maybeSingle();
        user_id = u?.id || null;

        // Strategy 2: If identifier contains @parent.schoolerp.local, strip it to get phone
        if (!user_id && identifier.includes('@parent.schoolerp.local')) {
          const phone = identifier.replace('@parent.schoolerp.local', '');
          const { data: u2 } = await supabaseAdmin
            .from('users').select('id')
            .eq('school_id', reqRow.school_id).eq('role', 'parent').eq('phone', phone)
            .maybeSingle();
          user_id = u2?.id || null;
        }

        // Strategy 3: Match by full_name from the request
        if (!user_id && reqRow.user_name) {
          const { data: u3 } = await supabaseAdmin
            .from('users').select('id')
            .eq('school_id', reqRow.school_id).eq('role', 'parent')
            .ilike('full_name', reqRow.user_name.trim())
            .maybeSingle();
          user_id = u3?.id || null;
        }
      } else {
        // ── Teacher: multiple lookup strategies ──────────────────────────
        // Teacher usernames are like: "firstname.empid@SCHOOLCODE"
        // Auth emails are like: "firstname.empid.SCHOOLCODE@schoolerp.local"

        // Strategy 1: Exact username match
        const { data: u1 } = await supabaseAdmin
          .from('users').select('id')
          .eq('school_id', reqRow.school_id).eq('role', 'teacher')
          .eq('username', identifier)
          .maybeSingle();
        user_id = u1?.id || null;

        // Strategy 2: If identifier ends with @schoolerp.local, it's the auth email
        // Strip the suffix, replace last dot with @ to reconstruct username
        if (!user_id && identifier.endsWith('@schoolerp.local')) {
          const withoutDomain = identifier.replace('@schoolerp.local', '');
          // "firstname.empid.SCHOOLCODE" → "firstname.empid@SCHOOLCODE"
          const lastDotIdx = withoutDomain.lastIndexOf('.');
          if (lastDotIdx > 0) {
            const reconstructedUsername = withoutDomain.substring(0, lastDotIdx) + '@' + withoutDomain.substring(lastDotIdx + 1);
            const { data: u2 } = await supabaseAdmin
              .from('users').select('id')
              .eq('school_id', reqRow.school_id).eq('role', 'teacher')
              .eq('username', reconstructedUsername)
              .maybeSingle();
            user_id = u2?.id || null;
          }

          // Also try direct email match in users table
          if (!user_id) {
            const { data: u2b } = await supabaseAdmin
              .from('users').select('id')
              .eq('school_id', reqRow.school_id).eq('role', 'teacher')
              .eq('email', identifier)
              .maybeSingle();
            user_id = u2b?.id || null;
          }
        }

        // Strategy 3: Derive email from username and match
        if (!user_id && !identifier.endsWith('@schoolerp.local')) {
          const derivedEmail = `${identifier.replace('@', '.')}@schoolerp.local`;
          const { data: u3 } = await supabaseAdmin
            .from('users').select('id')
            .eq('school_id', reqRow.school_id).eq('role', 'teacher')
            .eq('email', derivedEmail)
            .maybeSingle();
          user_id = u3?.id || null;
        }

        // Strategy 4: Match by full_name from the request
        if (!user_id && reqRow.user_name) {
          const { data: u4 } = await supabaseAdmin
            .from('users').select('id')
            .eq('school_id', reqRow.school_id).eq('role', 'teacher')
            .ilike('full_name', reqRow.user_name.trim())
            .maybeSingle();
          user_id = u4?.id || null;
        }

        // Strategy 5: Partial username match (identifier contains @ → use part before @)
        if (!user_id && identifier.includes('@')) {
          const namePart = identifier.split('@')[0];
          if (namePart) {
            const { data: u5 } = await supabaseAdmin
              .from('users').select('id')
              .eq('school_id', reqRow.school_id).eq('role', 'teacher')
              .ilike('username', `${namePart}@%`)
              .maybeSingle();
            user_id = u5?.id || null;
          }
        }

        // Strategy 6: Last resort — scan auth users by derived email
        if (!user_id) {
          const derivedEmail = identifier.endsWith('@schoolerp.local')
            ? identifier
            : `${identifier.replace('@', '.')}@schoolerp.local`;
          const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const found = authList?.users?.find((u: any) => u.email === derivedEmail);
          if (found) {
            // Verify this user belongs to the same school
            const { data: verifyUser } = await supabaseAdmin
              .from('users').select('id, school_id')
              .eq('id', found.id).eq('school_id', reqRow.school_id).maybeSingle();
            user_id = verifyUser?.id || null;
          }
        }
      }
    }

    if (!user_id) {
      return NextResponse.json({ error: `Could not find user account for "${reqRow.user_identifier}". Please check the identifier and try again.` }, { status: 404 });
    }

    // Verify the target user belongs to same school
    const { data: targetUser } = await supabaseAdmin
      .from('users').select('role, school_id').eq('id', user_id).single();
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (targetUser.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'Cross-school access denied' }, { status: 403 });
    }

    // Generate new credential
    const isParent = targetUser.role === 'parent';
    const newCredential = isParent
      ? String(Math.floor(100000 + Math.random() * 900000))         // 6-digit PIN
      : Math.random().toString(36).slice(2, 10).toUpperCase();       // 8-char password

    // Update auth password via Admin API
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: newCredential,
    });
    if (authError) {
      return NextResponse.json({ error: `Failed to reset credential: ${authError.message}` }, { status: 500 });
    }

    // Mark request as resolved and store the resolved user_id for future reference
    await supabaseAdmin.from('password_reset_requests').update({
      status: 'resolved',
      user_id,
      resolved_at: new Date().toISOString(),
      resolved_by: caller.id,
    }).eq('id', request_id);

    return NextResponse.json({ new_credential: newCredential, role: targetUser.role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

