/**
 * A running course run, for the suites about updates (Q18): people in
 * groups, a cohort list, facilitators, and the updates route.
 *
 * Built on `tests/lib/leadWorld.mjs` (AGI Strategy names its run, Claudia
 * leads it, Lloyd reviews it and is the run's admissions reviewer, Yusuf is
 * the run's track lead, Tess leads Technical AI Safety) and the hand-over
 * world's real handlers and recording mail door. On top of that, the AGI
 * run's people, each a `courseEnrolments` row as the routes write them:
 *
 *  - Group B (Rahul and Sofia facilitate): `amara` (told, on the cohort
 *    list), `dev` (placed, NOT told yet), `ines` (told, unsubscribed from the
 *    cohort list), `omar` (told, on the list, his address on the
 *    do-not-email list) and `nina` (told, then left: withdrawn).
 *  - Group A (Sofia): `bea` (told, on the list).
 *  - Group C (Tom): `tariq` (told, on the list).
 *
 * So, as the boards would count them: everyone on AGI Strategy is 5 people
 * (amara, ines, omar, bea, tariq) and the email reaches 3 (amara, bea,
 * tariq); Group B is 3 people and 1 email (amara); the facilitators are 3 and
 * 3 (rahul, sofia, tom).
 *
 * Real: the route, the libraries behind it, the cohort audience, the caps,
 * the notice door and the email templates. Stubbed (by the hand-over world):
 * `server-only`, `next/server`, the Admin SDK handle, the session, the
 * view-as guard and `sendEmail`, which records what it was handed and sends
 * nothing.
 */
import { CAST, makeWorld } from "./handoverWorld.mjs";
import { A, AGI, B, C, ROUND, RUN, leadSeed } from "./leadWorld.mjs";
import { session, userDoc } from "./applicationsSmallTerm.mjs";

export { A, AGI, B, C, CAST, ROUND, RUN };

export const SENT_AT = new Date("2026-10-28T18:00:00Z");

/** Who is in which group, and how their place stands. */
export const PEOPLE = {
  amara: { group: B, told: true, listed: true },
  dev: { group: B, told: false, listed: true },
  ines: { group: B, told: true, listed: false },
  omar: { group: B, told: true, listed: true, suppressed: true },
  nina: { group: B, told: true, listed: true, status: "withdrawn" },
  bea: { group: A, told: true, listed: true },
  tariq: { group: C, told: true, listed: true },
};

export const FACILITATORS = { rahul: [B], sofia: [B, A], tom: [C] };

/** The run's cohort channel, as `courseRunChannel` derives it. */
export const CHANNEL = `cohort:${RUN.agi}`;

export const enrolmentPath = (uid, runId = RUN.agi) => `courseEnrolments/${runId}__${uid}`;

/** The world every updates suite starts from. `over` adds or replaces whole documents. */
export function updatesSeed(over = {}) {
  const seed = leadSeed();
  for (const [uid, place] of Object.entries(PEOPLE)) {
    seed[enrolmentPath(uid)] = {
      runId: RUN.agi,
      courseId: seed[`courseRuns/${RUN.agi}`].courseId,
      uid,
      groupId: place.group,
      status: place.status ?? "active",
      role: "learner",
      selfEnrolled: false,
      applicationId: `${ROUND}__${uid}`,
      joinedWeekNumber: 1,
      ...(place.told ? { allocatedEmailAt: SENT_AT, allocatedEmailDelivery: "sent" } : {}),
    };
    seed[`subscriptions/cohort__${uid}`] = {
      email: `${uid}@example.com`,
      channel: CHANNEL,
      audience: "user",
      audienceId: uid,
      confirmed: true,
      subscribed: place.listed,
    };
    if (place.suppressed) {
      seed[`suppressedEmails/${uid}@example.com`] = {
        email: `${uid}@example.com`,
        reason: "bounce",
        source: "manual",
        addedAt: SENT_AT,
      };
    }
  }
  for (const uid of Object.keys(FACILITATORS)) {
    seed[enrolmentPath(uid)] = {
      runId: RUN.agi,
      courseId: seed[`courseRuns/${RUN.agi}`].courseId,
      uid,
      groupId: null,
      status: "active",
      role: "facilitator",
      selfEnrolled: false,
      joinedWeekNumber: 1,
    };
  }
  // A member of the TAIS run, so "another run's people" is somebody.
  seed["users/wren"] = userDoc(session("wren", "member", false, "Wren Holt"));
  seed[enrolmentPath("wren", RUN.tais)] = {
    runId: RUN.tais,
    courseId: seed[`courseRuns/${RUN.tais}`].courseId,
    uid: "wren",
    groupId: null,
    status: "active",
    role: "learner",
    selfEnrolled: true,
    joinedWeekNumber: 1,
  };
  return { ...seed, ...over };
}

/** Everybody a suite asks as, with the words a failure names them by. */
export const PERSONAS = [
  ["zach", "an admin"],
  ["claudia", "the lead of the programme that names the run"],
  ["tess", "the lead of another programme"],
  ["lloyd", "the programme's reviewer"],
  ["yusuf", "the run's track lead"],
  ["rahul", "a facilitator of Group B"],
  ["sofia", "a facilitator of Groups B and A"],
  ["tom", "a facilitator of Group C"],
  ["amara", "a member of Group B, told"],
  ["bea", "a member of Group A, told"],
  ["dev", "a member of Group B, placed and not yet told"],
  ["nina", "a member of Group B who left"],
  ["nobody", "a member who is on nothing"],
  [null, "somebody signed out"],
];

/**
 * The world, the route and short ways to ask it. `key` names the handle on
 * `globalThis`; `extraStubs` as for `makeWorld`.
 */
export async function makeUpdatesWorld(key, extraStubs = []) {
  const made = makeWorld(key, extraStubs);
  const { world, call, courseRoute, loadTs } = made;
  const route = await courseRoute("runs", "[runId]", "updates");
  const audience = await loadTs("lib/courses/updates/audience.ts");
  const readers = await loadTs("lib/courses/updates/readers.ts");
  const { normalizeCourseRun } = await loadTs("lib/firestore/courses.ts");

  /** The clock `serverTimestamp()` resolves to; a suite moves it. */
  let clock = new Date("2026-11-16T09:00:00Z");
  const reset = (seed = updatesSeed()) => {
    clock = new Date("2026-11-16T09:00:00Z");
    return made.reset(seed, { now: () => clock });
  };

  const run = (runId = RUN.agi) => normalizeCourseRun(runId, world.db.read(`courseRuns/${runId}`));

  /** The composer's counts, read the way the pages read them. */
  async function counts(runId = RUN.agi) {
    const groups = await readers.loadRunGroups(world.courseDb, runId);
    return audience.updateAudienceCounts(world.courseDb, run(runId), groups);
  }

  /** How many the email for `to` reaches, as the composer would put it on the button. */
  async function emailsFor(to, groupId = null) {
    const found = (await counts()).find((count) => count.to === to && (count.groupId ?? null) === groupId);
    return found ? found.emails : 0;
  }

  const ask = {
    read: (who, runId = RUN.agi, options = {}) => call(who, route.GET, { runId }, { course: true, ...options }),
    post: (who, body, runId = RUN.agi, options = {}) =>
      call(who, route.POST, { runId }, { body, course: true, ...options }),
  };

  /**
   * A press made the way the composer makes one: the number on the button
   * read first, then the press with it.
   */
  async function press(who, { to = "everyone", groupId, title = "Week 3 readings are up", message = "The 3 readings take about 75 minutes. Bring one question.", email = true } = {}) {
    const emailCount = email ? await emailsFor(to, groupId ?? null) : undefined;
    return ask.post(who, {
      to,
      ...(groupId ? { groupId } : {}),
      title,
      message,
      email,
      ...(email ? { emailCount } : {}),
    });
  }

  /** The stored updates, oldest path first. */
  const stored = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseUpdates/"))
      .sort()
      .map((path) => ({ path, ...world.db.read(path) }));

  return {
    ...made,
    reset,
    route,
    audience,
    readers,
    run,
    counts,
    emailsFor,
    ask,
    press,
    stored,
    setClock: (at) => {
      clock = new Date(at);
    },
  };
}
