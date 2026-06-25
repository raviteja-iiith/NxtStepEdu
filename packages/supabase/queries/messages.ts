import { SupabaseClient } from '@supabase/supabase-js';

export async function getMessageContacts(supabase: SupabaseClient, userId: string, role: 'teacher' | 'parent') {
  const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
  if (!u?.school_id) return [];

  if (role === 'parent') {
    // Parent sees teachers of their children's sections
    const { data: links } = await supabase
      .from('student_parent_links')
      .select('students(section_id)')
      .eq('parent_id', userId);
    const sectionIds = [...new Set((links || []).map((l: any) => l.students?.section_id).filter(Boolean))] as string[];
    if (sectionIds.length === 0) return [];

    // Source 1: subject-assigned teachers (teacher_section_assignments)
    const { data: subjectTeachers } = await supabase
      .from('teacher_section_assignments')
      .select('users!teacher_id(id, full_name, role)')
      .in('section_id', sectionIds);

    // Source 2: class teachers (stored directly on sections as class_teacher_id)
    const { data: classSections } = await supabase
      .from('sections')
      .select('class_teacher_id, users!class_teacher_id(id, full_name, role)')
      .in('id', sectionIds);

    const seen = new Set<string>();
    const allTeachers: any[] = [];

    // Add class teachers first (higher priority in list)
    (classSections || []).forEach((s: any) => {
      const u = s.users;
      if (u && !seen.has(u.id)) { seen.add(u.id); allTeachers.push(u); }
    });
    // Add subject teachers
    (subjectTeachers || []).forEach((r: any) => {
      const u = r.users;
      if (u && !seen.has(u.id)) { seen.add(u.id); allTeachers.push(u); }
    });
    return allTeachers;
  }

  // Teacher: only show parents whose children are in teacher's sections
  // Step 1: get teacher's sections (class teacher + subject assignments)
  const { data: classSecs } = await supabase
    .from('sections')
    .select('id')
    .eq('class_teacher_id', userId);
  const { data: subjectAsgn } = await supabase
    .from('teacher_section_assignments')
    .select('section_id')
    .eq('teacher_id', userId);

  const allSectionIds = [...new Set([
    ...(classSecs || []).map((s: any) => s.id as string),
    ...(subjectAsgn || []).map((a: any) => a.section_id as string),
  ])];
  if (allSectionIds.length === 0) return [];

  // Step 2: get students in those sections
  const { data: students } = await supabase
    .from('students')
    .select('id')
    .in('section_id', allSectionIds)
    .neq('is_active', false);
  const studentIds = (students || []).map((s: any) => s.id as string);
  if (studentIds.length === 0) return [];

  // Step 3: get parent IDs linked to those students
  const { data: links } = await supabase
    .from('student_parent_links')
    .select('parent_id')
    .in('student_id', studentIds);
  const parentIds = [...new Set((links || []).map((l: any) => l.parent_id as string).filter(Boolean))];
  if (parentIds.length === 0) return [];

  // Step 4: fetch parent user records
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role')
    .in('id', parentIds)
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
