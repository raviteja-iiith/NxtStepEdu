// ─── Principal Snapshot ───────────────────────────────────────────────────────
// Same as old fetchSchoolSnapshot...

// ─── Teacher Snapshot ─────────────────────────────────────────────────────────
async function fetchTeacherSnapshot(schoolId: string, userId: string, db: ReturnType<typeof svc>): Promise<string> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [teacherR, attR, classesR] = await Promise.all([
    safeQuery(() => db.from('users').select('full_name,email').eq('id', userId).single()),
    safeQuery(() => db.from('attendance').select('status').eq('school_id', schoolId).eq('date', todayStr)),
    // Just a basic snapshot, details can be queried by tools
    safeQuery(() => db.from('sections').select('id,name,classes(name)').eq('class_teacher_id', userId)),
  ]);

  let snap = `\n\n=== LIVE TEACHER DATA ===\n`;
  snap += `Date: ${now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}\n\n`;
  snap += `Teacher: ${teacherR.data?.full_name ?? 'Unknown'}\n`;
  
  const sections = classesR.data ?? [];
  if (sections.length > 0) {
    snap += `Class Teacher for: ${sections.map((s:any) => `${s.classes?.name} - ${s.name}`).join(', ')}\n`;
  }
  
  snap += `\nFor detailed class attendance, student marks, or lesson plans → use tools.\n`;
  snap += `=== END LIVE DATA ===\n`;
  return snap;
}

// ─── Parent Snapshot ──────────────────────────────────────────────────────────
async function fetchParentSnapshot(schoolId: string, userId: string, db: ReturnType<typeof svc>): Promise<string> {
  const now = new Date();

  // Find students linked to this parent
  const { data: students } = await safeQuery(() => db.from('students').select('id,full_name,roll_number,sections(name,classes(name))').eq('parent_id', userId));
  
  let snap = `\n\n=== LIVE PARENT DATA ===\n`;
  snap += `Date: ${now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}\n\n`;
  
  const kids = students ?? [];
  if (kids.length === 0) {
    snap += `No children found linked to your account.\n`;
  } else {
    snap += `Children:\n`;
    kids.forEach((k:any) => {
      snap += `- ${k.full_name} (Roll: ${k.roll_number || 'N/A'}, Class: ${(k.sections as any)?.classes?.name || '?'} - ${(k.sections as any)?.name || '?'})\n`;
    });
  }

  snap += `\nFor detailed attendance, fees, marks, or remarks for your children → use tools.\n`;
  snap += `=== END LIVE DATA ===\n`;
  return snap;
}
