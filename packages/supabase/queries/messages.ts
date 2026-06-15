import { SupabaseClient } from '@supabase/supabase-js';

export async function getMessageContacts(supabase: SupabaseClient, userId: string, role: 'teacher' | 'parent') {
  // If parent, get teachers of their students
  // If teacher, get parents of their students
  // For simplicity right now, just returning all users of the opposite role in the school
  const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
  if (!u?.school_id) return [];
  
  const targetRole = role === 'teacher' ? 'parent' : 'teacher';
  
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('school_id', u.school_id)
    .eq('role', targetRole)
    .eq('is_active', true)
    .order('full_name');
    
  if (error) throw error;
  return data || [];
}

export async function getMessages(supabase: SupabaseClient, userId: string, contactId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true });
    
  if (error) throw error;
  return data || [];
}

export async function sendMessage(supabase: SupabaseClient, payload: any) {
  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
