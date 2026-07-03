import { SupabaseClient } from '@supabase/supabase-js';

export interface ContactWithMeta {
  id: string;
  full_name: string;
  role: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

async function enrichContactsWithMessageMeta(
  supabase: SupabaseClient,
  userId: string,
  contacts: { id: string; full_name: string; role: string }[]
): Promise<ContactWithMeta[]> {
  if (contacts.length === 0) return [];

  const contactIds = contacts.map(c => c.id);

  // Fetch latest message for each contact (sent or received)
  const { data: sentMsgs } = await supabase
    .from('messages')
    .select('receiver_id, content, created_at')
    .eq('sender_id', userId)
    .in('receiver_id', contactIds)
    .order('created_at', { ascending: false });

  const { data: recvMsgs } = await supabase
    .from('messages')
    .select('sender_id, content, created_at')
    .eq('receiver_id', userId)
    .in('sender_id', contactIds)
    .order('created_at', { ascending: false });

  // Fetch unread counts per contact
  const { data: unreadRows } = await supabase
    .from('messages')
    .select('sender_id')
    .eq('receiver_id', userId)
    .eq('is_read', false)
    .in('sender_id', contactIds);

  // Build maps
  const lastMsgMap: Record<string, { content: string; created_at: string }> = {};

  (sentMsgs || []).forEach((m: any) => {
    const cid = m.receiver_id;
    if (!lastMsgMap[cid] || m.created_at > lastMsgMap[cid].created_at) {
      lastMsgMap[cid] = { content: m.content, created_at: m.created_at };
    }
  });

  (recvMsgs || []).forEach((m: any) => {
    const cid = m.sender_id;
    if (!lastMsgMap[cid] || m.created_at > lastMsgMap[cid].created_at) {
      lastMsgMap[cid] = { content: m.content, created_at: m.created_at };
    }
  });

  // Count unread per sender
  const unreadMap: Record<string, number> = {};
  (unreadRows || []).forEach((r: any) => {
    unreadMap[r.sender_id] = (unreadMap[r.sender_id] || 0) + 1;
  });

  // Enrich contacts
  const enriched: ContactWithMeta[] = contacts.map(c => ({
    ...c,
    last_message_at: lastMsgMap[c.id]?.created_at || null,
    last_message_preview: lastMsgMap[c.id]?.content || null,
    unread_count: unreadMap[c.id] || 0,
  }));

  // Sort: contacts with messages first (latest first), then alphabetically
  enriched.sort((a, b) => {
    if (a.last_message_at && b.last_message_at) {
      return b.last_message_at.localeCompare(a.last_message_at);
    }
    if (a.last_message_at && !b.last_message_at) return -1;
    if (!a.last_message_at && b.last_message_at) return 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return enriched;
}

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

    return enrichContactsWithMessageMeta(supabase, userId, allTeachers);
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
  const { data: pLinks } = await supabase
    .from('student_parent_links')
    .select('parent_id')
    .in('student_id', studentIds);
  const parentIds = [...new Set((pLinks || []).map((l: any) => l.parent_id as string).filter(Boolean))];
  if (parentIds.length === 0) return [];

  // Step 4: fetch parent user records
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role')
    .in('id', parentIds)
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;

  return enrichContactsWithMessageMeta(supabase, userId, data || []);
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
