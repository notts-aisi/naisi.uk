"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Accordion from "@/components/ui/Accordion";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import CountedTextarea from "@/components/ui/CountedTextarea";
import EmptyState from "@/components/ui/EmptyState";
import MemberName from "@/components/ui/MemberName";
import MemberText from "@/components/ui/MemberText";
import ProgressBar from "@/components/ui/ProgressBar";
import SavedFlash, { type SaveState } from "@/components/ui/SavedFlash";
import Skeleton from "@/components/ui/Skeleton";
import StarRating from "@/components/ui/StarRating";
import PageEnter from "@/components/motion/PageEnter";
import BlockView from "@/features/events/BlockView";
import { aboutMinutes, firstName } from "@/app/(app)/dashboard/homeWords";
import { weekDocId, type Material } from "@/lib/firestore/courses";
import {
  PROGRESS_LIMITS,
  type CourseProgressDoc,
  type ProgressItemKind,
} from "@/lib/firestore/courseProgress";
import {
  BEFORE_YOUR_SESSION,
  DUE_BEFORE,
  EXERCISE,
  REVIEWED_CHIP,
  START_EXERCISE,
  doneWords,
  nextWeekOpensWords,
  readerLine,
} from "@/lib/courses/memberPageWords";
import {
  CANCELLED_CARD,
  ONLINE_NOTICE_LINK_LINE,
  dayRangeWords,
  dayWords,
  weekHeading,
} from "@/lib/courses/sessionChange/words";
import { addDaysToKey, isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import ExerciseSubmit from "./ExerciseSubmit";
import PacingBanner from "./PacingBanner";
import { cancelledIn } from "./sessionChange/cardFacts";
import { saveProgressReflection } from "./progressMutations";
import { useMyExercises } from "./useMyExercises";
import { useRunOverview } from "./useRunOverview";
import { useSyncTasks } from "./useSyncTasks";
import { useWeek, type WeekSource } from "./useWeek";
import { useWeekComments, type WeekComments } from "./useWeekComments";
import {
  clearWeekNavDirection,
  peekWeekNavDirection,
  setWeekNavDirection,
} from "./weekNavDirection";
import TickRows, { tickItemsOf, type TickItem } from "./weekly/TickRows";
import { useMaterialTicks } from "./weekly/useMaterialTicks";
import weekly from "./weekly/weekly.module.css";
import styles from "./WeekView.module.css";

/**
 * A WEEK'S PAGE (board wk-week-phone): the week of weeks, its dates, what is
 * done and the minutes left; "Before your session" with the session's date and
 * the readings to tick; the exercise a facilitator reviews; and the way to the
 * next week, with when it opens (C17).
 *
 * Data: one overview fetch (the run, the reader's own weeks and their group),
 * one week-doc get, the member's own live rows, and for somebody taking part
 * one fetch of their own answers for this week.
 *
 * THE SESSION IS THIS WEEK'S OWN, read off the reader's own calendar with
 * "Change a session" applied (`weekSchedule`): a week moved to another day,
 * time or room says so on its own page, a cancelled one says it is cancelled,
 * and an online one says so. Never the group's usual slot dated to this week.
 *
 * TICKING is `useMaterialTicks`, the one way Home and the programme home tick
 * too, so a reading ticked anywhere is the same record everywhere. A ticked
 * reading opens its reflection, and a refused tick is put back and said.
 *
 * WHAT IS NOT HERE, though the board draws it: "Questions to think about" and
 * "Notes shared with your group". Both need records that do not exist yet; a
 * later slice adds them. The reflections and the run's notes on each reading,
 * which those notes replace, stay under each reading until then.
 *
 * PROGRESS SEMANTICS ARE UNCHANGED BY EXERCISES: the fraction counts
 * non-optional materials plus checklist items and nothing else.
 */

type ViewerRole = "learner" | "facilitator" | "admin";

type Props = {
  runId: string;
  weekNumber: number;
  uid: string;
  viewerRole: ViewerRole;
};

/**
 * The forked-week disclosure, told from the member's end: what it MEANS (your
 * group's version, not the run's) rather than the mechanism.
 */
const FORKED_HINT =
  "Your facilitator has made this week their own: you’re reading your group’s version, which may differ from the other groups on this run.";

/** What the page says when a tick is refused: the box has gone back. */
const TICK_REFUSED = "That tick didn’t save, so it has been undone. Check your connection and try again.";

const EMPTY_ROWS: ReadonlyArray<never> = [];

export default function WeekView({ runId, weekNumber, uid, viewerRole }: Props) {
  const overview = useRunOverview(runId);
  // WHERE THIS READER'S COPY OF THE WEEK LIVES (V2-3 copy-on-write): their
  // group's forked document when their facilitator has personalised this
  // week, the run canonical otherwise, and null until the overview lands.
  const weekSrc: WeekSource | null = overview.data
    ? {
        groupId: overview.data.enrolment?.groupId ?? overview.data.group?.id ?? null,
        forkedWeekIds: overview.data.forkedWeekIds,
      }
    : null;
  const canSeeDrafts = viewerRole !== "learner";
  const week = useWeek(runId, weekDocId(weekNumber), canSeeDrafts, weekSrc);
  const comments = useWeekComments(runId, weekNumber);
  // Own exercise answers for this week, for a learner only: "" is the hook's off switch.
  const isLearnerViewer = overview.data?.enrolment?.role === "learner";
  const myExercises = useMyExercises(isLearnerViewer ? runId : "", weekNumber);
  // P10 mirror trigger, keyed to the RUN: the route recomputes the anchor week.
  useSyncTasks(
    runId,
    overview.data?.enrolment?.status === "active",
    overview.data?.currentWeek?.anchorWeekNumber ?? null,
  );
  const canWrite = overview.data?.enrolment?.status === "active";
  const ticks = useMaterialTicks(runId, uid, weekNumber, canWrite);
  const { toast, run: runToast, dismiss } = useActionToast();

  // Travel direction for the entrance, handed over by the previous page's nav.
  const [navDir] = useState<"up" | "left" | "right">(() => peekWeekNavDirection() ?? "up");
  useEffect(() => {
    clearWeekNavDirection();
  }, []);

  const [openPanels, setOpenPanels] = useState<ReadonlySet<string>>(new Set());
  const [startedExercises, setStartedExercises] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setPanel = useCallback((id: string, open: boolean) => {
    setOpenPanels((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleTick = useCallback(
    (itemKind: ProgressItemKind, itemId: string, next: boolean) => {
      if (!canWrite) return;
      // A ticked reading opens its reflection; an unticked one closes it.
      if (itemKind === "material") setPanel(itemId, next);
      void ticks.toggle(itemKind, itemId, next).then((ok) => {
        if (ok || !mounted.current) return;
        if (itemKind === "material") setPanel(itemId, false);
        void runToast(async () => {
          throw new Error(TICK_REFUSED);
        });
      });
    },
    [canWrite, runToast, setPanel, ticks],
  );

  // ---- Moderation (admins only; the UI never renders it for anyone else) --
  const isAdmin = viewerRole === "admin";
  const reloadComments = comments.reload;
  const moderate = useCallback(
    (progressId: string, action: "hide" | "clear") => {
      void runToast(
        async () => {
          const res = await fetch(`/api/courses/progress/${encodeURIComponent(progressId)}/moderate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `Couldn't update that comment (${res.status}).`);
          }
          // The route is the only source of truth for what the lane shows.
          reloadComments();
        },
        {
          savingMessage: action === "hide" ? "Hiding comment…" : "Restoring comment…",
          successMessage: action === "hide" ? "Comment hidden" : "Comment restored",
        },
      );
    },
    [reloadComments, runToast],
  );

  // ---- Early states (Skeleton, then EmptyState, then the page) -----------
  const runHomeHref = `/learn/${encodeURIComponent(runId)}`;

  if (overview.error) {
    return (
      <EmptyState
        title="Couldn't load this course"
        body={overview.error.message}
        action={<Link href="/learn">Back to your courses</Link>}
      />
    );
  }
  if (week.status === "error") {
    return (
      <EmptyState
        title="Couldn't load this week"
        body={week.error?.message}
        action={<Link href={runHomeHref}>Back to the course</Link>}
      />
    );
  }
  if (overview.loading || !overview.data || week.status === "loading" || ticks.loading) {
    return <WeekSkeleton />;
  }
  if (week.status === "missing" || week.status === "unpublished") {
    return (
      <EmptyState
        title={week.status === "unpublished" ? "This week isn't published yet" : "This week doesn't exist"}
        body={
          week.status === "unpublished"
            ? "Your facilitators are still putting it together. Check back soon."
            : undefined
        }
        action={<Link href={runHomeHref}>Back to the course</Link>}
      />
    );
  }

  const payload = overview.data;
  const weekDoc = week.week;
  if (!weekDoc) return <WeekSkeleton />; // unreachable; narrows the type

  // ---- Derived page facts -------------------------------------------------
  const hasEnrolment = payload.enrolment !== null;
  const learnerEnrolment = payload.enrolment?.role === "learner" ? payload.enrolment : null;
  const canSubmitExercises = learnerEnrolment?.status === "active";
  const programmeName = payload.programme?.name || payload.run.courseTitle || "Your programme";
  const todayKey = londonDateKey(new Date());

  // THIS week's session as the reader's group holds it, changes applied.
  const schedule = payload.weekSchedule.find((entry) => entry.weekNumber === weekNumber) ?? null;
  const sessionDay = schedule?.dateKey ? dayWords(schedule.dateKey) : "";
  const cancelled = payload.group ? cancelledIn(payload.group, weekNumber) : null;
  // The viewed week's mode, addressed by `weekDocId(number)` like every other
  // week read on a member-facing surface: this page is about THIS week.
  const viewedSessionMode = payload.group?.sessionModes[weekDocId(weekNumber)] ?? null;

  // The week's seven days in the reader's own calendar.
  const slotStartKey = schedule?.slotStartKey ?? "";
  const range = slotStartKey && isValidDateKey(slotStartKey) ? dayRangeWords(slotStartKey, addDaysToKey(slotStartKey, 6)) : "";

  // Optional materials are left out of both sides of the fraction, so 100% is
  // reachable without the extension reading.
  const countable = [
    ...weekDoc.materials.filter((m) => !m.optional).map((m) => ({ id: m.id, minutes: m.estimatedMinutes ?? 0 })),
    ...weekDoc.checklist.map((c) => ({ id: c.id, minutes: 0 })),
  ];
  const doneCount = countable.filter((item) => ticks.isDone(item.id)).length;
  const minutesLeft = aboutMinutes(
    countable.filter((item) => !ticks.isDone(item.id)).reduce((sum, item) => sum + item.minutes, 0),
  );
  const weekComplete = countable.length > 0 && doneCount === countable.length;

  const items = tickItemsOf(weekDoc, true);
  const facilitatorFirstNames = (payload.group?.facilitatorNames ?? []).map((name) => firstName(name) || name);

  // The way on walks the taught weeks of the reader's own calendar.
  const taught = payload.weekSchedule;
  const at = taught.findIndex((entry) => entry.weekNumber === weekNumber);
  const prev = at > 0 ? taught[at - 1] : null;
  const next = at >= 0 && at < taught.length - 1 ? taught[at + 1] : null;
  const nextLine =
    next && !next.open && next.opensAfter ? nextWeekOpensWords(next.weekNumber, next.opensAfter, todayKey) : null;

  const exercisesNote =
    learnerEnrolment || viewerRole === "learner" ? null : (
      <p className={styles.exercisesNote}>
        You are viewing this week as {viewerRole === "admin" ? "an admin" : "a facilitator"}. Exercises are submitted
        by the learners on this run.
      </p>
    );

  const sessionChip = cancelled ? (
    <span className={weekly.plainChip}>{CANCELLED_CARD}</span>
  ) : viewedSessionMode === "virtual" ? (
    <span className={weekly.liveChip}>Online this week</span>
  ) : null;

  return (
    <div className={weekly.week}>
      <div className={weekly.bar}>
        <div className={weekly.barStart}>
          <Link href={runHomeHref} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{programmeName}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>Week {weekNumber}</div>
        <div className={weekly.barEnd} />
      </div>

      <PageEnter direction={navDir} className={weekly.weekBody}>
        <header>
          <p className={weekly.eyebrow}>{weekHeading(weekNumber, payload.run.totalWeeks, range)}</p>
          <h1 className={weekly.weekTitle}>{weekDoc.title || `Week ${weekNumber}`}</h1>
          {(week.forked || !weekDoc.published) && (
            <p className={weekly.weekChips}>
              {week.forked && (
                <Chip tone="neutral" size="sm" title={FORKED_HINT}>
                  Customised by your facilitator
                </Chip>
              )}
              {!weekDoc.published && (
                // Learners never reach an unpublished week (useWeek gates), so
                // this chip only ever faces facilitators and admins.
                <Chip tone="warning" size="sm">
                  Unpublished
                </Chip>
              )}
            </p>
          )}
          {hasEnrolment && countable.length > 0 && (
            <div className={weekly.weekProgress}>
              <p className={weekly.weekProgressWords}>
                <strong>{doneWords(doneCount, countable.length)}</strong>
                {minutesLeft && !weekComplete ? ` · ${minutesLeft} left` : ""}
              </p>
              <div className={weekly.weekProgressBar}>
                <ProgressBar
                  value={doneCount}
                  max={countable.length}
                  ariaLabel="Week progress"
                  tone={weekComplete ? "success" : "accent"}
                  size="md"
                />
              </div>
            </div>
          )}
        </header>

        <PacingBanner
          runId={runId}
          viewedWeek={weekNumber}
          currentWeek={payload.currentWeek}
          pacedByGroup={payload.calendarSource === "group"}
        />

        {weekDoc.guideBlocks.length > 0 && (
          <div className={weekly.guide}>
            <BlockView blocks={weekDoc.guideBlocks} />
          </div>
        )}

        {items.length > 0 && (
          <section className={`${weekly.card} ${weekly.cardTight}`} aria-labelledby="before-your-session">
            <div className={weekly.cardHead}>
              <h2 id="before-your-session" className={weekly.cardTitle}>
                {BEFORE_YOUR_SESSION}
              </h2>
              {(sessionDay || sessionChip) && (
                <span className={weekly.ticketFacts}>
                  {sessionChip}
                  {sessionDay && <span className={weekly.cardMeta}>{sessionDay}</span>}
                </span>
              )}
            </div>
            {cancelled?.reason && <p className={weekly.cardLine}>{cancelled.reason}</p>}
            <SessionModeNote mode={viewedSessionMode} cancelled={cancelled !== null} />
            <TickRows
              items={items}
              isDone={ticks.isDone}
              canTick={ticks.canTick}
              showTicks={hasEnrolment}
              onTick={handleTick}
              open="icon"
              withSource
              extra={(item) =>
                item.kind === "material" ? (
                  <MaterialExtras
                    runId={runId}
                    uid={uid}
                    weekNumber={weekNumber}
                    material={weekDoc.materials.find((m) => m.id === item.id) as Material}
                    row={ticks.byItemId.get(item.id) ?? null}
                    completed={ticks.isDone(item.id)}
                    canReflect={canWrite}
                    open={openPanels.has(item.id)}
                    onOpen={() => setPanel(item.id, true)}
                    onClose={() => setPanel(item.id, false)}
                    comments={comments}
                    canModerate={isAdmin}
                    onModerate={moderate}
                  />
                ) : hasEnrolment && mirrored(weekDoc, item) ? (
                  <MirrorHint />
                ) : null
              }
            />
          </section>
        )}

        {weekDoc.exercises.map((exercise) => {
          const row = learnerEnrolment ? (myExercises.byExerciseId.get(exercise.id) ?? null) : null;
          const started = startedExercises.has(exercise.id) || row !== null;
          return (
            <section key={exercise.id} className={weekly.exerciseCard} aria-labelledby={`exercise-${exercise.id}`}>
              <div className={weekly.exerciseHead}>
                <h2 id={`exercise-${exercise.id}`} className={weekly.cardTitle}>
                  {EXERCISE}
                </h2>
                <span className={weekly.kindChip}>{REVIEWED_CHIP}</span>
              </div>
              <p className={weekly.exercisePrompt}>{exercise.prompt}</p>
              {exercise.helpText && <p className={weekly.cardLine}>{exercise.helpText}</p>}
              {schedule?.dateKey && !cancelled && (
                <p className={weekly.exerciseDue}>
                  <span className={weekly.cardMeta}>{DUE_BEFORE}</span>
                </p>
              )}
              {learnerEnrolment ? (
                myExercises.loading ? (
                  <Skeleton lines={2} height="1.75rem" ariaLabel="Loading your answer…" />
                ) : !row && !myExercises.loaded ? (
                  <ExerciseUnavailable
                    detail={myExercises.error?.message ?? null}
                    canEdit={canSubmitExercises}
                    onRetry={myExercises.reload}
                  />
                ) : started || !canSubmitExercises ? (
                  <ExerciseSubmit
                    runId={runId}
                    weekId={weekDoc.id}
                    weekNumber={weekNumber}
                    exercise={exercise}
                    response={row}
                    onSaved={myExercises.apply}
                    readOnly={!canSubmitExercises}
                  />
                ) : (
                  <button
                    type="button"
                    className={weekly.startButton}
                    onClick={() => setStartedExercises((prev) => new Set(prev).add(exercise.id))}
                  >
                    {START_EXERCISE}
                  </button>
                )
              ) : null}
              <p className={weekly.exerciseReader}>{readerLine(facilitatorFirstNames)}</p>
            </section>
          );
        })}
        {weekDoc.exercises.length > 0 && exercisesNote}

        {(prev || next) && (
          <nav className={weekly.weekNav} aria-label="Weeks">
            {prev ? (
              <Link href={`${runHomeHref}/weeks/${prev.weekNumber}`} className={weekly.weekNavLink} onClick={() => setWeekNavDirection("right")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                <span>Week {prev.weekNumber}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && next.open ? (
              <Link href={`${runHomeHref}/weeks/${next.weekNumber}`} className={weekly.weekNavLink} onClick={() => setWeekNavDirection("left")}>
                <span>Week {next.weekNumber}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ) : nextLine ? (
              <p className={weekly.weekNavNote}>{nextLine}</p>
            ) : (
              <span />
            )}
          </nav>
        )}

        {/* THE RUN'S SUB NAV, such as it is: the progress page's second door,
            beside the one at the foot of the programme home's weeks, so the
            page is never reachable from one place only. */}
        {learnerEnrolment && (
          <div>
            <Link href={`${runHomeHref}/progress`} className={weekly.footLink}>
              See your progress week by week
            </Link>
          </div>
        )}
      </PageEnter>

      <ActionToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/** Whether a checklist item also lands on My Work. */
function mirrored(week: { checklist: { id: string; mirrorToMyWork: boolean }[] }, item: TickItem): boolean {
  return week.checklist.find((c) => c.id === item.id)?.mirrorToMyWork === true;
}

/**
 * Under "Before your session" for a week held online: where the link is.
 * The link itself is on the programme home's ticket, behind sign-in (Q23).
 */
function SessionModeNote({ mode, cancelled }: { mode: string | null; cancelled: boolean }) {
  if (cancelled || mode !== "virtual") return null;
  return <p className={weekly.cardLine}>{ONLINE_NOTICE_LINK_LINE}</p>;
}

// ---------------------------------------------------------------------------
// The mirror disclosure, course side
// ---------------------------------------------------------------------------

/**
 * The one-way sentence, told from the COURSE end: a copy of this item is on
 * My Work, and the two boxes are separate. A four-word marker that SHOWS, with
 * the sentence in a `title` and in visually-hidden text.
 */
const MIRROR_HINT =
  "A copy of this is on your My Work board. The two tick boxes are separate, and ticking one doesn’t tick the other.";

function MirrorHint() {
  return (
    <span className={styles.mirrorHint} title={MIRROR_HINT}>
      Also on My Work
      <span className={styles.mirrorHintNote}>: {MIRROR_HINT}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The un-writable exercise: what stands in for the form when the member's own
// answers didn't load
// ---------------------------------------------------------------------------

/**
 * Rendered INSTEAD of `ExerciseSubmit` when this week's answers failed to load.
 * Never an empty writable box whose emptiness is unverified: the stored row is
 * addressed by a deterministic id, so a form that starts blank because the
 * fetch failed would overwrite it on the first keystroke.
 */
function ExerciseUnavailable({
  detail,
  canEdit,
  onRetry,
}: {
  detail: string | null;
  canEdit: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.exerciseBlocked}>
      <p className={styles.exerciseBlockedText}>
        {canEdit
          ? "We couldn’t load your saved answer. Reload before editing so you don’t overwrite it."
          : "We couldn’t load your saved answer. Reload to see it."}
      </p>
      {detail && <p className={styles.exerciseBlockedDetail}>{detail}</p>}
      <Button size="sm" variant="secondary" onClick={onRetry} aria-label="Retry loading your saved answer">
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-material extras: reflection panel + the run's notes on the reading
// ---------------------------------------------------------------------------

type Draft = { rating: number | null; comment: string; note: string };

type ExtrasProps = {
  runId: string;
  uid: string;
  weekNumber: number;
  material: Material;
  row: CourseProgressDoc | null;
  /** Optimistic: may lead `row.completed` by a beat. */
  completed: boolean;
  /** Active enrolment: may write reflections. */
  canReflect: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  comments: WeekComments;
  /** Admin only: the moderation controls. */
  canModerate: boolean;
  onModerate: (progressId: string, action: "hide" | "clear") => void;
};

function MaterialExtras({
  runId,
  uid,
  weekNumber,
  material,
  row,
  completed,
  canReflect,
  open,
  onOpen,
  onClose,
  comments,
  canModerate,
  onModerate,
}: ExtrasProps) {
  const fieldId = useId();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notesOpen, setNotesOpen] = useState(false);

  // Draft seeded on open, discarded on close: seeding only when null means a
  // save landing mid-edit never clobbers what the member is typing.
  const [draft, setDraft] = useState<Draft | null>(null);
  if (open && draft === null) {
    setDraft({
      rating: row?.rating ?? null,
      comment: row?.publicComment ?? "",
      note: row?.privateNote ?? "",
    });
  }
  if (!open && draft !== null) {
    setDraft(null);
  }

  const hasReflection = Boolean(row && (row.rating !== undefined || row.publicComment || row.privateNote));

  const save = async () => {
    if (!draft || !row?.completed) return;
    setSaveState("saving");
    try {
      await saveProgressReflection({
        runId,
        uid,
        weekNumber,
        itemKind: "material",
        itemId: material.id,
        current: row,
        rating: draft.rating ?? undefined,
        publicComment: draft.comment.trim() ? draft.comment : undefined,
        privateNote: draft.note.trim() ? draft.note : undefined,
      });
      setSaveState("saved");
      comments.reload();
    } catch {
      // Inline, not a toast: reflection saves are keep-working feedback.
      setSaveState("error");
    }
  };

  const toggleNotes = () => {
    const next = !notesOpen;
    setNotesOpen(next);
    if (next) {
      if (comments.error && !comments.loading) comments.reload();
      else comments.load();
    }
  };

  const noteRows = comments.byItemId.get(material.id) ?? EMPTY_ROWS;
  const noteCount = comments.loaded ? noteRows.length : null;
  const showReflection = canReflect && completed;
  const panelClass = [styles.panel, open ? styles.panelOpen : ""].filter(Boolean).join(" ");

  return (
    <div className={styles.extras}>
      {showReflection && !open && (
        <button type="button" className={styles.reflectOpen} onClick={onOpen}>
          {hasReflection ? "Edit your reflection" : "Add a reflection"}
        </button>
      )}

      {showReflection && (
        // Always mounted while completed so the grid-rows track can animate
        // both ways; inert + aria-hidden park the form fields while closed.
        <div className={panelClass} aria-hidden={!open} inert={!open}>
          <div className={styles.panelInner}>
            <div className={styles.panelBody}>
              {row?.moderatedByUid && (
                <p className={styles.moderated}>
                  A moderator hid this comment. You can still edit it, but it stays hidden from the cohort until a
                  moderator clears it.
                </p>
              )}

              <div className={styles.stars}>
                <span className={styles.fieldLabel} id={`${fieldId}-rating`}>
                  How useful was this?
                </span>
                <StarRating
                  value={draft?.rating ?? null}
                  onChange={(n) => setDraft((d) => (d ? { ...d, rating: n } : d))}
                  onClear={() => setDraft((d) => (d ? { ...d, rating: null } : d))}
                  ariaLabel="How useful was this?"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`${fieldId}-comment`}>
                  Reflection
                  <span className={styles.fieldHint}> · Visible to everyone on this run</span>
                </label>
                <CountedTextarea
                  id={`${fieldId}-comment`}
                  rows={3}
                  value={draft?.comment ?? ""}
                  max={PROGRESS_LIMITS.publicComment}
                  placeholder="What stood out? What would you tell the rest of your cohort?"
                  onChange={(e) => {
                    const comment = e.target.value;
                    setDraft((d) => (d ? { ...d, comment } : d));
                  }}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`${fieldId}-note`}>
                  Private note
                  <span className={styles.fieldHint}> · Only facilitators and admins see this</span>
                </label>
                <CountedTextarea
                  id={`${fieldId}-note`}
                  rows={2}
                  value={draft?.note ?? ""}
                  max={PROGRESS_LIMITS.privateNote}
                  placeholder="Questions, sticking points, anything for your facilitator."
                  onChange={(e) => {
                    const note = e.target.value;
                    setDraft((d) => (d ? { ...d, note } : d));
                  }}
                />
              </div>

              <div className={styles.panelActions}>
                <Button size="sm" onClick={() => void save()} disabled={!row?.completed}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Skip
                </Button>
                <SavedFlash state={saveState} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.notes}>
        <Accordion
          summary={
            <>
              <span>
                Cohort notes
                {noteCount !== null ? ` (${noteCount})` : ""}
              </span>
              <span className={notesOpen ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron} aria-hidden="true">
                ▾
              </span>
            </>
          }
          open={notesOpen}
          onToggle={toggleNotes}
          summaryClassName={styles.notesSummary}
        >
          <div className={styles.notesBody}>
            {comments.loading && <Skeleton lines={2} ariaLabel="Loading cohort notes…" />}
            {!comments.loading && comments.error && <p className={styles.notesEmpty}>{comments.error.message}</p>}
            {comments.loaded && !comments.loading && noteRows.length === 0 && (
              <p className={styles.notesEmpty}>No notes on this yet. Save a reflection and yours will appear here.</p>
            )}
            {noteRows.map((r) => (
              <div key={r.progressId} className={r.moderated ? `${styles.noteRow} ${styles.noteHidden}` : styles.noteRow}>
                <div className={styles.noteHead}>
                  <span className={styles.noteName}>
                    <MemberName name={r.displayName} />
                  </span>
                  {r.rating !== null && <StarRating value={r.rating} readOnly ariaLabel="Their rating" size="sm" />}
                  {canModerate && r.moderated && (
                    <Chip tone="warning" size="sm">
                      Hidden
                    </Chip>
                  )}
                  {canModerate && (
                    <button
                      type="button"
                      className={styles.moderate}
                      onClick={() => onModerate(r.progressId, r.moderated ? "clear" : "hide")}
                    >
                      {r.moderated ? "Unhide" : "Hide"}
                    </button>
                  )}
                </div>
                {/* Member-authored plain text: MemberText is the XSS boundary. */}
                <MemberText text={r.comment} className={styles.noteText} />
              </div>
            ))}
          </div>
        </Accordion>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton: the head and the card, so arrival costs no reflow.
// ---------------------------------------------------------------------------

function WeekSkeleton() {
  return (
    <div className={weekly.week}>
      <div className={weekly.weekBody}>
        <Skeleton width="14rem" height="0.85rem" />
        <Skeleton width="60%" height="2.2rem" />
        <Skeleton width="100%" height="0.4rem" radius="var(--radius-pill)" />
        <Skeleton lines={3} height="2.5rem" />
      </div>
    </div>
  );
}
