# NxtStepEdu — Full Codebase Bug Audit & Fix Plan

## Summary

A thorough audit of all portals (Teacher, Principal, Parent) found **13 bugs** across data scoping, role access, edge cases, and UX. Bugs are grouped by severity.

---

## 🔴 Critical Bugs (Data Leaks & Role Access)

### BUG-1: Marks Page — School-Wide Exam Fallback (Data Leak)
**File:** `apps/web/src/app/teacher/marks/page.tsx` (lines 54–60)  
**Issue:** When a teacher has **no subject assignments** (e.g., a new class teacher), the `fetchExams` function falls back to fetching **all exams for the entire school**. A teacher could see and edit marks for exams they have no relation to.  
**Fix:** Remove the school-wide fallback. If no assignments, show "no exams assigned" state.

### BUG-2: Dashboard Attendance Pending — Uses Subject Sections, Not Class Teacher Section
**File:** `apps/web/src/app/teacher/dashboard/page.tsx` (lines 42–47)  
**Issue:** The "Attendance Pending" stat card counts sections from `teacher_section_assignments` (subject-based), but daily attendance is now restricted to class teachers only. A pure subject teacher will always see wrong "N pending" sections on their dashboard.  
**Fix:** The pending count should only look at sections where the user is `class_teacher_id`.

### BUG-3: Parent-Links API — No School Scoping (Cross-School Data Leak)
**File:** `apps/web/src/app/api/teacher/parent-links/route.ts` (line 41–44)  
**Issue:** The admin-level `student_parent_links` query doesn't filter by `school_id`. A teacher at School A could craft a request with student IDs from School B and get their parent data.  
**Fix:** Add `.eq('school_id', userRow.school_id)` or verify all requested student IDs belong to the teacher's school.

---

## 🟠 High Bugs (Wrong Data Shown)

### BUG-4: Teacher Students Page — `handleSectionSelect` Called Before Hook Init
**File:** `apps/web/src/app/teacher/students/page.tsx` (lines 47–49)  
**Issue:** `if (formatted.length === 1) { handleSectionSelect(formatted[0].id); }` is called inside `fetchSections` but `handleSectionSelect` itself calls `supabase` which is re-created each render. More critically, `fetchSections` has `[supabase]` in its deps but `handleSectionSelect` is not memoized, causing potential stale closure issues.  
**Fix:** Use `setSelectedSection` + rely on `useEffect` with `selectedSection` dep to trigger student fetch.

### BUG-5: Leave Page — Leave Balance is Hardcoded and Incorrect
**File:** `apps/web/src/app/teacher/leave/page.tsx` (lines 79–89)  
**Issue:** Leave balances (Casual: 12, Sick: 10, Earned: 15, Emergency: 5) are hardcoded constants — they don't come from the database and cannot be configured per school. Any principal-configured leave policy is ignored.  
**Fix:** Add a note in UI that these are default values, or better, fetch from a `leave_policies` or `school_settings` table if it exists.

### BUG-6: Marks Page — Student List Not Scoped to Teacher's Own Sections
**File:** `apps/web/src/app/teacher/marks/page.tsx` (lines 74–82)  
**Issue:** When loading students for an exam, it fetches all students in the exam's `section_id` or `class_id` without verifying the teacher is actually assigned to that section. The exam filter is correct, but there's no double-check on section ownership.  
**Fix:** This is low risk because exam list is already scoped, but add a comment clarifying the trust chain.

### BUG-7: Teacher Dashboard Sections Count — Counts Duplicate Assignments
**File:** `packages/supabase/queries/academics.ts` (lines 52–57)  
**Issue:** `getTeacherDashboardStats` counts rows from `teacher_section_assignments` — if a teacher teaches 2 subjects in the same section, the section is counted **twice**. The dashboard shows "4 sections" when really it's "2 sections (2 subjects each)".  
**Fix:** Use `DISTINCT section_id` count or deduplicate in JS.

---

## 🟡 Medium Bugs (Edge Cases & UX)

### BUG-8: Attendance Page — `selectedSection` in `useCallback` Deps Causes Infinite Loop
**File:** `apps/web/src/app/teacher/attendance/page.tsx`  
**Issue:** `fetchSections` depends on `selectedSection` to avoid re-setting it, but this means any change to `selectedSection` re-runs `fetchSections`, which can potentially re-run indefinitely.  
**Fix:** Remove `selectedSection` from deps. Instead, track whether section was auto-set using a `ref`.

### BUG-9: Parent API Route — All Routes Allowed Through Without Auth Check
**File:** `apps/web/src/middleware.ts` (line 63–64)  
**Issue:** ALL `/api/` routes skip authentication: `if (pathname.startsWith('/api/')) { return supabaseResponse; }`. This means the `/api/teacher/parent-links` route (and any future API routes) relies **solely on internal checks**. If those checks have a bug, there's no middleware safety net.  
**Fix:** This is by design for API routes (they handle their own auth), but make sure every API route has explicit auth. The existing API routes appear to handle this correctly. ✅ No change needed.

### BUG-10: Leave Apply — to_date Comparison is String Comparison, Not Date
**File:** `apps/web/src/app/teacher/leave/page.tsx` (line 135)  
**Issue:** `form.to_date >= form.from_date` uses string comparison. This works for ISO date strings (`YYYY-MM-DD`) format but could fail for locale-formatted dates if the input format ever changes.  
**Fix:** Already safe for `YYYY-MM-DD` strings (correct lexicographic ordering). Document with a comment.

### BUG-11: Marks Entry — Negative Marks Allowed
**File:** `apps/web/src/app/teacher/marks/page.tsx` (line 249–257)  
**Issue:** The marks input has `min={0}` as HTML attribute, but the browser can be bypassed. The `handleSave` function only checks if marks **exceed** the total, not if they are **negative**.  
**Fix:** Add `parseFloat(entry.marks) < 0` check in `handleSave` validation.

### BUG-12: Parent Fees Page — Payment history not scoped to child
**File:** `apps/web/src/app/parent/fees/page.tsx`  
**Issue:** Needs verification — is the fees query scoped by `student_id` from `selectedChild`? This is correct from context review, but needs double-check on the full query.  
**Fix:** Verify — appears to be correct via `useParent()` context.

### BUG-13: Teacher Layout — No Role Verification on Client Side
**File:** `apps/web/src/app/teacher/layout.tsx`  
**Issue:** The teacher layout loads the user's `full_name` but does **not verify the user's role is actually `teacher`**. The middleware handles this for page navigation, but if middleware has a bug, the layout itself won't catch it.  
**Fix:** Optionally add a role check in the layout's `useEffect` and redirect if role is wrong. Low priority since middleware handles this.

---

## Proposed Fixes (Execution Order)

1. **[MODIFY]** `apps/web/src/app/teacher/marks/page.tsx` — Remove school-wide fallback (BUG-1), add negative marks check (BUG-11)
2. **[MODIFY]** `apps/web/src/app/teacher/dashboard/page.tsx` — Fix attendance pending count to use `class_teacher_id` (BUG-2)
3. **[MODIFY]** `apps/web/src/app/api/teacher/parent-links/route.ts` — Add school scoping to admin query (BUG-3)
4. **[MODIFY]** `apps/web/src/app/teacher/students/page.tsx` — Fix stale closure in section auto-select (BUG-4)
5. **[MODIFY]** `packages/supabase/queries/academics.ts` — Deduplicate sections count (BUG-7)
6. **[MODIFY]** `apps/web/src/app/teacher/attendance/page.tsx` — Fix infinite loop risk with `selectedSection` dep (BUG-8)

## Verification Plan

- Navigate to teacher portal as subject-only teacher → should see 0 pending attendance sections
- Navigate to Marks page as teacher with no subjects → should see empty state, not all school exams
- Check API response with tampered studentIds from another school → should return empty/error
