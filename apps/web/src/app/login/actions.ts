'use server';

import { createServerSupabaseAdmin } from '@/lib/supabase/server';

export async function fetchActiveSchools() {
  const supabase = await createServerSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, code, city, state, logo_url')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
    
  if (error) {
    console.error('Error fetching schools:', error);
    return [];
  }
  
  return data || [];
}

export async function verifyUserLogin(userId: string) {
  const supabase = await createServerSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('users')
    .select('role, school_id, is_active, is_first_login')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error('Error verifying user:', error);
    return null;
  }
  
  return data;
}

export async function updateUserLastLogin(userId: string) {
  const supabase = await createServerSupabaseAdmin();
  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}
