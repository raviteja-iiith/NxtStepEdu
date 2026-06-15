import { SupabaseClient } from '@supabase/supabase-js';

export async function getStudentAttendance(supabase: SupabaseClient, sectionId: string, date: string) {
  const { data, error } = await supabase
    .from('attendance')
    .select('student_id, status')
    .eq('section_id', sectionId)
    .eq('date', date);
  
  if (error) throw error;
  return data;
}

export async function markAttendanceBulk(supabase: SupabaseClient, payload: { student_id: string; status: string; section_id: string; date: string; marked_by: string; school_id: string }[]) {
  if (payload.length === 0) return;
  
  // First, delete existing records for this section + date to handle updates cleanly
  const sectionId = payload[0].section_id;
  const date = payload[0].date;
  
  await supabase
    .from('attendance')
    .delete()
    .eq('section_id', sectionId)
    .eq('date', date);

  // Then insert the new ones
  const { data, error } = await supabase
    .from('attendance')
    .insert(payload);
    
  if (error) throw error;
  return data;
}

export async function getAttendanceStats(supabase: SupabaseClient, schoolId: string, date: string) {
  const { count: totalAtt } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('date', date);
    
  const { count: presentAtt } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('date', date)
    .eq('status', 'present');
    
  return { total: totalAtt || 0, present: presentAtt || 0 };
}
