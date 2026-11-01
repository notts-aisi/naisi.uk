import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normaliseApplication } from "@/lib/applications/normalise";
import { APPLICATIONS_COLLECTION } from "@/lib/firestore/admissionApplications";
import {
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { normalizeRsvp, type FormQuestion, type RsvpDoc } from "@/lib/firestore/events";
import {
  MEMBERSHIPS_COLLECTION,
  MEMBERSHIP_CONFIG_PATH,
  TIER_COUNTS_AS_MEMBER,
  membershipId,
  normalizeMembership,
  type MembershipDoc,
} from "@/lib/firestore/memberships";
import type { SessionUser } from "@/lib/firebase/session";
import { LIVE_RUN, staffNamesFor } from "@/lib/names/load";
import { guestStaffName, type StaffName } from "@/lib/names/staffName";
import { missedEventsOf } from "./missedEvents";
import {
  REQUEST_WORDS,
  answerLines,
  facilitatesWords,
  placeWords,
  type AboutLine,
  type SignupRequestView,
} from "./requestWords";

/**
 * WHO IS ASKING FOR A PLACE: the small card under each request on an event's
 * Sign-ups page, and the requests as each viewer is sent them.
 *
 * The privacy policy says: "The people organising an event may see who has
 * asked for a place, with a few words about each: whether you are on a
 * programme and in which group, whether you facilitate a group, and whether
 * you hold SU membership." Those are the card's lines, for everybody who sees
 * the requests (`src/lib/events/signupAccess.ts`):
 *
 *  - A PLACE ON A PROGRAMME that is still going: "AGI Strategy · Group K",
 *    the group named only where the placement may be shown to the viewer
 *    (`placementIsShownTo`: an admin always, anybody else once Publish has
 *    told its owner), else "AGI Strategy · not in a group yet".
 *  - FACILITATING a group on one: "Facilitator · AGI Strategy, Group C".
 *  - MEMBERSHIP this year: "SU member" or "Not an SU member", read off the
 *    current period's row. With no current period set, nothing is said.
 *  - A REQUEST WITH NO ACCOUNT: "Guest, no account", and nothing else.
 *
 * Admins are also told where the membership came from ("SU member: bought",
 * "SU member: marked by an admin"), whether the person's latest application
 * offered to facilitate, the way to the person's page, and, apart from the
 * card's lines, "Didn't come to the last 2 events they had a place at." when
 * that is so (`src/lib/events/missedEvents.ts`, privacy v15's
 * "Attendance"). Nobody else is, because the policy's few words do not
 * include them, the application is not theirs to read, and one person's
 * attendance is an admin's alone.
 *
 * Every read is by id, by an `in` on one field or by `array-contains` on one
 * field, so no composite index is owed.
 */

/** Firestore's cap on the values one `in` filter takes. */
const IN_FILTER_LIMIT = 30;
/** Applications read for each person at most: one per form, and there is one form a term. */
const APPLICATIONS_EACH = 20;

/** What the card's reads hand back, before any of it is put into words. */
type Facts = {
  /** Each person's active places on runs, a learner's row each. */
  seats: CourseEnrolmentDoc[];
  /** The groups each person facilitates, by uid. */
  facilitating: Map<string, CourseGroupDoc[]>;
  /** Each person's membership row this year, by uid; null when no current period is set. */
  membership: Map<string, MembershipDoc> | null;
  /** The people whose latest application offered to facilitate. Read for an admin alone. */
  offered: Set<string>;
};

async function seatsOf(db: Firestore, uids: readonly string[]): Promise<CourseEnrolmentDoc[]> {
  const seats: CourseEnrolmentDoc[] = [];
  for (let i = 0; i < uids.length; i += IN_FILTER_LIMIT) {
    const snap = await db
      .collection("courseEnrolments")
      .where("uid", "in", uids.slice(i, i + IN_FILTER_LIMIT))
      .get();
    for (const doc of snap.docs) seats.push(normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  }
  // A facilitator's own row is not a place: their facilitating is the group's.
  return seats.filter((seat) => seat.status === "active" && seat.role === "learner" && seat.runId !== "");
}

async function groupsFacilitatedBy(db: Firestore, uids: readonly string[]): Promise<Map<string, CourseGroupDoc[]>> {
  const out = new Map<string, CourseGroupDoc[]>();
  const asked = new Set(uids);
  for (let i = 0; i < uids.length; i += IN_FILTER_LIMIT) {
    const snap = await db
      .collection("courseGroups")
      .where("facilitatorUids", "array-contains-any", uids.slice(i, i + IN_FILTER_LIMIT))
      .get();
    for (const doc of snap.docs) {
      const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
      if (group.archived) continue;
      for (const person of group.facilitatorUids) {
        if (!asked.has(person)) continue;
        const theirs = out.get(person) ?? [];
        if (!theirs.some((known) => known.id === group.id)) out.set(person, [...theirs, group]);
      }
    }
  }
  return out;
}

/** Each person's row in the current membership period, where it counts as membership. */
async function membershipOf(db: Firestore, uids: readonly string[]): Promise<Map<string, MembershipDoc> | null> {
  const config = await db.collection(MEMBERSHIP_CONFIG_PATH.collection).doc(MEMBERSHIP_CONFIG_PATH.doc).get();
  const periodId = config.data()?.currentPeriodId;
  if (typeof periodId !== "string" || periodId === "") return null;
  const snaps = await db.getAll(...uids.map((person) => db.collection(MEMBERSHIPS_COLLECTION).doc(membershipId(person, periodId))));
  const out = new Map<string, MembershipDoc>();
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const row = normalizeMembership(snap.id, snap.data() ?? {});
    // A row nobody revoked, in a tier that counts: alumni is a fact about the person, not membership.
    if (row.revokedAt === null && TIER_COUNTS_AS_MEMBER[row.tier]) out.set(uids[i], row);
  });
  return out;
}

/**
 * The people whose latest application of record said yes to facilitating: of
 * their applications on a form, the one sent most recently and not given back.
 */
async function offeredToFacilitate(db: Firestore, uids: readonly string[]): Promise<Set<string>> {
  const latest = new Map<string, { at: number; offered: boolean }>();
  for (let i = 0; i < uids.length; i += IN_FILTER_LIMIT) {
    const chunk = uids.slice(i, i + IN_FILTER_LIMIT);
    const snap = await db
      .collection(APPLICATIONS_COLLECTION)
      .where("uid", "in", chunk)
      .limit(chunk.length * APPLICATIONS_EACH)
      .get();
    for (const doc of snap.docs) {
      const application = normaliseApplication(doc.id, doc.data() ?? {});
      if (!application?.sent || application.status === "withdrawn") continue;
      const at = application.sentAt?.getTime() ?? 0;
      const known = latest.get(application.uid);
      if (!known || at > known.at) latest.set(application.uid, { at, offered: application.sent.wantsToFacilitate === true });
    }
  }
  return new Set([...latest].filter(([, read]) => read.offered).map(([person]) => person));
}

async function readFacts(db: Firestore, uids: readonly string[], isAdmin: boolean): Promise<Facts> {
  const [seats, facilitating, membership, offered] = await Promise.all([
    seatsOf(db, uids),
    groupsFacilitatedBy(db, uids),
    membershipOf(db, uids),
    isAdmin ? offeredToFacilitate(db, uids) : Promise.resolve(new Set<string>()),
  ]);
  return { seats, facilitating, membership, offered };
}

async function runsAndGroups(
  db: Firestore,
  facts: Facts,
): Promise<{ runs: Map<string, CourseRunDoc>; groups: Map<string, CourseGroupDoc> }> {
  const runIds = [
    ...new Set([...facts.seats.map((seat) => seat.runId), ...[...facts.facilitating.values()].flat().map((group) => group.runId)]),
  ].filter((id) => id !== "");
  const groupIds = [...new Set(facts.seats.map((seat) => seat.groupId).filter((id): id is string => Boolean(id)))];
  const [runSnaps, groupSnaps] = await Promise.all([
    runIds.length > 0 ? db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))) : Promise.resolve([]),
    groupIds.length > 0 ? db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id))) : Promise.resolve([]),
  ]);
  const runs = new Map<string, CourseRunDoc>();
  for (const snap of runSnaps) if (snap.exists) runs.set(snap.id, normalizeCourseRun(snap.id, snap.data() ?? {}));
  const groups = new Map<string, CourseGroupDoc>();
  for (const snap of groupSnaps) if (snap.exists) groups.set(snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {}));
  return { runs, groups };
}

/** The programme a live run is, by the title staff screens use, or null for a run that is over or untitled. */
function programmeOf(runs: Map<string, CourseRunDoc>, runId: string): string | null {
  const run = runs.get(runId);
  if (!run || !LIVE_RUN(run)) return null;
  return run.courseTitle.trim() || null;
}

function membershipLine(row: MembershipDoc | undefined, isAdmin: boolean): AboutLine {
  if (!row) return { kind: "notMember", words: REQUEST_WORDS.notMember };
  if (!isAdmin) return { kind: "member", words: REQUEST_WORDS.member };
  if (row.source !== "su-import") return { kind: "member", words: REQUEST_WORDS.byAdmin };
  return { kind: "member", words: row.tier === "paid" ? REQUEST_WORDS.bought : REQUEST_WORDS.fromList };
}

/**
 * WHAT THE CARD SAYS ABOUT EACH ACCOUNT THAT ASKED, by uid, for a viewer who
 * sees the requests. `isAdmin` is the session's own role: it adds the
 * membership's source and the offer to facilitate, and names a group Publish
 * has not told anybody about yet.
 */
export async function aboutAccounts(
  db: Firestore,
  uids: readonly string[],
  viewer: { isAdmin: boolean },
): Promise<Map<string, AboutLine[]>> {
  const wanted = [...new Set(uids.filter((uid) => typeof uid === "string" && uid !== ""))];
  const out = new Map<string, AboutLine[]>();
  if (wanted.length === 0) return out;
  const { isAdmin } = viewer;
  const facts = await readFacts(db, wanted, isAdmin);
  const { runs, groups } = await runsAndGroups(db, facts);

  const newestFirst = [...facts.seats].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id),
  );
  for (const person of wanted) {
    const lines: AboutLine[] = [];
    const facilitated = (facts.facilitating.get(person) ?? []).filter((group) => programmeOf(runs, group.runId) !== null);
    for (const seat of newestFirst) {
      if (seat.uid !== person) continue;
      const programme = programmeOf(runs, seat.runId);
      if (!programme) continue;
      // A facilitator who holds a place sits in the group they facilitate: the facilitator's line says both.
      if (seat.groupId && facilitated.some((group) => group.id === seat.groupId)) continue;
      const group = seat.groupId && placementIsShownTo(seat, { isAdmin }) ? groups.get(seat.groupId)?.name.trim() || null : null;
      lines.push({ kind: "place", words: placeWords(programme, group) });
    }
    for (const group of facilitated) {
      const programme = programmeOf(runs, group.runId);
      const name = group.name.trim();
      if (programme && name) lines.push({ kind: "facilitates", words: facilitatesWords(programme, name) });
    }
    if (facts.offered.has(person)) lines.push({ kind: "offered", words: REQUEST_WORDS.offered });
    if (facts.membership) lines.push(membershipLine(facts.membership.get(person), isAdmin));
    out.set(person, lines);
  }
  return out;
}

/**
 * The requests for a place at one event that are waiting for a decision,
 * oldest first: the order they arrived in. One equality on one field, so no
 * composite index is owed; the event's other sign-ups are read and left here.
 */
export async function waitingRequests(db: Firestore, eventId: string): Promise<RsvpDoc[]> {
  const rows = await db.collection("eventRsvps").where("eventId", "==", eventId).get();
  return rows.docs
    .map((doc) => normalizeRsvp(doc.id, doc.data() ?? {}))
    .filter((row) => row.status === "pending")
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/** What `projectSignupRequests` draws on besides the requests themselves. */
export type RequestFacts = {
  names: Map<string, StaffName>;
  about: Map<string, AboutLine[]>;
  /** The accounts whose last two events that count went by without them. Read for an admin alone. */
  missed: ReadonlySet<string>;
};

/**
 * The names and the cards of the people asking, for the session looking:
 * every name through `staffNamesFor` with that viewer, so the committee and
 * admins read the full name and anybody else the name people go by, and the
 * card's lines as `aboutAccounts` gives them to the viewer's role. `everyone`
 * says whether the viewer sees each address already, as the whole list does.
 * For an admin alone, who among them did not come to the last two events
 * they had a place at, as at `now`; for anybody else that is never read.
 */
export async function requestFacts(
  db: Firestore,
  requests: readonly RsvpDoc[],
  viewer: SessionUser,
  access: { everyone: boolean },
  now: Date,
): Promise<RequestFacts> {
  const uids = requests.map((row) => row.uid).filter((uid): uid is string => typeof uid === "string" && uid !== "");
  const [names, about, missed] = await Promise.all([
    staffNamesFor(db, uids, viewer, { emailShown: access.everyone }),
    aboutAccounts(db, uids, { isAdmin: viewer.role === "admin" }),
    viewer.role === "admin" ? missedEventsOf(db, uids, now) : Promise.resolve(new Set<string>()),
  ]);
  return { names, about, missed };
}

/** What a request's name says when its account holds no name, or is gone. */
const NO_NAME = "NAISI member";

/**
 * THE REQUESTS AS ONE VIEWER IS SENT THEM. `everyone` is the bar for the whole
 * list (admins and SU-recognised committee): they are sent each address,
 * every answer, and the name the sign-up was made with where the account
 * holds none. Everybody else is sent no address, no answer to a dietary or
 * accessibility question, and nothing the request stored about an account's
 * name, which can be an address or a name from before the name rule. `names`
 * comes from `staffNamesFor` for the same viewer. Whether somebody missed the
 * last two events they had a place at is sent to an admin alone.
 */
export function projectSignupRequests(
  requests: readonly RsvpDoc[],
  questions: readonly FormQuestion[],
  facts: RequestFacts,
  viewer: { everyone: boolean; isAdmin: boolean },
): SignupRequestView[] {
  return requests.map((request) => {
    const account = request.uid;
    let name: StaffName;
    if (!account) name = guestStaffName(request.name, "No name given");
    else {
      const stored = viewer.everyone ? request.name.trim() : "";
      name = facts.names.get(account) ?? { name: stored || NO_NAME, goBy: null, apart: null, note: null };
    }
    return {
      id: request.id,
      name,
      askedAt: request.createdAt ? request.createdAt.toISOString() : null,
      email: viewer.everyone && request.email ? request.email : null,
      answers: answerLines(questions, request.answers, { withFoodHealthAndAccess: viewer.everyone }),
      about: account ? (facts.about.get(account) ?? []) : [{ kind: "guest", words: REQUEST_WORDS.guest }],
      page: viewer.isAdmin && account ? `/admin/members/${encodeURIComponent(account)}` : null,
      missed: viewer.isAdmin && account !== null && facts.missed.has(account),
      test: request.synthetic,
    };
  });
}
