import CoursesList from "@/features/courses/CoursesList";

/**
 * The Courses list. `courses/layout.tsx` gates this whole tree with
 * `requireCourseAuthorPage()` (admin, `draftCourse` or `approveCourse`), so
 * this is a thin server wrapper around the client list: the reads are
 * client-side Firestore (one-shot), same as the other admin lists, and
 * Firestore rules are the boundary on each one.
 */
export default function CoursesAdminPage() {
  return <CoursesList />;
}
