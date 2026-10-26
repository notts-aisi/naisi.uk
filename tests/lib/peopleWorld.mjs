/**
 * AGI Strategy's term after decision day, for the suites about the
 * programme's People tab (board st-people) and a facilitator's Home before
 * the group's first session (board st-fac-before-phone).
 *
 * Built on `tests/lib/leadWorld.mjs` (AGI Strategy names its run, Claudia
 * leads it, Lloyd reviews it, Yusuf is the run's track lead, Tess leads
 * Technical AI Safety, Rahul and Sofia facilitate Group B on Tuesdays at 6pm,
 * Sofia Group A on Thursdays at 6pm, Tom Group C on Wednesdays at 1pm, every
 * session two hours) and on `tests/lib/facilitatorPagesWorld.mjs` for its
 * pages, routes and Home. The run's first week starts Thu 29 Oct, so Group
 * B's first session is Tue 3 Nov.
 *
 * THE PEOPLE, each with a sentence in their answers and an address that no
 * page may show:
 *
 *  - amara: holds a place (by ranking), said "I'm coming" on Mon 26 Oct,
 *    free Tuesday and Thursday evenings (fits B and A).
 *  - dev: holds a place, no reply, free Wednesday lunchtimes (fits C).
 *  - bea: holds a place, said coming on Sun 25 Oct, painted nothing.
 *  - tariq: holds a place, no reply, free for an hour on Tuesday (fits none).
 *  - kofi: pooled by Technical AI Safety and invited to AGI Strategy, which
 *    Kofi did not rank; accepted on Tue 27 Oct, so holds a place and has
 *    said so. Free Tuesday evenings.
 *  - callum: holds a place, said coming; in the People seed taken off the
 *    run by staff on Tue 3 Nov (the place on the form stands).
 *  - sam: holds a place, no reply; in the People seed Sam left the run on Mon
 *    2 Nov, saying "Too much on this term." (leaving gives the form's place
 *    back with no reason on the application).
 *  - zach, the admin, applied too and holds a place.
 *  - nina: held a place, said "I can't make it" on Fri 23 Oct ("The times
 *    don't work for me").
 *  - sana: pooled by Technical AI Safety, invited to AGI Strategy, said no
 *    thanks on Sat 24 Oct. Sana did not rank AGI Strategy, so its lead may
 *    not read the application.
 *  - ines: invited to AGI Strategy on decision day, not answered, did not
 *    rank it: the same.
 *  - ruth: told no offer, then offered a freed place on AGI Strategy on Tue
 *    27 Oct, to answer by Thu 29 Oct. Ruth ranked it.
 *  - wen holds a Technical AI Safety place, and omar was told no offer: on
 *    nobody's AGI Strategy list.
 *
 * Amara's access requirements are kept apart, as the form keeps them, with a
 * sentence no page may show. Every address is `example.com`.
 */
import { applicationPath, decisionPath, privatePath, session, userDoc } from "./applicationsSmallTerm.mjs";
import { makeFacilitatorPagesWorld } from "./facilitatorPagesWorld.mjs";
import { COURSE, loadJoin, week } from "./handoverWorld.mjs";
import { A, AGI, B, C, ROUND, RUN, TAIS, leadSeed } from "./leadWorld.mjs";

export { A, AGI, B, C, COURSE, ROUND, RUN, TAIS };

const SENT = new Date("2026-10-09T14:20:00+01:00");
/** Decision day: Fri 23 Oct 2026, 9am in London. */
export const TOLD = new Date("2026-10-23T09:00:00+01:00");
/** Mon 26 Oct 2026, noon in London (GMT from Sun 25 Oct). */
export const MONDAY = new Date("2026-10-26T12:00:00Z");

/** A sentence in everybody's answers, which no page may show. */
export const ANSWER = "My answer about this programme is for the committee.";
/** What Amara wrote under access requirements, which no page may show. */
export const ACCESS = "A seat near the door, please.";
/** What Sam typed on leaving the run. */
export const SAM_SAID = "Too much on this term.";

/** Tuesday and Thursday evenings: fits Groups B and A. */
const TUE_THU = week({ 2: [["17:00", "21:00"]], 4: [["17:00", "21:00"]] });
/** Tuesday evenings: fits Group B. */
const TUESDAYS = week({ 2: [["17:00", "21:00"]] });
/** Wednesday lunchtimes: fits Group C. */
const WEDNESDAYS = week({ 3: [["12:00", "16:00"]] });
/** An hour on Tuesday: less than any session, so it fits none. */
const AN_HOUR = week({ 2: [["18:00", "19:00"]] });
/** Nothing painted. */
const NOTHING = week({});

const by = (decision, uid = "claudia") => ({ decision, decidedByUid: uid, decidedAt: TOLD });

const accepted = (uid) => ({
  decision: { roundId: ROUND, uid, programmes: { [AGI]: by("accept") }, pooledOutcome: null },
  result: { kind: "accepted", programmeId: AGI, publishedAt: TOLD, email: "sent", emailedAt: TOLD },
  status: "accepted",
});

/** Pooled by Technical AI Safety and invited to AGI Strategy on decision day. */
const invitedFromTais = (uid, invitation) => ({
  decision: {
    roundId: ROUND,
    uid,
    programmes: { [TAIS]: { ...by("pool", "tess"), poolReason: "capacity" } },
    pooledOutcome: { kind: "invite", programmeId: AGI, setByUid: "zach", setAt: TOLD },
  },
  result: { kind: "invited", programmeId: AGI, publishedAt: TOLD, email: "sent", emailedAt: TOLD },
  invitation: { programmeId: AGI, replyBy: "2026-10-25", response: null, respondedAt: null, lastReminderOn: null, ...invitation },
  status: invitation.response === "accepted" ? "accepted" : invitation.response === "declined" ? "withdrawn" : "invited",
});

/**
 * [uid, name, ranking, painted week, subject, what was decided and published,
 * and what they replied since].
 */
const PEOPLE = [
  ["amara", "Amara Okafor", [AGI, TAIS], TUE_THU, "BA Philosophy", { ...accepted("amara"), attendance: { answer: "coming", answeredAt: new Date("2026-10-26T10:00:00Z") } }],
  ["dev", "Dev Patel", [AGI], WEDNESDAYS, "BEng Mechanical Engineering", accepted("dev")],
  ["bea", "Bea Lindqvist", [AGI], NOTHING, "BSc Mathematics", { ...accepted("bea"), attendance: { answer: "coming", answeredAt: new Date("2026-10-25T09:00:00Z") } }],
  ["tariq", "Tariq Mensah", [AGI], AN_HOUR, "BSc Computer Science", accepted("tariq")],
  ["kofi", "Kofi Asante", [TAIS], TUESDAYS, "MA International Relations", invitedFromTais("kofi", { response: "accepted", respondedAt: new Date("2026-10-27T11:00:00Z") })],
  ["callum", "Callum Price", [AGI], TUESDAYS, "BSc Geography", { ...accepted("callum"), attendance: { answer: "coming", answeredAt: new Date("2026-10-24T09:00:00Z") } }],
  ["sam", "Sam Whitfield", [AGI], TUESDAYS, "BSc Geography", accepted("sam")],
  ["zach", "Zach Levin", [AGI], TUESDAYS, "MSc Computer Science", accepted("zach")],
  [
    "nina",
    "Nina Petrova",
    [AGI],
    TUESDAYS,
    "MSc Physics",
    {
      ...accepted("nina"),
      status: "withdrawn",
      attendance: { answer: "cant-make-it", answeredAt: TOLD },
      withdrawnAt: TOLD,
      releaseReason: { kind: "times", other: "" },
    },
  ],
  [
    "sana",
    "Sana Malik",
    [TAIS],
    TUESDAYS,
    "MSc Artificial Intelligence",
    {
      ...invitedFromTais("sana", { response: "declined", respondedAt: new Date("2026-10-24T10:00:00+01:00") }),
      withdrawnAt: new Date("2026-10-24T10:00:00+01:00"),
      releaseReason: { kind: "too-much-on", other: "" },
    },
  ],
  ["ines", "Ines Carvalho", [TAIS], TUESDAYS, "BA Politics", invitedFromTais("ines", {})],
  [
    "ruth",
    "Ruth Adler",
    [AGI],
    TUESDAYS,
    "BA History",
    {
      decision: {
        roundId: ROUND,
        uid: "ruth",
        programmes: { [AGI]: { ...by("pool"), poolReason: "capacity" } },
        pooledOutcome: { kind: "no-offer", setByUid: "zach", setAt: TOLD },
      },
      result: { kind: "no-offer", programmeId: null, publishedAt: TOLD, email: "sent", emailedAt: TOLD },
      invitation: { programmeId: AGI, replyBy: "2026-10-29", response: null, respondedAt: null, lastReminderOn: null },
      freedPlace: {
        groupId: B,
        offeredAt: new Date("2026-10-27T15:00:00Z"),
        email: "sent",
        emailedAt: new Date("2026-10-27T15:00:00Z"),
        emailClaimedAt: null,
      },
      status: "invited",
    },
  ],
  [
    "wen",
    "Wen Zhao",
    [TAIS, AGI],
    TUESDAYS,
    "MSc Computer Science",
    {
      decision: {
        roundId: ROUND,
        uid: "wen",
        programmes: { [TAIS]: by("accept", "tess"), [AGI]: by("accept") },
        pooledOutcome: null,
      },
      result: { kind: "accepted", programmeId: TAIS, publishedAt: TOLD, email: "sent", emailedAt: TOLD },
      status: "accepted",
    },
  ],
  [
    "omar",
    "Omar Haddad",
    [AGI],
    TUESDAYS,
    "MSc Statistics",
    {
      decision: {
        roundId: ROUND,
        uid: "omar",
        programmes: { [AGI]: { ...by("pool"), poolReason: "capacity" } },
        pooledOutcome: { kind: "no-offer", setByUid: "zach", setAt: TOLD },
      },
      result: { kind: "no-offer", programmeId: null, publishedAt: TOLD, email: "sent", emailedAt: TOLD },
      status: "no-offer",
    },
  ],
];

/** Everybody who holds a place on AGI Strategy, by uid: the tab's number is this many. */
export const HOLDING = ["amara", "bea", "callum", "dev", "kofi", "sam", "tariq", "zach"];

/** One sent application, as decision day and any reply left it. */
function applicationOf(uid, name, ranked, painted, subject, told) {
  const content = {
    aboutYou: {
      preferredName: name.split(" ")[0],
      universityEmail: `${uid}@students.example.com`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject,
      expectedGraduation: "2028-06",
      motivation: ANSWER,
      interests: ANSWER,
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers: { fellowships: { why: ANSWER }, [ranked[0]]: ranked[0] === AGI ? { event: ANSWER } : { built: ANSWER } },
    availability: painted,
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    draft: content,
    sent: content,
    status: told.status,
    submittedAt: SENT,
    sentAt: SENT,
    withdrawnAt: told.withdrawnAt ?? null,
    result: told.result,
    invitation: told.invitation ?? null,
    freedPlace: told.freedPlace ?? null,
    attendance: told.attendance ?? null,
    releaseReason: told.releaseReason ?? null,
    createdAt: SENT,
    updatedAt: SENT,
  };
}

/** An enrolment as allocation and Publish leave one: placed and told, unless said. */
export function seat(uid, groupId, over = {}) {
  return {
    runId: RUN.agi,
    courseId: COURSE.agi,
    uid,
    groupId,
    status: "active",
    role: "learner",
    selfEnrolled: false,
    applicationId: null,
    joinedWeekNumber: 1,
    allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
    attendance: {},
    createdAt: TOLD,
    updatedAt: TOLD,
    ...over,
  };
}

/**
 * The term with its applications and replies, and no seat on the run: what a
 * suite drives the hand-over, the placements and Publish from. Sam and Callum
 * hold their places here.
 */
export function termSeed(over = {}) {
  const seed = leadSeed();
  // The small term's applications and decisions are replaced by this cast.
  for (const path of Object.keys(seed)) {
    if (path.startsWith("admissionApplications/") || path.startsWith("admissionDecisions/")) delete seed[path];
  }
  for (const [uid, name, ranked, painted, subject, told] of PEOPLE) {
    if (uid !== "zach") seed[`users/${uid}`] = userDoc(session(uid, "member", false, name));
    seed[applicationPath(uid)] = applicationOf(uid, name, ranked, painted, subject, told);
    seed[decisionPath(uid)] = told.decision;
  }
  seed[privatePath("amara")] = { roundId: ROUND, uid: "amara", accessRequirements: ACCESS };
  return { ...seed, ...over };
}

/**
 * The People tab's world: the term, with seats on the run. Amara is in Group
 * B and told; Kofi is in Group B and not told yet; Dev and Tariq are in no
 * group; Sam left the run on Mon 2 Nov, and with it the form's place; Callum
 * was taken off the run by staff on Tue 3 Nov.
 */
export function peopleSeed(over = {}) {
  const seed = termSeed();
  seed[`courseEnrolments/${RUN.agi}__amara`] = seat("amara", B);
  seed[`courseEnrolments/${RUN.agi}__kofi`] = seat("kofi", B, { allocatedEmailAt: null });
  seed[`courseEnrolments/${RUN.agi}__bea`] = seat("bea", A);
  seed[`courseEnrolments/${RUN.agi}__zach`] = seat("zach", A);
  // Sam left the run, after Publish told Sam the group: the seat keeps its
  // group and stamp, and the place on the form went back, with no reason on it.
  const samLeft = new Date("2026-11-02T10:00:00Z");
  seed[`courseEnrolments/${RUN.agi}__sam`] = seat("sam", B, {
    status: "withdrawn",
    droppedOutAt: samLeft,
    dropOutReason: SAM_SAID,
  });
  const samApplication = seed[applicationPath("sam")];
  samApplication.status = "withdrawn";
  samApplication.withdrawnAt = samLeft;
  samApplication.attendance = { answer: "cant-make-it", answeredAt: samLeft };
  // Callum was taken off by staff: removed, the group cleared, the day kept.
  seed[`courseEnrolments/${RUN.agi}__callum`] = seat("callum", null, {
    status: "removed",
    droppedOutAt: new Date("2026-11-03T09:00:00Z"),
    allocatedEmailAt: null,
  });
  return { ...seed, ...over };
}

/**
 * The world: the facilitator pages' (pages, routes, Home and its two hooks,
 * the clock), the join's routes (hand-over, placements, Publish, replies),
 * and the People page and the tabs' layout.
 */
export async function makePeopleWorld(key = "__peopleWorld") {
  const made = await makeFacilitatorPagesWorld(key);
  const join = await loadJoin(made);
  const TABS = ["app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)"];
  const peoplePageModule = await made.loadTs([...TABS, "people", "page.tsx"].join("/"));
  const layoutModule = await made.loadTs([...TABS, "layout.tsx"].join("/"));
  const params = { roundId: ROUND, programmeId: AGI };

  /** The People page as `who`: its element, HTML, words and where it sent them. */
  const peoplePage = (who, programmeId = AGI) => made.draw(peoplePageModule.default, who, { ...params, programmeId });

  /** The view the People page hands its table, read off the element, or null. */
  function viewOf(drawn) {
    const visit = (node) => {
      if (!node || typeof node !== "object") return null;
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      }
      if (node.props?.view && Array.isArray(node.props.view.rows)) return node.props.view;
      return visit(node.props?.children);
    };
    return drawn.element ? visit(drawn.element) : null;
  }

  /** The tabs' layout as `who`, drawn round an empty page. */
  const layout = (who) =>
    made.draw(
      ({ params: p }) => layoutModule.default({ children: null, params: p }),
      who,
      params,
    );

  return { ...made, join, peoplePage, viewOf, layout, params };
}
