import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // This uses the service role key to run DDL
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results: string[] = [];

    // Step 1: Add attendance_sms_enabled to schools
    const { error: e1 } = await supabaseAdmin.rpc('execute_readonly_sql', {
      query: "SELECT column_name FROM information_schema.columns WHERE table_name='schools' AND column_name='attendance_sms_enabled'"
    });
    results.push('Column check done: ' + (e1?.message || 'ok'));

    // We'll use the raw fetch with the REST API to execute DDL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    const ddlStatements = [
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS attendance_sms_enabled BOOLEAN DEFAULT false",
      `CREATE TABLE IF NOT EXISTS sms_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
        msg91_auth_key TEXT NOT NULL DEFAULT '',
        msg91_sender_id TEXT NOT NULL DEFAULT 'SCHOOL',
        msg91_template_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      "ALTER TABLE sms_credentials ENABLE ROW LEVEL SECURITY",
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sms_credentials' AND policyname='Anyone in school can read sms_credentials') THEN
          CREATE POLICY "Anyone in school can read sms_credentials"
          ON sms_credentials FOR SELECT USING (
            school_id = (SELECT school_id FROM users WHERE id = auth.uid())
          );
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sms_credentials' AND policyname='Service role full access sms_credentials') THEN
          CREATE POLICY "Service role full access sms_credentials"
          ON sms_credentials FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$`,
    ];

    for (const stmt of ddlStatements) {
      try {
        // Use the pg REST endpoint directly with service key
        const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_readonly_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ query: stmt }),
        });
        const data = await resp.json();
        results.push(`Stmt "${stmt.slice(0, 40)}": ${resp.ok ? 'OK' : JSON.stringify(data)}`);
      } catch (err: any) {
        results.push(`Error: ${err.message}`);
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
