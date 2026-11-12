"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { OLDER_EDITORS } from "@/lib/courses/weekEdit/pageWords";
import type { WeekPlanEntry } from "@/lib/courses/weekPlan";
import type { GroupSessionMode } from "@/lib/firestore/courseGroups";
import type { CourseWeekDoc } from "@/lib/firestore/courses";
import { setGroupWeekMode, useGroupWeek, useGroupWeeks } from "./useGroupWeeks";
import styles from "./GroupWeekEditor.module.css";

/**
 * A group's weeks, for its facilitators: the index of weeks and one week of
 * them. READ ONLY for what a week says.
 *
 * ── THE PROGRAMME'S WEEKS ARE EDITED BY ITS LEAD ────────────────────────────
 * A group used to be able to take its own copy of a week (a FORK) here and
 * change it: its materials, exercises, checklist and questions, or, for a
 * week written as blocks, its Markdown pasted back. Making and editing a
 * group's own copy is switched off until a later phase (no group on the live
 * site has one): a week is changed in one place, on the programme's Weeks
 * page, by the programme's lead and admins, one block at a time or the whole
 * week pasted, with a history of every save. So this surface offers no
 * "Customise", no paste and no editor of a copy, and says who edits the
 * weeks instead.
 *
 * A GROUP THAT ALREADY HAS A COPY keeps reading it: nothing here deletes or
 * changes it. Its week page says it is the group's own copy and shows what
 * it holds, read only, and the index still says which weeks are the group's
 * own. A save of the programme's week does not reach it (the Weeks page says
 * so when it saves).
 *
 * ── WHAT STILL CHANGES HERE ─────────────────────────────────────────────────
 * How a week meets (in person or online) for this group: one switch per
 * week, stored on the group, not on any copy of a week.
 */

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Both ends parsed at T00:00:00Z and formatted in UTC — a civil-date label
 *  can never slide a day across a clock change. */
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const FORK_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
});

function formatDateKey(key: string): string {
  return key ? DAY_MONTH.format(new Date(`${key}T00:00:00Z`)) : "";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 materials · 2 exercises · 4 checklist items" — the same line everywhere. */
function contentLine(week: CourseWeekDoc): string {
  return [
    plural(week.materials.length, "material", "materials"),
    plural(week.exercises.length, "exercise", "exercises"),
    plural(week.checklist.length, "checklist item", "checklist items"),
  ].join(" · ");
}

// ---------------------------------------------------------------------------
// GroupWeekIndex — every week, and whether it still follows the course
// ---------------------------------------------------------------------------

type IndexProps = {
  runId: string;
  groupId: string;
  groupName: string;
  /**
   * The calendar this group actually teaches to — resolved by the page shell
   * through `resolveCalendar`, so it is the group's own plan when it has one
   * and the run's otherwise. This component never picks between them.
   */
  weekPlan: WeekPlanEntry[];
  startDate: string;
  calendarSource: "run" | "group";
  /** The plan slot the group is in right now, or null (undated / outside). */
  nowIndex: number | null;
};

export function GroupWeekIndex({
  runId,
  groupId,
  groupName,
  weekPlan,
  startDate,
  calendarSource,
  nowIndex,
}: IndexProps) {
  const { rows, forkedCount, loading, error, reload } = useGroupWeeks(
    runId,
    groupId,
    weekPlan,
    startDate,
  );

  const editBase = `/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}/edit`;
  const taughtWeeks = rows.filter((row) => row.kind === "week").length;

  return (
    <>
      <Card as="section" padding="lg">
        <h2 className={styles.sectionTitle}>Your group&apos;s weeks</h2>
        <p className={styles.hint}>
          {OLDER_EDITORS.groupLine}
          {calendarSource === "group" ? (
            <>
              {" "}
              The dates come from {groupName}&apos;s own schedule, set below.
            </>
          ) : (
            <> The dates come from the course&apos;s schedule.</>
          )}
        </p>

        {loading && rows.length === 0 && (
          <Skeleton width="100%" height="10rem" ariaLabel="Loading your group's weeks…" />
        )}

        {error && (
          <>
            <p className={styles.error}>
              Couldn&apos;t read your group&apos;s weeks: {error.message}
            </p>
            <div className={styles.actions}>
              <Button type="button" variant="secondary" size="sm" onClick={reload}>
                Try again
              </Button>
            </div>
          </>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className={styles.empty}>
            This course has no weeks in its plan yet, so there is nothing to
            customise. It will appear here once the course team adds the weeks.
          </p>
        )}

        {rows.length > 0 && (
          <ol className={styles.indexList}>
            {rows.map((row) => {
              const isNow = nowIndex === row.planIndex;
              const dates =
                row.from && row.to
                  ? `${formatDateKey(row.from)} – ${formatDateKey(row.to)}`
                  : "—";

              if (row.kind === "break") {
                return (
                  <li
                    key={`break-${row.planIndex}`}
                    className={`${styles.indexRow} ${styles.indexRowBreak} ${isNow ? styles.indexNow : ""}`}
                  >
                    <span className={styles.indexWeek}>Break</span>
                    <span className={styles.indexTitle}>
                      {row.label || "Unnamed break"}
                      <span className={styles.indexState}>
                        No week content — the group pauses.
                      </span>
                    </span>
                    <span className={styles.indexDates}>{dates}</span>
                    <span className={styles.indexActions} />
                  </li>
                );
              }

              const title = row.effective?.title || "Untitled week";
              const forkedOn = row.fork?.forkedAt
                ? FORK_DATE.format(row.fork.forkedAt)
                : null;
              const weekLabel = `Week ${row.weekNumber}`;

              return (
                <li
                  key={row.weekId}
                  className={`${styles.indexRow} ${row.forked ? styles.indexRowForked : ""} ${isNow ? styles.indexNow : ""}`}
                >
                  <span className={styles.indexWeek}>
                    {weekLabel}
                    {isNow && (
                      <>
                        {" "}
                        <Badge tone="accent">Now</Badge>
                      </>
                    )}
                  </span>

                  <span className={styles.indexTitle}>
                    {title}
                    <span className={styles.indexState}>
                      {row.forked ? (
                        <>
                          Customised by your group
                          {forkedOn ? ` — your copy since ${forkedOn}` : ""}.{" "}
                          {row.effective ? contentLine(row.effective) : ""}
                        </>
                      ) : row.canonical ? (
                        <>
                          Tracking the course curriculum.{" "}
                          {contentLine(row.canonical)}
                        </>
                      ) : (
                        <>The course hasn&apos;t written this week yet.</>
                      )}
                    </span>
                  </span>

                  <span className={styles.indexDates}>{dates}</span>

                  <span className={styles.indexActions}>
                    <Link
                      href={`${editBase}/${encodeURIComponent(row.weekId)}`}
                      className={styles.indexLink}
                    >
                      Open
                    </Link>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {rows.length > 0 && (
          <p className={`${styles.hint} ${styles.spaced}`}>
            {forkedCount === 0
              ? `All ${taughtWeeks} weeks still follow the course.`
              : `${plural(forkedCount, "week is", "weeks are")} ${groupName}’s own copy; the other ${taughtWeeks - forkedCount} follow the course.`}
          </p>
        )}
      </Card>
    </>
  );
}


// ---------------------------------------------------------------------------
// What a week holds, read only: the course's week, or a group's own copy
// ---------------------------------------------------------------------------

function WeekPreview({ week, title, line }: { week: CourseWeekDoc; title: string; line: string }) {
  const rows: { kind: string; title: string; meta?: string }[] = [
    ...week.materials.map((m) => ({
      kind: m.type,
      title: m.title || "Untitled",
      meta: [
        m.optional ? "Optional" : null,
        m.estimatedMinutes != null ? `${m.estimatedMinutes} min` : null,
        "url" in m && m.url ? m.url : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    // "Questions to think about", in the order the week page numbers them.
    ...week.questions.map((question) => ({ kind: "question", title: question })),
    ...week.exercises.map((x) => ({
      kind: "exercise",
      title: x.prompt || "Untitled prompt",
      meta: [
        x.responseType === "link" ? "Link answer" : "Written answer",
        x.required ? "Required" : "Optional",
        x.peerVisible ? "Shared with the group" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...week.checklist.map((c) => ({
      kind: "checklist",
      title: c.title || "Untitled item",
      meta: c.detail || undefined,
    })),
  ];

  return (
    <Card padding="lg">
      <h3 className={styles.sectionTitle}>{title}</h3>
      <p className={styles.hint}>{line}</p>

      {week.summary && <p className={styles.hint}>{week.summary}</p>}

      {rows.length === 0 ? (
        <p className={styles.empty}>
          This week has no materials, exercises or checklist items yet.
        </p>
      ) : (
        <ul className={styles.previewList}>
          {rows.map((row, i) => (
            <li key={`${row.kind}-${i}`} className={styles.previewRow}>
              <span className={styles.previewKind}>{row.kind}</span>
              <span className={styles.previewTitle}>
                {row.title}
                {row.meta && <span className={styles.previewMeta}>{row.meta}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}


// ---------------------------------------------------------------------------
// GroupWeekEditor — one week
// ---------------------------------------------------------------------------

type EditorProps = {
  runId: string;
  courseId: string;
  groupId: string;
  groupName: string;
  weekId: string;
  weekNumber: number;
  /** The group's civil dates for this slot, "" when the calendar is undated. */
  from: string;
  to: string;
  /**
   * The stored mode for this (group, week), or null when the facilitator has
   * never set one. Null is NOT "in person": it is "no week-level override", so
   * the group sees whatever its usual session carries. The distinction is what
   * makes the clear-back action meaningful.
   */
  mode: GroupSessionMode | null;
  /** The effective session, for the location/link swap explanation. */
  location: string;
  meetingUrl: string | null;
  viewerIsAdmin: boolean;
};

export default function GroupWeekEditor({
  runId,
  courseId,
  groupId,
  groupName,
  weekId,
  weekNumber,
  from,
  to,
  mode,
  location,
  meetingUrl,
  viewerIsAdmin,
}: EditorProps) {
  const router = useRouter();
  const { toast, run: runAction, dismiss } = useActionToast();
  const { canonical, fork, forked, loading, error, reload } = useGroupWeek(
    runId,
    groupId,
    weekId,
  );

  const [busy, setBusy] = useState(false);

  // The group's own copy, when it has one: read, never written, here.
  const week = fork?.week ?? null;

  // ---- Mode draft ----
  // The control is binary because the DECISION is binary; the stored value has
  // a third state (never set) which the draft collapses to "in person" for the
  // pills while `mode === null` keeps driving the copy and the clear action.
  const [modeDraft, setModeDraft] = useState<GroupSessionMode>(mode ?? "in-person");
  const [syncedMode, setSyncedMode] = useState<GroupSessionMode | null>(mode);
  if (mode !== syncedMode) {
    setSyncedMode(mode);
    setModeDraft(mode ?? "in-person");
  }

  const groupPath = `/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}`;
  const indexHref = `${groupPath}/edit`;
  const weekLabel = `Week ${weekNumber}`;
  const dateLine =
    from && to ? `${formatDateKey(from)} – ${formatDateKey(to)}` : "No dates yet";
  const published = week?.published ?? false;

  async function saveMode() {
    setBusy(true);
    let ok = false;
    await runAction(
      async () => {
        await setGroupWeekMode(groupId, weekId, modeDraft);
        ok = true;
      },
      {
        savingMessage: "Saving how this week meets…",
        successMessage:
          modeDraft === "virtual"
            ? "This week now shows the meeting link"
            : "This week now shows the room",
      },
    );
    setBusy(false);
    // The mode lives on the GROUP doc, which `courseGroups` rules keep away
    // from a facilitator's client — the page shell read it server-side. A
    // server re-render is the only honest way to show what was actually
    // stored, so ask for one rather than assuming the write landed as sent.
    if (ok) router.refresh();
  }

  async function clearMode() {
    setBusy(true);
    let ok = false;
    await runAction(
      async () => {
        await setGroupWeekMode(groupId, weekId, null);
        ok = true;
      },
      {
        savingMessage: "Clearing this week's override…",
        successMessage: "Back to your group's usual arrangement",
      },
    );
    setBusy(false);
    if (ok) router.refresh();
  }

  if (loading) {
    return <Skeleton width="100%" height="18rem" ariaLabel="Loading this week…" />;
  }

  if (error) {
    return (
      <Card padding="lg">
        <h2 className={styles.sectionTitle}>Couldn&apos;t load this week</h2>
        <p className={styles.error}>{error.message}</p>
        <div className={styles.actions}>
          <Button type="button" onClick={reload}>
            Try again
          </Button>
          <Link href={indexHref} className={styles.backLink}>
            Back to your group&apos;s weeks
          </Link>
        </div>
      </Card>
    );
  }

  const shown = week ?? canonical;
  // A week written as blocks reads on the group's own week page; a week
  // written before blocks is shown here as its lists.
  const blockShape = shown !== null && shown !== undefined && isBlockWeek(shown);

  return (
    <div className={styles.editor}>
      <div className={styles.breadcrumb}>
        <Link href={indexHref} className={styles.backLink}>
          ← {groupName || "Your group"}&apos;s weeks
        </Link>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusMeta}>
          <span className={styles.eyebrow}>{weekLabel}</span>
          <h1 className={styles.weekTitle}>{shown?.title || "Untitled week"}</h1>
          <Badge tone={forked ? "accent" : "neutral"}>
            {forked ? "Your group’s own copy" : "Tracking the course"}
          </Badge>
          {forked && (
            <Badge tone={published ? "success" : "neutral"}>
              {published ? "Visible to your group" : "Hidden from your group"}
            </Badge>
          )}
        </div>
        <span className={styles.muted}>{dateLine}</span>
      </div>

      {/* ---- How this week meets — independent of the fork ---------------- */}
      <Card padding="lg">
        <h2 className={styles.sectionTitle}>How this week meets</h2>
        <p className={styles.hint}>
          One switch, one week. <strong>In person</strong> shows your group the
          room and hides the meeting link; <strong>online</strong> shows the link
          and hides the room. It changes what {groupName} sees on the week page
          and in the reminder emails — it does not move the day or the time, and
          it does not touch any other week.
        </p>

        <div className={styles.modeRow}>
          <SegmentedControl<GroupSessionMode>
            value={modeDraft}
            onChange={setModeDraft}
            options={[
              { value: "in-person", label: "In person" },
              { value: "virtual", label: "Online" },
            ]}
            ariaLabel={`How ${weekLabel} meets`}
            disabled={busy}
          />
          <Button
            type="button"
            onClick={saveMode}
            disabled={busy || modeDraft === mode}
          >
            Save
          </Button>
          {mode !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearMode}
              disabled={busy}
            >
              Use your group&apos;s usual arrangement
            </Button>
          )}
        </div>

        {mode === null && (
          <p className={styles.modeNow}>
            Nothing set for {weekLabel} yet, so your group sees its usual
            arrangement — whatever the session carries. Saving one of these makes
            the choice explicit for this week only.
          </p>
        )}

        {/* States what the pills currently SAY, and is careful about tense: an
            unsaved choice describes what would happen, not what does. */}
        <p className={styles.modeNow}>
          {modeDraft === "virtual" ? (
            meetingUrl ? (
              <>
                {modeDraft === mode
                  ? "Your group sees the meeting link "
                  : "If you save this, your group will see the meeting link "}
                <span className={styles.modeNowValue}>{meetingUrl}</span> and not
                the room.
              </>
            ) : (
              <>
                Your group has no meeting link saved, so an online week would show
                them nowhere to go. Add the link on your group&apos;s session
                before you switch. It goes on their programme page, never in an
                email.
              </>
            )
          ) : location ? (
            <>
              {modeDraft === mode
                ? "Your group sees "
                : "If you save this, your group will see "}
              <span className={styles.modeNowValue}>{location}</span>
              {/* A week in a room still carries its link, for anybody joining
                  it online: the tickets say so beside it. */}
              {meetingUrl ? ", and the meeting link for anybody joining online." : "."}
            </>
          ) : (
            <>
              Your group has no room saved, so an in-person week would show them
              no location. Set one on your group&apos;s session, or say where in a
              room notice.
            </>
          )}
        </p>
      </Card>

      {/* ---- What the week says: read only, edited by the programme's lead ---- */}
      <Card padding="lg">
        <h2 className={styles.sectionTitle}>What {groupName} reads</h2>
        <p className={styles.hint}>
          {OLDER_EDITORS.groupLine}
          {viewerIsAdmin && (
            <>
              {" "}
              You&apos;re an admin: the course-wide version lives in the{" "}
              <Link
                href={`/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}`}
              >
                admin week editor
              </Link>
              .
            </>
          )}
        </p>
        {forked && <p className={styles.warn}>{OLDER_EDITORS.groupCopyLine(groupName)}</p>}
      </Card>

      {/* A week written before blocks: its lists, as the group reads them. A
          week written as blocks reads on the group's own week page. */}
      {forked && week && !blockShape && (
        <WeekPreview
          week={week}
          title={`${groupName}’s own copy of ${weekLabel}`}
          line="This is what your group reads for this week. It can’t be changed here."
        />
      )}
      {!forked && canonical && !blockShape && (
        <WeekPreview
          week={canonical}
          title="What the course gives your group"
          line="This is live: when the programme’s lead changes it, your group sees the change."
        />
      )}

      {!forked && !canonical && (
        <p className={styles.warn}>
          <code>{weekId}</code> is in your group&apos;s schedule but the course has
          not written it. Nothing is shown to your group for this slot yet.
        </p>
      )}

      <ActionToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
