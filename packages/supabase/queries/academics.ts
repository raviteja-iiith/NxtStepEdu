import { SupabaseClient } from '@supabase/supabase-js';

export async function getTeacherSections(supabase: SupabaseClient, teacherId: string) {
  // Primary source: class teacher assignments (set via the Classes page)
  const { data: classSecs } = await supabase
    .from('sections')
    .select('id, name, classes(name)')
    .eq('class_teacher_id', teacherId);

  // Secondary source: subject-based assignments (set via Subjects/Teachers pages)
  // Only include sections NOT already covered by class_teacher_id
  const classSectionIds = new Set((classSecs || []).map((s: any) => s.id as string));

  const { data: asgn } = await supabase
    .from('teacher_section_assignments')
    .select('section_id')
    .eq('teacher_id', teacherId);

  const subjectOnlyIds = [...new Set((asgn || []).map((a: any) => a.section_id as string))]
    .filter(id => !classSectionIds.has(id));

  let subjectOnlySecs: any[] = [];
  if (subjectOnlyIds.length > 0) {
    const { data: secs } = await supabase
      .from('sections')
      .select('id, name, classes(name)')
      .in('id', subjectOnlyIds);
    subjectOnlySecs = secs || [];
  }

  const all = [...(classSecs || []), ...subjectOnlySecs];
  return all.map((s: any) => ({
    id: s.id as string,
    name: s.name as string,
    class_name: (s.classes as any)?.name || '',
  }));
}

export async function getSectionStudents(supabase: SupabaseClient, sectionId: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('section_id', sectionId)
    .neq('is_active', false)  // includes null (unset) and true
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
