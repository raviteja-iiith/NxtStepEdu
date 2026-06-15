-- ============================================================
-- School ERP — Row Level Security Policies
-- Migration 002: RLS Policies
-- ============================================================

-- === SCHOOLS ===
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active schools visible for login screen"
ON schools FOR SELECT USING (is_active = true OR 
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Admin can insert schools"
ON schools FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Admin can update schools"
ON schools FOR UPDATE USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Admin can delete schools"
ON schools FOR DELETE USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- === USERS ===
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see users from same school or admin sees all"
ON users FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  OR id = auth.uid()
);

CREATE POLICY "Admin can insert users"
ON users FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'teacher'
);

CREATE POLICY "Users can update own profile or higher role can update"
ON users FOR UPDATE USING (
  id = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  OR (
    (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
    AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  )
);

-- === PRINCIPAL PROFILES ===
ALTER TABLE principal_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Principal profiles visible to admin and same school"
ON principal_profiles FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  OR school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Admin can manage principal profiles"
ON principal_profiles FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- === TEACHER PROFILES ===
ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher profiles visible to same school"
ON teacher_profiles FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Principal can manage teacher profiles"
ON teacher_profiles FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'principal')
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    OR school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  )
);

-- === PARENT PROFILES ===
ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parent profiles visible to same school"
ON parent_profiles FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "Teacher and principal can manage parent profiles"
ON parent_profiles FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === ACADEMIC YEARS ===
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Academic years visible to same school"
ON academic_years FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage academic years"
ON academic_years FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === CLASSES ===
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classes visible to same school"
ON classes FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage classes"
ON classes FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === SECTIONS ===
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sections visible to same school"
ON sections FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage sections"
ON sections FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === SUBJECTS ===
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subjects visible to same school"
ON subjects FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage subjects"
ON subjects FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === TEACHER SECTION ASSIGNMENTS ===
ALTER TABLE teacher_section_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments visible to same school"
ON teacher_section_assignments FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage teacher assignments"
ON teacher_section_assignments FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === STUDENTS ===
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students visible with role scope"
ON students FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
    OR section_id IN (
      SELECT section_id FROM teacher_section_assignments
      WHERE teacher_id = auth.uid()
    )
    OR id IN (
      SELECT student_id FROM student_parent_links
      WHERE parent_id = auth.uid()
    )
  )
);

CREATE POLICY "Principal can manage students"
ON students FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can update students"
ON students FOR UPDATE USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === STUDENT PARENT LINKS ===
ALTER TABLE student_parent_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parent links visible to relevant users"
ON student_parent_links FOR SELECT USING (
  parent_id = auth.uid()
  OR student_id IN (
    SELECT id FROM students
    WHERE school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  )
);

CREATE POLICY "Teacher can create parent links"
ON student_parent_links FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('teacher', 'principal')
);

-- === TIMETABLE ===
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timetable visible to same school"
ON timetable FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage timetable"
ON timetable FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === ATTENDANCE ===
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendance visible by role"
ON attendance FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
    OR marked_by = auth.uid()
    OR section_id IN (
      SELECT section_id FROM teacher_section_assignments WHERE teacher_id = auth.uid()
    )
    OR student_id IN (
      SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
    )
  )
);

CREATE POLICY "Teacher can mark attendance"
ON attendance FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) = 'teacher'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Teacher can update attendance"
ON attendance FOR UPDATE USING (
  marked_by = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

-- === HOLIDAYS ===
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holidays visible to same school"
ON holidays FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage holidays"
ON holidays FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === ASSIGNMENTS ===
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments visible by role"
ON assignments FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
    OR (
      is_published = true
      AND section_id IN (
        SELECT section_id FROM students
        WHERE id IN (SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid())
      )
    )
  )
);

CREATE POLICY "Teacher can manage own assignments"
ON assignments FOR ALL USING (
  teacher_id = auth.uid()
);

-- === ASSIGNMENT SUBMISSIONS ===
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submissions visible to relevant users"
ON assignment_submissions FOR SELECT USING (
  assignment_id IN (SELECT id FROM assignments WHERE teacher_id = auth.uid())
  OR student_id IN (SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid())
);

CREATE POLICY "Teacher can manage submissions"
ON assignment_submissions FOR ALL USING (
  assignment_id IN (SELECT id FROM assignments WHERE teacher_id = auth.uid())
);

-- === EXAMS ===
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Exams visible by role"
ON exams FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
    OR (
      is_published = true
      AND (SELECT role FROM users WHERE id = auth.uid()) = 'parent'
    )
  )
);

CREATE POLICY "Principal can manage exams"
ON exams FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === MARKS ===
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marks visible by role"
ON marks FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
    OR (
      exam_id IN (SELECT id FROM exams WHERE is_published = true)
      AND student_id IN (
        SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Teacher can manage marks"
ON marks FOR ALL USING (
  entered_by = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

-- === REPORT CARDS ===
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Report cards visible by role"
ON report_cards FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
    OR (
      is_published = true
      AND student_id IN (
        SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
      )
    )
  )
);

-- === FEE STRUCTURES ===
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fee structures visible to same school"
ON fee_structures FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage fee structures"
ON fee_structures FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === FEES ===
ALTER TABLE fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fees visible to principal and linked parent"
ON fees FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'admin')
    OR student_id IN (
      SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
    )
  )
);

CREATE POLICY "Principal can manage fees"
ON fees FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === FEE PAYMENTS ===
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fee payments visible to principal and parent"
ON fee_payments FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
    OR student_id IN (
      SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
    )
  )
);

-- === MESSAGES ===
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own messages"
ON messages FOR SELECT USING (
  sender_id = auth.uid() OR receiver_id = auth.uid()
);

CREATE POLICY "Users can send messages"
ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
);

CREATE POLICY "Users can update own messages"
ON messages FOR UPDATE USING (
  receiver_id = auth.uid()
);

-- === ANNOUNCEMENTS ===
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Announcements visible to same school"
ON announcements FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal and teacher can create announcements"
ON announcements FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
);

-- === MEETING REQUESTS ===
ALTER TABLE meeting_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meeting requests visible to involved users"
ON meeting_requests FOR SELECT USING (
  parent_id = auth.uid() OR teacher_id = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

CREATE POLICY "Parent can create meeting requests"
ON meeting_requests FOR INSERT WITH CHECK (
  parent_id = auth.uid()
);

-- === LESSON PLANS ===
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lesson plans visible to teacher and principal"
ON lesson_plans FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
);

CREATE POLICY "Teacher can manage own lesson plans"
ON lesson_plans FOR ALL USING (teacher_id = auth.uid());

-- === RESOURCES ===
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resources visible to same school"
ON resources FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
    OR is_published = true
  )
);

CREATE POLICY "Teacher can manage own resources"
ON resources FOR ALL USING (teacher_id = auth.uid());

-- === STUDENT REMARKS ===
ALTER TABLE student_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remarks visible by role"
ON student_remarks FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
    OR (
      is_visible_to_parent = true
      AND student_id IN (
        SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Teacher can manage remarks"
ON student_remarks FOR ALL USING (teacher_id = auth.uid());

-- === LEAVE REQUESTS ===
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leave requests visible to requester and principal"
ON leave_requests FOR SELECT USING (
  requester_id = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

CREATE POLICY "Teacher can create leave requests"
ON leave_requests FOR INSERT WITH CHECK (
  requester_id = auth.uid()
);

CREATE POLICY "Principal can update leave requests"
ON leave_requests FOR UPDATE USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  OR requester_id = auth.uid()
);

-- === DOCUMENT REQUESTS ===
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Document requests visible to requester and principal"
ON document_requests FOR SELECT USING (
  requested_by = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

CREATE POLICY "Parent can create document requests"
ON document_requests FOR INSERT WITH CHECK (
  requested_by = auth.uid()
);

-- === EVENTS ===
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events visible to same school"
ON events FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "Principal can manage events"
ON events FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- === NOTIFICATIONS ===
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
ON notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE USING (user_id = auth.uid());

-- === PAYROLL ===
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll visible to principal and own teacher"
ON payroll FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  OR teacher_id = auth.uid()
);

CREATE POLICY "Principal can manage payroll"
ON payroll FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);
