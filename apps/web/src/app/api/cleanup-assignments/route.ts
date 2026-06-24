import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cleanup-assignments
 *
 * Soft-archives assignments that are more than 7 days past their deadline
 * by setting is_published = false. Called daily by Vercel Cron at 1 AM.
 *
 * Authorization: requires CRON_SECRET header matching env var.
 */
export async function GET(request: Request) {
  // Simple auth check for Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().split('T')[0];

  // Soft-archive: set is_published = false for old overdue assignments
  const { data, error } = await supabase
    .from('assignments')
    .update({ is_published: false })
    .eq('is_published', true)
    .lt('deadline', cutoff)
    .select('id');

  if (error) {
    console.error('[cleanup-assignments] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = data?.length ?? 0;
  console.log(`[cleanup-assignments] Archived ${count} assignment(s) with deadline before ${cutoff}`);

  return NextResponse.json({
    success: true,
    archived: count,
    cutoff,
    timestamp: new Date().toISOString(),
  });
}
