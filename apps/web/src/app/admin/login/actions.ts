'use server';

import { createServerSupabaseAdmin } from '@/lib/supabase/server';

export async function verifyAdminRole(userId: string) {
  const supabase = await createServerSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error('Error verifying admin role:', error);
    return null;
  }
  
  return data;
}

export async function updateAdminLogin(userId: string) {
  const supabase = await createServerSupabaseAdmin();
  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}
