/**
 * One term after decision day, with the course runs its people go onto, for
 * the suites that take somebody accepted on the application form onto a
 * course run.
 *
 * ## What it is made of
 *
 * The form, its question sets and its committee are `applicationsSmallTerm`'s
 * (the term the application system's own suites use). On top of that:
 *
 *  - PEOPLE WHO HAVE BEEN TOLD. Decisions have been sent, and each person's
 *    own application carries what decision day published on it. The cast
 *    covers every way of standing after it: placed by their own ranking,
 *    placed on a lower choice, invited and not yet answered, no offer, and a
 *    place given back.
 *  - THE COURSE SIDE. Two courses with a run each and groups with a weekly
 *    session, stored the way the course editor writes them, plus a course
 *    that belongs to no programme.
 *
 * ## One database, two ways of asking
 *
 * The application system's code is handed the store as it is, so it is still
 * held to "one or two equalities and nothing else". A course route is handed
 * `courseView(db)`: the same documents, with the `limit()` those older routes
 * page by. `call(..., { course: true })` picks the second.
 *
 * ## What is real and what is stubbed
 *
 * Real: every handler a suite loads, the libraries behind it, the access
 * predicates, the standing checks, the rate limiter and the email templates.
 * Stubbed: `server-only`, `next/server`, the Admin SDK's sentinels and handle,
 * the session, the view-as guard, the push mirror and `sendEmail`, which
 * records what it was handed. No message can leave this process.
 */
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import {
  AGI,
  CAST as TERM_CAST,
  GRID,
  INCUBATOR,
  ROUND,
  TAIS,
  applicationPath,
  decisionPath,
  seedTerm,
  session,
  userDoc,
} from "./applicationsSmallTerm.mjs";
import { courseView } from "./courseRunStore.mjs";
import { createLoader } from "./tsLoader.mjs";

export { AGI, GRID, INCUBATOR, ROUND, TAIS, applicationPath, decisionPath };

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

/**
 * The committee is the small term's. `yusuf` is SU-recognised committee and
 * is named on nothing on the form: here he is the AGI run's track lead.
 * `lloyd` reviews AGI Strategy on the form, and is that run's admissions
 * reviewer. Neither is an admin.
 */
export const CAST = {
  ...TERM_CAST,
  // Applicants beyond the small term's four.
  bea: session("bea", "member", false, "Bea Lindqvist"),
  ines: session("ines", "member", false, "Ines Carvalho"),
  omar: session("omar", "member", false, "Omar Haddad"),
  tariq: session("tariq", "member", false, "Tariq Mensah"),
  // A member who applied to nothing, and holds no role anywhere.
  nobody: session("nobody", "member", false, "Nell Carter"),
};

export const COURSE = {
  agi: "agi-strategy-fellowship__c0urse01",
  tais: "technical-ai-safety__c0urse02",
  other: "pre-course__c0urse03",
};

export const RUN = {
  agi: "agi-strategy-autumn-2026__run00001",
  /** A second run of the AGI course, for "which run can it name". */
  agiSpring: "agi-strategy-spring-2027__run00002",
  tais: "technical-ai-safety-autumn-2026__run00003",
  /** A run of a course no programme is tied to. */
  other: "pre-course-autumn-2026__run00004",
};

export const GROUP = {
  /** Mondays 18:00 to 19:30. */
  monday: "agi-autumn-2026-monday__grp00001",
  /** Thursdays 10:00 to 11:30. */
  thursday: "agi-autumn-2026-thursday__grp00002",
  /** No session time set yet. */
  unset: "agi-autumn-2026-tbc__grp00003",
};

// ---------------------------------------------------------------------------
// Painted weeks
// ---------------------------------------------------------------------------

/**
 * A painted week on the form's own grid (09:00 to 21:00 in quarter hours,
 * 48 slots a day, 12 hex characters). `spans` is weekday (0 is Sunday) to a
 * list of `[from, to]` wall clocks.
 */
export function week(spans = {}) {
  const days = [];
  for (let day = 0; day < 7; day += 1) {
    const slots = new Array(48).fill(false);
    for (const [from, to] of spans[day] ?? []) {
      const at = (clock) => {
        const [h, m] = clock.split(":").map(Number);
        return (h * 60 + m - GRID.startMinute) / GRID.slotMinutes;
      };
      for (let slot = at(from); slot < at(to); slot += 1) slots[slot] = true;
    }
    let hex = "";
    for (let c = 0; c < 12; c += 1) {
      let nibble = 0;
      for (let b = 0; b < 4; b += 1) if (slots[c * 4 + b]) nibble |= 8 >> b;
      hex += nibble.toString(16);
    }
    days.push(hex);
  }
  return { ...GRID, days };
}

/** Free Monday evening and Thursday morning: can make both AGI groups. */
const BOTH = week({ 1: [["17:00", "21:00"]], 4: [["09:00", "13:00"]] });
/** Free Monday evening only. */
const MONDAY_ONLY = week({ 1: [["18:00", "19:30"]] });
/** Free Monday from 18:00 to 19:00: half of the session, which is not the session. */
const HALF_OF_MONDAY = week({ 1: [["18:00", "19:00"]] });
/** Painted nothing. */
const NOTHING = week({});

// ---------------------------------------------------------------------------
// The term, after decision day
// ---------------------------------------------------------------------------

const APPLIED_ON = new Date("2026-10-09T14:20:00+01:00");
const SENT_ON = new Date("2026-10-23T09:00:00+01:00");

/**
 * What somebody sent, in the shapes the application system's own reader
 * takes. Each answer is a sentence no other document holds, so a suite can
 * fail on one turning up somewhere it has no business being.
 */
export const ANSWER = {
  why: "I keep changing my mind about timelines.",
  agi: "The EU code of practice came into force.",
  tais: "A probe for refusal directions.",
  motivation: "I want to know which arguments survive.",
};

function contentOf(who, ranked, painted) {
  const answers = { fellowships: { why: ANSWER.why } };
  if (ranked.includes(AGI)) answers[AGI] = { event: ANSWER.agi };
  if (ranked.includes(TAIS)) answers[TAIS] = { built: ANSWER.tais };
  return {
    aboutYou: {
      preferredName: who.displayName.split(" ")[0],
      universityEmail: `${who.uid}@students.example.com`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BSc Mathematics",
      expectedGraduation: "2028-07",
      motivation: ANSWER.motivation,
      interests: "Evaluations",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers,
    availability: painted,
    suMembership: "not-yet",
  };
}

/** One stored application, sent, as decision day and any reply left it. */
function applicationOf(who, ranked, painted, told, sent) {
  const content = contentOf(who, ranked, painted);
  const doc = {
    formVersion: 2,
    roundId: ROUND,
    uid: who.uid,
    email: who.email,
    displayName: who.displayName,
    draft: content,
    sent: content,
    status: sent ? told.status : "submitted",
    submittedAt: APPLIED_ON,
    sentAt: APPLIED_ON,
    withdrawnAt: null,
    result: sent ? told.result : null,
    invitation: sent ? (told.invitation ?? null) : null,
    attendance: null,
    createdAt: APPLIED_ON,
    updatedAt: APPLIED_ON,
  };
  if (sent && told.attendance) {
    doc.attendance = told.attendance;
    doc.withdrawnAt = told.withdrawnAt;
    doc.releaseReason = told.releaseReason;
  }
  return doc;
}

const accepted = (uid, programmeId) => ({
  decision: { roundId: ROUND, uid, programmes: { [programmeId]: lead("accept") }, pooledOutcome: null },
  result: { kind: "accepted", programmeId, publishedAt: SENT_ON, email: "sent", emailedAt: SENT_ON },
  status: "accepted",
});

const lead = (decision) => ({ decision, decidedByUid: "claudia", decidedAt: SENT_ON });

/**
 * [uid, ranking, painted week, what was decided and published].
 *
 *  - `amara`, `dev`, `bea`, `tariq`: accepted by AGI Strategy, their 1st choice.
 *  - `wen`: accepted by Technical AI Safety, ranked above AGI Strategy, which
 *    also accepted. One place a term: the place is on Technical AI Safety.
 *  - `nina`: accepted by AGI Strategy, and gave the place back before anybody
 *    was handed over.
 *  - `ines`: pooled by Technical AI Safety and invited to AGI Strategy. Not
 *    answered yet.
 *  - `omar`: pooled, and told no offer this time.
 */
const PEOPLE = [
  ["amara", [AGI, TAIS], BOTH, accepted("amara", AGI)],
  ["dev", [AGI], MONDAY_ONLY, accepted("dev", AGI)],
  ["bea", [AGI], NOTHING, accepted("bea", AGI)],
  ["tariq", [AGI], HALF_OF_MONDAY, accepted("tariq", AGI)],
  [
    "wen",
    [TAIS, AGI],
    BOTH,
    {
      decision: {
        roundId: ROUND,
        uid: "wen",
        programmes: { [TAIS]: lead("accept"), [AGI]: lead("accept") },
        pooledOutcome: null,
      },
      result: { kind: "accepted", programmeId: TAIS, publishedAt: SENT_ON, email: "sent", emailedAt: SENT_ON },
      status: "accepted",
    },
  ],
  [
    "nina",
    [AGI],
    BOTH,
    {
      ...accepted("nina", AGI),
      status: "withdrawn",
      attendance: { answer: "cant-make-it", answeredAt: SENT_ON },
      withdrawnAt: SENT_ON,
      releaseReason: { kind: "times", other: "" },
    },
  ],
  [
    "ines",
    [TAIS],
    MONDAY_ONLY,
    {
      decision: {
        roundId: ROUND,
        uid: "ines",
        programmes: { [TAIS]: { ...lead("pool"), poolReason: "capacity" } },
        pooledOutcome: { kind: "invite", programmeId: AGI, setByUid: "zach", setAt: SENT_ON },
      },
      result: { kind: "invited", programmeId: AGI, publishedAt: SENT_ON, email: "sent", emailedAt: SENT_ON },
      invitation: { programmeId: AGI, replyBy: "2026-10-25", response: null, respondedAt: null },
      status: "invited",
    },
  ],
  [
    "omar",
    [AGI],
    BOTH,
    {
      decision: {
        roundId: ROUND,
        uid: "omar",
        programmes: { [AGI]: { ...lead("pool"), poolReason: "capacity" } },
        pooledOutcome: { kind: "no-offer", setByUid: "zach", setAt: SENT_ON },
      },
      result: { kind: "no-offer", programmeId: null, publishedAt: SENT_ON, email: "sent", emailedAt: SENT_ON },
      status: "no-offer",
    },
  ],
];

/** Everybody who holds a place on AGI Strategy when the term is seeded, by uid. */
export const AGI_HOLDERS = ["amara", "bea", "dev", "tariq"];
/** Everybody who holds a place on Technical AI Safety. */
export const TAIS_HOLDERS = ["wen"];

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** A course run, as the course editor and the routes leave one. */
export function runDoc(over = {}) {
  return {
    courseId: COURSE.agi,
    courseTitle: "AGI Strategy Fellowship",
    label: "Autumn 2026",
    academicYear: "2026/27",
    status: "applications-open",
    enrolMode: "admissions",
    startDate: "2026-10-26",
    weekPlan: [
      { kind: "week", weekNumber: 1, weekId: "w01" },
      { kind: "week", weekNumber: 2, weekId: "w02" },
    ],
    applicationForm: [],
    applicationsOpenAt: null,
    applicationsCloseAt: null,
    applicationCap: null,
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: [],
    applicationCounts: { ...ZERO_COUNTS },
    groupCount: 0,
    enrolledCount: 0,
    archived: false,
    authorUid: "zach",
    ...over,
  };
}

/** A group with a weekly session. `weekday` is 0 for Sunday. */
export function groupDoc(over = {}) {
  return {
    runId: RUN.agi,
    courseId: COURSE.agi,
    name: "Monday evening",
    facilitatorUids: ["claudia"],
    capacity: 8,
    memberCount: 0,
    archived: false,
    session: {
      weekday: 1,
      startTimeLocal: "18:00",
      durationMinutes: 90,
      location: "Room B12",
      meetingUrl: null,
      notes: "",
    },
    ...over,
  };
}

/**
 * The whole world as documents by path. `sent: false` leaves the term not
 * yet marked as sent; `over` adds or replaces whole documents.
 */
export function seedWorld({ sent = true, round = {}, over = {} } = {}) {
  const docs = seedTerm({
    round: {
      status: "deciding",
      decisionsSentAt: sent ? SENT_ON : null,
      decisionsSentByUid: sent ? "zach" : null,
      ...round,
    },
  });
  // The form's programmes are tied to their courses, as their Settings tabs do it.
  const stored = docs[`admissionRounds/${ROUND}`];
  stored.programmes[AGI].courseId = COURSE.agi;
  stored.programmes[TAIS].courseId = COURSE.tais;

  for (const who of Object.values(CAST)) {
    docs[`users/${who.uid}`] = userDoc(who);
  }
  // Wen's account was waiting, and an acceptance approves it.
  docs["users/wen"] = userDoc({ ...CAST.wen, role: "member" });

  // The small term's own three sent applications are replaced by this cast.
  for (const path of Object.keys(docs)) {
    if (path.startsWith("admissionApplications/")) delete docs[path];
  }
  for (const [uid, ranked, painted, told] of PEOPLE) {
    docs[applicationPath(uid)] = applicationOf(CAST[uid], ranked, painted, told, sent);
    docs[decisionPath(uid)] = told.decision;
  }

  docs[`courses/${COURSE.agi}`] = { title: "AGI Strategy Fellowship", status: "published" };
  docs[`courses/${COURSE.tais}`] = { title: "Technical AI Safety Fellowship", status: "published" };
  docs[`courses/${COURSE.other}`] = { title: "Pre-course", status: "published" };

  docs[`courseRuns/${RUN.agi}`] = runDoc({
    // Named by an admin on the run, and on nothing on the form.
    trackLeadUids: ["yusuf"],
    admissionsReviewerUids: ["lloyd"],
    groupCount: 3,
  });
  docs[`courseRuns/${RUN.agiSpring}`] = runDoc({ label: "Spring 2027", status: "draft", startDate: "2027-02-01" });
  docs[`courseRuns/${RUN.tais}`] = runDoc({
    courseId: COURSE.tais,
    courseTitle: "Technical AI Safety Fellowship",
  });
  docs[`courseRuns/${RUN.other}`] = runDoc({ courseId: COURSE.other, courseTitle: "Pre-course" });

  docs[`courseGroups/${GROUP.monday}`] = groupDoc();
  docs[`courseGroups/${GROUP.thursday}`] = groupDoc({
    name: "Thursday morning",
    session: {
      weekday: 4,
      startTimeLocal: "10:00",
      durationMinutes: 90,
      location: "Room A3",
      meetingUrl: null,
      notes: "",
    },
  });
  docs[`courseGroups/${GROUP.unset}`] = groupDoc({
    name: "To be arranged",
    session: { weekday: 2, startTimeLocal: "", durationMinutes: 90, location: "", meetingUrl: null, notes: "" },
  });
  return { ...docs, ...over };
}

// ---------------------------------------------------------------------------
// The world a suite runs in
// ---------------------------------------------------------------------------

/** The Admin SDK's sentinels, and a `Timestamp` whose `now()` the subscription writer calls. */
const FIRESTORE_STUB = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }",
);

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

/** A stand-in for `sendEmail`: it writes down what it was handed, and that is all. */
const MAIL_DOOR = (handle) =>
  "export async function sendEmail(args) {\n" +
  `  ${handle}.mail.push(args);\n` +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}";

// Nothing here can reach a mail server even if a door were left open: with
// no transport configured the real sender refuses before it connects.
for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "EMAIL_AUDIENCE"]) {
  delete process.env[name];
}

/**
 * A world, its loader and the way to make a request in it. `key` names the
 * handle on `globalThis` the stubs read, so two suites in one process would
 * not share one.
 */
export function makeWorld(key = "__handover") {
  const world = {
    /** The store, as the application system's code is handed it. */
    db: null,
    /** The same documents, as a course route is handed them. */
    courseDb: null,
    /** Which of the two the next request gets. */
    course: false,
    user: null,
    viewAs: false,
    /** Every message handed to the one mail door. */
    mail: [],
    /** Every notification handed to the push mirror. */
    pushes: [],
  };
  globalThis[key] = world;
  const handle = `globalThis[${JSON.stringify(key)}]`;

  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["next/server", NEXT_SERVER_STUB],
      ["firebase-admin/firestore", FIRESTORE_STUB],
      [
        "@/lib/firebase/admin",
        `export function getAdminDb() { const w = ${handle}; return w.course ? w.courseDb : w.db; }`,
      ],
      ["@/lib/firebase/session", `export async function getCurrentUser() { return ${handle}.user; }`],
      [
        "@/lib/firebase/impersonation",
        "export async function assertNotImpersonating() {\n" +
          `  return ${handle}.viewAs ? { status: 403, body: { error: 'view-as' } } : null;\n` +
          "}\n" +
          // The marker of a view-as session an admin started, read as the
          // real module reads it: live unless it names the session's own uid.
          "export async function getImpersonator() {\n" +
          `  return ${handle}.viewAs ? { actorUid: 'zach', actorName: 'Zach Levin' } : null;\n` +
          "}\n" +
          "export function markerIsLive(marker, currentUid) {\n" +
          "  return marker !== null && marker.actorUid !== currentUid;\n" +
          "}",
      ],
      // The one mail door, under both names it is imported by: the
      // application system writes the alias, and the course emails beside
      // the door write `./send`. Both record and send nothing.
      ["@/lib/email/send", MAIL_DOOR(handle)],
      ["./send", MAIL_DOOR(handle)],
      [
        "@/lib/push/courseNotifications",
        "export async function mirrorCourseDecisionToPush(uid, note) {\n" +
          `  ${handle}.pushes.push({ uid, ...note });\n` +
          "}",
      ],
    ]),
  });

  /** Start again from a seed. Returns the store. */
  function reset(seed = seedWorld(), options = {}) {
    world.db = makeDb(seed, { now: () => new Date("2026-10-24T10:00:00Z"), ...options });
    world.courseDb = courseView(world.db);
    world.course = false;
    world.user = null;
    world.viewAs = false;
    world.mail.length = 0;
    world.pushes.length = 0;
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

  let requests = 0;

  /**
   * One request to a real handler, as `who` (a uid, or null for nobody
   * signed in). `course: true` hands the handler the course routes' view of
   * the database. Answers `{ status, body }`; a handler that throws is a 599.
   */
  async function call(who, handler, params, { body, course = false, viewAs = false } = {}) {
    requests += 1;
    world.user = sessionOf(who);
    world.course = course;
    world.viewAs = viewAs;
    const init = {
      method: handler.name,
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.${(requests >> 16) & 255}.${(requests >> 8) & 255}.${requests & 255}`,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    try {
      const response = await handler(new Request("https://naisi.invalid/api", init), {
        params: Promise.resolve(params),
      });
      return { status: response.status, body: structuredClone(response.body) };
    } catch (err) {
      return { status: 599, body: { error: String(err?.stack ?? err) } };
    } finally {
      world.course = false;
      world.viewAs = false;
    }
  }

  /** The whole database as one string, to prove a request wrote nothing. */
  const everything = () =>
    JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

  const formRoute = (...parts) =>
    loadTs(join("app", "api", "admissions", "forms", "[roundId]", ...parts, "route.ts"));
  const courseRoute = (...parts) => loadTs(join("app", "api", "courses", ...parts, "route.ts"));
  const lib = (...parts) => loadTs(join("lib", ...parts));

  return { world, loadTs, reset, call, everything, formRoute, courseRoute, lib, sessionOf };
}

/** `{ roundId, programmeId }`, for a programme's own routes. */
export const programmeParams = (programmeId) => ({ roundId: ROUND, programmeId });

// ---------------------------------------------------------------------------
// The join's routes, and the ways a suite asks them
// ---------------------------------------------------------------------------

/**
 * A term in which AGI Strategy names its course run, as an admin's press on
 * the programme's Settings tab would have left it. Takes what `seedWorld`
 * takes.
 */
export function namedSeed(options = {}) {
  const seed = seedWorld(options);
  seed[`admissionRounds/${ROUND}`].programmes[AGI].runId = RUN.agi;
  return seed;
}

/**
 * Every route the join touches, loaded for one suite, and one short function
 * for each request a suite makes of them. `made` is what `makeWorld` returned.
 * The form's own routes are handed the store as it is, and the course routes
 * the course view of it.
 */
export async function loadJoin(made) {
  const { world, call, formRoute, courseRoute } = made;
  const routes = {
    handOver: await formRoute("programmes", "[programmeId]", "run", "hand-over"),
    run: await formRoute("programmes", "[programmeId]", "run"),
    reply: await formRoute("application", "reply"),
    board: await courseRoute("runs", "[runId]", "allocation"),
    allocate: await courseRoute("runs", "[runId]", "allocate"),
    publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
    queue: await courseRoute("runs", "[runId]", "applications"),
    decide: await courseRoute("runs", "[runId]", "applications", "[uid]", "decide"),
    notes: await courseRoute("runs", "[runId]", "applications", "[uid]", "notes"),
    remove: await courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove"),
    me: await courseRoute("me"),
  };
  const rowPath = (uid, runId = RUN.agi) => `courseApplications/${runId}__${uid}`;
  return {
    routes,
    /** An admin's press of the hand-over, unless somebody else is named. */
    press: (who = "zach", programmeId = AGI, options) =>
      call(who, routes.handOver.POST, programmeParams(programmeId), options),
    /** The panel beside the button, as an admin reads it. */
    panel: async () => (await call("zach", routes.run.GET, programmeParams(AGI))).body.panel,
    /** A person's own reply on their application page. */
    reply: (who, body) => call(who, routes.reply.POST, { roundId: ROUND }, { body }),
    board: (who = "zach") => call(who, routes.board.GET, { runId: RUN.agi }, { course: true }),
    place: (who, placements) =>
      call(who, routes.allocate.POST, { runId: RUN.agi }, { body: { placements }, course: true }),
    publish: (who = "zach") => call(who, routes.publish.POST, { runId: RUN.agi }, { course: true }),
    queue: (who) => call(who, routes.queue.GET, { runId: RUN.agi }, { course: true }),
    /** Every run this person's member area lists. */
    me: async (who, options = {}) =>
      (await call(who, routes.me.GET, {}, { course: true, ...options })).body.runs ?? [],
    rowPath,
    /** The uids with a row on a run's own applications list. */
    rowsOn: (runId = RUN.agi) =>
      world.db
        .paths()
        .filter((path) => path.startsWith(`courseApplications/${runId}__`))
        .map((path) => world.db.read(path).uid)
        .sort(),
    run: (runId = RUN.agi) => world.db.read(`courseRuns/${runId}`),
    pathsUnder: (prefix) => world.db.paths().filter((path) => path.startsWith(prefix)).sort(),
  };
}

/** `[status, error]`, for comparing a refusal in one line. */
export const short = (response) => [response.status, response.body?.error ?? null];
/** The names in one of the panel's lists. */
export const names = (people) => people.map((person) => person.name);
