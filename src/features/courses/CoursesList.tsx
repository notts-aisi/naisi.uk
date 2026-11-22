"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "@/auth/AuthProvider";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import CountedTextarea from "@/components/ui/CountedTextarea";
import { Field, Input } from "@/components/ui/Input";
import PageHead from "@/components/ui/PageHead";
import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import {
  AdminLoadingBar,
  AdminPage,
  useOneShotList,
} from "@/features/admin/adminList";
import { getClientDb } from "@/lib/firebase/client";
import { canDraftCourse } from "@/lib/firestore/users";
import {
  COURSES_INTRO,
  COURSE_COLUMNS,
  LIST_RUNS_JOIN,
  archivedCoursesWords,
  listRunWords,
  upToHoursWords,
} from "@/lib/courses/coursePage/words";
import {
  COURSE_FIELD_LIMITS,
  COURSE_STATUS_LABEL,
  COURSE_TRACK_LABELS,
  normalizeCourseRun,
  type CourseDoc,
  type CourseRunDoc,
  type CourseTrack,
} from "@/lib/firestore/courses";
import { TRACK_OPTIONS, courseStatusTone, levelOptions } from "./AdminCourseList";
import { createCourse } from "./courseMutations";
import { useCourses } from "./useAdminCourses";
import styles from "./adminCourses.module.css";
import page from "./coursePages.module.css";

/**
 * THE COURSES LIST (`/admin/courses`), in the newer pages: what a course is,
 * New course, a table of the courses (track, status, level, weekly hours,
 * and each live run with its stage, in the words Course run uses), and the
 * archived courses folded at the foot. A course's row opens its page; no run
 * is opened from here, since each run belongs to the programme that names it.
 *
 * Reads as it always has: every course (`useCourses`) and every run, in ONE
 * unfiltered query for the whole page, client-direct. New course writes
 * client-direct (`createCourse`), under the rule that admits an admin or a
 * `draftCourse` holder, and is offered to exactly them.
 */
export default function CoursesList() {
  const router = useRouter();
  const { toast, run: runAction, dismiss } = useActionToast();
  const { role, permissions } = useAuth();
  // The rule a new course is written under: an admin, or a holder of draftCourse.
  const mayMakeCourse = role !== null && canDraftCourse({ role, permissions });

  const { items: courses, loading, error } = useCourses();

  /**
   * Every run, in ONE query for the whole page — not one per row. A course row
   * names its live runs, and `courseRuns` is a top-level collection of tens of
   * docs at NAISI scale, so a single unfiltered read is cheaper than N scoped
   * ones. (If runs ever grow past a few hundred this becomes a paginated admin
   * read — see the read-cost hardening backlog.)
   */
  const runsQuery = useOneShotList<CourseRunDoc>(async () => {
    const db = getClientDb();
    const snap = await getDocs(collection(db, "courseRuns"));
    return snap.docs.map((d) => normalizeCourseRun(d.id, d.data()));
  }, "admin-courses-runs");

  /** Each course's live runs, earliest start first, as a row names them. */
  // The courses with an archived run, so a row whose every run is archived says so.
  const withArchivedRuns = useMemo(
    () => new Set(runsQuery.items.filter((run) => run.archived).map((run) => run.courseId)),
    [runsQuery.items],
  );

  const runsByCourse = useMemo(() => {
    const map = new Map<string, CourseRunDoc[]>();
    for (const run of runsQuery.items) {
      if (run.archived) continue;
      const list = map.get(run.courseId);
      if (list) list.push(run);
      else map.set(run.courseId, [run]);
    }
    // startDate is a civil "YYYY-MM-DD" key, so string compare IS date order.
    for (const list of map.values()) list.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return map;
  }, [runsQuery.items]);

  // Archived is a course's status; every other course is in the table.
  const liveCourses = useMemo(() => courses.filter((c: CourseDoc) => c.status !== "archived"), [courses]);
  const archivedCourses = useMemo(() => courses.filter((c: CourseDoc) => c.status === "archived"), [courses]);

  // --- New course form ---
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [track, setTrack] = useState<CourseTrack>("general");
  const [level, setLevel] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setTitle("");
    setTagline("");
    setTrack("general");
    setLevel("");
    setWeeklyHours("");
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("A course needs a title.");
      return;
    }
    let hours: number | null = null;
    if (weeklyHours.trim()) {
      const parsed = Number(weeklyHours);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError("Weekly hours must be a positive number (or left blank).");
        return;
      }
      hours = Math.round(parsed);
    }
    setFormError(null);
    setBusy(true);
    let newId = "";
    await runAction(
      async () => {
        newId = await createCourse({
          title: trimmedTitle,
          tagline: tagline.trim(),
          track,
          level,
          estimatedWeeklyHours: hours,
        });
      },
      { savingMessage: "Creating course…", successMessage: "Course created" },
    );
    setBusy(false);
    if (newId) {
      resetForm();
      setCreating(false);
      // Straight onto its page: a course with no summary isn't useful yet,
      // and its page is where that gets written.
      router.push(`/admin/courses/${encodeURIComponent(newId)}`);
    }
  }

  /** The runs a row names, or what stands in their place. */
  function runsCell(course: CourseDoc): string {
    const runs = runsByCourse.get(course.id) ?? [];
    if (runs.length > 0) return runs.map(listRunWords).join(LIST_RUNS_JOIN);
    if (runsQuery.loading) return "Loading runs…";
    if (runsQuery.error) return "";
    if (withArchivedRuns.has(course.id)) return "Every run of this course is archived.";
    return "No runs yet";
  }

  function courseTable(rows: CourseDoc[], caption: string) {
    return (
      <div className={page.tableCard}>
        <div className={page.tableScroll}>
          <table className={page.table}>
            <caption className={page.srOnly}>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">{COURSE_COLUMNS.title}</th>
                <th scope="col">{COURSE_COLUMNS.track}</th>
                <th scope="col">{COURSE_COLUMNS.status}</th>
                <th scope="col">{COURSE_COLUMNS.level}</th>
                <th scope="col">{COURSE_COLUMNS.hours}</th>
                <th scope="col">{COURSE_COLUMNS.runs}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((course) => (
                <tr key={course.id}>
                  <th scope="row" data-label={COURSE_COLUMNS.title}>
                    <Link href={`/admin/courses/${encodeURIComponent(course.id)}`} className={page.nameLink}>
                      {course.title || "(untitled)"}
                    </Link>
                  </th>
                  <td data-label={COURSE_COLUMNS.track}>{COURSE_TRACK_LABELS[course.track]}</td>
                  <td data-label={COURSE_COLUMNS.status}>
                    <Badge tone={courseStatusTone(course.status)}>{COURSE_STATUS_LABEL[course.status]}</Badge>
                  </td>
                  <td data-label={COURSE_COLUMNS.level}>{course.level || "No level set"}</td>
                  <td data-label={COURSE_COLUMNS.hours}>
                    {course.estimatedWeeklyHours != null ? upToHoursWords(course.estimatedWeeklyHours) : ""}
                  </td>
                  <td data-label={COURSE_COLUMNS.runs}>{runsCell(course)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <AdminPage wide>
      <PageHead
        title="Courses"
        description={COURSES_INTRO}
        actions={
          mayMakeCourse ? (
            <Button
              variant={creating ? "ghost" : "primary"}
              onClick={() => {
                setFormError(null);
                setCreating((c) => !c);
              }}
            >
              {creating ? "Cancel" : "New course"}
            </Button>
          ) : undefined
        }
      />

      {creating && mayMakeCourse && (
        <Card padding="lg">
          <h2 className={styles.emptyTitle}>New course</h2>
          <p className={styles.emptyBody}>
            Courses start as drafts. Add the curriculum on its page, then
            publish when it&apos;s ready for the public catalogue.
          </p>
          <form
            onSubmit={handleCreate}
            className={styles.form}
            style={{ marginTop: "var(--space-4)" }}
          >
            <div className={styles.formGrid}>
              <div className={styles.formSpan}>
                <Field id="course-title" label="Title">
                  <Input
                    id="course-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={COURSE_FIELD_LIMITS.title}
                    placeholder="e.g. AI Safety Fundamentals — Technical"
                    required
                  />
                </Field>
              </div>

              <div className={styles.formSpan}>
                <Field
                  id="course-tagline"
                  label="Tagline"
                  hint="One line, shown on the catalogue card."
                >
                  <CountedTextarea
                    id="course-tagline"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    max={COURSE_FIELD_LIMITS.tagline}
                    rows={2}
                    placeholder="Eight weeks on the technical side of alignment, in small facilitated groups."
                  />
                </Field>
              </div>

              <Field id="course-track" label="Track">
                <ResponsiveSelect<CourseTrack>
                  value={track}
                  onChange={setTrack}
                  options={TRACK_OPTIONS}
                  ariaLabel="Track"
                />
              </Field>

              <Field id="course-level" label="Level">
                <ResponsiveSelect
                  value={level}
                  onChange={setLevel}
                  options={levelOptions(level)}
                  ariaLabel="Level"
                />
              </Field>

              <Field
                id="course-hours"
                label="Weekly hours"
                hint="Rough commitment. Leave blank if it varies."
              >
                <Input
                  id="course-hours"
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(e.target.value)}
                  placeholder="5"
                />
              </Field>
            </div>

            {formError && <p className={styles.error}>{formError}</p>}

            <div className={styles.formActions}>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create course"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setCreating(false);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && (
        <Card padding="md">
          <p className={styles.error}>Couldn&apos;t load courses: {error.message}</p>
        </Card>
      )}

      {runsQuery.error && !error && (
        <Card padding="sm">
          <p className={styles.status}>
            Runs couldn&apos;t be loaded, so the run column is blank:{" "}
            {runsQuery.error.message}
          </p>
        </Card>
      )}

      {loading && (
        <Card padding="md">
          <AdminLoadingBar label="Loading courses…" />
        </Card>
      )}

      {!loading && !error && courses.length === 0 && !creating && (
        <Card padding="lg">
          <h2 className={styles.emptyTitle}>No courses yet</h2>
          <p className={styles.emptyBody}>
            A course is the evergreen curriculum shell — fellowships, reading groups,
            the incubator. Each one gets runs (&ldquo;Autumn 2026&rdquo;) that carry the
            dates, applications and groups.
          </p>
        </Card>
      )}

      {!loading && !error && liveCourses.length > 0 && courseTable(liveCourses, "Courses")}

      {!loading && !error && (
        <details className={page.fold}>
          <summary className={page.foldSummary}>{archivedCoursesWords(archivedCourses.length)}</summary>
          {archivedCourses.length > 0 && courseTable(archivedCourses, archivedCoursesWords(archivedCourses.length))}
        </details>
      )}

      <ActionToast toast={toast} onDismiss={dismiss} />
    </AdminPage>
  );
}
