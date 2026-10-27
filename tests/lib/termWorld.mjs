/**
 * The world This term in numbers is counted in: the Autumn 2026 term on Thu
 * 10 Dec 2026, the day after AGI Strategy's last session (board sv-term).
 *
 * Built on `tests/lib/ratingsWorld.mjs`'s seed: the term's form after
 * decision day ("Autumn 2026", opened Tue 6 Oct), AGI Strategy naming its run
 * with Claudia as its lead, the run's six weeks from Thu 29 Oct, three groups
 * and every register finished (Amara 6 of 6, Rahul 5, Sofia 6, Bea 4, Dev 2,
 * Tariq 3). On top of that:
 *
 *  - WHO FINISHED: AGI Strategy's rule is at least 4 sessions, so Amara,
 *    Rahul, Sofia and Bea finished, and Dev and Tariq did not: 4 of 6.
 *  - AGI STRATEGY'S SURVEYS, stored as the routes leave them. Before (sent to
 *    6): Amara at stage 1, Bea 0, Dev 2, Rahul 3. At the end (sent to 6,
 *    closed Wed 9 Dec): Amara at stage 3, Bea 0, Dev 4, Sofia 2, and one
 *    answer whose name has come off. Answered both: Amara, Bea and Dev, of
 *    whom 1 (Dev) was considering, planning or doing it at the start and 2
 *    (Amara, Dev) at the end.
 *  - TECHNICAL AI SAFETY names its own run, which starts Thu 3 Dec and runs
 *    ten taught weeks round two weeks off at Christmas, so its last session
 *    is Thu 11 Feb 2027: Wen and Omar are in its one group, nobody has
 *    finished yet, and its survey at the end is a draft.
 *  - THE RESEARCH INCUBATOR names no run, so it is not one of the term's
 *    programmes.
 *  - NINE EVENTS, seven of them the term's (`EV`), run by Iris (committee,
 *    not recognised by the SU) unless a test says otherwise:
 *
 *    | Event | Day | Who came | Survey |
 *    | --- | --- | --- | --- |
 *    | Board games and pizza | Wed 14 Oct | nobody checked in | none |
 *    | Movie night: WarGames (no sign-up) | Fri 16 Oct | nobody | none |
 *    | VR games night | Sun 1 Nov | Amara (code), Bea, Gwen and Dev and Mo as guests, Dan walking in, and one record whose names came off (counted by the Check-in tab, and matched with nobody); Tariq signed up and did not come | sent: 3 answers, rated 5 and 4 |
 *    | AI policy careers panel | Thu 5 Nov | Amara (code), Gwen (with an account now), Dev walking in with an account, Mo walking in with no account | a draft |
 *    | How do you test an AI model? (no sign-up) | Thu 12 Nov | Bea with the code, Pat at the door | none |
 *    | Pizza and board games | Thu 19 Nov | nobody checked in | none |
 *    | Movie night: Ex Machina (no sign-up) | Wed 25 Nov | nobody | none |
 *
 *    Not the term's: a draft (Fri 20 Nov), a cancelled one (Sat 21 Nov), one
 *    on Wed 30 Sep, before the form opened, and one on Tue 15 Dec, to come.
 *
 *    So: 13 check-ins at 3 events; 9 different people (Amara, Bea, Gwen, Dev,
 *    Mo the guest, three walk-ins with no account: Dan, Mo again, Pat, and the
 *    person whose names came off); 4 who came to two or more (Amara, Bea,
 *    Gwen, Dev). Gwen is matched by
 *    the address on Gwen's guest sign-up and the account's own; Dev by the
 *    address on Dev's guest sign-up and the account's, which Dev's walking
 *    in carries. Mo's walk-in email is never matched to Mo's guest sign-up.
 *
 * THE CLOCK is a suite's to set with `mock.timers` (Date only). Every address
 * is `example.com`.
 */
import { join } from "node:path";
import { session, userDoc } from "./applicationsSmallTerm.mjs";
import { TAIS } from "./leadWorld.mjs";
import { AGI, ROUND, RUN, makeSurveyWorld, seat } from "./surveyWorld.mjs";
import { ratingsSeed } from "./ratingsWorld.mjs";

export { AGI, ROUND, RUN, TAIS };

/** Thu 10 Dec 2026, noon: the day after AGI Strategy's last session. */
export const AFTER = new Date("2026-12-10T12:00:00Z");

/** The term's events, and the ones that are not. */
export const EV = {
  games: "board-games__ev000001",
  movie: "movie-wargames__ev000002",
  vr: "vr-games-night__ev000003",
  panel: "policy-panel__ev000004",
  talk: "testing-talk__ev000005",
  pizza: "pizza-games__ev000006",
  film: "movie-ex-machina__ev000007",
  draft: "draft-event__ev000008",
  cancelled: "cancelled-event__ev000009",
  early: "september-social__ev000010",
  later: "winter-social__ev000011",
};

/** TAIS's one group: Thursdays at 6pm. */
export const TAIS_GROUP = "tais-autumn-2026-thursday__grp00009";

const day = (iso) => new Date(iso);

/** An event, published and run by Iris, as the editor and publish route leave one. */
export function eventDoc(title, startAt, endAt, over = {}) {
  return {
    title,
    blocks: [],
    startAt: day(startAt),
    endAt: day(endAt),
    location: "Portland A13",
    locationHidden: false,
    locationPublicText: "",
    visibility: "public",
    capacity: 40,
    waitlistEnabled: false,
    noSignup: false,
    signupForm: [],
    status: "published",
    archived: false,
    authorUid: "iris",
    authorDisplayName: "Iris Walker",
    collaboratorUids: [],
    rsvpCountPending: 0,
    rsvpCountConfirmed: 0,
    rsvpCountWaitlisted: 0,
    createdAt: day("2026-10-01T10:00:00Z"),
    updatedAt: day("2026-10-01T10:00:00Z"),
    ...over,
  };
}

/** A sign-up, confirmed unless told otherwise. */
export function rsvpDoc(eventId, name, email, uid, over = {}) {
  return {
    eventId,
    uid,
    name,
    email,
    answers: {},
    status: "confirmed",
    synthetic: false,
    decisionNote: null,
    decidedBy: null,
    decidedAt: null,
    pendingAnswers: null,
    signupSnapshot: null,
    createdAt: day("2026-10-20T10:00:00Z"),
    cancelledAt: null,
    ...over,
  };
}

/** A check-in, as the door, the code or the event's page leaves one. */
export function checkInDoc(eventId, at, over = {}) {
  return {
    eventId,
    kind: "signup",
    rsvpId: null,
    uid: null,
    name: null,
    email: null,
    emailGoesAt: null,
    how: "door",
    byUid: "sue",
    at: day(at),
    namesOffAt: day("2027-12-01T00:00:00Z"),
    namesOff: false,
    ...over,
  };
}

/** A survey document in the shape the routes leave one. */
function surveyDoc(over) {
  return {
    privacy: "confidential",
    intro: "",
    minutes: 5,
    runId: "",
    pairOf: null,
    strand: null,
    closedAt: null,
    namesOffOn: "2028-12-09",
    namesOffAt: null,
    tests: {},
    testToken: null,
    createdByUid: "zach",
    createdAt: day("2026-10-28T09:00:00Z"),
    updatedAt: day("2026-10-28T09:00:00Z"),
    ...over,
  };
}

const choice = (optionId) => ({ type: "choice", optionId });
const rating = (value) => ({ type: "rating", value });

/** The world every suite here starts from. `over` adds or replaces whole documents. */
export function termSeed(templates, eventItems, over = {}) {
  const seed = ratingsSeed();
  seed["users/iris"] = userDoc(session("iris", "committee", false, "Iris Walker"));
  seed["users/sue"] = userDoc(session("sue", "committee", true, "Sue Park"));
  seed["users/gwen"] = userDoc(session("gwen", "member", false, "Gwen Price"));
  seed["users/omar"] = userDoc(session("omar", "member", false, "Omar Haddad"));
  seed["users/wen"] = userDoc(session("wen", "member", false, "Wen Zhao"));

  // Who finished: AGI Strategy's rule.
  seed[`courseFinishing/${RUN.agi}`] = { kind: "rule", runId: RUN.agi, atLeast: 4, setAt: day("2026-12-09T21:00:00Z"), setByUid: "claudia" };

  // Technical AI Safety: ten taught weeks from Thu 3 Dec, two weeks off at Christmas.
  const tenWeeks = [];
  for (let week = 1; week <= 10; week += 1) {
    tenWeeks.push({ kind: "week", weekNumber: week, weekId: `w${String(week).padStart(2, "0")}` });
    if (week === 3) tenWeeks.push({ kind: "break", label: "Christmas" }, { kind: "break", label: "New Year" });
  }
  seed[`courseRuns/${RUN.tais}`] = { ...seed[`courseRuns/${RUN.tais}`], startDate: "2026-12-03", weekPlan: tenWeeks };
  seed[`courseGroups/${TAIS_GROUP}`] = {
    runId: RUN.tais,
    courseId: seed[`courseRuns/${RUN.tais}`].courseId,
    name: "Group A",
    facilitatorUids: ["tess"],
    capacity: 8,
    memberCount: 2,
    archived: false,
    session: { weekday: 4, startTimeLocal: "18:00", durationMinutes: 90, location: "Room B8", meetingUrl: null, notes: "" },
  };
  for (const uid of ["wen", "omar"]) {
    seed[`courseEnrolments/${RUN.tais}__${uid}`] = seat(uid, TAIS_GROUP, { runId: RUN.tais, courseId: seed[`courseRuns/${RUN.tais}`].courseId });
  }

  // AGI Strategy's two surveys, and Technical AI Safety's survey at the end, still a draft.
  const agi = { kind: "programme", roundId: ROUND, programmeId: AGI };
  seed["surveys/s-before"] = surveyDoc({
    kind: "before",
    name: "AGI Strategy: before",
    title: "Before you start",
    items: templates.templateItems("before", "fellowship", null),
    audience: agi,
    programmeName: "AGI Strategy",
    programmeKind: "fellowship",
    runId: RUN.agi,
    closesAt: day("2026-11-04T23:59:00Z"),
    firstSentAt: day("2026-10-29T09:00:00Z"),
    presses: [{ id: "p1", kind: "first", at: day("2026-10-29T09:00:00Z"), count: 6 }],
  });
  seed["surveys/s-after"] = surveyDoc({
    kind: "after",
    name: "AGI Strategy: after",
    title: "At the end",
    items: templates.templateItems("after", "fellowship", null),
    audience: agi,
    programmeName: "AGI Strategy",
    programmeKind: "fellowship",
    runId: RUN.agi,
    pairOf: "s-before",
    closesAt: day("2026-12-09T23:59:00Z"),
    firstSentAt: day("2026-12-03T09:00:00Z"),
    presses: [
      { id: "p2", kind: "first", at: day("2026-12-03T09:00:00Z"), count: 6 },
      { id: "p3", kind: "remind", at: day("2026-12-07T09:00:00Z"), count: 3 },
    ],
    createdAt: day("2026-12-01T09:00:00Z"),
  });
  seed["surveys/s-tais-after"] = surveyDoc({
    kind: "after",
    name: "Technical AI Safety: after",
    title: "At the end",
    items: templates.templateItems("after", "fellowship", null),
    audience: { kind: "programme", roundId: ROUND, programmeId: TAIS },
    programmeName: "Technical AI Safety",
    programmeKind: "fellowship",
    runId: RUN.tais,
    closesAt: day("2027-02-19T23:59:00Z"),
    firstSentAt: null,
    presses: [],
  });
  const answer = (surveyId, index, uid, answers) => {
    seed[`surveyAnswers/${surveyId}-${index}`] = {
      surveyId,
      roundId: ROUND,
      respondent: uid ? { kind: "account", uid } : null,
      answers,
      sentAt: day("2026-12-04T19:00:00Z"),
      via: "link",
      afterFirstSession: false,
    };
  };
  answer("s-before", 0, "amara", { q_c1: choice("o_stage1") });
  answer("s-before", 1, "bea", { q_c1: choice("o_stage0") });
  answer("s-before", 2, "dev", { q_c1: choice("o_stage2") });
  answer("s-before", 3, "rahul", { q_c1: choice("o_stage3") });
  answer("s-after", 0, "amara", { q_c1: choice("o_stage3") });
  answer("s-after", 1, "bea", { q_c1: choice("o_stage0") });
  answer("s-after", 2, "dev", { q_c1: choice("o_stage4") });
  answer("s-after", 3, "sofia", { q_c1: choice("o_stage2") });
  answer("s-after", 4, null, { q_c1: choice("o_stage5") });

  // The events.
  seed[`events/${EV.games}`] = eventDoc("Board games and pizza", "2026-10-14T17:00:00Z", "2026-10-14T20:00:00Z");
  seed[`events/${EV.movie}`] = eventDoc("Movie night: WarGames", "2026-10-16T18:00:00Z", "2026-10-16T21:00:00Z", { noSignup: true });
  seed[`events/${EV.vr}`] = eventDoc("VR games night", "2026-11-01T14:00:00Z", "2026-11-01T17:00:00Z");
  seed[`events/${EV.panel}`] = eventDoc("AI policy careers panel", "2026-11-05T18:00:00Z", "2026-11-05T20:00:00Z");
  seed[`events/${EV.talk}`] = eventDoc("How do you test an AI model?", "2026-11-12T18:00:00Z", "2026-11-12T20:00:00Z", { noSignup: true });
  seed[`events/${EV.pizza}`] = eventDoc("Pizza and board games", "2026-11-19T18:00:00Z", "2026-11-19T21:00:00Z");
  seed[`events/${EV.film}`] = eventDoc("Movie night: Ex Machina", "2026-11-25T19:00:00Z", "2026-11-25T22:00:00Z", { noSignup: true });
  seed[`events/${EV.draft}`] = eventDoc("A draft", "2026-11-20T18:00:00Z", "2026-11-20T20:00:00Z", { status: "draft" });
  seed[`events/${EV.cancelled}`] = eventDoc("Called off", "2026-11-21T18:00:00Z", "2026-11-21T20:00:00Z", { status: "cancelled" });
  seed[`events/${EV.early}`] = eventDoc("Freshers social", "2026-09-30T18:00:00Z", "2026-09-30T21:00:00Z");
  seed[`events/${EV.later}`] = eventDoc("Winter social", "2026-12-15T18:00:00Z", "2026-12-15T21:00:00Z");

  // Sign-ups.
  seed["eventRsvps/games-amara"] = rsvpDoc(EV.games, "Amara Okafor", "amara@example.com", "amara");
  seed["eventRsvps/vr-amara"] = rsvpDoc(EV.vr, "Amara Okafor", "amara@example.com", "amara");
  seed["eventRsvps/vr-bea"] = rsvpDoc(EV.vr, "Bea Lindqvist", "bea@example.com", "bea");
  seed["eventRsvps/vr-gwen"] = rsvpDoc(EV.vr, "Gwen Price", "Gwen@Example.com ", null);
  seed["eventRsvps/vr-dev"] = rsvpDoc(EV.vr, "Dev Patel", "dev@example.com", null);
  seed["eventRsvps/vr-mo"] = rsvpDoc(EV.vr, "Mo Rahman", "mo@example.com", null);
  seed["eventRsvps/vr-tariq"] = rsvpDoc(EV.vr, "Tariq Mensah", "tariq@example.com", "tariq");
  seed["eventRsvps/vr-test"] = rsvpDoc(EV.vr, "Test Person", "test@example.com", null, { synthetic: true });
  seed["eventRsvps/panel-amara"] = rsvpDoc(EV.panel, "Amara Okafor", "amara@example.com", "amara");
  seed["eventRsvps/panel-gwen"] = rsvpDoc(EV.panel, "Gwen Price", "gwen@example.com", "gwen");
  seed["eventRsvps/pizza-amara"] = rsvpDoc(EV.pizza, "Amara Okafor", "amara@example.com", "amara");

  // Check-ins.
  const vr = "2026-11-01T14:10:00Z";
  seed["eventCheckIns/vr-amara"] = checkInDoc(EV.vr, "2026-11-01T14:05:00Z", { rsvpId: "vr-amara", uid: "amara", how: "qr", byUid: null });
  seed["eventCheckIns/vr-bea"] = checkInDoc(EV.vr, vr, { rsvpId: "vr-bea", uid: "bea" });
  seed["eventCheckIns/vr-gwen"] = checkInDoc(EV.vr, vr, { rsvpId: "vr-gwen" });
  seed["eventCheckIns/vr-dev"] = checkInDoc(EV.vr, vr, { rsvpId: "vr-dev" });
  seed["eventCheckIns/vr-mo"] = checkInDoc(EV.vr, vr, { rsvpId: "vr-mo" });
  seed["eventCheckIns/vr-dan"] = checkInDoc(EV.vr, vr, { kind: "walk-in", name: "Dan Fitzgerald" });
  // Somebody whose account was deleted: their record's names came off at once. The Check-in tab still counts it, as one person nothing can match.
  seed["eventCheckIns/vr-gone"] = checkInDoc(EV.vr, "2026-11-01T14:20:00Z", { namesOff: true, namesOffAt: null, byUid: null });
  const panel = "2026-11-05T18:10:00Z";
  seed["eventCheckIns/panel-amara"] = checkInDoc(EV.panel, panel, { rsvpId: "panel-amara", uid: "amara", how: "qr", byUid: null });
  seed["eventCheckIns/panel-gwen"] = checkInDoc(EV.panel, panel, { rsvpId: "panel-gwen", uid: "gwen" });
  seed["eventCheckIns/panel-dev"] = checkInDoc(EV.panel, panel, { kind: "walk-in", uid: "dev", name: "Dev Patel" });
  seed["eventCheckIns/panel-mo"] = checkInDoc(EV.panel, panel, {
    kind: "walk-in",
    name: "Mo Rahman",
    email: "mo@example.com",
    emailGoesAt: day("2026-11-12T20:00:00Z"),
  });
  const talk = "2026-11-12T18:05:00Z";
  seed["eventCheckIns/talk-bea"] = checkInDoc(EV.talk, talk, { kind: "walk-in", uid: "bea", name: "Bea Lindqvist", how: "qr", byUid: null });
  seed["eventCheckIns/talk-pat"] = checkInDoc(EV.talk, talk, { kind: "walk-in", name: "Pat Ellis" });

  // The VR night's survey, sent, three answers: rated 5, rated 4, and one that skipped the rating.
  seed["surveys/s-vr"] = surveyDoc({
    kind: "event",
    name: "After VR games night",
    title: "After VR games night",
    items: eventItems(),
    minutes: 1,
    audience: { kind: "event-came", eventId: EV.vr },
    eventId: EV.vr,
    event: { title: "VR games night", startAt: day("2026-11-01T14:00:00Z"), endAt: day("2026-11-01T17:00:00Z") },
    closesAt: day("2026-11-08T23:59:00Z"),
    firstSentAt: day("2026-11-01T16:30:00Z"),
    presses: [{ id: "p4", kind: "first", at: day("2026-11-02T10:00:00Z"), count: 5 }],
    namesOffOn: "2028-11-01",
  });
  const eventAnswer = (index, respondent, answers) => {
    seed[`surveyAnswers/s-vr-${index}`] = { surveyId: "s-vr", eventId: EV.vr, respondent, answers, sentAt: day("2026-11-02T12:00:00Z"), via: "link" };
  };
  eventAnswer(0, { kind: "account", uid: "amara" }, { q_ev_how: rating(5), q_ev_again: choice("o_ev_yes") });
  eventAnswer(1, { kind: "guest", signupId: "vr-gwen" }, { q_ev_how: rating(4) });
  eventAnswer(2, { kind: "account", uid: "bea" }, { q_ev_again: choice("o_ev_maybe") });

  // The panel's survey, made and never opened or sent.
  seed["surveys/s-panel"] = surveyDoc({
    kind: "event",
    name: "After the AI policy careers panel",
    title: "After the AI policy careers panel",
    items: eventItems(),
    minutes: 1,
    audience: { kind: "event-came", eventId: EV.panel },
    eventId: EV.panel,
    event: { title: "AI policy careers panel", startAt: day("2026-11-05T18:00:00Z"), endAt: day("2026-11-05T20:00:00Z") },
    closesAt: day("2026-11-12T23:59:00Z"),
    firstSentAt: null,
    presses: [],
    namesOffOn: "2028-11-05",
  });

  return { ...seed, ...over };
}

/**
 * The world, with This term in numbers' loader beside the survey world's, and
 * its page and file route loaded when a suite first asks for them.
 */
export async function makeTermWorld(key = "__termNumbers") {
  const w = await makeSurveyWorld(key);
  const templates = w.lib.templates;
  const { eventTemplateItems } = await w.loadTs(join("lib", "surveys", "events", "template.ts"));
  const { loadTermNumbers } = await w.loadTs(join("lib", "surveys", "term", "load.ts"));
  const seed = (over = {}) => termSeed(templates, eventTemplateItems, over);
  let termPage = null;
  return {
    ...w,
    seed,
    reset: (docs = seed()) => w.reset(docs),
    /** The loader, as `who` would be handed it: the view, `{ term: null }`, or null when they may not have it. */
    load: (who, now = new Date()) => loadTermNumbers(w.world.db, w.sessionOf(who), now),
    /** This term in numbers as `who`; a redirect is answered by where it went. */
    async view(who) {
      termPage ??= (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "term", "page.tsx"))).default;
      return w.page(termPage, {}, who);
    },
  };
}
