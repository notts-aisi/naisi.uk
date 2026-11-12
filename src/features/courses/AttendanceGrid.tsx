"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import EmptyState from "@/components/ui/EmptyState";
import MemberName from "@/components/ui/MemberName";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { TOLD_IN_ADVANCE, registerCantMakeItLine } from "@/lib/courses/cantMakeIt/words";
import { JOINED_ONLINE, ONLINE_WORD, SAID_ONLINE_IN_ADVANCE, whereChoiceLabel } from "@/lib/courses/joiningOnline/words";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import {
  ATTENDANCE_LIMITS,
  ATTENDANCE_STATUS_LABEL,
  cameBy,
  type AttendanceStatus,
} from "@/lib/firestore/courseAttendance";
import { finishSummary } from "@/lib/courses/registerCover/pageModel";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { OPEN_THE_GROUPS_PAGE, placeLine, setByWords } from "@/lib/courses/registerCover/pageWords";
import styles from "./AttendanceGrid.module.css";
import ParticipantNoteDrawer from "./ParticipantNoteDrawer";
import CheckInCard from "./register/CheckInCard";
import CoveringReportLink from "./register/CoveringReportLink";
import SessionSidePanel from "./register/SessionSidePanel";
import ReportLink from "./report/ReportLink";
import PushConfirm from "./PushConfirm";
import ColumnSheet from "./registerCorrection/ColumnSheet";
import LineSheet, { type LineSheetTarget } from "./registerCorrection/LineSheet";
import { registerEndingWords } from "./registerEndingWords";
import useAttendance, {
  type AttendanceLeaver,
  type AttendanceMark,
  type AttendanceMember,
  type AttendanceSession,
} from "./useAttendance";

/**
 * THE ATTENDANCE REGISTER: one group, every session so far, everyone in it.
 *
 * ── IT IS A REAL TABLE ──────────────────────────────────────────────────────
 * `<table>` with `<th scope="col">` sessions and `<th scope="row">` names,
 * because that is what it is: a screen reader announces "Ada Lovelace, Week 3,
 * Present" from the headers alone, and keyboard users get the table navigation
 * their software already provides. A grid of divs would need every one of
 * those behaviours reimplemented, badly.
 *
 * ── WHAT MOVES, AND WHAT NEVER DOES ─────────────────────────────────────────
 * Cell BACKGROUND and glyph SCALE animate. Row and column geometry NEVER does:
 * a register is read by scanning across a row and down a column, and a width
 * or height that animates drags every other cell out from under the eye that
 * is scanning it. Nothing here transitions width, height, padding or tracks.
 *
 * The glyph pops only where the FACILITATOR just acted (see `pop()`). Mounting
 * a half-marked register would otherwise fire thirty pops at once on load,
 * which reads as the page glitching rather than as feedback.
 *
 * ── THE FIVE-STATE TAP CYCLE ────────────────────────────────────────────────
 * unmarked, present, late, left-early, absent, excused, back to unmarked.
 * Present first because it is the overwhelmingly common answer and the whole
 * gesture is "tap everyone who came"; the rest in attended-most to
 * attended-least order, which is the order the rollup counts them in, so the
 * cycle reads as a slider rather than as a list. `null` is IN the cycle, not
 * an escape hatch beside it: a mis-tap must be undoable with more taps, never
 * with a modifier key or a second control.
 *
 * ── THE DRAFT / FINISHED BOUNDARY IS THE SHAPE OF THIS SCREEN ───────────────
 * A column is a draft until it is finished: "Finish the register" while next
 * week's email is on its schedule (finishing then emails nobody), "Push
 * attendance" while pushing still sends that email. Either locks it and
 * rebuilds every member's attendance record, so a finished column renders as
 * read-only for a facilitator and stays editable for an admin, whose every
 * change is logged. The confirm in front of the button (`PushConfirm`) names
 * who is emailed and how many, that the register locks, and how many people
 * are about to be counted absent for want of a mark. Who is emailed is the
 * route's answer for that register (`ending.pushEmails`), the one the push
 * acts on, never worked out here from the columns.
 *
 * ── EVERY TAP SAVES, AND SAYS SO ────────────────────────────────────────────
 * The status beside the legend reads "Saved 7:58pm" after each save, the time
 * of the last one in London, so a facilitator can see their register is safe
 * without finishing it. The foot under the grid is the register page's: the session
 * the button finishes, the button, and the words under it, every value read
 * off a record by the route (`registerEndingWords`).
 *
 * ── "CAN'T MAKE IT" ─────────────────────────────────────────────────────────
 * Somebody taking part can tell us, before a session starts, that they can't
 * make it, from their programme page. Their mark on that session's register
 * is then `excused`, and the register says so to whoever reads it: a line
 * over the table for each session that has not ended ("Tue 17 Nov: Kofi
 * Asante can't make it."), from the moment they say it, whether or not the
 * session is a column yet; and beside the mark, to a screen reader, that
 * the excused mark was their own word. A facilitator who taps the cell takes
 * the mark over, and the line goes with it.
 *
 * ── IN THE ROOM OR ONLINE ───────────────────────────────────────────────────
 * Beside every cell marked present, late or left early, the register keeps
 * where the person was: in the room (the faint screen, which a tap turns to
 * online) or online (the screen drawn whole). Its own small control in a slot
 * every markable cell keeps, so the mark under the facilitator's thumb never
 * moves when a tap gives it one. A mark that says somebody came is sent with
 * where they were: kept from the mark before, or, the first time, online for
 * somebody who said in advance they are joining online ("Joining online" on
 * their programme page), which a screen reader hears beside the cell. Any
 * other mark takes it away. A finished register shows it and moves it only
 * for whoever may correct one, on the same lane as a mark.
 *
 * ── MID-RUN JOINERS ─────────────────────────────────────────────────────────
 * Cells before a member's `joinedWeekNumber` are INERT: a dash, not an
 * unmarked cell, with an aria-label that says why. Rendering them as markable
 * would invite a register that says someone was absent from sessions that
 * happened before they existed to the group. The routes refuse those writes
 * too; this is the visible half of one rule.
 *
 * PII: names arrive as `displayName` and render through `MemberName`.
 * Participant notes live behind the drawer, never in a cell, and carry their
 * own disclosure line. There is no email address anywhere in this component's
 * data, by construction.
 */

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type AttendanceGridProps = {
  /** The group whose register this is. Everything else is server-derived. */
  groupId: string;
  /**
   * Accepted for symmetry with the review page's callsite and deliberately
   * unused: the register's run comes off the group document server-side, so a
   * run id in the URL can never disagree with the one the marks are stored
   * under.
   */
  runId?: string;
  /**
   * The session report page of this group, for a caller who writes one (a
   * live facilitator of the group, or whoever took that session's register
   * in a facilitator's place, which the register's read says per session):
   * from the start of the session the foot is about, finished or not, the
   * register leads on to its report, beside the check-in. Absent for anybody
   * else.
   */
  reportHref?: string;
  /**
   * The session the address names (`?session=w02`, as "Take the register"
   * and the email to somebody given a session write it): its column is
   * asked for, and the line about whose place is taken, the check-in and the
   * report are about it. Absent: the session the foot is about.
   */
  session?: string | null;
  /**
   * Where "It didn't happen" lives now, for the line that took the old
   * switch's place: "Change one week" on the group's own page under /learn,
   * or "It didn't happen" on its page under the programme, as the page that
   * draws the register says. Null for somebody given one session, who has no
   * way into the group's page.
   */
  didntHappen?: { href: string; words: string } | null;
  /**
   * Where the Requests page is, for the people who decide a request, where
   * the page drawing the register has a way there (the register under the
   * programme's group page); null elsewhere. One request's page is beneath it.
   */
  requestsBase?: string | null;
};

/** "w02" or "w02-2" as its week, or null. */
function weekOfKey(key: string | null | undefined): number | null {
  const match = key ? /^w(\d{2})(?:-\d)?$/.exec(key) : null;
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// The cycle
// ---------------------------------------------------------------------------

const CYCLE: Array<AttendanceStatus | null> = [
  "present",
  "late",
  "left-early",
  "absent",
  "excused",
  null,
];

function nextStatus(current: AttendanceStatus | null): AttendanceStatus | null {
  const i = CYCLE.indexOf(current);
  return CYCLE[(i + 1) % CYCLE.length];
}

/**
 * Tick and cross are read without a legend; the rest are lettered or arrowed
 * and decoded by the legend above the table. Colour is never the only signal:
 * each status has its own glyph as well as its own tone.
 */
const GLYPH: Record<AttendanceStatus, string> = {
  present: "✓",
  late: "L",
  "left-early": "↘",
  absent: "✕",
  excused: "E",
};

/**
 * An unmarked cell is not blank. A faint dot says "this is a control that has
 * not been used", which is the state a facilitator is scanning for; an empty
 * 44px square reads as a gap in the table instead.
 */
const UNMARKED_GLYPH = "·";

/**
 * Online, drawn as a screen: whole for somebody who joined online, faint for
 * somebody in the room (the choice a tap turns round). Decorative: every
 * cell and choice says where in words.
 */
function ScreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </svg>
  );
}

/** Shared empty list of people who left. Read only by contract. */
const NO_LEAVERS: AttendanceLeaver[] = [];

/** A session nobody has been marked at yet. Read only by contract. */
const NO_MARKS: Record<string, AttendanceStatus> = {};

/** No stamps, no covers, no facilitators: a register read before they were sent. Read only by contract. */
const NO_SET_BY: ReturnType<typeof useAttendance>["setBy"] = {};
const NO_COVERS: ReturnType<typeof useAttendance>["covers"] = {};
const NO_FACILITATORS: ReturnType<typeof useAttendance>["facilitators"] = [];
const NO_CORRECTIONS: ReturnType<typeof useAttendance>["corrections"] = {};
const NO_REQUESTS: ReturnType<typeof useAttendance>["requests"] = {};

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  present: styles.isPresent,
  late: styles.isLate,
  "left-early": styles.isLeftEarly,
  absent: styles.isAbsent,
  excused: styles.isExcused,
};

/** A beat over `--dur-settle` (260ms), so the pop class outlives its animation. */
const POP_MS = 320;

const NO_POPS: ReadonlySet<string> = new Set();

function cellKey(sessionKey: string, uid: string): string {
  return `${sessionKey} ${uid}`;
}

/** "Tue 6 Oct" from a civil date key, or "" when the session has no date. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function dateLabel(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  // Noon UTC: far enough from either boundary that no London offset can move
  // the civil date this label names.
  const at = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(at.getTime()) ? "" : DATE_FORMAT.format(at);
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

/**
 * Layout-matched to the real thing so arrival costs no reflow. One
 * announcement, not one per bar: `Skeleton`'s wrapper is its own live region,
 * so only the first carries a label.
 */
function GridSkeleton() {
  return (
    <div className={styles.skeleton}>
      <Skeleton
        width="100%"
        height="4.5rem"
        radius="var(--radius-md)"
        ariaLabel="Loading the attendance register…"
      />
      <Skeleton width="100%" height="2.75rem" radius="var(--radius-sm)" ariaLabel="" />
      <Skeleton width="100%" height="2.75rem" radius="var(--radius-sm)" ariaLabel="" />
      <Skeleton width="100%" height="2.75rem" radius="var(--radius-sm)" ariaLabel="" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The session note
// ---------------------------------------------------------------------------

/**
 * A note about the SESSION, not about any one person: "the projector died",
 * "we ran the second exercise as a whole group".
 *
 * It lives here rather than in its own file because it is one field and one
 * button, and it is deliberately NOT `ParticipantNoteDrawer`: that component
 * carries a disclosure line about personal data, which would be the wrong
 * thing to say about a note that names nobody. Two notes, two audiences, two
 * sentences.
 */
function SessionNoteDialog({
  session,
  onClose,
  onSave,
}: {
  session: AttendanceSession | null;
  onClose: () => void;
  onSave: (text: string, reason: string) => Promise<void>;
}) {
  // Seeded ONCE. The caller keys this component on the session, so pointing
  // it at a different one remounts it: no reseeding effect, and a reload
  // landing under an open dialog cannot wipe what is being typed.
  const [draft, setDraft] = useState(session?.notes ?? "");
  // A finished register's note is a correction, and every correction says why.
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;
  const finished = session.pushedAt !== null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim(), reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That note didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} ariaLabel="Note on this session">
      <div className={styles.dialog}>
        <h2 className={styles.dialogTitle}>
          Week {session.weekNumber}
          {session.occurrence > 1 ? `, session ${session.occurrence}` : ""}
        </h2>
        <p className={styles.dialogMeta}>
          About the session as a whole. For anything about a named person, use the
          note beside their cell instead.
        </p>
        <CountedTextarea
          value={draft}
          max={ATTENDANCE_LIMITS.notes}
          rows={5}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What a reader would need to know about this session later."
        />
        {finished && (
          <label className={styles.noteReason}>
            <span>{P.WHY_NEEDED}</span>
            <input
              type="text"
              className={styles.noteReasonInput}
              value={reason}
              maxLength={P.REASON_MAX}
              onChange={(e) => setReason(P.oneLine(e.target.value))}
            />
            <span className={styles.dialogMeta}>The register is finished, so this is a correction: the group’s history says that the note changed, never what it says.</span>
          </label>
        )}
        {error && (
          <p className={styles.error} role="status">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || (finished && !reason.trim())}>
            {busy ? "Saving..." : "Save note"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// AttendanceGrid
// ---------------------------------------------------------------------------

export default function AttendanceGrid({
  groupId,
  runId = undefined,
  reportHref,
  session: askedSession = null,
  didntHappen = null,
  requestsBase = null,
}: AttendanceGridProps) {
  const {
    group,
    sessions,
    members,
    notYetTold,
    leavers: givenLeavers,
    records,
    online,
    onlineSaid,
    participantNotes,
    canEditPushed,
    ending,
    cantMakeIt,
    setBy: givenSetBy,
    covers: givenCovers,
    facilitatorRecord,
    facilitators: givenFacilitators,
    caller: givenCaller,
    corrections: givenCorrections,
    requests: givenRequests,
    loading,
    error,
    reload,
    mark,
    edit,
    push,
    saveNote,
  } = useAttendance(groupId, { week: weekOfKey(askedSession) });
  const { toast, run: runAction, dismiss } = useActionToast();
  // Who left the group, read only. Read as none when the data behind the
  // register does not carry the list (a stand-in for the hook may not).
  const leavers = givenLeavers ?? NO_LEAVERS;
  // Who set each line, who covered, the facilitators and what the reader may
  // do: read as none when the data behind the register does not carry them
  // (a register read from before they were sent, or a stand-in for the hook).
  const setBy = givenSetBy ?? NO_SET_BY;
  const covers = givenCovers ?? NO_COVERS;
  const facilitators = givenFacilitators ?? NO_FACILITATORS;
  const caller = givenCaller ?? null;
  // Corrected lines and the asks about lines: none from a payload that did not send them.
  const corrections = givenCorrections ?? NO_CORRECTIONS;
  const requests = givenRequests ?? NO_REQUESTS;
  // WHO DOES WHAT ON A FINISHED REGISTER. Admins and the people leading the
  // programme correct it, a line or a whole column, with a reason. A
  // facilitator of the group asks for a correction from the line. Nobody
  // changes a finished register without saying why.
  const corrects = caller?.corrects === true;
  const asks = !corrects && caller?.standing === "facilitator";

  /** A save in flight, so the status can say "Saving…" while it is. */
  const [saving, setSaving] = useState(false);
  /** When the last save landed. The status reads it as "Saved 7:58pm". */
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /**
   * The route's OWN sentence for a refused single tap. A generic autosave
   * error ("your last change isn't stored") is right elsewhere and wrong here:
   * this register refuses in specifics, "Ada hadn't joined the group in week
   * 3", "This register has been pushed", and those sentences are the whole
   * reason the facilitator can fix it.
   */
  const [cellError, setCellError] = useState<string | null>(null);

  const [popped, setPopped] = useState<ReadonlySet<string>>(NO_POPS);
  /**
   * Every scheduled beat is registered so unmount cancels the lot. NOT effect
   * cleanup: two marks in quick succession would have the second run's cleanup
   * cancel the FIRST cell's timer (the `ReviewQueue` note, same fix).
   */
  const timersRef = useRef<Set<number>>(new Set());
  useEffect(
    () => () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current.clear();
    },
    [],
  );

  const pop = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setPopped((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      setPopped((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next.size === prev.size ? prev : next;
      });
    }, POP_MS);
    timersRef.current.add(timer);
  }, []);

  const statusOf = useCallback(
    (sessionKey: string, uid: string): AttendanceStatus | null =>
      records[sessionKey]?.[uid] ?? null,
    [records],
  );

  /** Where somebody marked as having come was, as the register keeps it: true online. */
  const onlineOf = useCallback(
    (sessionKey: string, uid: string): boolean =>
      cameBy(records[sessionKey]?.[uid]) && online?.[sessionKey]?.[uid] === true,
    [online, records],
  );
  /** Whether somebody said in advance they are joining this session online. */
  const saidOnline = useCallback(
    (sessionKey: string, uid: string): boolean => onlineSaid?.[sessionKey]?.includes(uid) ?? false,
    [onlineSaid],
  );
  /**
   * Where somebody marked as having come is to be, as the route decides it:
   * kept from a mark that already said they came, else their own word in
   * advance. Sent with every such mark, so the cell and the register agree.
   */
  const whereFor = useCallback(
    (sessionKey: string, uid: string, before: AttendanceStatus | null): boolean => {
      const kept = cameBy(before) ? online?.[sessionKey]?.[uid] : undefined;
      return typeof kept === "boolean" ? kept : saidOnline(sessionKey, uid);
    },
    [online, saidOnline],
  );

  /** Who told us in advance they can't make each session, by session key. */
  const toldInAdvance = useMemo(
    () => new Map((cantMakeIt ?? []).map((entry) => [entry.sessionKey, new Set(entry.uids)])),
    [cantMakeIt],
  );
  /** Whether this cell's excused mark is the person's own word, given in advance. */
  const toldUs = useCallback(
    (sessionKey: string, uid: string): boolean =>
      statusOf(sessionKey, uid) === "excused" && (toldInAdvance.get(sessionKey)?.has(uid) ?? false),
    [statusOf, toldInAdvance],
  );

  // ---- The session a dialog is pointed at ----------------------------------

  const [pushTarget, setPushTarget] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [resendTarget, setResendTarget] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [noteTarget, setNoteTarget] = useState<{ sessionKey: string; uid: string } | null>(
    null,
  );
  const [sessionNoteTarget, setSessionNoteTarget] = useState<string | null>(null);
  /** The finished line a sheet is open on: to ask, to correct, or to read its story. */
  const [lineTarget, setLineTarget] = useState<{ sessionKey: string; uid: string } | null>(null);
  /** The column whose correction sheet is open. */
  const [columnTarget, setColumnTarget] = useState<string | null>(null);

  const sessionByKey = useMemo(
    () => new Map(sessions.map((s) => [s.sessionKey, s])),
    [sessions],
  );
  const pushSession = pushTarget ? (sessionByKey.get(pushTarget) ?? null) : null;
  const resendSession = resendTarget ? (sessionByKey.get(resendTarget) ?? null) : null;
  const noteSession = noteTarget ? (sessionByKey.get(noteTarget.sessionKey) ?? null) : null;
  const noteMember = noteTarget
    ? (members.find((m) => m.uid === noteTarget.uid) ?? null)
    : null;
  const sessionNoteSession = sessionNoteTarget
    ? (sessionByKey.get(sessionNoteTarget) ?? null)
    : null;

  // ---- One tap -------------------------------------------------------------

  const onCycle = useCallback(
    async (session: AttendanceSession, member: AttendanceMember) => {
      const current = statusOf(session.sessionKey, member.uid);
      const next = nextStatus(current);
      setCellError(null);
      setSaving(true);
      pop([cellKey(session.sessionKey, member.uid)]);
      try {
        const marks: AttendanceMark[] = [
          {
            uid: member.uid,
            status: next,
            ...(cameBy(next) ? { online: whereFor(session.sessionKey, member.uid, current) } : {}),
          },
        ];
        // A finished register is never tapped: its line opens a sheet that
        // asks why (`LineSheet`), so this is a draft's tap and nothing else.
        if (session.pushedAt) return;
        await mark(session, marks);
        setSavedAt(new Date());
      } catch (e) {
        // The hook has already put the cell back; this is the sentence.
        setCellError(e instanceof Error ? e.message : "That didn't go through.");
      } finally {
        setSaving(false);
      }
    },
    [mark, pop, statusOf, whereFor],
  );

  // ---- In the room or online ----------------------------------------------

  /**
   * The other place, for somebody marked as having come: the same mark, sent
   * with where they were turned round. A draft's only: on a finished register
   * where somebody was is corrected in the line's sheet, with a reason.
   */
  const onWhere = useCallback(
    async (session: AttendanceSession, member: AttendanceMember) => {
      const current = statusOf(session.sessionKey, member.uid);
      if (!cameBy(current)) return;
      setCellError(null);
      setSaving(true);
      try {
        const marks: AttendanceMark[] = [{ uid: member.uid, status: current, online: !onlineOf(session.sessionKey, member.uid) }];
        if (session.pushedAt) return;
        await mark(session, marks);
        setSavedAt(new Date());
      } catch (e) {
        setCellError(e instanceof Error ? e.message : "That didn't go through.");
      } finally {
        setSaving(false);
      }
    },
    [mark, onlineOf, statusOf],
  );

  // ---- A whole column ------------------------------------------------------

  /**
   * "Mark the rest present": the bulk gesture a facilitator actually wants
   * after a session, since everyone who has not been given a status yet was
   * there.
   *
   * It never overwrites an EXISTING mark. A recorded absence is a considered
   * statement about a person, and a bulk button that could erase one would
   * make the register untrustworthy for exactly the cases it matters in.
   */
  const remainingFor = useCallback(
    (session: AttendanceSession): AttendanceMark[] =>
      members
        .filter(
          (m) =>
            session.weekNumber >= m.joinedWeekNumber &&
            statusOf(session.sessionKey, m.uid) === null,
        )
        .map((m) => ({ uid: m.uid, status: "present" as const, online: saidOnline(session.sessionKey, m.uid) })),
    [members, saidOnline, statusOf],
  );

  const onBulk = useCallback(
    (session: AttendanceSession) => {
      const targets = remainingFor(session);
      if (targets.length === 0) return;
      setCellError(null);
      pop(targets.map((t) => cellKey(session.sessionKey, t.uid)));
      void runAction(
        async () => {
          await mark(session, targets);
          setSavedAt(new Date());
        },
        {
          savingMessage: `Marking ${targets.length} present…`,
          successMessage: `Week ${session.weekNumber}: ${targets.length} marked present.`,
        },
      );
    },
    [mark, pop, remainingFor, runAction],
  );

  // ---- The session's own switches ------------------------------------------

  const onToggleHeld = useCallback(
    (session: AttendanceSession) => {
      const next = !session.held;
      setCellError(null);
      void runAction(
        async () => {
          // A draft's way back only: whether a finished session happened is
          // the column's correction, which asks why.
          if (session.pushedAt) return;
          await mark(session, [], { held: next });
          setSavedAt(new Date());
        },
        {
          savingMessage: next ? "Marking the session as held…" : "Marking the session as not held…",
          successMessage: next
            ? `Week ${session.weekNumber} counts in everyone's attendance again.`
            : `Week ${session.weekNumber} is out of everyone's attendance: it did not happen.`,
        },
      );
    },
    [mark, runAction],
  );

  const onSessionNote = useCallback(
    async (session: AttendanceSession, text: string, reason: string) => {
      setCellError(null);
      // A finished register's note is an admin's correction, and asks why.
      if (session.pushedAt) await edit(session, [], { notes: text }, reason);
      else await mark(session, [], { notes: text });
      setSavedAt(new Date());
    },
    [edit, mark],
  );

  /** A sheet's press went through: say so, and read the register again. */
  const onSheetDone = useCallback(
    (said: string) => {
      setLineTarget(null);
      setColumnTarget(null);
      setCellError(null);
      reload();
      void runAction(async () => undefined, { savingMessage: said, successMessage: said });
    },
    [reload, runAction],
  );

  // ---- Finishing -----------------------------------------------------------

  const onPush = useCallback(async (facilitatorsHere?: string[]) => {
    if (!pushSession) return;
    setPushing(true);
    setCellError(null);
    try {
      const result = await push(pushSession, facilitatorsHere ? { facilitatorsHere } : undefined);
      setPushTarget(null);
      // Reported through the toast rather than inline: this is the one action
      // on the page that must not be continued past without being read.
      void runAction(async () => undefined, {
        savingMessage: result.scheduled ? "Finishing…" : "Pushing…",
        successMessage: result.scheduled
          ? result.alreadyPushed
            ? "That register was already finished, so nothing changed."
            : "Register finished. Everyone can see their mark, and nobody was emailed."
          : result.alreadyPushed
            ? "That register was already pushed, so nothing was sent again."
            : result.sent > 0
              ? `Register locked. ${result.sent} ${result.sent === 1 ? "person" : "people"} emailed about the next session.`
              : `Register locked. ${result.reason ?? "No email was sent."}`,
      });
    } catch (e) {
      setCellError(e instanceof Error ? e.message : "The push didn't go through.");
    } finally {
      setPushing(false);
    }
  }, [push, pushSession, runAction]);

  // ---- The admin's resend --------------------------------------------------

  /**
   * A push that locked the register and then failed to mail the group leaves
   * no lane a facilitator can use: the marker is claimed, so pressing Push
   * again reports "already pushed" and sends nothing. Before this button the
   * only recovery was the run-wide catch-up, which mails every OTHER group of
   * the run a second time.
   *
   * Admin only (the route refuses anyone else), behind a confirm, and every
   * press is recorded on the marker as a force.
   */
  const onResend = useCallback(async () => {
    if (!resendSession) return;
    setResending(true);
    setCellError(null);
    try {
      const result = await push(resendSession, { force: true });
      setResendTarget(null);
      void runAction(async () => undefined, {
        savingMessage: "Re-sending…",
        successMessage:
          result.sent > 0
            ? `${result.sent} ${result.sent === 1 ? "person" : "people"} emailed again about the next session.`
            : (result.reason ?? "No email was sent."),
      });
    } catch (e) {
      setCellError(e instanceof Error ? e.message : "The resend didn't go through.");
    } finally {
      setResending(false);
    }
  }, [push, resendSession, runAction]);

  // ---- Per-column tallies --------------------------------------------------

  /**
   * `marked / eligible` per session, where eligible excludes anyone who had
   * not joined yet: the same scoping the cells use, so the fraction can always
   * reach its denominator.
   */
  const tallies = useMemo(() => {
    const map = new Map<string, { marked: number; eligible: number }>();
    for (const session of sessions) {
      let marked = 0;
      let eligible = 0;
      for (const member of members) {
        if (session.weekNumber < member.joinedWeekNumber) continue;
        eligible += 1;
        if (statusOf(session.sessionKey, member.uid) !== null) marked += 1;
      }
      map.set(session.sessionKey, { marked, eligible });
    }
    return map;
  }, [sessions, members, statusOf]);

  // ---- States --------------------------------------------------------------

  const hasGrid = members.length > 0 || leavers.length > 0 || sessions.length > 0;

  if (loading && !hasGrid) return <GridSkeleton />;

  if (error && !hasGrid) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{error.message}</p>
        <div>
          <Button variant="secondary" size="sm" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (members.length === 0 && leavers.length === 0) {
    // Somebody is placed here and has not been told their group yet, so the
    // register has no row for them until Publish emails them. The roster
    // above it on the group page already says when the names come, and a
    // register of nobody would only say it again.
    if (notYetTold) return null;
    return (
      <EmptyState
        title="Nobody is in this group yet."
        body="Once allocation places members here, the register fills in a column per session."
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="This run has no taught weeks yet."
        body="Add weeks to the run's plan and the register will follow the cohort."
      />
    );
  }

  // "Tue 17 Nov: Kofi Asante can't make it.", for each session that has not
  // ended. On a column, only while the mark is still the person's excused: a
  // facilitator's tap takes it over.
  const columnKeys = new Set(sessions.map((session) => session.sessionKey));
  const cantMakeItLines = (cantMakeIt ?? [])
    .filter((entry) => !entry.ended)
    .map((entry) => {
      const names = members
        .filter((member) => entry.uids.includes(member.uid))
        .filter((member) => !columnKeys.has(entry.sessionKey) || toldUs(entry.sessionKey, member.uid))
        .map((member) => member.displayName);
      return { key: entry.sessionKey, words: names.length > 0 ? registerCantMakeItLine(dateLabel(entry.dateKey), names) : "" };
    })
    .filter((line) => line.words !== "");

  const pushTally = pushSession
    ? (tallies.get(pushSession.sessionKey) ?? { marked: 0, eligible: 0 })
    : { marked: 0, eligible: 0 };
  // What pressing it emails, as the route answered for this register. Never
  // the next column: the columns are only the sessions that have started.
  const pushEmail = pushSession ? (ending?.pushEmails?.[pushSession.sessionKey] ?? null) : null;

  // How this register ends: which button, and the words under it. While the
  // payload has not said, the page says what it always has.
  const scheduled = ending?.scheduled === true;
  const words = ending ? registerEndingWords(ending) : null;
  const focus = ending?.focus ?? null;
  const focusSession = focus ? (sessionByKey.get(focus.sessionKey) ?? null) : null;

  // THE SESSION THE PANELS ARE ABOUT: the one the address names when it is a
  // column, else the one the foot finishes. Whose place is taken, the
  // check-in and the report are about it.
  const panelKey = askedSession && sessionByKey.has(askedSession) ? askedSession : (focus?.sessionKey ?? null);
  const panelSession = panelKey ? (sessionByKey.get(panelKey) ?? null) : null;
  const panelAccess = panelKey && caller ? (caller.sessions[panelKey] ?? null) : null;
  const panelCover = panelKey ? (covers[panelKey] ?? null) : null;
  // The register's notes are its facilitators' and admins': nobody else is
  // offered a box to write one. A payload from before the reader was said
  // reads as today's.
  const readsNotes = caller ? caller.readsNotes : true;
  const facilitates = caller ? caller.facilitates : true;
  const place =
    caller && panelSession
      ? placeLine({
          cover: panelCover,
          facilitators,
          readerFacilitates: facilitates,
          facilitatorStarted: panelSession.facilitatorStarted,
          finished: panelSession.pushedAt !== null,
        })
      : null;
  // The report: a facilitator's own, as before, or whoever took this
  // session's register in a facilitator's place, labelled so.
  const writesReport = panelAccess ? panelAccess.reports : Boolean(reportHref);
  const reportFor = panelSession && reportHref && writesReport && panelSession.held ? panelSession : null;
  // The side panel about the session, for an admin and the programme's lead.
  const side = Boolean(caller?.readsFacilitatorRecord && panelSession);
  // Finish's check: what the register says, and in a group with more than one
  // facilitator, which of them were here, ticked by the facilitator finishing.
  const summary = pushSession ? finishSummary(members, pushSession.weekNumber, records[pushSession.sessionKey] ?? NO_MARKS, online?.[pushSession.sessionKey] ?? {}) : [];
  const hereChoices = caller?.facilitates && facilitators.length > 1 ? facilitators : null;
  // Where It didn't happen lives now, said where the switch was.
  const movedLine = didntHappen && caller && caller.standing !== "given" ? didntHappen : null;
  const hasDraft = sessions.some((each) => each.pushedAt === null && each.held);

  // The line a sheet is open on, with everything the register says about it.
  const lineSheet = (() => {
    if (!lineTarget) return null;
    const on = sessionByKey.get(lineTarget.sessionKey);
    const member = members.find((each) => each.uid === lineTarget.uid);
    if (!on || !member) return null;
    const target: LineSheetTarget = {
      person: { uid: member.uid, name: member.displayName },
      session: { weekNumber: on.weekNumber, occurrence: on.occurrence, dateKey: on.dateKey },
      line: { status: statusOf(on.sessionKey, member.uid), online: onlineOf(on.sessionKey, member.uid) },
      setBy: setBy[on.sessionKey]?.[member.uid] ?? null,
      story: corrections[on.sessionKey]?.[member.uid] ?? null,
      request: requests[on.sessionKey]?.[member.uid] ?? null,
    };
    return { sessionKey: on.sessionKey, target };
  })();
  const columnSession = columnTarget ? (sessionByKey.get(columnTarget) ?? null) : null;
  const sessionLabelOf = (key: string) => {
    const on = sessionByKey.get(key);
    return on ? `week ${on.weekNumber}${on.occurrence > 1 ? `, session ${on.occurrence}` : ""}` : "another week";
  };

  const checkIn = panelKey ? <CheckInCard groupId={groupId} sessionKey={panelKey} marks={records[panelKey] ?? NO_MARKS} /> : null;
  const report = reportFor ? (
    <div data-testid="register-report">
      {facilitates ? (
        <ReportLink href={reportHref ?? ""} sessionKey={reportFor.sessionKey} />
      ) : (
        <CoveringReportLink href={reportHref ?? ""} sessionKey={reportFor.sessionKey} covering={panelCover?.covering ?? []} />
      )}
    </div>
  ) : null;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <ul className={styles.legend}>
          {CYCLE.filter((s): s is AttendanceStatus => s !== null).map((status) => (
            <li key={status} className={styles.legendItem}>
              <span
                className={`${styles.legendGlyph} ${STATUS_CLASS[status]}`}
                aria-hidden="true"
              >
                {GLYPH[status]}
              </span>
              {ATTENDANCE_STATUS_LABEL[status]}
            </li>
          ))}
          <li className={styles.legendItem}>
            <span className={styles.legendGlyph} aria-hidden="true">
              {UNMARKED_GLYPH}
            </span>
            Not marked
          </li>
          <li className={styles.legendItem}>
            <span className={`${styles.legendGlyph} ${styles.whereOnline}`} aria-hidden="true">
              <ScreenIcon />
            </span>
            {ONLINE_WORD}
          </li>
        </ul>

        <div className={styles.toolbarEnd}>
          {/* Every tap saves. Present from the first render so a screen reader
              hears the change rather than a new region appearing. */}
          <span className={styles.saved} role="status" aria-live="polite">
            {saving ? (
              "Saving…"
            ) : savedAt ? (
              <>
                <span className={styles.savedCheck} aria-hidden="true">
                  ✓
                </span>
                Saved {londonClockLabel(savedAt)}
              </>
            ) : null}
          </span>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* One line for both kinds of trouble: a refused mark (the route's own
          sentence) and a refresh that failed on top of a grid that already
          loaded. The refusal wins: it is the newer thing, and it is the one
          the facilitator caused. */}
      {(cellError || error) && (
        <p className={styles.error} role="status">
          {cellError ?? error?.message}
        </p>
      )}

      {/* Who told us in advance they can't make a session still to come. */}
      {cantMakeItLines.length > 0 && (
        <div className={styles.cantMakeIt}>
          {cantMakeItLines.map((line) => (
            <p key={line.key} className={styles.cantMakeItLine}>
              {line.words}
            </p>
          ))}
        </div>
      )}

      {/* Whose place is taken, for the session the panels are about: said
          before anybody taps, and to a facilitator who arrives late. */}
      {place && (
        <p className={styles.placeLine} data-testid="register-place">
          {place}
        </p>
      )}

      <div className={side ? styles.withSide : styles.alone}>
      {/* The register's OWN scroller. Never `.mainWide`: a wide data view
          handles its own overflow, and
          the `min-width: 0` chain below is what keeps this table scrolling
          inside itself instead of widening the shell and orphaning the
          sidebar. The height bound is what gives the sticky header something
          to stick to: a container that cannot scroll vertically has no sticky
          to offer. */}
      <div className={styles.scroll}>
        {/* The test ids from here down are addressed by the browser end-to-end
            suite. They are on the TABLE and on repeated controls rather than on
            each cell: a cell belongs to a member and a session, and an id per
            cell would have to be built from both, which the suite's own guard
            refuses. The spec scopes a row and then counts columns instead. */}
        <table className={styles.table} data-testid="attendance-grid">
          <caption className={styles.caption}>
            Attendance for {group?.name || "this group"}: {members.length}{" "}
            {members.length === 1 ? "member" : "members"}, {sessions.length}{" "}
            {sessions.length === 1 ? "session" : "sessions"} so far. Each cell cycles
            through present, late, left early, absent, excused and back to not marked.
            A finished register is locked.
            {leavers.length > 0 &&
              ` ${leavers.length === 1 ? "1 person" : `${leavers.length} people`} who left the group ${
                leavers.length === 1 ? "is" : "are"
              } listed last, read only, with the marks they had.`}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${styles.head} ${styles.corner}`}>
                Member
              </th>
              {sessions.map((session) => {
                const tally = tallies.get(session.sessionKey) ?? {
                  marked: 0,
                  eligible: 0,
                };
                const remaining = tally.eligible - tally.marked;
                const pushed = session.pushedAt !== null;
                // Three states, because "nothing to do" has two very different
                // reasons: everyone is marked, or nobody had joined the group
                // that week. A column of joiners-to-be must not read as done.
                const bulkLabel =
                  tally.eligible === 0
                    ? "Nobody yet"
                    : remaining === 0
                      ? "All marked"
                      : `Rest present (${remaining})`;
                const when = dateLabel(session.dateKey);
                return (
                  <th
                    key={session.sessionKey}
                    scope="col"
                    data-testid="attendance-session"
                    className={`${styles.head} ${styles.weekHead} ${
                      pushed ? styles.headPushed : ""
                    }`}
                  >
                    <span className={styles.weekLabel}>
                      Week {session.weekNumber}
                      {session.occurrence > 1 ? ` (${session.occurrence})` : ""}
                    </span>
                    {when && <span className={styles.weekDate}>{when}</span>}
                    {session.title && (
                      <span className={styles.weekTitle}>{session.title}</span>
                    )}
                    <span className={styles.tally}>
                      {tally.marked}/{tally.eligible}
                    </span>

                    {!session.held && (
                      <span className={styles.notHeld}>Not held</span>
                    )}

                    {pushed && (
                      <span className={styles.pushed}>{scheduled ? "Finished" : "Pushed"}</span>
                    )}

                    {/* The bulk gesture and the push itself belong to the
                        DRAFT column only: one is how a facilitator finishes
                        marking, the other is the act of finishing. */}
                    {!pushed && (
                      <button
                        type="button"
                        className={styles.bulk}
                        data-testid="attendance-bulk"
                        onClick={() => onBulk(session)}
                        disabled={remaining === 0 || !session.held}
                        aria-label={
                          remaining === 0
                            ? `Week ${session.weekNumber}: ${bulkLabel}`
                            : `Mark the remaining ${remaining} present in week ${session.weekNumber}`
                        }
                      >
                        {bulkLabel}
                      </button>
                    )}

                    {/* "It didn't happen" lives with the two cancels on the
                        group's page now (the line under the register says
                        where). A draft that already says it did not happen
                        keeps the way back for whoever does not correct
                        registers. For the people who do, a finished column,
                        or one that says it didn't happen, opens the column's
                        correction instead, which asks why. */}
                    {corrects && (pushed || !session.held) && (
                      <button
                        type="button"
                        className={styles.bulk}
                        data-testid="attendance-column-correct"
                        onClick={() => setColumnTarget(session.sessionKey)}
                      >
                        {session.held ? P.correctColumnWords(session.weekNumber) : P.didHappenWords(session.weekNumber)}
                      </button>
                    )}
                    {!corrects && !pushed && !session.held && (
                      <button
                        type="button"
                        className={styles.bulk}
                        data-testid="attendance-held-toggle"
                        onClick={() => onToggleHeld(session)}
                        aria-label={
                          session.held
                            ? `Mark week ${session.weekNumber} as not held`
                            : `Mark week ${session.weekNumber} as held after all`
                        }
                      >
                        {session.held ? "Didn't happen" : "It did happen"}
                      </button>
                    )}
                    {/* The session note, for the people its notes are written for:
                        on a finished register an admin's, which asks why. */}
                    {(!pushed || canEditPushed) && readsNotes && (
                      <button
                        type="button"
                        className={styles.bulk}
                        onClick={() => setSessionNoteTarget(session.sessionKey)}
                        aria-label={`Note on week ${session.weekNumber} as a whole`}
                      >
                        {session.notes ? "Session note ✓" : "Session note"}
                      </button>
                    )}

                    {!pushed && (
                      <button
                        type="button"
                        className={`${styles.bulk} ${styles.pushButton}`}
                        data-testid="attendance-push"
                        onClick={() => setPushTarget(session.sessionKey)}
                        aria-label={
                          scheduled
                            ? `Finish the week ${session.weekNumber} register, which locks it and shows everyone their mark`
                            : `Push the week ${session.weekNumber} register, which locks it and emails the group`
                        }
                      >
                        {words?.columnButton ?? "Push"}
                      </button>
                    )}

                    {/* The recovery lane for the week's email when it failed
                        after it was claimed. Admin only, and it reaches THIS
                        group alone. */}
                    {pushed && canEditPushed && (
                      <button
                        type="button"
                        className={styles.bulk}
                        data-testid="attendance-resend"
                        onClick={() => setResendTarget(session.sessionKey)}
                        aria-label={`Send this group the email after week ${session.weekNumber} again`}
                      >
                        Resend the week’s email
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.uid}>
                <th scope="row" className={styles.nameCell}>
                  <MemberName name={member.displayName} />
                </th>
                {sessions.map((session) => {
                  const notYet = session.weekNumber < member.joinedWeekNumber;
                  const status = statusOf(session.sessionKey, member.uid);
                  const key = cellKey(session.sessionKey, member.uid);
                  const hasNote = Boolean(
                    participantNotes[session.sessionKey]?.[member.uid],
                  );

                  // INERT, not unmarked: see the mid-run joiner note above. A
                  // stored status here can only come from a `joinedWeekNumber`
                  // edited after the fact; it is shown rather than hidden, and
                  // stays uneditable.
                  if (notYet) {
                    return (
                      <td key={key} className={styles.cell}>
                        <span
                          className={styles.notYet}
                          role="img"
                          aria-label={`Not in the group yet: joined in week ${member.joinedWeekNumber}${
                            status ? `, recorded ${ATTENDANCE_STATUS_LABEL[status]}` : ""
                          }`}
                        >
                          {status ? GLYPH[status] : "—"}
                        </span>
                      </td>
                    );
                  }

                  // A FINISHED register is never tapped through. Its line
                  // opens a sheet: to correct it with a reason (admins and
                  // the people leading the programme), to ask for a
                  // correction (its facilitators), or to read what became of
                  // it. With nothing to do or read, the lock is a fact about
                  // the document, rendered as a fact rather than as a
                  // disabled button nobody can explain.
                  const finished = session.pushedAt !== null;
                  const story = corrections[session.sessionKey]?.[member.uid] ?? null;
                  const asked = requests[session.sessionKey]?.[member.uid] ?? null;
                  const opens = finished && session.held && (corrects || asks || story !== null || asked !== null);
                  const locked = finished && !opens;
                  const chip = finished ? P.cellChip({ corrected: story !== null, request: asked }) : "";
                  const next = nextStatus(status);
                  // Where they were, beside a mark that says they came; and
                  // their own word in advance, beside a cell not marked yet.
                  const came = cameBy(status);
                  const isOnline = onlineOf(session.sessionKey, member.uid);
                  const said = saidOnline(session.sessionKey, member.uid);
                  // Who set this line and when, beside it: a register written
                  // before lines were stamped says nothing here.
                  const stamp = setBy[session.sessionKey]?.[member.uid] ?? null;
                  const stampWords = stamp ? setByWords(stamp) : "";
                  const besides = `${toldUs(session.sessionKey, member.uid) ? ` ${TOLD_IN_ADVANCE}` : ""}${
                    isOnline ? ` ${JOINED_ONLINE}` : ""
                  }${said && !came ? ` ${SAID_ONLINE_IN_ADVANCE}` : ""}`;
                  return (
                    <td key={key} className={styles.cell}>
                      <div className={styles.cellStack}>
                        {opens ? (
                          <button
                            type="button"
                            className={`${styles.cellButton} ${
                              status ? STATUS_CLASS[status] : styles.isUnmarked
                            }`}
                            data-testid="attendance-cell"
                            aria-haspopup="dialog"
                            aria-label={`${member.displayName}, week ${session.weekNumber}: ${
                              status ? ATTENDANCE_STATUS_LABEL[status] : "not marked"
                            }.${besides}${chip ? ` ${chip}.` : ""} ${
                              corrects ? "Correct this line." : asks && asked?.state !== "waiting" ? "Ask for a correction." : "What happened to this line."
                            }`}
                            onClick={() => setLineTarget({ sessionKey: session.sessionKey, uid: member.uid })}
                          >
                            <span className={styles.glyph} aria-hidden="true">
                              {status ? GLYPH[status] : UNMARKED_GLYPH}
                            </span>
                          </button>
                        ) : locked ? (
                          <span
                            className={`${styles.cellButton} ${styles.cellLocked} ${
                              status ? STATUS_CLASS[status] : styles.isUnmarked
                            }`}
                            data-testid="attendance-cell"
                            role="img"
                            aria-label={`${member.displayName}, week ${session.weekNumber}: ${
                              status ? ATTENDANCE_STATUS_LABEL[status] : "not marked"
                            }.${besides} This register is finished and locked.`}
                          >
                            {status ? GLYPH[status] : UNMARKED_GLYPH}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.cellButton} ${
                              status ? STATUS_CLASS[status] : styles.isUnmarked
                            }`}
                            data-testid="attendance-cell"
                            aria-pressed={status !== null}
                            aria-label={`${member.displayName}, week ${session.weekNumber}: ${
                              status ? ATTENDANCE_STATUS_LABEL[status] : "not marked"
                            }.${besides} Sets ${
                              next ? ATTENDANCE_STATUS_LABEL[next] : "not marked"
                            }.`}
                            onClick={() => void onCycle(session, member)}
                          >
                            {/* Keyed by status so a change REMOUNTS the glyph:
                                the pop animation then runs exactly once per
                                change, and only when this cell is in `popped`
                                (i.e. the facilitator did it, never on load). */}
                            <span
                              key={status ?? "none"}
                              className={`${styles.glyph} ${
                                popped.has(key) ? styles.glyphPop : ""
                              }`}
                              aria-hidden="true"
                            >
                              {status ? GLYPH[status] : UNMARKED_GLYPH}
                            </span>
                          </button>
                        )}
                        {/* In the room or online: a slot every markable cell
                            keeps, so the mark never moves when a tap gives it
                            a control; the control only beside a mark that
                            says they came, and drawn alone, read only, on a
                            finished register for anybody who cannot correct it. */}
                        {came && !finished ? (
                          <button
                            type="button"
                            className={`${styles.where} ${isOnline ? styles.whereOnline : ""}`}
                            aria-pressed={isOnline}
                            aria-label={whereChoiceLabel(member.displayName, session.weekNumber, isOnline)}
                            onClick={() => void onWhere(session, member)}
                          >
                            <ScreenIcon />
                          </button>
                        ) : came && isOnline ? (
                          <span className={`${styles.where} ${styles.whereOnline} ${styles.whereStatic}`} aria-hidden="true">
                            <ScreenIcon />
                          </span>
                        ) : (
                          <span className={styles.whereSlot} aria-hidden="true" />
                        )}
                        {readsNotes && (
                          <button
                            type="button"
                            className={`${styles.noteDot} ${hasNote ? styles.noteDotSet : ""}`}
                            data-testid="attendance-note-open"
                            onClick={() =>
                              setNoteTarget({
                                sessionKey: session.sessionKey,
                                uid: member.uid,
                              })
                            }
                            aria-label={`${hasNote ? "Read or edit the" : "Add a"} private note on ${member.displayName} for week ${session.weekNumber}`}
                          >
                            <span aria-hidden="true">{hasNote ? "✎" : "+"}</span>
                          </button>
                        )}
                      </div>
                      {/* Read as the cell's own text, after its control: the
                          control's name stays the mark and what a tap sets. */}
                      {stampWords && (
                        <span className={styles.setBy} data-testid="attendance-set-by">
                          {stampWords}
                        </span>
                      )}
                      {chip && (
                        <span className={`${styles.lineChip} ${chip === P.ASKED ? styles.lineChipWaiting : ""}`} data-testid="attendance-line-chip">
                          {chip}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* SOMEBODY WHO LEFT THE GROUP (as the facilitator's group page shows "Sam Whitfield,
                Left Fri 13 Nov"), as the lead's Attendance tab lists them:
                read only, with the marks they had. Their cells are never
                buttons, they count in no tally above, and a session after
                they left is blank, so nothing here chases them. */}
            {leavers.map((leaver, index) => (
              <tr
                key={`left-${leaver.uid}`}
                className={index === 0 ? `${styles.leaverRow} ${styles.leaverFirst}` : styles.leaverRow}
              >
                <th scope="row" className={styles.nameCell}>
                  <span className={styles.leaverName}>
                    <MemberName name={leaver.displayName} />
                  </span>
                  <span className={styles.leftNote}>{leaver.left}</span>
                </th>
                {sessions.map((session) => {
                  const status = leaver.records[session.sessionKey] ?? null;
                  const key = cellKey(session.sessionKey, leaver.uid);
                  // The sessions they joined online, with the marks they had.
                  const leftOnline = cameBy(status) && (leaver.online ?? []).includes(session.sessionKey);
                  return (
                    <td key={key} className={styles.cell}>
                      {status ? (
                        <span className={styles.cellStack}>
                          <span
                            className={`${styles.cellButton} ${styles.cellLocked} ${STATUS_CLASS[status]}`}
                            role="img"
                            aria-label={`${leaver.displayName}, week ${session.weekNumber}: ${ATTENDANCE_STATUS_LABEL[status]}.${
                              leftOnline ? ` ${JOINED_ONLINE}` : ""
                            } ${leaver.left}.`}
                          >
                            {GLYPH[status]}
                          </span>
                          {leftOnline && (
                            <span className={`${styles.where} ${styles.whereOnline} ${styles.whereStatic}`} aria-hidden="true">
                              <ScreenIcon />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span
                          className={styles.leftBlank}
                          role="img"
                          aria-label={`${leaver.displayName}, week ${session.weekNumber}: no mark. ${leaver.left}.`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* THE SIDE PANEL about the session, for an admin and the programme's
          lead: who took it, whether each facilitator was there, the
          reminders, and the check-in and report, which sit here for them. */}
      {side && panelSession && (
        <SessionSidePanel
          groupId={groupId}
          session={panelSession}
          cover={panelCover}
          record={facilitatorRecord?.[panelSession.sessionKey] ?? []}
          facilitators={facilitators}
          onChanged={reload}
          checkIn={checkIn}
          report={report}
        />
      )}
      </div>

      {/* THE CHECK-IN for the session the panels are about: its own card,
          with its own route, which answers the group's facilitators, admins
          and whoever took that session's register (a lead who has not taken
          it is shown nothing). */}
      {!side && checkIn}

      {/* THE SESSION REPORT, beside the check-in: from the session's start,
          whether or not its register is finished, and still there once it
          is, so a facilitator can write it while the room answers the
          check-in. Only for a caller who writes one (a facilitator, or
          whoever took the session's register), and only for a session that
          happened. */}
      {!side && report}

      {/* THE FOOT: the register page's ending. The session the button finishes, the
          button, and the words under it, every value read off a record by the
          route. Once there is nothing left to finish it says so instead. */}
      {ending && focus && words && (
        <section
          className={styles.foot}
          aria-labelledby="register-foot-title"
          data-testid="register-ending"
        >
          <div className={styles.footHead}>
            <h3 id="register-foot-title" className={styles.footTitle}>
              Week {focus.weekNumber}
              {focus.occurrence > 1 ? `, session ${focus.occurrence}` : ""} register
            </h3>
            {focus.line && <p className={styles.footLine}>{focus.line}</p>}
          </div>
          {!focus.finished && focusSession && (
            <div className={styles.footAction}>
              <button
                type="button"
                className={styles.finishButton}
                onClick={() => setPushTarget(focusSession.sessionKey)}
              >
                {words.button}
              </button>
              <p className={styles.footEffect}>{words.effect}</p>
            </div>
          )}
          {words.notes.length > 0 && (
            <div className={styles.footNotes}>
              {words.notes.map((note) => (
                <p key={note} className={styles.footNote}>
                  {note}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Where the old "Didn't happen" switch was: one line saying where the
          two cancels live now. */}
      {movedLine && hasDraft && (
        <p className={styles.movedLine} data-testid="register-didnt-happen">
          {movedLine.words}{" "}
          <Link href={movedLine.href} className={styles.movedLink}>
            {OPEN_THE_GROUPS_PAGE}
          </Link>
        </p>
      )}

      <PushConfirm
        key={pushSession?.sessionKey ?? "no-push"}
        open={pushSession !== null}
        onClose={() => setPushTarget(null)}
        onConfirm={(here) => void onPush(here)}
        busy={pushing}
        session={pushSession}
        groupName={group?.name ?? ""}
        eligible={pushTally.eligible}
        unmarked={Math.max(0, pushTally.eligible - pushTally.marked)}
        email={pushEmail}
        scheduled={scheduled}
        summary={summary}
        hereChoices={hereChoices}
      />

      {resendSession && (
        <Modal
          open
          onClose={() => setResendTarget(null)}
          ariaLabel="Re-send this group's email"
          width="sm"
        >
          <div className={styles.dialog}>
            <h2 className={styles.dialogTitle}>
              Re-send the week’s email after week{" "}
              {resendSession.weekNumber}
              {resendSession.occurrence > 1 ? `, session ${resendSession.occurrence}` : ""}?
            </h2>
            <p className={styles.dialogMeta}>
              {scheduled
                ? "Use it when the week’s email went out on its schedule and failed: "
                : "This group has already been sent (or claimed) this email. Use it when the push locked the register but the email failed: "}
              everyone in {group?.name || "this group"} gets the message again, and nobody
              outside the group is emailed. The re-send is recorded against your name.
              {scheduled ? " An email that hasn’t gone yet isn’t sent early." : ""}
            </p>
            <div className={styles.dialogActions}>
              <Button
                variant="secondary"
                onClick={() => setResendTarget(null)}
                disabled={resending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void onResend()}
                disabled={resending}
                data-testid="attendance-resend-confirm"
              >
                {resending ? "Re-sending..." : "Re-send the email"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <SessionNoteDialog
        key={sessionNoteSession?.sessionKey ?? "no-session-note"}
        session={sessionNoteSession}
        onClose={() => setSessionNoteTarget(null)}
        onSave={async (text, reason) => {
          if (sessionNoteSession) await onSessionNote(sessionNoteSession, text, reason);
        }}
      />

      {/* ONE LINE OF A FINISHED REGISTER: correct it, ask for a correction,
          or read what became of it. Mounted only while open, so each line
          starts with nothing chosen. */}
      {lineSheet && (
        <LineSheet
          key={`${lineSheet.sessionKey} ${lineSheet.target.person.uid}`}
          open
          onClose={() => setLineTarget(null)}
          groupId={groupId}
          mode={corrects ? "correct" : asks ? "ask" : "read"}
          target={lineSheet.target}
          requestHref={requestsBase ? (id: string) => `${requestsBase}/${encodeURIComponent(id)}` : null}
          sessionLabelOf={sessionLabelOf}
          onDone={onSheetDone}
        />
      )}

      {/* A WHOLE COLUMN, for the people who correct registers. */}
      {columnSession && (
        <ColumnSheet
          key={columnSession.sessionKey}
          open
          onClose={() => setColumnTarget(null)}
          groupId={groupId}
          runId={runId ?? null}
          groupName={group?.name ?? ""}
          target={{
            session: {
              weekNumber: columnSession.weekNumber,
              occurrence: columnSession.occurrence,
              sessionKey: columnSession.sessionKey,
              dateKey: columnSession.dateKey,
              held: columnSession.held,
            },
            finished: null,
          }}
          onDone={onSheetDone}
        />
      )}

      <ParticipantNoteDrawer
        key={noteTarget ? `${noteTarget.sessionKey} ${noteTarget.uid}` : "no-note"}
        open={noteSession !== null && noteMember !== null}
        onClose={() => setNoteTarget(null)}
        session={noteSession}
        member={noteMember}
        note={
          noteTarget
            ? (participantNotes[noteTarget.sessionKey]?.[noteTarget.uid] ?? "")
            : ""
        }
        onSave={async (text) => {
          if (!noteSession || !noteMember) return;
          await saveNote(noteSession, noteMember.uid, text);
        }}
      />

      <ActionToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
