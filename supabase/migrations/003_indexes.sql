-- ============================================================
-- School ERP — Database Indexes for Performance
-- Migration 003: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_section_date ON attendance(section_id, date);
CREATE INDEX IF NOT EXISTS idx_fees_student_status ON fees(student_id, status);
CREATE INDEX IF NOT EXISTS idx_marks_exam ON marks(exam_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_students_school_section ON students(school_id, section_id);
CREATE INDEX IF NOT EXISTS idx_users_school_role ON users(school_id, role);
CREATE INDEX IF NOT EXISTS idx_students_school_class ON students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_section ON timetable(section_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable(teacher_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_assignments_section ON assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_requester ON leave_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_schools_active ON schools(is_active);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
