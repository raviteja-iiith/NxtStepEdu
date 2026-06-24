import { SupabaseClient } from '@supabase/supabase-js';

export async function getTeacherSections(supabase: SupabaseClient, teacherId: string) {
  // Step 1: get all section IDs assigned to this teacher (may have duplicates across subjects)
  const { data: assignments, error: aErr } = await supabase
    .from('teacher_section_assignments')
    .select('section_id')
    .eq('teacher_id', teacherId);

  if (aErr) throw aErr;
  if (!assignments || assignments.length === 0) return [];

  // Deduplicate section IDs
  const sectionIds = [...new Set(assignments.map((a: any) => a.section_id as string))];

  // Step 2: fetch full section details for all IDs in one query
  const { data: sections, error: sErr } = await supabase
    .from('sections')
    .select('id, name, classes(name)')
    .in('id', sectionIds);

  if (sErr) throw sErr;

  return (sections || []).map((sec: any) => ({
    id: sec.id as string,
    name: sec.name as string,
    class_name: sec.classes?.name || '',
  }));
}

export async function getSectionStudents(supabase: SupabaseClient, sectionId: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('section_id', sectionId)
    .eq('is_active', true)
    .order('roll_number');
    
  if (error) throw error;
  return data || [];
}

export async function getTeacherDashboardStats(supabase: SupabaseClient, teacherId: string) {
  const { count } = await supabase
    .from('teacher_section_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('teacher_id', teacherId);
    
  return { sectionsCount: count || 0 };
}

export async function getTeacherAssignments(supabase: SupabaseClient, teacherId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, subjects(name), sections(name)')
    .eq('teacher_id', teacherId)
    .order('deadline', { ascending: false });
    
  if (error) throw error;
  return data || [];
}

export async function createAssignment(supabase: SupabaseClient, payload: any) {
  const { data, error } = await supabase
    .from('assignments')
    .insert(payload)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function getTeacherSubjectsAndSections(supabase: SupabaseClient, teacherId: string) {
  const { data, error } = await supabase
    .from('teacher_section_assignments')
    .select('sections(id, name, classes(name)), subjects(id, name)')
    .eq('teacher_id', teacherId);
    
  if (error) throw error;
  return data || [];
}

export async function getTeacherLessonPlans(supabase: SupabaseClient, teacherId: string) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .select('*, subjects(name), sections(name)')
    .eq('teacher_id', teacherId)
    .order('week_start_date', { ascending: false });
    
  if (error) throw error;
  return data || [];
}

export async function createLessonPlan(supabase: SupabaseClient, payload: any) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .insert(payload)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
