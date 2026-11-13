"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AttendanceEditResult,
  AttendanceMarkResult,
  AttendancePayload,
  AttendanceSession,
} from "@/app/api/courses/groups/[groupId]/attendance/route";
import type { AttendancePushResult } from "@/app/api/courses/groups/[groupId]/attendance/push/route";
import type { ParticipantNoteResult } from "@/app/api/courses/groups/[groupId]/participant-notes/route";
import type { RegisterEnding } from "@/lib/courses/registerEnding";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";

/**
 * One group's attendance register: the data behind `AttendanceGrid`.
 *
 * A one-shot fetch with a manual refresh (the `useReviewQueue` / `useMyExercises`
 * idiom), not `onSnapshot`, for the reasons those hooks give and one more of
 * this surface's own:
 *
 *  1. `courseAttendance` is `read/write: if false` in firestore.rules. The
 *     routes are the ONLY path to this data in either direction, and they are
 *     also what strip it down to names. There is no client query that could
 *     replace them.
 *  2. Nothing moves behind the facilitator's back. A register is typed by the
 *     person looking at the room; a standing listener would buy a live flip
 *     nobody is waiting for.
 *  3. The grid is OPTIMISTIC. A listener firing mid-gesture would fight the
 *     local value that has not been confirmed yet, exactly the flicker the
 *     optimistic path exists to avoid.
 *
 * ── KEY-TAGGED STORE (the P8 precedent, and load-bearing here) ──────────────
 * Every piece of state carries the `groupId` it was fetched for. A facilitator
 * who runs two groups can switch between them fast enough that the first
 * group's response lands after the second group's render, and merging that
 * would show one group's marks under the other group's roster. A stale
 * response whose key no longer matches is dropped, and so is a stale
 * optimistic patch or revert.
 *
 * ── WHAT IS NOT OPTIMISTIC, AND WHY ─────────────────────────────────────────
 * Marks are: they are small, reversible, and the whole gesture is tapping
 * quickly down a column. FINISHING is not. It locks the register and rewrites
 * every member's attendance record (and, while next week's email is not on its
 * schedule, mails the group), and a UI that showed it as done before the
 * server agreed would be claiming something had happened. The finish and the
 * note drawer both wait for their answer and then reload.
 *
 * ── PII BOUNDARY ────────────────────────────────────────────────────────────
 * The payload carries `displayName`, the marks, and the facilitator's own
 * participant notes. No email address, no lookup of its own, nothing derived
 * from a uid beyond using it as a key. Names render through `MemberName` and
 * notes through `MemberText`.
 */

export type { AttendanceStatus };

/**
 * One cell's target state. `null` CLEARS the mark (back to unmarked).
 * `online` is where somebody marked as having come was (true online, false
 * in the room), sent beside a mark that says they came and never beside any
 * other.
 */
export type AttendanceMark = { uid: string; status: AttendanceStatus | null; online?: boolean };

export type { AttendanceSession };
export type AttendanceMember = AttendancePayload["members"][number];
/** Somebody who left the group: read only, beside the register's rows. */
export type AttendanceLeaver = AttendancePayload["leavers"][number];
export type AttendanceRecords = AttendancePayload["records"];
/** `sessionKey -> uid -> online`, beside a mark that says they came. */
export type AttendanceOnline = AttendancePayload["online"];
/** `sessionKey -> uids` who said they are joining online. */
export type AttendanceOnlineSaid = AttendancePayload["onlineSaid"];
export type AttendanceNotes = AttendancePayload["participantNotes"];
/** A session where somebody told us in advance they can't make it, with who. */
export type AttendanceCantMakeIt = AttendancePayload["cantMakeIt"][number];

/** What one save is changing about one session, beyond its marks. */
export type SessionPatch = { held?: boolean; notes?: string };

export type AttendanceSetBy = AttendancePayload["setBy"];
export type AttendanceCovers = AttendancePayload["covers"];
export type AttendanceFacilitatorRecord = NonNullable<AttendancePayload["facilitatorRecord"]>;
export type AttendanceFacilitator = AttendancePayload["facilitators"][number];
export type AttendanceCaller = AttendancePayload["caller"];
/** `sessionKey -> uid -> story` of each line corrected after its register was finished. */
export type AttendanceCorrections = AttendancePayload["corrections"];
/** `sessionKey -> uid -> request`: a waiting ask about the line, or what became of the newest. */
export type AttendanceRequests = AttendancePayload["requests"];
/**
 * `sessionKey -> uid -> "waiting" | "excused"`: a request to be excused, as
 * one of two facts and nothing else (never the reason, the reply or a count).
 */
export type AttendanceExcuseRequests = AttendancePayload["excuseRequests"];

export type AttendanceState = {
  group: AttendancePayload["group"] | null;
  /** The grid's columns: sessions up to and including the current week. */
  sessions: AttendanceSession[];
  /** The grid's rows: active members, name-sorted. */
  members: AttendanceMember[];
  /**
   * True when somebody placed in the group is not a row yet because Publish
   * has not told them their group. False until a payload has landed.
   */
  notYetTold: boolean;
  /** Who left the group, read only, with the marks they had. Never a row anybody marks. */
  leavers: AttendanceLeaver[];
  /** `sessionKey -> uid -> status`. Sparse: absent means unmarked. */
  records: AttendanceRecords;
  /** `sessionKey -> uid -> online`. Sparse: somebody who came with no entry was in the room. */
  online: AttendanceOnline;
  /** `sessionKey -> uids` who said in advance they are joining online. */
  onlineSaid: AttendanceOnlineSaid;
  /** `sessionKey -> uid -> note`. Private to staff. */
  participantNotes: AttendanceNotes;
  /** True when this caller may correct a register that is already pushed. */
  canEditPushed: boolean;
  /** How the register ends: which button, and the words under it. */
  ending: RegisterEnding | null;
  /** Who told us in advance they can't make a session, soonest session first. */
  cantMakeIt: AttendanceCantMakeIt[];
  /** `sessionKey -> uid -> who set the line and when`. Empty for a register written before lines were stamped. */
  setBy: AttendanceSetBy;
  /** Who took each session's register in a facilitator's place, by session key. */
  covers: AttendanceCovers;
  /** Whether each facilitator was there: only for a reader the route sends it to, else null. */
  facilitatorRecord: AttendanceFacilitatorRecord | null;
  /** The group's facilitators, by name. */
  facilitators: AttendanceFacilitator[];
  /** What the reader may do on each session; null until the first payload. */
  caller: AttendanceCaller | null;
  /** Each corrected line's story, as the route sends it to this reader. */
  corrections: AttendanceCorrections;
  /** The asks about lines, as the route sends them to this reader. */
  requests: AttendanceRequests;
  /** Requests to be excused, one of two facts per person per session. */
  excuseRequests: AttendanceExcuseRequests;
  /** True on the first load of a group AND on a manual refresh. */
  loading: boolean;
  /** A fetch for the CURRENT group has landed, so the grid is real. */
  loaded: boolean;
  error: Error | null;
  reload: () => void;
  /**
   * Mark cells, or change the session's held switch or note. Marks apply
   * OPTIMISTICALLY and revert if the write is refused; the session patch waits
   * for the answer, because a held switch that flickered would be read as a
   * cancelled session. THROWS so the caller can put the route's own sentence
   * in front of the facilitator.
   */
  mark: (
    session: AttendanceSession,
    marks: AttendanceMark[],
    patch?: SessionPatch,
  ) => Promise<void>;
  /**
   * A correction to a register that is already finished, with its reason:
   * marks, or (an admin's) the session note. Every changed line appends its
   * own history row. Whether a session happened is the column's, never this.
   */
  edit: (
    session: AttendanceSession,
    marks: AttendanceMark[],
    patch: { notes?: string } | undefined,
    reason: string,
  ) => Promise<AttendanceEditResult>;
  /**
   * FINISH THE REGISTER (or PUSH ATTENDANCE). Locks the register and rebuilds
   * the mirrors; mails the group only while next week's email is not on its
   * schedule. `force` is the ADMIN-ONLY resend over a claimed email.
   */
  push: (
    session: AttendanceSession,
    opts?: { force?: boolean; facilitatorsHere?: string[] },
  ) => Promise<AttendancePushResult>;
  /** Write or clear one private note about one member for one session. */
  saveNote: (
    session: AttendanceSession,
    uid: string,
    note: string,
  ) => Promise<ParticipantNoteResult>;
};

const NO_SESSIONS: AttendanceSession[] = [];
const NO_MEMBERS: AttendanceMember[] = [];
const NO_LEAVERS: AttendanceLeaver[] = [];
const NO_RECORDS: AttendanceRecords = {};
const NO_ONLINE: AttendanceOnline = {};
const NO_ONLINE_SAID: AttendanceOnlineSaid = {};
const NO_NOTES: AttendanceNotes = {};
const NO_CANT_MAKE_IT: AttendanceCantMakeIt[] = [];
const NO_SET_BY: AttendanceSetBy = {};
const NO_COVERS: AttendanceCovers = {};
const NO_FACILITATORS: AttendanceFacilitator[] = [];
const NO_CORRECTIONS: AttendanceCorrections = {};
const NO_REQUESTS: AttendanceRequests = {};
const NO_EXCUSE_REQUESTS: AttendanceExcuseRequests = {};

/**
 * A separator that cannot occur in a group id, so the composite stamp can
 * never be spelled two ways. (`useReviewQueue` and `useMyExercises` use the
 * same one.)
 */
const SEP = " ";

type Store = {
  key: string;
  data: AttendancePayload | null;
  error: Error | null;
};

/**
 * `records` with `marks` applied to one session: a pure function over a plain
 * object, so the optimistic patch and the revert are the same operation run
 * with different values. A session whose last mark is cleared loses its key
 * entirely, which keeps the payload's own "absent means unmarked" invariant
 * true of the local copy too.
 */
function withMarks(
  records: AttendanceRecords,
  sessionKey: string,
  marks: AttendanceMark[],
): AttendanceRecords {
  const week = { ...(records[sessionKey] ?? {}) };
  for (const mark of marks) {
    if (mark.status === null) delete week[mark.uid];
    else week[mark.uid] = mark.status;
  }
  const next = { ...records };
  if (Object.keys(week).length === 0) delete next[sessionKey];
  else next[sessionKey] = week;
  return next;
}

/**
 * `online` with `marks` applied to one session, the twin of `withMarks`: a
 * mark that says they came and carries where they were sets it, and any other
 * mark takes their entry away, as the route writes it.
 */
function withOnline(
  online: AttendanceOnline,
  sessionKey: string,
  marks: AttendanceMark[],
): AttendanceOnline {
  const week = { ...(online[sessionKey] ?? {}) };
  for (const mark of marks) {
    const came = mark.status === "present" || mark.status === "late" || mark.status === "left-early";
    if (came && typeof mark.online === "boolean") week[mark.uid] = mark.online;
    else if (!came) delete week[mark.uid];
  }
  const next = { ...online };
  if (Object.keys(week).length === 0) delete next[sessionKey];
  else next[sessionKey] = week;
  return next;
}

/**
 * `setBy` with the reader's own save applied to one session: each line it
 * moved is theirs from now, and a line it cleared shows nobody, as the route
 * stamps them. Lines it did not move keep their stamp. Undone with the marks
 * when the save is refused, by putting back what was there.
 */
function withSetBy(
  setBy: AttendanceSetBy,
  sessionKey: string,
  marks: AttendanceMark[],
  how: "facilitator" | "cover",
  at: string,
): AttendanceSetBy {
  const week = { ...(setBy[sessionKey] ?? {}) };
  for (const mark of marks) {
    if (mark.status === null) delete week[mark.uid];
    else week[mark.uid] = { name: "", at, how, yours: true };
  }
  const next = { ...setBy };
  if (Object.keys(week).length === 0) delete next[sessionKey];
  else next[sessionKey] = week;
  return next;
}

/** The route's own sentence where it gave one, a status where it did not. */
function errorFrom(
  body: { error?: string } | null,
  res: Response,
  fallback: string,
): string {
  return body?.error ?? `${fallback} (${res.status}).`;
}

export function useAttendance(groupId: string, options: { week?: number | null } = {}): AttendanceState {
  const idle = !groupId;
  // A week named in the address (`?session=w02` on the register's page) is
  // asked for too, so its column is there even before the cohort's week reaches it.
  const week = options.week ?? null;
  const key = idle ? "" : `${groupId}${week ? `?week=${week}` : ""}`;

  const [store, setStore] = useState<Store>({ key: "", data: null, error: null });
  const [nonce, setNonce] = useState(0);
  // The stamp whose fetch has landed. Deriving `loading` from the pair (rather
  // than flipping a boolean inside the effect body, which is a cascading
  // render) means a manual `reload()` reads as "refreshing" straight away.
  const [settled, setSettled] = useState("");

  const stamp = `${key}${SEP}${nonce}`;
  const endpoint = `/api/courses/groups/${encodeURIComponent(groupId)}/attendance`;

  useEffect(() => {
    if (idle) return;
    let cancelled = false;
    // Same-origin default carries the session cookie; no `credentials` needed.
    fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/attendance${week ? `?week=${week}` : ""}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | (AttendancePayload & { error?: string })
          | null;
        if (!res.ok || !body || !Array.isArray(body.members)) {
          // The route's own sentence where it gave one: a facilitator who has
          // been taken off the group needs to read "Forbidden", not "failed".
          throw new Error(body?.error ?? `Couldn't load the register (${res.status}).`);
        }
        return body;
      })
      .then((payload) => {
        if (!cancelled) setStore({ key, data: payload, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A failed REFRESH keeps the grid it already had: replacing a register
        // someone is halfway through marking with an error card is the wrong
        // trade. A failed FIRST load of this key has nothing to keep.
        setStore((prev) => ({
          key,
          data: prev.key === key ? prev.data : null,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      })
      .finally(() => {
        if (!cancelled) setSettled(stamp);
      });
    return () => {
      cancelled = true;
    };
  }, [idle, groupId, key, stamp, nonce, week]);

  const fresh = store.key === key ? store : null;
  const data = fresh?.data ?? null;

  const mark = useCallback(
    async (session: AttendanceSession, marks: AttendanceMark[], patch?: SessionPatch) => {
      if (!marks.length && !patch) return;
      const sessionKey = session.sessionKey;

      // What each cell held BEFORE the gesture, captured from the render's own
      // snapshot. The revert restores exactly these, and nothing else.
      const before = new Map<string, AttendanceStatus | null>();
      const current = data?.records[sessionKey] ?? {};
      for (const m of marks) before.set(m.uid, current[m.uid] ?? null);
      const whereBefore = data?.online?.[sessionKey] ?? {};
      const setByBefore = data?.setBy?.[sessionKey] ?? {};
      // Who sets the line, as the route will stamp it: the group's facilitator, or somebody who is not.
      const how = data?.caller ? (data.caller.facilitates ? "facilitator" : "cover") : "facilitator";
      const at = new Date().toISOString();

      // OPTIMISTIC: the cells move now. Key-guarded like every other write
      // here. The session patch is NOT applied optimistically; it lands on the
      // reload below, because a held switch that flickered back would have
      // said a session was cancelled.
      if (marks.length) {
        setStore((prev) =>
          prev.key === key && prev.data
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  records: withMarks(prev.data.records, sessionKey, marks),
                  online: withOnline(prev.data.online ?? NO_ONLINE, sessionKey, marks),
                  setBy: withSetBy(prev.data.setBy ?? NO_SET_BY, sessionKey, marks, how, at),
                },
              }
            : prev,
        );
      }

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            weekNumber: session.weekNumber,
            occurrence: session.occurrence,
            ...(marks.length ? { marks } : {}),
            ...(patch?.held !== undefined ? { held: patch.held } : {}),
            ...(patch?.notes !== undefined ? { notes: patch.notes } : {}),
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | (Partial<AttendanceMarkResult> & { error?: string })
          | null;
        if (!res.ok || !body?.ok) {
          throw new Error(body?.error ?? `That didn't go through (${res.status}).`);
        }
        // The session's own fields are server truth, so they arrive by reload
        // rather than by guess.
        if (patch) setNonce((n) => n + 1);
      } catch (e) {
        // REVERT, cell by cell, and only where the optimistic value is still
        // standing: a cell the facilitator has since re-marked belongs to that
        // later gesture, and yanking it back would undo a change they can see
        // themselves making. A revert for a group the grid has left is dropped
        // by the key guard: the failed write did not land anywhere either.
        if (marks.length) {
          setStore((prev) => {
            if (prev.key !== key || !prev.data) return prev;
            const week = prev.data.records[sessionKey] ?? {};
            const where = prev.data.online?.[sessionKey] ?? {};
            const restore = marks.filter(
              (m) => (week[m.uid] ?? null) === m.status && (typeof m.online !== "boolean" || where[m.uid] === m.online),
            );
            if (restore.length === 0) return prev;
            const back = restore.map((m) => ({
              uid: m.uid,
              status: before.get(m.uid) ?? null,
              ...(typeof whereBefore[m.uid] === "boolean" ? { online: whereBefore[m.uid] } : {}),
            }));
            // Who set each line goes back with it: the stamp it had, or none.
            const setByWeek = { ...(prev.data.setBy?.[sessionKey] ?? {}) };
            for (const m of restore) {
              if (setByBefore[m.uid]) setByWeek[m.uid] = setByBefore[m.uid];
              else delete setByWeek[m.uid];
            }
            const setBy = { ...(prev.data.setBy ?? NO_SET_BY) };
            if (Object.keys(setByWeek).length === 0) delete setBy[sessionKey];
            else setBy[sessionKey] = setByWeek;
            return {
              ...prev,
              data: {
                ...prev.data,
                setBy,
                records: withMarks(prev.data.records, sessionKey, back),
                // Where they were goes back with the mark: what it was, or no
                // entry where there was none.
                online: withOnline(
                  withOnline(prev.data.online ?? NO_ONLINE, sessionKey, restore.map((m) => ({ uid: m.uid, status: null }))),
                  sessionKey,
                  back,
                ),
              },
            };
          });
        }
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
    [data, endpoint, key],
  );

  const edit = useCallback(
    async (
      session: AttendanceSession,
      marks: AttendanceMark[],
      patch: { notes?: string } | undefined,
      reason: string,
    ) => {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          marks,
          ...(patch?.notes !== undefined ? { notes: patch.notes } : {}),
          reason,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (Partial<AttendanceEditResult> & { error?: string })
        | null;
      if (!res.ok || !body?.ok) {
        throw new Error(errorFrom(body, res, "That correction didn't go through"));
      }
      setNonce((n) => n + 1);
      return body as AttendanceEditResult;
    },
    [endpoint],
  );

  const push = useCallback(
    async (session: AttendanceSession, opts?: { force?: boolean; facilitatorsHere?: string[] }) => {
      const res = await fetch(`${endpoint}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          ...(opts?.force ? { force: true } : {}),
          ...(opts?.facilitatorsHere ? { facilitatorsHere: opts.facilitatorsHere } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (Partial<AttendancePushResult> & { error?: string })
        | null;
      if (!res.ok || !body?.ok) {
        throw new Error(errorFrom(body, res, "The push didn't go through"));
      }
      // ALWAYS reload: the register is locked now, and the grid has to show
      // that before the facilitator taps another cell into a 409.
      setNonce((n) => n + 1);
      return body as AttendancePushResult;
    },
    [endpoint],
  );

  const saveNote = useCallback(
    async (session: AttendanceSession, uid: string, note: string) => {
      const res = await fetch(
        `/api/courses/groups/${encodeURIComponent(groupId)}/participant-notes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            weekNumber: session.weekNumber,
            occurrence: session.occurrence,
            uid,
            note,
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as
        | (Partial<ParticipantNoteResult> & { error?: string })
        | null;
      if (!res.ok || !body?.ok) {
        throw new Error(errorFrom(body, res, "That note didn't save"));
      }
      const saved = body as ParticipantNoteResult;
      // Merged locally rather than reloaded: the drawer is open over the grid,
      // and a full refetch under it would swap the roster out from beneath the
      // note the facilitator is reading.
      setStore((prev) => {
        if (prev.key !== key || !prev.data) return prev;
        const forSession = { ...(prev.data.participantNotes[saved.sessionKey] ?? {}) };
        if (saved.note) forSession[uid] = saved.note;
        else delete forSession[uid];
        const participantNotes = { ...prev.data.participantNotes };
        if (Object.keys(forSession).length === 0) delete participantNotes[saved.sessionKey];
        else participantNotes[saved.sessionKey] = forSession;
        return { ...prev, data: { ...prev.data, participantNotes } };
      });
      return saved;
    },
    [groupId, key],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const loading = idle ? false : settled !== stamp;

  return {
    group: data?.group ?? null,
    sessions: data?.sessions ?? NO_SESSIONS,
    members: data?.members ?? NO_MEMBERS,
    notYetTold: data?.notYetTold === true,
    leavers: data?.leavers ?? NO_LEAVERS,
    records: data?.records ?? NO_RECORDS,
    online: data?.online ?? NO_ONLINE,
    onlineSaid: data?.onlineSaid ?? NO_ONLINE_SAID,
    participantNotes: data?.participantNotes ?? NO_NOTES,
    canEditPushed: data?.canEditPushed ?? false,
    ending: data?.ending ?? null,
    cantMakeIt: data?.cantMakeIt ?? NO_CANT_MAKE_IT,
    setBy: data?.setBy ?? NO_SET_BY,
    covers: data?.covers ?? NO_COVERS,
    facilitatorRecord: data?.facilitatorRecord ?? null,
    facilitators: data?.facilitators ?? NO_FACILITATORS,
    caller: data?.caller ?? null,
    corrections: data?.corrections ?? NO_CORRECTIONS,
    requests: data?.requests ?? NO_REQUESTS,
    excuseRequests: data?.excuseRequests ?? NO_EXCUSE_REQUESTS,
    loading,
    loaded: !idle && !loading && data !== null,
    error: fresh?.error ?? null,
    reload,
    mark,
    edit,
    push,
    saveNote,
  };
}

export default useAttendance;
