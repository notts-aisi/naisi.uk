"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/auth/AuthProvider";
import ProgrammeMark from "@/components/ProgrammeMark";
import { CREST_KEYS, crestName, type CrestKey } from "@/components/ProgrammeCrest";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import CountedTextarea from "@/components/ui/CountedTextarea";
import { Field, Input } from "@/components/ui/Input";
import PageHead from "@/components/ui/PageHead";
import TimeField from "@/components/ui/TimeField";
import Modal from "@/components/ui/Modal";
import ResponsiveSelect, {
  type ResponsiveSelectOption,
} from "@/components/ui/ResponsiveSelect";
import { AdminLoadingBar, AdminPage } from "@/features/admin/adminList";
import BlockEditor from "@/components/blocks/BlockEditor";
import { crestForCourse } from "@/lib/crests/resolve";
import {
  COURSE_SECTIONS,
  EDIT_PUBLIC_PAGE,
  OPEN_THE_PROGRAMME,
  OPEN_THE_RUN,
  PUBLIC_PAGE_NOTE,
  PUBLIC_PAGE_TITLE,
  RUNS_TITLE,
  WHERE_A_RUN_IS_MADE,
  archivedRunsWords,
  hoursAWeekWords,
  runNameWords,
  type RunProgrammes,
} from "@/lib/courses/coursePage/words";
import { runRowView } from "@/lib/courses/coursePage/runRows";
import { facilitatorGuideAdminPath } from "@/lib/courses/facilitatorGuide/model";
import type { Block } from "@/lib/firestore/newsletterBlocks";
import {
  COURSE_FIELD_LIMITS,
  COURSE_RUN_STATUS_LABEL,
  COURSE_STATUS_LABEL,
  COURSE_TRACK_LABELS,
  type CourseDoc,
  type CourseRunDoc,
  type CourseTrack,
} from "@/lib/firestore/courses";
import {
  TRACK_OPTIONS,
  courseStatusTone,
  levelOptions,
} from "./AdminCourseList";
import { publishCourse, saveCourseCrest, updateCourse } from "./courseMutations";
import CourseDangerZone from "./CourseDangerZone";
import CourseRubricCard from "./CourseRubricCard";
import CourseSectionStrip from "./CourseSectionStrip";
import { useCourseRuns, useCourses } from "./useAdminCourses";
import CourseRoutesCard from "./CourseRoutesCard";
import CoursePredictionsCard from "./CoursePredictionsCard";
import styles from "./adminCourses.module.css";
import page from "./coursePages.module.css";

/**
 * A COURSE'S OWN PAGE (`/admin/courses/[courseId]`), in the newer pages: the
 * head, a strip of the page's sections down the side, then Course details,
 * Public page, Runs, and the course's other cards (Crest, Rubric, Routes and
 * deadlines, Sealed predictions, Facilitator guide, Publishing, Archive and
 * the danger zone).
 *
 * EVERY CARD READS AND WRITES AS IT DID on the older course page. The course
 * and its runs are read client-direct (`useCourses`, `useCourseRuns`); the
 * details, the credit, the introduction and Archive are written client-direct
 * (`updateCourse`), under `firestore.rules`; the crest, the rubric, the
 * routes, the predictions card, the publish and the destroy go through their
 * own routes, which ask who may. Only where each card sits and how it looks
 * changed.
 *
 * RUNS are not made here: a run is made, changed and closed on its
 * programme's Settings, under Course run. Each run says its stage and the
 * programme that names it (`programmes`, read by the page on the server),
 * with "Open the programme" to that programme's Overview for a reader it
 * opens for. For anybody else, for a run no programme names (a run people
 * join without applying is one), and when that read failed, "Open the run"
 * leads to the run's older page, so nobody on this page loses the way in
 * before the older pages forward (`runRowView`). Archived runs fold under
 * the live ones with the same row, so an archived run can still be reached
 * and brought back.
 */
type MetaDraft = {
  title: string;
  tagline: string;
  track: CourseTrack;
  level: string;
  weeklyHours: string;
  /** "" for by the end of the day before; "HH:MM" for a time on it. */
  dayBeforeDueTime: string;
  /** The line every certificate of this course carries after its weeks. */
  credit: string;
  summaryBlocks: Block[];
};

function metaFromCourse(course: CourseDoc | null): MetaDraft {
  return {
    title: course?.title ?? "",
    tagline: course?.tagline ?? "",
    track: course?.track ?? "general",
    level: course?.level ?? "",
    weeklyHours:
      course?.estimatedWeeklyHours != null ? String(course.estimatedWeeklyHours) : "",
    dayBeforeDueTime: course?.dayBeforeDueTime ?? "",
    credit: course?.credit ?? "",
    summaryBlocks: course?.summaryBlocks ?? [],
  };
}

function sameMeta(a: MetaDraft, b: MetaDraft): boolean {
  return (
    a.title === b.title &&
    a.tagline === b.tagline &&
    a.track === b.track &&
    a.level === b.level &&
    a.weeklyHours === b.weeklyHours &&
    a.dayBeforeDueTime === b.dayBeforeDueTime &&
    a.credit === b.credit &&
    JSON.stringify(a.summaryBlocks) === JSON.stringify(b.summaryBlocks)
  );
}

/** The course's two ways of reading "the day before" (`CourseDoc.dayBeforeDueTime`). */
const DAY_BEFORE_OPTIONS: ResponsiveSelectOption<"end" | "time">[] = [
  { value: "end", label: "By the end of the day before" },
  { value: "time", label: "By a time on the day before" },
];

export default function CourseEditor({
  courseId,
  programmes,
}: {
  courseId: string;
  /** The programme naming each run, read on the server; null when that read failed. */
  programmes: RunProgrammes | null;
}) {
  const { toast, run: runAction, dismiss } = useActionToast();
  const saving = toast?.phase === "saving";

  // The course list is a single one-shot read of a tens-of-docs collection, so
  // picking this course out of it costs nothing extra and keeps the hook
  // surface to the four in useAdminCourses.
  const { items: courses, loading, error, reload } = useCourses();
  const runs = useCourseRuns(courseId);

  const course = useMemo(
    () => courses.find((c: CourseDoc) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  // --- Meta form: local edits layered over the fetched doc ---
  const [draft, setDraft] = useState<Partial<MetaDraft>>({});
  /**
   * What we last wrote, used as the dirty-check baseline. The list is one-shot
   * rather than an onSnapshot, so a save can't wait for the doc to come back —
   * pinning the baseline to the payload we sent stops the form flickering back
   * to pre-save values and stops it reading dirty straight after a save.
   */
  const [saved, setSaved] = useState<MetaDraft | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const base = useMemo(() => saved ?? metaFromCourse(course), [saved, course]);
  const meta = useMemo<MetaDraft>(() => ({ ...base, ...draft }), [base, draft]);
  const dirty = !sameMeta(meta, base);
  const patch = (p: Partial<MetaDraft>) => setDraft((d) => ({ ...d, ...p }));

  // --- The crest: an admin's to set, through its own route ---
  // Shown to everybody who can open this page, and changed only by an admin:
  // the rules keep the field as it was on every other write. The value shown
  // is the last one picked until a reload brings the stored one back, and the
  // stored one again if the save is refused.
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [crestPicked, setCrestPicked] = useState<CrestKey | null | undefined>(undefined);

  async function handleCrest(next: CrestKey | null) {
    if (!isAdmin) return;
    setCrestPicked(next);
    await runAction(
      async () => {
        try {
          await saveCourseCrest(courseId, next);
        } catch (err) {
          setCrestPicked(undefined);
          throw err;
        }
        reload();
      },
      { savingMessage: "Saving the crest…", successMessage: "Crest saved" },
    );
  }

  // --- Publish control ---
  const [showcaseChoice, setShowcaseChoice] = useState<string | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const showcase = showcaseChoice ?? course?.showcaseRunId ?? "";

  const showcaseOptions = useMemo<ResponsiveSelectOption[]>(() => {
    // Draft runs are excluded on purpose: the showcase run is what the PUBLIC
    // course page renders its curriculum from, and a draft is by definition
    // not ready to be the shop window.
    const opts: ResponsiveSelectOption[] = [
      { value: "", label: "— no curriculum preview —" },
      ...runs.items
        .filter((r: CourseRunDoc) => r.status !== "draft")
        .map((r: CourseRunDoc) => ({
          value: r.id,
          label: `${r.label || r.id} · ${COURSE_RUN_STATUS_LABEL[r.status]}`,
        })),
    ];
    // A run that has since gone back to draft would otherwise vanish from the
    // control while still being the stored value.
    if (showcase && !opts.some((o) => o.value === showcase)) {
      opts.push({ value: showcase, label: `${showcase} (not published)` });
    }
    return opts;
  }, [runs.items, showcase]);

  /**
   * Archived runs are FOLDED under the live ones, never dropped: the second
   * half of what a run's archive promises when it says archiving takes a run
   * "out of the admin list's default view". A soft-archived thing has to be
   * reachable or it can never be brought back, so the fold lists every one
   * `useCourseRuns` returns, with the archived rows sorted to the end.
   */
  const liveRuns = useMemo(
    () => runs.items.filter((r: CourseRunDoc) => !r.archived),
    [runs.items],
  );
  const archivedRuns = useMemo(
    () => runs.items.filter((r: CourseRunDoc) => r.archived),
    [runs.items],
  );

  // Loading the facilitator guide is an admin's job for now; its page and
  // route refuse everyone else, so nobody else is offered its section.
  const sections = useMemo(
    () => COURSE_SECTIONS.filter((section) => section.id !== "guide" || isAdmin),
    [isAdmin],
  );

  async function handleSave() {
    if (!course) return;
    const title = meta.title.trim();
    if (!title) {
      setMetaError("A course needs a title.");
      return;
    }
    let hours: number | null = null;
    if (meta.weeklyHours.trim()) {
      const parsed = Number(meta.weeklyHours);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setMetaError("Weekly hours must be a positive number (or left blank).");
        return;
      }
      hours = Math.round(parsed);
    }
    const tagline = meta.tagline.trim();
    const dayBeforeDueTime = meta.dayBeforeDueTime === "" ? null : meta.dayBeforeDueTime;
    if (dayBeforeDueTime !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dayBeforeDueTime)) {
      setMetaError("Give the time written work is due as hours and minutes, like 12:00.");
      return;
    }
    const credit = meta.credit.trim();
    setMetaError(null);
    await runAction(
      async () => {
        await updateCourse(courseId, {
          title,
          tagline,
          track: meta.track,
          level: meta.level,
          estimatedWeeklyHours: hours,
          dayBeforeDueTime,
          credit,
          summaryBlocks: meta.summaryBlocks,
        });
        setSaved({
          title,
          tagline,
          track: meta.track,
          level: meta.level,
          weeklyHours: hours == null ? "" : String(hours),
          dayBeforeDueTime: dayBeforeDueTime ?? "",
          credit,
          summaryBlocks: meta.summaryBlocks,
        });
        setDraft({});
        reload();
      },
      { savingMessage: "Saving course…", successMessage: "Course saved" },
    );
  }

  /**
   * The confirmed half of the publish action. The dialog is the guard — this
   * runs only from its confirm button, and closes it first so the toast (which
   * dims the page behind it) isn't stacked on a live dialog.
   */
  async function handlePublish() {
    if (!course) return;
    setConfirmingPublish(false);
    const target = showcase || null;
    const published = course.status === "published";
    await runAction(
      async () => {
        await publishCourse(courseId, target);
        setShowcaseChoice(null);
        reload();
      },
      {
        savingMessage: published ? "Updating…" : "Publishing…",
        successMessage: published ? "Showcase updated" : "Course published",
      },
    );
  }

  // The way back to the list, as the head's crumb.
  const crumb = (
    <Link href="/admin/courses" className={page.crumb}>
      Courses
    </Link>
  );

  if (loading) {
    return (
      <AdminPage>
        <PageHead crumb={crumb} title="Courses" />
        <Card padding="md">
          <AdminLoadingBar label="Loading course…" />
        </Card>
      </AdminPage>
    );
  }

  if (error) {
    return (
      <AdminPage>
        <PageHead crumb={crumb} title="Courses" />
        <Card padding="md">
          <p className={styles.error}>Couldn&apos;t load this course: {error.message}</p>
        </Card>
      </AdminPage>
    );
  }

  if (!course) {
    return (
      <AdminPage>
        <PageHead crumb={crumb} title="Course not found" />
        <Card padding="lg">
          <p className={styles.emptyBody}>
            No course with the id <code>{courseId}</code>. It may have been deleted, or
            the link may be stale.
          </p>
        </Card>
      </AdminPage>
    );
  }

  const crestChoice = crestPicked === undefined ? course.crest : crestPicked;
  const crestOptions: ResponsiveSelectOption[] = [
    { value: "", label: "No crest" },
    ...CREST_KEYS.map((key) => ({ value: key, label: crestName(key) })),
  ];

  const published = course.status === "published";
  const publishQuestion = published
    ? `Update the public curriculum preview for “${course.title}”?`
    : `Publish “${course.title}” to the public catalogue? The course page becomes visible to everyone, signed in or not.`;

  const headLine = [
    COURSE_TRACK_LABELS[course.track],
    course.level || "no level set",
    ...(course.estimatedWeeklyHours != null ? [hoursAWeekWords(course.estimatedWeeklyHours)] : []),
  ].join(" · ");

  /** One run's row: its name, its stage and programme, and the way on (`runRowView`). */
  const runRow = (run: CourseRunDoc) => {
    const view = runRowView(run, programmes);
    return (
      <li key={run.id} className={page.runRow}>
        <div className={page.runText}>
          <p className={page.runName}>{runNameWords(run)}</p>
          <p className={page.runLine}>{view.line}</p>
        </div>
        {view.opens.kind === "programme" ? (
          <Link href={view.opens.href} className={page.action}>
            {OPEN_THE_PROGRAMME}
          </Link>
        ) : (
          <Link
            href={`/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(run.id)}`}
            className={page.action}
          >
            {OPEN_THE_RUN}
          </Link>
        )}
      </li>
    );
  };

  return (
    <AdminPage wide>
      <PageHead
        crumb={crumb}
        title={course.title || "(untitled course)"}
        badges={
          <>
            <Badge tone={courseStatusTone(course.status)}>
              {COURSE_STATUS_LABEL[course.status]}
            </Badge>
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </>
        }
        description={headLine}
      />

      <div className={page.columns}>
        <CourseSectionStrip sections={sections} />

        <div className={page.cards}>
          {/* === Course details === */}
          <section id="details" className={page.anchor} aria-labelledby="course-details-title">
            <Card padding="lg">
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 id="course-details-title" className={styles.sectionTitle}>
                    Course details
                  </h2>
                  <p className={styles.sectionHint}>Shown on the public catalogue card.</p>
                </div>

                <div className={styles.form}>
                  <div className={styles.formGrid}>
                    <Field id="course-title" label="Title">
                      <Input
                        id="course-title"
                        value={meta.title}
                        onChange={(e) => patch({ title: e.target.value })}
                        maxLength={COURSE_FIELD_LIMITS.title}
                        disabled={saving}
                      />
                    </Field>

                    <Field
                      id="course-tagline"
                      label="Tagline"
                      hint="One line, shown under the title on the catalogue card."
                    >
                      <CountedTextarea
                        id="course-tagline"
                        value={meta.tagline}
                        onChange={(e) => patch({ tagline: e.target.value })}
                        max={COURSE_FIELD_LIMITS.tagline}
                        rows={2}
                        disabled={saving}
                      />
                    </Field>

                    <Field id="course-track" label="Track">
                      <ResponsiveSelect<CourseTrack>
                        value={meta.track}
                        onChange={(track) => patch({ track })}
                        options={TRACK_OPTIONS}
                        ariaLabel="Track"
                        disabled={saving}
                      />
                    </Field>

                    <Field id="course-level" label="Level">
                      <ResponsiveSelect
                        value={meta.level}
                        onChange={(level) => patch({ level })}
                        options={levelOptions(meta.level)}
                        ariaLabel="Level"
                        disabled={saving}
                      />
                    </Field>

                    <div className={page.hours}>
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
                          value={meta.weeklyHours}
                          onChange={(e) => patch({ weeklyHours: e.target.value })}
                          disabled={saving}
                        />
                      </Field>
                    </div>

                    <div className={styles.formSpan}>
                      <div className={styles.formGrid}>
                        <Field
                          id="course-day-before"
                          label="Written work due the day before a session"
                          hint="For a week whose written work is due the day before its session. Each group’s own dates come from its calendar."
                        >
                          <ResponsiveSelect<"end" | "time">
                            value={meta.dayBeforeDueTime === "" ? "end" : "time"}
                            onChange={(choice) =>
                              patch({ dayBeforeDueTime: choice === "end" ? "" : meta.dayBeforeDueTime || "12:00" })
                            }
                            options={DAY_BEFORE_OPTIONS}
                            ariaLabel="Written work due the day before a session"
                            disabled={saving}
                          />
                        </Field>
                        {meta.dayBeforeDueTime !== "" && (
                          <Field id="course-day-before-time" label="Due by, on the day before">
                            <TimeField
                              value={meta.dayBeforeDueTime}
                              onChange={(dayBeforeDueTime) => patch({ dayBeforeDueTime })}
                              disabled={saving}
                            />
                          </Field>
                        )}
                      </div>
                    </div>

                    <div className={styles.formSpan}>
                      <Field
                        id="course-credit"
                        label="Credit on certificates"
                        hint="Follows the weeks on each certificate of this course, after a dot, as in “6 weeks · based on the BlueDot Impact curriculum”, so start it as it reads there. Leave it empty for none. A change reaches certificates sent after it."
                      >
                        <Input
                          id="course-credit"
                          value={meta.credit}
                          onChange={(e) => patch({ credit: e.target.value })}
                          maxLength={COURSE_FIELD_LIMITS.credit}
                          disabled={saving}
                        />
                      </Field>
                    </div>
                  </div>

                  <div>
                    <h3 className={styles.subheading}>Introduction</h3>
                    <p className={styles.subheadingHint}>
                      A short intro, used on the public page when its own pitch has
                      not been written yet.
                    </p>
                    {/*
                      Same wiring as the email-designs editor: BlockEditor owns a
                      Block[] field and hands the whole array back on change.
                      `storagePrefix` needs a matching storage.rules block for
                      `course-images/{courseId}/**` — image uploads fail closed
                      without one (see the application-emails comment in
                      storage.rules for the last time that bit).
                    */}
                    <BlockEditor
                      draftId={courseId}
                      storagePrefix="course-images"
                      blocks={meta.summaryBlocks}
                      onChange={(summaryBlocks) => patch({ summaryBlocks })}
                      disabled={saving}
                    />
                  </div>

                  {metaError && <p className={styles.error}>{metaError}</p>}

                  <div className={styles.formActions}>
                    <Button onClick={handleSave} disabled={saving || !dirty}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDraft({});
                        setMetaError(null);
                      }}
                      disabled={saving || !dirty}
                    >
                      Revert
                    </Button>
                    {!dirty && <span className={styles.status}>No unsaved changes.</span>}
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* === Public page: today's editor, at its own address === */}
          <section id="public-page" className={page.anchor} aria-labelledby="course-public-title">
            <Card padding="lg">
              <div className={page.cardHead}>
                <h2 id="course-public-title" className={styles.sectionTitle}>
                  {PUBLIC_PAGE_TITLE}
                </h2>
                <Link href={`/admin/courses/${encodeURIComponent(courseId)}/page`} className={page.action}>
                  {EDIT_PUBLIC_PAGE}
                </Link>
              </div>
              <p className={page.note}>{PUBLIC_PAGE_NOTE}</p>
            </Card>
          </section>

          {/* === Runs: each with its stage and the programme that names it === */}
          <section id="runs" className={page.anchor} aria-labelledby="course-runs-title">
            <Card padding="lg">
              <h2 id="course-runs-title" className={styles.sectionTitle}>
                {RUNS_TITLE}
              </h2>

              {runs.loading && <AdminLoadingBar label="Loading runs…" />}

              {runs.error && (
                <p className={styles.error}>
                  Couldn&apos;t load runs: {runs.error.message}
                </p>
              )}

              {!runs.loading && !runs.error && runs.items.length === 0 && (
                <p className={styles.emptyBody}>
                  No runs yet. A course needs at least one before anyone can apply.
                </p>
              )}

              {liveRuns.length > 0 && <ul className={page.runs}>{liveRuns.map(runRow)}</ul>}

              {archivedRuns.length > 0 && (
                <details className={page.fold}>
                  <summary className={page.foldSummary}>{archivedRunsWords(archivedRuns.length)}</summary>
                  <ul className={page.runs}>{archivedRuns.map(runRow)}</ul>
                </details>
              )}

              <p className={page.note}>{WHERE_A_RUN_IS_MADE}</p>
            </Card>
          </section>

          {/* === Crest === */}
          <section id="crest" className={page.anchor} aria-labelledby="course-crest-title">
            <Card padding="lg">
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 id="course-crest-title" className={styles.sectionTitle}>
                    Crest
                  </h2>
                  <p className={styles.sectionHint}>
                    Beside the course’s name on /courses and at the top of its page.
                  </p>
                </div>
                <div className={styles.crestRow}>
                  <ProgrammeMark shown={crestForCourse({ crest: crestChoice })} size={64} />
                  <div className={styles.crestField}>
                    <Field
                      id="course-crest"
                      label="Crest"
                      hint={
                        isAdmin
                          ? "A programme on the application form can carry its own, which shows in its place. With neither, the NAISI emblem shows."
                          : "Only an admin can change the crest."
                      }
                    >
                      <ResponsiveSelect
                        id="course-crest"
                        value={crestChoice ?? ""}
                        onChange={(value) => void handleCrest(CREST_KEYS.find((key) => key === value) ?? null)}
                        options={crestOptions}
                        ariaLabel="Crest"
                        disabled={saving || !isAdmin}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* === The rubric for written answers === */}
          <section id="rubric" className={page.anchor}>
            <CourseRubricCard key={`rubric-${course.id}`} courseId={course.id} stored={course.rubric} isAdmin={isAdmin} />
          </section>

          {/* === Routes and deadlines (the routes a week that lists them shows) === */}
          <section id="routes" className={page.anchor}>
            <CourseRoutesCard key={`routes-${course.id}`} courseId={course.id} stored={course.routes} />
          </section>

          {/* === Sealed predictions (the card a week asks, sealed and opened later) === */}
          <section id="predictions" className={page.anchor}>
            <CoursePredictionsCard key={`predictions-${course.id}`} courseId={course.id} stored={course.predictionCard} />
          </section>

          {/* === Facilitator guide === */}
          {isAdmin && (
            <section id="guide" className={page.anchor} aria-labelledby="course-guide-title">
              <Card padding="lg">
                <div className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 id="course-guide-title" className={styles.sectionTitle}>Facilitator guide</h2>
                    <p className={styles.sectionHint}>
                      Each week’s session plan and notes, and the course’s own documents, for its facilitators, its
                      programme’s lead and admins only.{" "}
                      <Link href={facilitatorGuideAdminPath(courseId)}>Load the facilitator guide</Link>
                    </p>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* === Publish === */}
          <section id="publishing" className={page.anchor} aria-labelledby="course-publishing-title">
            <Card padding="lg">
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 id="course-publishing-title" className={styles.sectionTitle}>Publishing</h2>
                  <p className={styles.sectionHint}>
                    {course.status === "published"
                      ? "Live on the public catalogue."
                      : "Not visible to the public yet."}
                  </p>
                </div>

                <div className={styles.form}>
                  <div className={styles.formGrid}>
                    <Field
                      id="course-showcase"
                      label="Showcase run"
                      hint="Whose curriculum the public course page displays."
                    >
                      <ResponsiveSelect
                        value={showcase}
                        onChange={setShowcaseChoice}
                        options={showcaseOptions}
                        ariaLabel="Showcase run"
                        disabled={saving}
                      />
                    </Field>
                  </div>

                  {showcaseOptions.length === 1 && (
                    <p className={styles.status}>
                      No run is out of draft yet, so there is nothing to preview publicly.
                      A run leaves draft on its programme’s Settings, under Course run, or on its own page when no programme names it.
                    </p>
                  )}

                  <div className={styles.formActions}>
                    <Button onClick={() => setConfirmingPublish(true)} disabled={saving}>
                      {published ? "Update showcase run" : "Publish course"}
                    </Button>
                    {dirty && (
                      <span className={styles.status}>
                        Save your edits first — publishing doesn&apos;t include them.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* === Archive + destroy ===
              Last on the page by design: end-of-life controls sit after
              everything you might edit instead, and the destroy half is behind
              its own disclosure inside. `onArchived` re-reads the course; a
              DESTROY is deliberately not wired to `reload` — the course is gone,
              and refetching would replace the receipt with "Course not found". */}
          <section id="careful" className={page.anchor}>
            <div className={page.stack}>
              <CourseDangerZone course={course} runAction={runAction} onArchived={reload} />
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={confirmingPublish}
        onClose={() => setConfirmingPublish(false)}
        ariaLabel={published ? "Update the curriculum preview" : "Publish this course"}
        width="sm"
      >
        <div className={styles.confirm}>
          <h2 className={styles.confirmTitle}>
            {published ? "Update the preview?" : "Publish this course?"}
          </h2>
          <p className={styles.confirmBody}>{publishQuestion}</p>
          <div className={styles.confirmActions}>
            <Button
              variant="ghost"
              onClick={() => setConfirmingPublish(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handlePublish} disabled={saving}>
              {published ? "Update showcase run" : "Publish course"}
            </Button>
          </div>
        </div>
      </Modal>

      <ActionToast toast={toast} onDismiss={dismiss} />
    </AdminPage>
  );
}
