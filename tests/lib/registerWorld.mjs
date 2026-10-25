/**
 * One course run in its second week, with registers to take and finish, for
 * the suites about how a register ends (wk-register, option B): finishing,
 * next week's email on its schedule, the facilitators' reminder and the task
 * for the programme's lead and the admins.
 *
 * ## What it is made of
 *
 * The application form, its programmes and its committee are
 * `applicationsSmallTerm`'s: AGI Strategy's lead is `claudia`. Its programme
 * names `RUN`, so the run's lead is hers. A second run, `OTHER_RUN`, is named
 * by no programme, so it has no lead.
 *
 * `RUN` starts on Thursday 15 October 2026 and runs six weeks, Thursday to
 * Wednesday. Two groups meet in it:
 *
 *  - Group B, Tuesdays 6pm to 8pm in Room C20, facilitated by Rahul and Sofia,
 *    with Amara, Chloe and Farah in it. Week 2's session is Tuesday 27
 *    October, the first Tuesday after the clocks go back on Sunday 25 October.
 *  - Group A, Mondays 6pm to 8pm in Room A13, facilitated by Amelia, with Ana
 *    in it. Week 2's session is Monday 26 October, so two days before it is
 *    Saturday 24 October, before the clocks go back.
 *
 * Weeks 1 and 2 are published; weeks 3 to 6 are not.
 *
 * ## What is real and what is stubbed
 *
 * Real: every handler and job a suite loads, the libraries behind them, the
 * access predicates, the standing checks, the email templates, the claims and
 * the rate limiter. Stubbed: `server-only`, `next/server`, the Admin SDK's
 * sentinels and handle, the session, the view-as guard and the one mail door,
 * which writes down what it was handed and sends nothing.
 */
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import {
  AGI,
  CAST as TERM_CAST,
  ROUND,
  seedTerm,
  session,
  userDoc,
} from "./applicationsSmallTerm.mjs";
import { courseView } from "./courseRunStore.mjs";
import { createLoader } from "./tsLoader.mjs";

export { AGI, ROUND };

// ---------------------------------------------------------------------------
// The cast and the course
// ---------------------------------------------------------------------------

export const CAST = {
  ...TERM_CAST,
  rahul: session("rahul", "member", false, "Rahul Mehta"),
  sofia: session("sofia", "member", false, "Sofia Rossi"),
  amelia: session("amelia", "member", false, "Amelia Hart"),
  pia: session("pia", "member", false, "Pia Lund"),
  chloe: session("chloe", "member", false, "Chloe Nguyen"),
  farah: session("farah", "member", false, "Farah Hussain"),
  ana: session("ana", "member", false, "Ana Silva"),
  // A member on no run at all.
  nell: session("nell", "member", false, "Nell Carter"),
};

export const COURSE = "agi-strategy-fellowship__crs00001";
export const OTHER_COURSE = "pre-course__crs00002";
export const RUN = "agi-strategy-fellowship-autumn-2026__run00001";
/** A run no programme names: it has no lead. */
export const OTHER_RUN = "pre-course-autumn-2026__run00002";

export const GROUP = {
  /** Tuesdays 18:00 to 20:00, Room C20, Rahul and Sofia. */
  b: "autumn-2026-group-b__grp0000b",
  /** Mondays 18:00 to 20:00, Room A13, Amelia. */
  a: "autumn-2026-group-a__grp0000a",
  /** OTHER_RUN's one group: Tuesdays 18:00 to 20:00, Room P1, Pia. */
  other: "pre-course-group__grp0000c",
};

/** Who is in each group. */
export const MEMBERS = {
  [GROUP.b]: ["amara", "chloe", "farah"],
  [GROUP.a]: ["ana"],
  [GROUP.other]: ["dev"],
};

/** The instants the suites move the clock to. All in London. */
export const AT = {
  /** Tuesday 20 October, 7:58pm BST: week 1's register for Group B, just taken. */
  week1Evening: new Date("2026-10-20T18:58:00Z"),
  /** Saturday 24 October, 5:59pm BST: one minute before Group A's email is due. */
  beforeGroupA: new Date("2026-10-24T16:59:00Z"),
  /** Saturday 24 October, 6pm BST: Group A's email, two days before Monday 6pm. */
  groupADue: new Date("2026-10-24T17:00:00Z"),
  /** Saturday 24 October, 7pm BST: where 48 elapsed hours would have put it. */
  groupAElapsed: new Date("2026-10-24T18:00:00Z"),
  /** Sunday 25 October, 5:59pm GMT: one minute before Group B's email. */
  beforeGroupB: new Date("2026-10-25T17:59:00Z"),
  /** Sunday 25 October, 6pm GMT: Group B's email, two days before Tuesday 6pm. */
  groupBDue: new Date("2026-10-25T18:00:00Z"),
  /** Tuesday 27 October, 6pm GMT: Group B's week 2 session starts. */
  groupBStarts: new Date("2026-10-27T18:00:00Z"),
};

const SENT_ON = new Date("2026-10-13T09:00:00Z");

const plan = () =>
  Array.from({ length: 6 }, (_, i) => ({
    kind: "week",
    weekNumber: i + 1,
    weekId: `w0${i + 1}`,
  }));

/** A course run, as the course editor and the routes leave one. */
export function runDoc(over = {}) {
  return {
    courseId: COURSE,
    courseTitle: "AGI Strategy Fellowship",
    label: "Autumn 2026",
    academicYear: "2026/27",
    status: "running",
    enrolMode: "admissions",
    startDate: "2026-10-15",
    weekPlan: plan(),
    applicationForm: [],
    applicationsOpenAt: null,
    applicationsCloseAt: null,
    applicationCap: null,
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: [],
    applicationCounts: { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 },
    groupCount: 2,
    enrolledCount: 4,
    archived: false,
    authorUid: "zach",
    ...over,
  };
}

/** A group with a weekly session. `weekday` is 0 for Sunday. */
export function groupDoc(over = {}) {
  return {
    runId: RUN,
    courseId: COURSE,
    name: "Group B",
    facilitatorUids: ["rahul", "sofia"],
    capacity: 8,
    memberCount: 3,
    archived: false,
    session: {
      weekday: 2,
      startTimeLocal: "18:00",
      durationMinutes: 120,
      location: "Room C20",
      meetingUrl: null,
      notes: "",
    },
    sessionOverrides: {},
    sessionModes: {},
    ...over,
  };
}

/** One week of the run, published or not. */
export function weekDoc(weekNumber, over = {}) {
  return {
    weekNumber,
    title: `Week ${weekNumber} theme`,
    summary: `What week ${weekNumber} is about.`,
    guideBlocks: [],
    materials: [
      {
        id: `m${weekNumber}`,
        type: "reading",
        title: `Reading for week ${weekNumber}`,
        url: `https://reading.example.com/${weekNumber}`,
        estimatedMinutes: 45,
      },
    ],
    exercises: [],
    checklist: [],
    estimatedMinutes: 75,
    published: weekNumber <= 2,
    ...over,
  };
}

function enrolmentDoc(runId, courseId, groupId, uid) {
  return {
    runId,
    courseId,
    uid,
    groupId,
    status: "active",
    role: "learner",
    streamId: null,
    selfEnrolled: false,
    applicationId: null,
    joinedWeekNumber: 1,
    // The empty record a placement starts with, which finishing a register
    // rebuilds in full.
    attendance: {
      sessionsHeld: 0,
      attendedInFull: 0,
      late: 0,
      leftEarly: 0,
      absent: 0,
      excused: 0,
      lastPushedSessionKey: null,
      lastComputedAt: null,
    },
    // Publish has told them their group, so every rule that waits for that has
    // been met.
    allocatedEmailAt: SENT_ON,
    createdAt: SENT_ON,
    updatedAt: SENT_ON,
  };
}

function subscriptionDoc(runId, uid) {
  return {
    email: `${uid}@example.com`,
    channel: `cohort:${runId}`,
    audience: "user",
    audienceId: uid,
    name: CAST[uid].displayName,
    confirmed: true,
    confirmedAt: SENT_ON,
    subscribed: true,
    subscribedAt: SENT_ON,
    source: "allocation",
    createdAt: SENT_ON,
  };
}

/** The whole world as documents by path. `over` adds or replaces whole documents. */
export function seedWorld({ over = {}, scheduled = false, reminders = false, tasks = true } = {}) {
  const docs = seedTerm();
  // AGI Strategy names the run, as an admin's press on its Settings tab leaves it.
  const form = docs[`admissionRounds/${ROUND}`];
  form.programmes[AGI].courseId = COURSE;
  form.programmes[AGI].runId = RUN;

  for (const who of Object.values(CAST)) docs[`users/${who.uid}`] = userDoc(who);

  docs[`courses/${COURSE}`] = { title: "AGI Strategy Fellowship", status: "published" };
  docs[`courses/${OTHER_COURSE}`] = { title: "Pre-course", status: "published" };
  docs[`courseRuns/${RUN}`] = runDoc();
  docs[`courseRuns/${OTHER_RUN}`] = runDoc({
    courseId: OTHER_COURSE,
    courseTitle: "Pre-course",
    groupCount: 1,
    enrolledCount: 1,
  });
  for (let n = 1; n <= 6; n += 1) {
    docs[`courseRuns/${RUN}/weeks/w0${n}`] = weekDoc(n);
    docs[`courseRuns/${OTHER_RUN}/weeks/w0${n}`] = weekDoc(n);
  }

  docs[`courseGroups/${GROUP.b}`] = groupDoc();
  docs[`courseGroups/${GROUP.a}`] = groupDoc({
    name: "Group A",
    facilitatorUids: ["amelia"],
    memberCount: 1,
    session: {
      weekday: 1,
      startTimeLocal: "18:00",
      durationMinutes: 120,
      location: "Room A13",
      meetingUrl: null,
      notes: "",
    },
  });
  docs[`courseGroups/${GROUP.other}`] = groupDoc({
    runId: OTHER_RUN,
    courseId: OTHER_COURSE,
    name: "Pre-course group",
    facilitatorUids: ["pia"],
    memberCount: 1,
    session: {
      weekday: 2,
      startTimeLocal: "18:00",
      durationMinutes: 120,
      location: "Room P1",
      meetingUrl: null,
      notes: "",
    },
  });

  for (const [groupId, uids] of Object.entries(MEMBERS)) {
    const runId = groupId === GROUP.other ? OTHER_RUN : RUN;
    const courseId = groupId === GROUP.other ? OTHER_COURSE : COURSE;
    for (const uid of uids) {
      docs[`courseEnrolments/${runId}__${uid}`] = enrolmentDoc(runId, courseId, groupId, uid);
      docs[`subscriptions/sub_${uid}__cohort-${runId}`] = subscriptionDoc(runId, uid);
    }
  }
  // The facilitators' own enrolments, as the facilitators route writes them:
  // a null group, on purpose, so a facilitator is never a row of a register.
  for (const [runId, courseId, uids] of [
    [RUN, COURSE, ["rahul", "sofia", "amelia"]],
    [OTHER_RUN, OTHER_COURSE, ["pia"]],
  ]) {
    for (const uid of uids) {
      docs[`courseEnrolments/${runId}__${uid}`] = {
        ...enrolmentDoc(runId, courseId, null, uid),
        role: "facilitator",
      };
    }
  }

  docs["config/scheduler"] = {
    enabled: true,
    jobs: {
      "courses-next-week-email": { enabled: scheduled },
      "courses-register-reminders": { enabled: reminders },
      "courses-unmarked-registers": { enabled: tasks },
    },
  };
  return { ...docs, ...over };
}

// ---------------------------------------------------------------------------
// The world a suite runs in
// ---------------------------------------------------------------------------

/**
 * The Admin SDK's sentinels, a `Timestamp` that hands back the Date it was
 * given (the store keeps Dates, and every reader here takes a Date as a
 * stored instant), and a `FieldPath` the store can read as the dotted path it
 * names.
 */
const FIRESTORE_STUB =
  FIELD_VALUE_STUB.replace(
    "export class Timestamp {}",
    "export class Timestamp {" +
      " static now() { return new Date(); }" +
      " static fromDate(date) { return date; }" +
      " static fromMillis(ms) { return new Date(ms); }" +
      " }",
  ) + " export class FieldPath extends String { constructor(...segments) { super(segments.join('.')); } }";

const NEXT_SERVER_STUB =
  "export class NextResponse {\n" +
  "  constructor(body, init) {\n" +
  "    this.body = body;\n" +
  "    this.status = (init && init.status) || 200;\n" +
  "    this.headers = (init && init.headers) || {};\n" +
  "  }\n" +
  "  static json(body, init) { return new NextResponse(body, init); }\n" +
  "  async json() { return this.body; }\n" +
  "}";

/**
 * A stand-in for `sendEmail`: it writes down what it was handed, and that is
 * all. `./send` is also the push module's own door (`src/lib/push/send.ts`,
 * reached through the jobs the tick loads), so the same stand-in answers for
 * a push as well, and records nothing: no suite here is about a push.
 */
const MAIL_DOOR = (handle) =>
  "export async function sendEmail(args) {\n" +
  `  const world = ${handle};\n` +
  "  if (world.mailFails && world.mailFails(args)) throw new Error('the transport refused');\n" +
  "  world.mail.push(args);\n" +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}\n" +
  "export async function sendPushToUid() {\n" +
  "  return { sent: 0, pruned: 0, deferred: 0, failed: 0, retried: 0 };\n" +
  "}";

for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "EMAIL_AUDIENCE"]) {
  delete process.env[name];
}
// The unsubscribe links are signed for real, so a signing key is set.
process.env.EVENTS_TOKEN_SECRET = "a-test-signing-key-that-is-long-enough-to-pass";
process.env.NEXT_PUBLIC_APP_URL = "https://naisi.invalid";

/**
 * A world, its loader and the way to make a request in it. `key` names the
 * handle on `globalThis` the stubs read. `extraStubs` are `[specifier,
 * source]` pairs added after the world's own, as the hand-over world takes
 * them, for a suite that also draws a page component (its stylesheets, its
 * data hook): an extra wins over a default of the same name.
 */
export function makeWorld(key = "__register", extraStubs = []) {
  const world = {
    db: null,
    user: null,
    viewAs: false,
    /** Every message handed to the one mail door. */
    mail: [],
    /** When set, the mail door throws for a message this returns true for. */
    mailFails: null,
  };
  globalThis[key] = world;
  const handle = `globalThis[${JSON.stringify(key)}]`;

  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["next/server", NEXT_SERVER_STUB],
      ["firebase-admin/firestore", FIRESTORE_STUB],
      ["@/lib/firebase/admin", `export function getAdminDb() { return ${handle}.db; }`],
      ["@/lib/firebase/session", `export async function getCurrentUser() { return ${handle}.user; }`],
      [
        "@/lib/firebase/impersonation",
        "export async function assertNotImpersonating() {\n" +
          `  return ${handle}.viewAs ? { status: 403, body: { error: 'view-as' } } : null;\n` +
          "}\n" +
          "export async function getImpersonator() { return null; }\n" +
          "export function markerIsLive() { return false; }",
      ],
      ["@/lib/email/send", MAIL_DOOR(handle)],
      ["./send", MAIL_DOOR(handle)],
      ["@/lib/push/courseNotifications", "export async function mirrorCourseDecisionToPush() {}"],
      ...extraStubs,
    ]),
  });

  /** Start again from a seed. Returns the store. */
  function reset(seed = seedWorld()) {
    // A serverTimestamp is the clock the suite has set.
    world.db = courseView(makeDb(seed, { now: () => new Date() }));
    world.user = null;
    world.viewAs = false;
    world.mail.length = 0;
    world.mailFails = null;
    return world.db;
  }

  /** The session a request arrives with: the account as it is stored right now. */
  function sessionOf(uid) {
    if (!uid) return null;
    const account = world.db.read(`users/${uid}`);
    if (!account) return null;
    return {
      uid,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      suRecognised: account.suRecognised === true,
      permissions: CAST[uid]?.permissions ?? TERM_CAST.zach.permissions,
    };
  }

  /**
   * One request to a real handler, as `who` (a uid, or null for nobody
   * signed in). Answers `{ status, body }`; a handler that throws is a 599.
   */
  async function call(who, handler, params, { body, viewAs = false, query = "" } = {}) {
    world.user = sessionOf(who);
    world.viewAs = viewAs;
    const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    try {
      const response = await handler(new Request(`https://naisi.invalid/api${query}`, init), {
        params: Promise.resolve(params),
      });
      return { status: response.status, body: structuredClone(response.body) };
    } catch (err) {
      return { status: 599, body: { error: String(err?.stack ?? err) } };
    } finally {
      world.viewAs = false;
    }
  }

  const courseRoute = (...parts) => loadTs(join("app", "api", "courses", ...parts, "route.ts"));
  const lib = (...parts) => loadTs(join("lib", ...parts));

  return { world, loadTs, reset, call, courseRoute, lib, sessionOf };
}

/** The register's document path for one session of one group. */
export const registerPath = (groupId, weekNumber, runId = RUN) =>
  `courseAttendance/${runId}__${groupId}__w0${weekNumber}`;

/** A job context at `now`, as the tick hands one over. */
export function jobContext(job, now, { remainingMs = 20_000, maxPerTick } = {}) {
  const logged = [];
  return {
    logged,
    ctx: {
      now,
      budget: { remainingMs: () => remainingMs, expired: () => remainingMs <= 0 },
      log: (message, extra) => logged.push([message, extra]),
      policy: { reclaimAfterMinutes: Math.max(job.reclaimAfterMinutes, 5), maxAttempts: 3 },
      maxPerTick: maxPerTick ?? job.maxPerTick,
      maxLateHours: job.maxLateHours,
    },
  };
}
