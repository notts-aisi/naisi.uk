import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunLead, standingUserOf } from "@/lib/courses/programmeLead";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { dayRangeWords } from "@/lib/courses/sessionChange/words";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekReadiness } from "@/lib/courses/weekBlocks/reader";
import { addDaysToKey, isValidDateKey } from "@/lib/courses/weekPlan";
import {
  compareGroupsByMeeting,
  normalizeCourseGroup,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  normalizeCourseWeek,
  weekDocId,
  type CourseRunDoc,
  type CourseWeekDoc,
} from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { READY_BY_DAYS, meetsLine } from "./words";

/**
 * WHAT A PROGRAMME'S WEEKS TAB SHOWS (board pr-weeks), worked out on the
 * server from records, for the programme's lead and admins.
 *
 * Each taught week of the run the programme names, in the run's plan order:
 * where it stands (Ready once the lead has marked it, `weekIsReady` through
 * `weekReadiness`; Empty while it holds nothing; Draft otherwise), its first
 * session (the earliest session that week of any of the run's groups that
 * still meet, from each group's own calendar, a cancelled session left out),
 * the day it should be ready by (`READY_BY_DAYS` before that session), and
 * its owner (the uid stored by the owner route when it is still the lead or
 * one of the run's helpers, otherwise the programme's lead).
 *
 * HELPERS are the run's track leads (the boards' "a run's helpers"; no other
 * helper role exists). They are owners to choose from, and nothing here
 * grants them anything.
 *
 * WHO READS IT: the Weeks tab's pages, after `loadProgrammeRun` has admitted
 * an admin or the programme's lead. Nothing about anybody but names reaches
 * the page, each by the names rule for the reader (`nameForViewer`: the
 * committee and admins see "Priya Shah (Pri)", a lead who is not on it the
 * name people go by).
 *
 * Reads: the run, its weeks (one list), its groups (one equality on the run,
 * as the times picture reads them), the programme's lead (`readRunLead`) and
 * the helpers' accounts. No query needs a declared index.
 */

export type WeekOwner = {
  uid: string;
  /** Their name as the reader is shown it, as the lead's tabs name people. */
  name: string;
  /** The programme's lead, who every week starts as owned by; a helper otherwise. */
  lead: boolean;
};

/** How a week meets across the groups that meet that week: every one online, some, or none. */
export type WeekOnline = "all" | "some" | "none";

export type WeeksTabWeek = {
  /** "w03": the week's document id, by the addressing doctrine (`weekDocId`). */
  weekId: string;
  weekNumber: number;
  /** The week's own title ("What could go wrong"), or "". */
  title: string;
  state: "ready" | "draft" | "empty";
  /** The week has a document on the run. */
  hasPage: boolean;
  published: boolean;
  /** Written as blocks: "Copy as Markdown" has something to copy. */
  blockWeek: boolean;
  /** The first session that week across the groups, a London date, or null. */
  firstSession: string | null;
  /** When that first session starts, or null: from then on the week can be reviewed. */
  firstStartsAt: Date | null;
  /** `READY_BY_DAYS` before `firstSession`, or null. */
  readyBy: string | null;
  /** The week's seven days on the run's own calendar ("Thu 12 to Wed 18 Nov"), or "". */
  range: string;
  /** Who owns it as shown, or null when nobody stands as lead or helper. */
  owner: WeekOwner | null;
  online: WeekOnline;
};

export type WeeksTab = {
  runId: string;
  courseId: string;
  /** The programme's short name, then the course's title. */
  programmeName: string;
  weeks: WeeksTabWeek[];
  /** pr-weeks' line under the list ("AGI Strategy meets in person every week."). */
  meets: string;
  /** Who a week's owner can be: the programme's lead first, then each helper. */
  owners: WeekOwner[];
  /** The run's groups that still meet, Monday first. */
  groups: CourseGroupDoc[];
};

/** A run's groups that still meet, in the order every tab of the programme lists them. */
export async function liveGroupsOfRun(db: Firestore, runId: string): Promise<CourseGroupDoc[]> {
  // One equality on one field, so no declared index.
  const snap = await db.collection("courseGroups").where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === runId)
    .sort(compareGroupsByMeeting);
}

/** The roles of an approved account: a helper whose account is gone or waiting is no owner. */
const APPROVED = new Set(["member", "committee", "admin"]);

/**
 * The programme's lead, then each of the run's helpers who still has an
 * approved account, by name, each named as `viewer` is shown them (none: the
 * name they go by).
 */
export async function weekOwnersOf(db: Firestore, run: CourseRunDoc, viewer: NameViewer = null): Promise<WeekOwner[]> {
  const nameOf = (data: Record<string, unknown>) => nameForViewer(viewer, accountNamesOf(data), "NAISI member");
  const lead = await readRunLead(db, run.id);
  const owners: WeekOwner[] = [];
  if (lead) {
    const snap = await db.collection("users").doc(lead.uid).get();
    owners.push({ uid: lead.uid, name: snap.exists ? nameOf(snap.data() ?? {}) : "NAISI member", lead: true });
  }
  const helperUids = [...new Set(run.trackLeadUids)].filter((uid) => uid && uid !== lead?.uid);
  const accounts = helperUids.length ? await db.getAll(...helperUids.map((uid) => db.collection("users").doc(uid))) : [];
  const helpers: WeekOwner[] = [];
  for (const snap of accounts) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (!APPROVED.has(standingUserOf(snap.id, data).role)) continue;
    helpers.push({ uid: snap.id, name: nameOf(data), lead: false });
  }
  helpers.sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));
  return [...owners, ...helpers];
}

/**
 * Who a week is shown as owned by: the stored owner while they are still one
 * to choose from, otherwise the programme's lead, otherwise nobody yet.
 */
export function shownOwner(week: Pick<CourseWeekDoc, "ownerUid"> | null, owners: readonly WeekOwner[]): WeekOwner | null {
  const stored = week?.ownerUid ? owners.find((owner) => owner.uid === week.ownerUid) : undefined;
  return stored ?? owners.find((owner) => owner.lead) ?? null;
}

/** The week slot each taught week takes on the run's own calendar, by week number. */
function runSlots(run: CourseRunDoc): Map<number, string> {
  const slots = new Map<number, string>();
  for (const session of resolveSessions(run, null)) {
    if (session.occurrence === 1) slots.set(session.weekNumber, session.slotStartKey);
  }
  return slots;
}

/**
 * The earliest session of week `weekNumber` among `groups`, each from its own
 * calendar, and how the groups meeting that week meet. A cancelled session is
 * no session; a group with no day yet has none.
 */
export function weekSessions(
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  weekNumber: number,
): { firstSession: string | null; firstStartsAt: Date | null; online: WeekOnline } {
  let first: string | null = null;
  let firstStartsAt: Date | null = null;
  let meeting = 0;
  let online = 0;
  const weekId = weekDocId(weekNumber);
  for (const group of groups) {
    const session = sessionOfWeek(resolveSessions(run, group), weekNumber);
    if (!session || !session.dateKey || session.cancelled) continue;
    meeting += 1;
    if (sessionModeForWeek(group, weekId) === "virtual") online += 1;
    if (first === null || session.dateKey < first) first = session.dateKey;
    const { startsAt } = sessionInstants(session);
    if (startsAt && (firstStartsAt === null || startsAt.getTime() < firstStartsAt.getTime())) firstStartsAt = startsAt;
  }
  return { firstSession: first, firstStartsAt, online: online === 0 ? "none" : online === meeting ? "all" : "some" };
}

/** `READY_BY_DAYS` before a session's date, or null. */
export function readyByOf(firstSession: string | null): string | null {
  return firstSession && isValidDateKey(firstSession) ? addDaysToKey(firstSession, -READY_BY_DAYS) : null;
}

/** The run a programme names, read for the tab: null when it is gone or being destroyed. */
export async function readTabRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  if (raw.destroying === true) return null;
  return normalizeCourseRun(snap.id, raw);
}

/**
 * The whole tab for the run a programme names, or null when the run is not
 * on the site. `programmeName` is the programme's short name as the tab's
 * frame read it; `viewer` is who reads it, for the names.
 */
export async function loadWeeksTab(db: Firestore, runId: string, programmeName: string, viewer: NameViewer): Promise<WeeksTab | null> {
  const run = await readTabRun(db, runId);
  if (!run) return null;
  const [weekSnap, groups, owners] = await Promise.all([
    db.collection("courseRuns").doc(run.id).collection("weeks").get(),
    liveGroupsOfRun(db, run.id),
    weekOwnersOf(db, run, viewer),
  ]);
  const docs = new Map(weekSnap.docs.map((doc) => [doc.id, normalizeCourseWeek(doc.id, doc.data() ?? {})] as const));
  const slots = runSlots(run);
  const weeks: WeeksTabWeek[] = [];
  for (const entry of run.weekPlan) {
    if (entry.kind !== "week") continue;
    // The addressing doctrine: a slot's document is `weekDocId(n)`, never the entry's own id.
    const weekId = weekDocId(entry.weekNumber);
    const doc = docs.get(weekId) ?? null;
    const { firstSession, firstStartsAt, online } = weekSessions(run, groups, entry.weekNumber);
    const slotStart = slots.get(entry.weekNumber) ?? "";
    weeks.push({
      weekId,
      weekNumber: entry.weekNumber,
      title: doc?.title.trim() ?? "",
      state: doc ? weekReadiness(doc) : "empty",
      hasPage: doc !== null,
      published: doc?.published === true,
      blockWeek: doc !== null && isBlockWeek(doc),
      firstSession,
      firstStartsAt,
      readyBy: readyByOf(firstSession),
      range: slotStart && isValidDateKey(slotStart) ? dayRangeWords(slotStart, addDaysToKey(slotStart, 6)) : "",
      owner: shownOwner(doc, owners),
      online,
    });
  }
  const name = programmeName.trim() || run.courseTitle.trim();
  const meets = meetsLine(
    name,
    weeks.filter((week) => week.online === "all").map((week) => week.weekNumber),
    weeks.filter((week) => week.online === "some").map((week) => week.weekNumber),
  );
  return { runId: run.id, courseId: run.courseId, programmeName: name, weeks, meets, owners, groups };
}

/** How many taught weeks the run a programme names has, for the tab's count; null when there is no run to count. */
export async function countRunWeeks(db: Firestore, runId: string): Promise<number | null> {
  const run = await readTabRun(db, runId);
  return run ? run.weekPlan.filter((entry) => entry.kind === "week").length : null;
}
