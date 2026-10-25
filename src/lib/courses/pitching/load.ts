import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  PITCHES_COLLECTION,
  normalizePitch,
  type PitchDoc,
  type PitchRow,
  type PitchingView,
} from "./model";
import { ownSeat, seatsOn } from "./people";
import { readPitchingWeek, type PitchingWeek } from "./week";
import { editUntilWords, eyebrowWords, ledeWords, pitchedByWords, teamsWords, type SessionStart } from "./words";

/**
 * PITCHING WEEK, READ FOR ONE PERSON IN IT: who may take part, when it
 * closes, and everything their page shows.
 *
 * ## Who takes part
 *
 * Somebody with a live learner seat in one of the run's groups, told by
 * Publish, whose account still stands (`ownSeat`). Facilitators, the lead and
 * admins are not taking part: they are refused here and read the lead's list
 * instead (`src/lib/applications/handover/pitchesLoad.ts`). A person sees
 * their OWN group's pitches only, because the people in a group already see
 * each other's names and nobody else's.
 *
 * ## When
 *
 * The run's pitching week is the lowest-numbered week document ticked as one
 * (`CourseWeekDoc.pitching`), and only while that week is published. It
 * closes, for each group, at the start of that group's session in that week,
 * from the group's own calendar (`resolveSessions`, so a group that meets on
 * another day or has moved that week closes at its own time). After the
 * close everything on the page is read only, and both writers refuse. A week
 * the group's calendar cannot date never opens.
 *
 * ## What is never sent
 *
 * Who picked what. A person is told which pitches THEY picked, and how many
 * that is; nothing about anybody else's picks, counts included.
 */

/**
 * When a group's session in this week starts: the earliest session the
 * group's own calendar holds that week, or null when it holds none it can
 * date.
 */
export function sessionStartIn(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  weekNumber: number,
): SessionStart | null {
  let found: SessionStart | null = null;
  for (const session of resolveSessions(run, group)) {
    if (session.weekNumber !== weekNumber) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt) continue;
    if (!found || startsAt.getTime() < found.at.getTime()) {
      found = { at: startsAt, dateKey: session.dateKey, startTimeLocal: session.session.startTimeLocal };
    }
  }
  return found;
}

/**
 * Open: before the group's session starts, on a run that is still being
 * taught. An archived, finished or cancelled run takes no more pitches.
 */
export function pitchingIsOpen(run: CourseRunDoc, start: SessionStart | null, now: Date): boolean {
  if (!start || run.archived) return false;
  if (run.status === "completed" || run.status === "cancelled") return false;
  return now.getTime() < start.at.getTime();
}

/** One person taking part in pitching week, and what their page is made from. */
export type PitchingPerson = {
  user: SessionUser;
  run: CourseRunDoc;
  group: CourseGroupDoc;
  seat: CourseEnrolmentDoc;
  week: PitchingWeek;
  start: SessionStart | null;
};

export type Refusal = { ok: false; status: number; error: string };

const NOT_IN_A_GROUP: Refusal = {
  ok: false,
  status: 403,
  error: "Pitching week is for the people in this programme’s groups.",
};
const NO_PITCHING_WEEK: Refusal = {
  ok: false,
  status: 404,
  error: "There’s no pitching week on this programme.",
};

/**
 * The gate every pitching route and the page ask first. The caller's own
 * seat is read before anything else about the run, and a run that is being
 * destroyed is not there for anybody.
 */
export async function pitchingPerson(
  db: Firestore,
  user: SessionUser,
  runId: string,
): Promise<{ ok: true; person: PitchingPerson } | Refusal> {
  const seat = await ownSeat(db, runId, user);
  if (!seat || !seat.groupId) return NOT_IN_A_GROUP;
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").doc(seat.groupId).get(),
  ]);
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) return NOT_IN_A_GROUP;
  if (!groupSnap.exists) return NOT_IN_A_GROUP;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.archived || group.runId !== runId) return NOT_IN_A_GROUP;
  const week = await readPitchingWeek(db, runId);
  if (!week || !week.published) return NO_PITCHING_WEEK;
  return {
    ok: true,
    person: { user, run, group, seat, week, start: sessionStartIn(run, group, week.weekNumber) },
  };
}

/** Every pitch on the run, in the order they came in. One equality, so no declared index. */
export async function pitchesOnRun(db: Firestore, runId: string): Promise<PitchDoc[]> {
  const snap = await db.collection(PITCHES_COLLECTION).where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizePitch(doc.id, doc.data() ?? {}))
    .sort(
      (a, b) =>
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id),
    );
}

/** The pitches of one group in one pitching week. */
export function pitchesOfGroup(pitches: PitchDoc[], weekId: string, groupId: string): PitchDoc[] {
  return pitches.filter((pitch) => pitch.weekId === weekId && pitch.groupId === groupId);
}

/** Display names for these people, and whether each account stands. Names only, never an address. */
export async function peopleNamed(
  db: Firestore,
  uids: Iterable<string>,
): Promise<Map<string, { name: string; approved: boolean }>> {
  const list = [...new Set([...uids].filter(Boolean))];
  const out = new Map<string, { name: string; approved: boolean }>();
  if (list.length === 0) return out;
  const docs = await db.getAll(...list.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    if (!doc.exists) continue;
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    out.set(doc.id, {
      name: displayNameOf(data),
      approved: data.role === "member" || data.role === "committee" || data.role === "admin",
    });
  }
  return out;
}

/** The fallback a missing account is named by, the roster's own. */
const SOMEBODY = "NAISI member";

/** Everything one person's pitching page shows, built field by field. */
export async function pitchingView(
  db: Firestore,
  person: PitchingPerson,
  now: Date = new Date(),
): Promise<PitchingView> {
  const { user, run, group, week, start } = person;
  const viewer = { isAdmin: user.role === "admin" };
  const [allPitches, seats, resolved, programme] = await Promise.all([
    pitchesOnRun(db, run.id),
    seatsOn(db, run.id, viewer),
    resolveWeekDoc(db, run.id, group.id, week.weekId),
    runProgrammeOf(db, run.id),
  ]);
  const pitches = pitchesOfGroup(allPitches, week.weekId, group.id);
  const groupSeats = seats.filter((seat) => seat.groupId === group.id);
  const named = await peopleNamed(db, [
    ...groupSeats.map((seat) => seat.uid),
    ...pitches.flatMap((pitch) => pitch.pitcherUids),
  ]);
  const nameOf = (uid: string) => named.get(uid)?.name ?? SOMEBODY;

  const mine = pitches.find((pitch) => pitch.pitcherUids.includes(user.uid)) ?? null;
  const partnerUid = mine?.pitcherUids.find((uid) => uid !== user.uid) ?? null;
  const rows: PitchRow[] = pitches.map((pitch) => {
    const yours = pitch.id === mine?.id;
    return {
      id: pitch.id,
      title: pitch.title,
      twist: pitch.twist,
      pitchedBy: yours
        ? pitchedByWords([], partnerUid ? nameOf(partnerUid) : null)
        : pitchedByWords(pitch.pitcherUids.map(nameOf), undefined),
      yours,
      picked: !yours && pitch.wouldJoinUids.includes(user.uid),
    };
  });

  // Who could pitch with this person: somebody else in the group, told, whose
  // account stands, and who is on no pitch but this person's own.
  const onAPitch = new Set(
    pitches.filter((pitch) => pitch.id !== mine?.id).flatMap((pitch) => pitch.pitcherUids),
  );
  const partners = groupSeats
    .filter((seat) => seat.uid !== user.uid && !onAPitch.has(seat.uid) && named.get(seat.uid)?.approved)
    .map((seat) => ({ uid: seat.uid, name: nameOf(seat.uid) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));

  const readings = (resolved.week?.materials ?? [])
    .filter((material) => material.type === "reading" && material.title.trim())
    .map((material) => ({ id: material.id, title: material.title.trim() }));

  const open = pitchingIsOpen(run, start, now);
  const pickLimit = run.pitchSettings.pickLimit;
  return {
    runId: run.id,
    weekNumber: week.weekNumber,
    eyebrow: eyebrowWords(programme, run.courseTitle, week.weekNumber),
    backLabel: programme?.shortName || run.courseTitle || "Your programme",
    lede: ledeWords({ pitchCount: pitches.length, pickLimit, start, now }),
    open,
    editUntil: open && start ? editUntilWords(start, now) : null,
    pickLimit,
    picked: rows.filter((row) => row.picked).length,
    mine: mine
      ? {
          id: mine.id,
          title: mine.title,
          paperTitle: mine.paper?.title ?? "",
          readingId: mine.paper?.kind === "reading" ? mine.paper.materialId : null,
          twist: mine.twist,
          partner: partnerUid ? { uid: partnerUid, name: nameOf(partnerUid) } : null,
          sentByMe: mine.pitcherUids[0] === user.uid,
        }
      : null,
    pitches: rows,
    readings,
    partners,
    teams: teamsWords(run.pitchSettings, programme?.leadFirstName ?? null),
  };
}

/**
 * What the run home says about pitching week, for somebody taking part, or
 * null when it says nothing. Shown from the moment the pitching week is
 * published until the end of the day of the person's group's session in it:
 * its line while picking is open, and the closed line for the rest of that
 * day. The week is looked up first, so a run with no pitching week costs one
 * query here.
 */
export async function pitchingCard(
  db: Firestore,
  user: SessionUser,
  runId: string,
  now: Date = new Date(),
): Promise<{ lede: string; open: boolean } | null> {
  const week = await readPitchingWeek(db, runId);
  if (!week || !week.published) return null;
  const gate = await pitchingPerson(db, user, runId);
  if (!gate.ok) return null;
  const { run, group, start } = gate.person;
  if (!start || run.archived || run.status === "completed" || run.status === "cancelled") return null;
  const open = pitchingIsOpen(run, start, now);
  if (!open && londonDateKey(now) !== start.dateKey) return null;
  const pitches = pitchesOfGroup(await pitchesOnRun(db, runId), gate.person.week.weekId, group.id);
  return {
    lede: ledeWords({ pitchCount: pitches.length, pickLimit: run.pitchSettings.pickLimit, start, now }),
    open,
  };
}

/** The person's page, or why they cannot have it. */
export async function loadPitching(
  db: Firestore,
  user: SessionUser,
  runId: string,
  now: Date = new Date(),
): Promise<{ ok: true; view: PitchingView } | Refusal> {
  const gate = await pitchingPerson(db, user, runId);
  if (!gate.ok) return gate;
  return { ok: true, view: await pitchingView(db, gate.person, now) };
}
