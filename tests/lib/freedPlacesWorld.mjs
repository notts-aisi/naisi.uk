/**
 * One term after decision day, with places given back and pooled people told
 * "No offer this time", for the suites that offer freed places.
 *
 * ## What it is made of
 *
 * The hand-over world's term (`tests/lib/handoverWorld.mjs`): AGI Strategy
 * names its course run, four people hold a place on it, Ines is invited to it
 * and has not answered, Nina gave her place back, and Omar was pooled by it
 * and told no offer. On top of that:
 *
 *  - AGI STRATEGY HAS 7 PLACES, so 2 are free: 4 held, 1 kept for Ines.
 *  - MORE PEOPLE TOLD "No offer this time", one for each way the rule can
 *    answer: George (pooled by AGI Strategy, free on Monday evenings), Lena
 *    (pooled by it, free only on a Wednesday morning, which no group meets
 *    at), Rory (pooled by it, painted nothing), Hana (pooled by Technical AI
 *    Safety and never ranked AGI Strategy), Kai (AGI Strategy declined him,
 *    Technical AI Safety pooled him) and Zed (every programme he ranked
 *    declined him).
 *  - SCORES on AGI Strategy's question for Omar and George.
 *  - THE GROUPS ARE NAMED AS THE BOARDS NAME THEM: Group B meets on Mondays
 *    at 6pm, Group A on Thursdays at 10am.
 *  - THE FORM'S COUNTERS match the statuses, so a suite can watch them move.
 *
 * ## One database, two ways of asking
 *
 * As in the hand-over world: the application system's code is handed the
 * store, and a course route is handed `courseView(db)`.
 *
 * ## The mail door answers as a suite says
 *
 * `world.verdict(args, n)` decides what the n-th message meets: `sent`,
 * `held`, `suppressed`, `throw` (the provider was never reached, so nothing
 * went) or `cut-off` (the conversation broke off, so nobody can say). Every
 * message is recorded in `world.mail`. No message can leave this process.
 */
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { userDoc } from "./applicationsSmallTerm.mjs";
import { courseView } from "./courseRunStore.mjs";
import {
  AGI,
  CAST as HANDOVER_CAST,
  COURSE,
  GROUP,
  GRID,
  ROUND,
  RUN,
  TAIS,
  applicationPath,
  decisionPath,
  groupDoc,
  namedSeed,
  programmeParams,
  week,
} from "./handoverWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { AGI, COURSE, GROUP, GRID, ROUND, RUN, TAIS, applicationPath, decisionPath, groupDoc, programmeParams, week };

/** The site's own address: the email's buttons lead to a page on it. */
export const APP_URL = "https://naisi.invalid";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const SENT_ON = new Date("2026-10-23T09:00:00+01:00");
const APPLIED_ON = new Date("2026-10-09T14:20:00+01:00");

const member = (uid, displayName) => ({
  uid,
  email: `${uid}@example.com`,
  role: "member",
  suRecognised: false,
  displayName,
  permissions: HANDOVER_CAST.amara.permissions,
});

/** Everybody: the hand-over world's cast, and the people this world adds. */
export const CAST = {
  ...HANDOVER_CAST,
  george: member("george", "George Lambert"),
  lena: member("lena", "Lena Sato"),
  rory: member("rory", "Rory Quinn"),
  hana: member("hana", "Hana Ito"),
  kai: member("kai", "Kai Moreau"),
  zed: member("zed", "Zed Olsen"),
};

/** Free Monday evening and Thursday morning: covers both AGI groups with a time. */
export const BOTH = week({ 1: [["17:00", "21:00"]], 4: [["09:00", "13:00"]] });
/** Free on Monday evenings only: covers the Monday group. */
export const MONDAY_EVENINGS = week({ 1: [["17:00", "21:00"]] });
/** Free on a Wednesday morning, which no group meets at. */
export const WEDNESDAY_MORNING = week({ 3: [["09:00", "11:00"]] });
export const NOTHING = week({});

const lead = (decision, more = {}) => ({ decision, decidedByUid: "claudia", decidedAt: SENT_ON, ...more });
const pooled = () => lead("pool", { poolReason: "capacity" });

/** [uid, ranked, painted, the decision document's programmes, what decision day published]. */
const ADDED = [
  ["george", [AGI, TAIS], MONDAY_EVENINGS, { [AGI]: pooled(), [TAIS]: pooled() }, "no-offer"],
  ["lena", [AGI], WEDNESDAY_MORNING, { [AGI]: pooled() }, "no-offer"],
  ["rory", [AGI], NOTHING, { [AGI]: pooled() }, "no-offer"],
  ["hana", [TAIS], BOTH, { [TAIS]: pooled() }, "no-offer"],
  ["kai", [AGI, TAIS], BOTH, { [AGI]: lead("decline"), [TAIS]: pooled() }, "no-offer"],
  ["zed", [AGI], BOTH, { [AGI]: lead("decline") }, "declined"],
];

function contentOf(who, ranked, painted) {
  const answers = { fellowships: { why: "I keep changing my mind about timelines." } };
  if (ranked.includes(AGI)) answers[AGI] = { event: "The EU code of practice came into force." };
  if (ranked.includes(TAIS)) answers[TAIS] = { built: "A probe for refusal directions." };
  return {
    aboutYou: {
      preferredName: who.displayName.split(" ")[0],
      universityEmail: `${who.uid}@students.example.com`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BSc Mathematics",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments survive.",
      interests: "Evaluations",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers,
    availability: painted,
    suMembership: "not-yet",
  };
}

/**
 * The world's documents. `places` is AGI Strategy's number of places; `run`
 * changes its run; `over` adds or replaces whole documents last.
 */
export function freedSeed({ places = 7, run = {}, sent = true, over = {} } = {}) {
  const seed = namedSeed({ sent });
  const form = seed[`admissionRounds/${ROUND}`];
  form.programmes[AGI].places = places;
  for (const [uid, ranked, painted, programmes, told] of ADDED) {
    const who = CAST[uid];
    seed[`users/${uid}`] = userDoc(who);
    const content = contentOf(who, ranked, painted);
    seed[applicationPath(uid)] = {
      formVersion: 2,
      roundId: ROUND,
      uid,
      email: who.email,
      displayName: who.displayName,
      draft: content,
      sent: content,
      status: sent ? told : "submitted",
      submittedAt: APPLIED_ON,
      sentAt: APPLIED_ON,
      withdrawnAt: null,
      result: sent ? { kind: told, programmeId: null, publishedAt: SENT_ON, email: "sent", emailedAt: SENT_ON } : null,
      invitation: null,
      attendance: null,
      createdAt: APPLIED_ON,
      updatedAt: APPLIED_ON,
    };
    seed[decisionPath(uid)] = {
      roundId: ROUND,
      uid,
      programmes,
      pooledOutcome: told === "no-offer" ? { kind: "no-offer", setByUid: "zach", setAt: SENT_ON } : null,
    };
  }
  // Scores on AGI Strategy's own question, from its reviewer and its lead.
  const review = (applicantUid, reviewerUid, score) => ({
    roundId: ROUND,
    applicantUid,
    reviewerUid,
    scores: { [`${AGI}.event`]: score },
    comments: [],
    notes: "",
  });
  seed[`admissionReviews/${ROUND}__omar__lloyd`] = review("omar", "lloyd", 4);
  seed[`admissionReviews/${ROUND}__omar__claudia`] = review("omar", "claudia", 3);
  seed[`admissionReviews/${ROUND}__george__lloyd`] = review("george", "lloyd", 3);
  // The groups are named as the boards name them.
  seed[`courseGroups/${GROUP.monday}`].name = "Group B";
  seed[`courseGroups/${GROUP.thursday}`].name = "Group A";
  // The run, with any change a suite asks for.
  Object.assign(seed[`courseRuns/${RUN.agi}`], run);
  // The counters, as the statuses stand.
  const counts = {};
  for (const [path, doc] of Object.entries(seed)) {
    if (!path.startsWith("admissionApplications/")) continue;
    counts[doc.status] = (counts[doc.status] ?? 0) + 1;
  }
  form.applicationCounts = counts;
  return { ...seed, ...over };
}

// ---------------------------------------------------------------------------
// The world a suite runs in
// ---------------------------------------------------------------------------

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

const MAIL_DOOR = (handle) =>
  "export async function sendEmail(args) {\n" +
  `  const world = ${handle};\n` +
  "  world.mail.push(args);\n" +
  "  const verdict = world.verdict ? world.verdict(args, world.mail.length) : 'sent';\n" +
  "  if (verdict === 'throw') {\n" +
  "    throw Object.assign(new Error('connect refused'), { code: 'ESOCKET', syscall: 'connect' });\n" +
  "  }\n" +
  "  if (verdict === 'cut-off') throw Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' });\n" +
  "  return {\n" +
  "    messageId: verdict === 'sent' ? 'm' : '',\n" +
  "    delivered: verdict === 'sent' ? [args.to] : [],\n" +
  "    suppressed: verdict === 'suppressed' ? [args.to] : [],\n" +
  "    held: verdict === 'held' ? [args.to] : [],\n" +
  "  };\n" +
  "}";

for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "EMAIL_AUDIENCE"]) {
  delete process.env[name];
}

/**
 * A world, its loader and the way to make a request in it. `extraStubs` adds
 * specifiers a suite needs stubbed beyond these, such as the stylesheets of a
 * page it renders.
 */
export function makeFreedWorld(key = "__freedPlaces", extraStubs = []) {
  const world = {
    db: null,
    courseDb: null,
    course: false,
    user: null,
    viewAs: false,
    mail: [],
    pushes: [],
    verdict: null,
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
          "export async function getImpersonator() {\n" +
          `  return ${handle}.viewAs ? { actorUid: 'zach', actorName: 'Zach Levin' } : null;\n` +
          "}\n" +
          "export function markerIsLive(marker, currentUid) {\n" +
          "  return marker !== null && marker.actorUid !== currentUid;\n" +
          "}",
      ],
      ["@/lib/email/send", MAIL_DOOR(handle)],
      ["./send", MAIL_DOOR(handle)],
      [
        "@/lib/push/courseNotifications",
        "export async function mirrorCourseDecisionToPush(uid, note) {\n" +
          `  ${handle}.pushes.push({ uid, ...note });\n` +
          "}",
      ],
      ...extraStubs.map(([specifier, source]) => [specifier, source.replaceAll("__WORLD__", handle)]),
    ]),
  });

  /** Start again from a seed. The store's clock is the test's clock. */
  function reset(seed = freedSeed()) {
    world.db = makeDb(seed, { now: () => new Date(Date.now()) });
    world.courseDb = courseView(world.db);
    world.course = false;
    world.user = null;
    world.viewAs = false;
    world.mail.length = 0;
    world.pushes.length = 0;
    world.verdict = null;
    return world.db;
  }

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
      permissions: CAST[uid]?.permissions ?? HANDOVER_CAST.zach.permissions,
    };
  }

  let requests = 0;
  /** One request to a real handler, as `who` (a uid, or null for nobody signed in). */
  async function call(who, handler, params, { body, course = false, viewAs = false } = {}) {
    requests += 1;
    world.user = sessionOf(who);
    world.course = course;
    world.viewAs = viewAs;
    const init = {
      method: handler.name,
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.9.${(requests >> 8) & 255}.${requests & 255}`,
      },
    };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    try {
      const response = await handler(new Request("https://naisi.invalid/api", init), {
        params: Promise.resolve(params),
      });
      return { status: response.status, body: structuredClone(response.body) };
    } catch (err) {
      return { status: 599, body: { error: String(err?.stack ?? err).slice(0, 2000) } };
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

/** Every route a freed place passes through, and a short function for each request. */
export async function loadRoutes(made) {
  const { call, formRoute, courseRoute } = made;
  const routes = {
    offer: await formRoute("programmes", "[programmeId]", "freed-places"),
    test: await formRoute("programmes", "[programmeId]", "freed-places", "test"),
    reply: await formRoute("application", "reply"),
    handOver: await formRoute("programmes", "[programmeId]", "run", "hand-over"),
    send: await formRoute("send"),
    allocate: await courseRoute("runs", "[runId]", "allocate"),
    board: await courseRoute("runs", "[runId]", "allocation"),
    publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
    publishTest: await courseRoute("runs", "[runId]", "allocation", "publish", "test"),
    publishNotes: await courseRoute("runs", "[runId]", "allocation", "publish", "notes"),
    me: await courseRoute("me"),
  };
  /**
   * "Send without a note" for everybody Publish waits on a choice for, as
   * `who` would choose it on Publish's own page (the handover world's
   * `withoutNotes`). Answers the names it chose for.
   */
  async function withoutNotes(who) {
    const read = await call(who, routes.publishNotes.GET, { runId: RUN.agi }, { course: true });
    if (read.status !== 200) return [];
    const chosen = [];
    for (const row of read.body.section.rows) {
      if (row.note.state !== "missing") continue;
      const saved = await call(who, routes.publishNotes.PUT, { runId: RUN.agi }, {
        body: { uid: row.uid, groupId: row.groupId, choice: "none" },
        course: true,
      });
      if (saved.status === 200) chosen.push(row.name);
    }
    return chosen;
  }
  return {
    routes,
    offer: (who, body, options) => call(who, routes.offer.POST, programmeParams(AGI), { body, ...options }),
    test: (who, body, options) => call(who, routes.test.POST, programmeParams(AGI), { body, ...options }),
    reply: (who, body) => call(who, routes.reply.POST, { roundId: ROUND }, { body }),
    handOver: (who = "zach") => call(who, routes.handOver.POST, programmeParams(AGI)),
    sendBoard: (who = "zach") => call(who, routes.send.GET, { roundId: ROUND }),
    place: (who, placements) =>
      call(who, routes.allocate.POST, { runId: RUN.agi }, { body: { placements }, course: true }),
    /**
     * A press of Publish, made the way the board makes one (as the hand-over
     * world's `publish()`): read the number on its button, send "a test to
     * me" first when the board says one is owed, then press with that number.
     * The test goes to whoever presses and is in `world.mail` with "[TEST]"
     * at the start of its subject.
     */
    withoutNotes,
    publish: async (who = "zach", { notes = true } = {}) => {
      // Anybody placed outside the times they gave needs a choice first, as
      // Publish's own page asks whoever presses: here, "Send without a note".
      if (notes) await withoutNotes(who);
      const read = async () =>
        (await call(who, routes.board.GET, { runId: RUN.agi }, { course: true })).body?.publish ?? null;
      let summary = await read();
      if (summary && summary.emails > 0 && summary.test?.state !== "fresh") {
        await call(who, routes.publishTest.POST, { runId: RUN.agi }, { course: true });
        summary = await read();
      }
      return call(who, routes.publish.POST, { runId: RUN.agi }, { body: { emails: summary?.emails ?? 0 }, course: true });
    },
    me: async (who) => (await call(who, routes.me.GET, {}, { course: true })).body.runs ?? [],
  };
}

/** `[status, error]`, for comparing a refusal in one line. */
export const short = (response) => [response.status, response.body?.error ?? null];
