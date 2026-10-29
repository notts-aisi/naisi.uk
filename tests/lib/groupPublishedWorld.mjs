/**
 * One term after decision day, on the course side, for the suites that hold
 * "a placement shows once Publish has told its owner"
 * (`tests/course-hub-group-published-*.test.mjs`).
 *
 * ## What it is made of
 *
 * The documents are `handoverWorld`'s: the term the hand-over suites use, its
 * cast, its AGI Strategy run with three groups, and the programme naming that
 * run. Two things differ, both in `groupSeed`:
 *
 *  - the Thursday group has its own facilitator, `tess`, so that a
 *    facilitator of ANOTHER group can be asked about it. The Monday group
 *    keeps `claudia`;
 *  - the pre-course run takes people by open enrolment, so somebody can pick a
 *    group for themselves, as on the live pre-course.
 *
 * And three things are added: each facilitator's own enrolment on the AGI
 * run, as the facilitators route writes one; week one of that run, published,
 * with one exercise; and an answer to it from `dev` (Monday) and from
 * `amara` (Thursday), for the review queue to list.
 *
 * ## What is real and what is stubbed
 *
 * Real: every handler a suite loads, the libraries behind them, the access
 * predicates, the standing checks, the email and notice writers, the send
 * limits and the email templates. Stubbed: `server-only`, `next/server`, the
 * Admin SDK's sentinels and handle, the session, the view-as guard, the two
 * push mirrors, and `sendEmail`, which records what it was handed and answers
 * as the real door would (see `MAIL_DOOR`). No message can leave this process.
 *
 * ## How Publish is pressed
 *
 * The way the allocation board presses it (`steps.publish`): read the number
 * on its button, send "a test to me" first when the board says one is owed,
 * then press with that number. So a first press puts in `world.mail` the
 * presser's test of both of Publish's emails ("[TEST]" at the start of each
 * subject, to the presser's own address), then each placed person's email,
 * then "You’re facilitating" to each facilitator of a group with somebody in
 * it. A later press needs no new test while the wording is unchanged.
 *
 * Every request is handed the course routes' view of the store
 * (`courseView`), which takes the `limit()` the course routes page by. The
 * application system's own code runs on the same view; nothing it does
 * depends on a limit.
 */
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { courseView } from "./courseRunStore.mjs";
import { AGI, CAST, COURSE, GROUP, RUN, groupDoc, namedSeed, programmeParams } from "./handoverWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { CAST, COURSE, GROUP, RUN };

/** The open sign-up group on the pre-course run. */
export const OPEN_GROUP = "pre-course-autumn-2026-tuesday__grp00009";

/** The handover term, with the two differences in the module header. */
export function groupSeed(options = {}) {
  const seed = namedSeed(options);
  seed[`courseGroups/${GROUP.thursday}`].facilitatorUids = ["tess"];
  seed[`courseRuns/${RUN.other}`].enrolMode = "open";
  seed[`courseRuns/${RUN.other}`].status = "running";
  seed[`courseGroups/${OPEN_GROUP}`] = groupDoc({
    runId: RUN.other,
    courseId: COURSE.other,
    name: "Tuesday evening",
    facilitatorUids: ["claudia"],
    capacity: 20,
    session: {
      weekday: 2,
      startTimeLocal: "18:00",
      durationMinutes: 60,
      location: "Room C2",
      meetingUrl: null,
      notes: "",
    },
  });
  for (const uid of ["claudia", "tess"]) {
    seed[`courseEnrolments/${RUN.agi}__${uid}`] = {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid,
      groupId: null,
      status: "active",
      role: "facilitator",
      applicationId: null,
      joinedWeekNumber: 1,
    };
  }
  seed[`courseRuns/${RUN.agi}/weeks/w01`] = {
    weekNumber: 1,
    title: "Week 1",
    summary: "",
    materials: [],
    exercises: [{ id: EXERCISE, prompt: "What would change your mind?", responseType: "text", maxLength: 2000, required: true }],
    checklist: [],
    published: true,
  };
  for (const uid of ["dev", "amara"]) {
    seed[`courseExerciseResponses/${responseOf(uid)}`] = {
      runId: RUN.agi,
      uid,
      weekId: "w01",
      weekNumber: 1,
      exerciseId: EXERCISE,
      responseType: "text",
      text: `${uid} wrote this.`,
      submittedAt: new Date("2026-10-24T09:00:00Z"),
      reviewStatus: "unreviewed",
    };
  }
  return seed;
}

/** Week one's one exercise. */
export const EXERCISE = "x1";

/** The id of one member's answer to week one's exercise. */
export const responseOf = (uid) => `${RUN.agi}__${uid}__w01__${EXERCISE}`;

/**
 * The Admin SDK's sentinels the store resolves, a `Timestamp` the subscription
 * writer calls, and a `FieldPath` for the participant-notes route to import.
 * The notes this world writes are set, never cleared, so no `FieldPath` ever
 * reaches the store.
 */
const FIRESTORE_STUB =
  FIELD_VALUE_STUB.replace(
    "export class Timestamp {}",
    "export class Timestamp {" +
      " static now() { return new Date(); }" +
      " static fromDate(date) { return date; }" +
      " static fromMillis(ms) { return new Date(ms); }" +
      " }",
  ) + " export class FieldPath { constructor(...parts) { this.parts = parts; } }";

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
 * all. `world.mailFate`, when a suite sets it, says what the real door would
 * have answered for one message: "held" (this copy of the site may not write
 * to the address), "suppressed" (the do-not-email list) or "fail" (the send
 * throws, and nothing is written down). Unset, every message is handed over.
 */
const MAIL_DOOR = (handle) =>
  "export async function sendEmail(args) {\n" +
  `  const w = ${handle};\n` +
  "  const fate = w.mailFate ? w.mailFate(args) : 'sent';\n" +
  "  if (fate === 'fail') throw new Error('the mail door refused');\n" +
  "  w.mail.push(args);\n" +
  "  if (fate === 'held') return { messageId: '', delivered: [], suppressed: [], held: [args.to] };\n" +
  "  if (fate === 'suppressed') return { messageId: '', delivered: [], suppressed: [args.to], held: [] };\n" +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}";

for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "EMAIL_AUDIENCE"]) {
  delete process.env[name];
}
// A copy of the site that knows its own address, as every deployed one does:
// the facilitators' email Publish sends has a button to the group's page, and
// Publish refuses to send it from a copy that cannot say where that is.
process.env.NEXT_PUBLIC_APP_URL = "https://naisi.invalid";

/**
 * A world, its loader, its routes and the way to make a request in it. `key`
 * names the handle on `globalThis` the stubs read.
 */
export async function makeGroupWorld(key = "__groupPublished") {
  const world = {
    db: null,
    courseDb: null,
    user: null,
    viewAs: false,
    /** Every message handed to the one mail door. */
    mail: [],
    /** What the door answers for a message, when a suite says: see `MAIL_DOOR`. */
    mailFate: null,
    /** Every notification handed to either push mirror. */
    pushes: [],
  };
  globalThis[key] = world;
  const handle = `globalThis[${JSON.stringify(key)}]`;

  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["next/server", NEXT_SERVER_STUB],
      ["firebase-admin/firestore", FIRESTORE_STUB],
      ["@/lib/firebase/admin", `export function getAdminDb() { return ${handle}.courseDb; }`],
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
      [
        "@/lib/push/noticeNotifications",
        "export async function sendNoticePush(uid, note) {\n" +
          `  ${handle}.pushes.push({ uid, ...note });\n` +
          "  return false;\n" +
          "}",
      ],
    ]),
  });

  function reset(seed = groupSeed()) {
    world.db = makeDb(seed, { now: () => new Date() });
    world.courseDb = courseView(world.db);
    world.user = null;
    world.viewAs = false;
    world.mail.length = 0;
    world.mailFate = null;
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
      permissions: CAST[uid]?.permissions ?? {},
    };
  }

  let requests = 0;

  /**
   * One request to a real handler, as `who`. `query` is the address's search
   * part, for the routes that read one. `viewAs` is an admin's view-as
   * session: the session is `who`'s, as it is on the site. Answers
   * `{ status, body }`; a handler that throws is a 599.
   */
  async function call(who, handler, params, { body, query = "", viewAs = false } = {}) {
    requests += 1;
    world.user = sessionOf(who);
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
  const formRoute = (...parts) =>
    loadTs(join("app", "api", "admissions", "forms", "[roundId]", ...parts, "route.ts"));

  const routes = {
    handOver: await formRoute("programmes", "[programmeId]", "run", "hand-over"),
    allocate: await courseRoute("runs", "[runId]", "allocate"),
    board: await courseRoute("runs", "[runId]", "allocation"),
    publishTest: await courseRoute("runs", "[runId]", "allocation", "publish", "test"),
    publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
    publishNotes: await courseRoute("runs", "[runId]", "allocation", "publish", "notes"),
    me: await courseRoute("me"),
    overview: await courseRoute("runs", "[runId]", "overview"),
    roster: await courseRoute("groups", "[groupId]", "roster"),
    register: await courseRoute("groups", "[groupId]", "attendance"),
    participantNotes: await courseRoute("groups", "[groupId]", "participant-notes"),
    queue: await courseRoute("groups", "[groupId]", "exercises"),
    groupEmail: await courseRoute("groups", "[groupId]", "email"),
    notice: await courseRoute("groups", "[groupId]", "notice"),
    comments: await courseRoute("runs", "[runId]", "comments"),
    myExercises: await courseRoute("runs", "[runId]", "my-exercises"),
    submit: await courseRoute("runs", "[runId]", "exercises", "[exerciseId]", "submit"),
    syncTasks: await courseRoute("runs", "[runId]", "sync-tasks"),
    enrol: await courseRoute("runs", "[runId]", "enrol"),
    review: await courseRoute("exercise-responses", "[responseId]", "review"),
    nudge: await courseRoute("runs", "[runId]", "nudge"),
  };
  const runAccess = await loadTs(join("features", "courses", "runAccess.ts"));
  const audience = await loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));

  /** Every AGI Strategy holder in a group: the board an admin publishes from. */
  const EVERYBODY = [
    { uid: "amara", groupId: GROUP.thursday },
    { uid: "dev", groupId: GROUP.monday },
    { uid: "bea", groupId: GROUP.monday },
    { uid: "tariq", groupId: GROUP.thursday },
  ];

  const enrolmentPath = (uid, runId = RUN.agi) => `courseEnrolments/${runId}__${uid}`;

  const steps = {
    /** An admin's hand-over of AGI Strategy's place holders. */
    handOver: () => call("zach", routes.handOver.POST, programmeParams(AGI)),
    place: (placements, who = "zach") =>
      call(who, routes.allocate.POST, { runId: RUN.agi }, { body: { placements } }),
    /** "Send a test to me" on the allocation board. */
    sendTest: (who = "zach") => call(who, routes.publishTest.POST, { runId: RUN.agi }),
    /**
     * "Send without a note" for everybody Publish waits on a choice for, as
     * `who` would choose it on Publish's own page (since 29 October 2026,
     * Publish waits for one for anybody placed outside the times they gave).
     */
    withoutNotes: async (who = "zach") => {
      const read = await call(who, routes.publishNotes.GET, { runId: RUN.agi });
      if (read.status !== 200) return [];
      const chosen = [];
      for (const row of read.body.section.rows) {
        if (row.note.state !== "missing") continue;
        const saved = await call(who, routes.publishNotes.PUT, { runId: RUN.agi }, {
          body: { uid: row.uid, groupId: row.groupId, choice: "none" },
        });
        if (saved.status === 200) chosen.push(row.name);
      }
      return chosen;
    },
    /**
     * A press of Publish, made the way the board makes one: choose "Send
     * without a note" for anybody placed outside the times they gave, read
     * the number on its button, send "a test to me" first when the board says
     * one is owed, then press with that number.
     */
    publish: async (who = "zach") => {
      await steps.withoutNotes(who);
      let summary = await ask.publishSummary(who);
      if (summary && summary.emails > 0 && summary.test?.state !== "fresh") {
        await steps.sendTest(who);
        summary = await ask.publishSummary(who);
      }
      return call(who, routes.publish.POST, { runId: RUN.agi }, { body: { emails: summary?.emails ?? 0 } });
    },
    /** Handed over, everybody in a group, and NOT published. */
    async placed() {
      const handed = await steps.handOver();
      if (handed.status !== 200) throw new Error(`hand-over: ${JSON.stringify(handed.body)}`);
      const placed = await steps.place(EVERYBODY);
      if (placed.status !== 200 || placed.body.placed !== EVERYBODY.length) {
        throw new Error(`placement: ${JSON.stringify(placed.body)}`);
      }
    },
    /** As `placed`, and then Publish, which has to work. */
    async published() {
      await steps.placed();
      await steps.publishes();
    },
    async publishes() {
      const published = await steps.publish();
      if (published.status !== 200) throw new Error(`publish: ${JSON.stringify(published.body)}`);
      return published.body;
    },
  };

  const ask = {
    /** The allocation board's `publish` summary: the number on its button and the last test. */
    publishSummary: async (who = "zach") =>
      (await call(who, routes.board.GET, { runId: RUN.agi })).body?.publish ?? null,
    me: async (who, options = {}) => (await call(who, routes.me.GET, {}, options)).body.runs ?? [],
    overview: (who, runId = RUN.agi, options = {}) => call(who, routes.overview.GET, { runId }, options),
    roster: (who, groupId, options = {}) => call(who, routes.roster.GET, { groupId }, options),
    register: (who, groupId) => call(who, routes.register.GET, { groupId }),
    queue: (who, groupId, week = 1) => call(who, routes.queue.GET, { groupId }, { query: `?week=${week}` }),
    comments: (who, runId = RUN.agi) => call(who, routes.comments.GET, { runId }, { query: "?week=1" }),
    myExercises: (who, runId = RUN.agi) => call(who, routes.myExercises.GET, { runId }, { query: "?week=1" }),
    enrol: (who, runId = RUN.agi) => call(who, routes.enrol.GET, { runId }),
    /** The gate every page under `/learn/[runId]` asks. */
    async access(who, runId = RUN.agi) {
      world.user = sessionOf(who);
      return runAccess.getRunAccess(runId);
    },
  };

  return { world, loadTs, reset, call, routes, steps, ask, sessionOf, audience, EVERYBODY, enrolmentPath };
}
