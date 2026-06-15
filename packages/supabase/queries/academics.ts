import { SupabaseClient } from '@supabase/supabase-js';

export async function getTeacherSections(supabase: SupabaseClient, teacherId: string) {
  const { data, error } = await supabase
    .from('teacher_section_assignments')
    .select('sections(id, name, classes(name))')
    .eq('teacher_id', teacherId);
    
  if (error) throw error;
  
  const unique = new Map();
  if (data) {
    data.forEach((d: Record<string, unknown>) => {
      const sec = d.sections as Record<string, unknown>;
      if (sec) {
        unique.set(sec.id as string, { 
          id: sec.id as string, 
          name: sec.name as string, 
          class_name: (sec.classes as Record<string, string>)?.name || '' 
        });
      }
    });
  }
  return Array.from(unique.values());
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
