import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import {
  accountNamesOf,
  seesFullNames,
  sharedFullNames,
  staffNameOf,
  type AccountNames,
  type NameViewer,
  type StaffName,
} from "./staffName";

/** Firestore's cap on the values one `in` filter takes. */
const IN_FILTER_LIMIT = 30;

export type StaffNamesOptions = {
  /**
   * True when the screen already shows each person's email beside their
   * name (the sign-ups list does), so it is never added to tell two apart.
   */
  emailShown?: boolean;
};

type Person = { uid: string; names: AccountNames; email: string };

/**
 * THE NAMES A STAFF SCREEN DRAWS FOR THESE ACCOUNTS, by uid, as this viewer
 * may see them (`nameForViewer`'s rule, in parts).
 *
 * For a committee member or an admin: "Priya Shah (Pri)". Where two people on
 * the screen share a full name (`uids` is everybody the screen names), each
 * of them also carries what tells them apart: their programme and group,
 * when they hold a seat on a live run that may be shown to this viewer, and
 * for an admin, their email, unless the screen shows it already. For anybody
 * else: the name they go by, and nothing from the full name. The callers are
 * staff screens behind their own gates; the rule is asked here as well, so
 * this function never hands a full name to anybody outside the committee.
 *
 * An account that is gone, or holds no name at all, has no entry: the screen
 * says what it stored (an event's sign-up keeps the name it was made with).
 *
 * One read of the accounts. The seats, runs and groups are read only for the
 * people who share a full name, which on most screens is nobody.
 */
export async function staffNamesFor(
  db: Firestore,
  uids: readonly (string | null | undefined)[],
  viewer: NameViewer,
  options: StaffNamesOptions = {},
): Promise<Map<string, StaffName>> {
  const wanted = [...new Set(uids.filter((uid): uid is string => typeof uid === "string" && uid !== ""))];
  const out = new Map<string, StaffName>();
  if (wanted.length === 0) return out;

  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  const people: Person[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    const names = accountNamesOf(data);
    if (!names.full && !names.goBy) continue;
    people.push({ uid: snap.id, names, email: typeof data.email === "string" ? data.email.trim() : "" });
  }

  if (!seesFullNames(viewer)) {
    for (const person of people) {
      if (person.names.goBy) out.set(person.uid, { name: person.names.goBy, goBy: null, apart: null, note: null });
    }
    return out;
  }

  const shared = sharedFullNames(people.map((person) => ({ key: person.uid, full: person.names.full })));
  const isAdmin = viewer?.role === "admin";
  const places = shared.size > 0 ? await placesOf(db, [...shared], isAdmin) : new Map<string, string>();
  for (const person of people) {
    // One of the two names is there, so the fallback is never drawn.
    const staff = staffNameOf(person.names, "");
    if (shared.has(person.uid)) {
      const parts = [places.get(person.uid), isAdmin && !options.emailShown ? person.email : ""];
      staff.apart = parts.filter((part): part is string => Boolean(part)).join(" · ") || null;
    }
    out.set(person.uid, staff);
  }
  return out;
}

/** A run that is still going: what "their programme" means on a staff screen. */
const LIVE_RUN = (run: { status: string; archived: boolean }) =>
  !run.archived && run.status !== "completed" && run.status !== "cancelled" && run.status !== "draft";

/**
 * "AGI Strategy, Tuesday group": the programme each of these people holds an
 * active seat on, and the group, by uid. A learner's seat comes before a
 * facilitator's, and the newer before the older. The group is named only
 * where the placement may be shown to this viewer (`placementIsShownTo`):
 * an admin always, anybody else once Publish has told its owner. A person
 * with no seat on a live run has no entry.
 */
async function placesOf(db: Firestore, uids: readonly string[], isAdmin: boolean): Promise<Map<string, string>> {
  const seats: CourseEnrolmentDoc[] = [];
  for (let i = 0; i < uids.length; i += IN_FILTER_LIMIT) {
    const snap = await db
      .collection("courseEnrolments")
      .where("uid", "in", uids.slice(i, i + IN_FILTER_LIMIT))
      .get();
    for (const doc of snap.docs) seats.push(normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  }
  const active = seats
    .filter((seat) => seat.status === "active" && seat.runId !== "")
    .sort(
      (a, b) =>
        (a.role === "learner" ? 0 : 1) - (b.role === "learner" ? 0 : 1) ||
        (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id),
    );
  if (active.length === 0) return new Map();

  const runIds = [...new Set(active.map((seat) => seat.runId))];
  const groupIds = [...new Set(active.map((seat) => seat.groupId).filter((id): id is string => Boolean(id)))];
  const [runSnaps, groupSnaps] = await Promise.all([
    db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))),
    groupIds.length > 0 ? db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id))) : Promise.resolve([]),
  ]);
  const runs = new Map(
    runSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [snap.id, normalizeCourseRun(snap.id, snap.data() ?? {})] as const),
  );
  const groups = new Map(
    groupSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {})] as const),
  );

  const out = new Map<string, string>();
  for (const seat of active) {
    if (out.has(seat.uid)) continue;
    const run = runs.get(seat.runId);
    if (!run || !LIVE_RUN(run)) continue;
    const programme = run.courseTitle.trim();
    if (!programme) continue;
    const group =
      seat.groupId && placementIsShownTo(seat, { isAdmin }) ? groups.get(seat.groupId)?.name.trim() : "";
    out.set(seat.uid, group ? `${programme}, ${group}` : programme);
  }
  return out;
}
