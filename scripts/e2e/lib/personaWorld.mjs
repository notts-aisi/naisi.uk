/**
 * THE PERSONA BATTERY'S WORLD: two programmes, each running, written to a
 * FIRESTORE EMULATOR ONLY, so the battery can ask every course hub route and
 * page about records a persona does and does not hold a role on.
 *
 * WHY IT EXISTS. With ids that address nothing (`e2e-missing-<segment>`) the
 * battery proves who a route refuses outright, and never whether a programme's
 * lead can reach ANOTHER programme's records, or a group's facilitator another
 * group's. That needs records, and records with roles on them, so this module
 * writes two of everything:
 *
 *  - THEIRS: a programme on an application form, led by the `lead` persona,
 *    naming a course run that is running (three weeks in, its first three
 *    weeks published), with two groups. The `facilitator` persona facilitates
 *    the first group and holds a place in it, as this term's facilitators do;
 *    the `participant` persona holds a place in the second. Publish has told
 *    both. A before survey went to both, and the lead has asked the
 *    participant to facilitate the second group (an ask still open).
 *  - ANOTHER: the same shapes in every field that decides a gate, led,
 *    facilitated and taken part in by three accounts that are none of the
 *    personas (a `users` document each and no Auth account: nobody signs in
 *    as them).
 *
 * The two are mirrors on purpose: anybody holding no role on either (every
 * persona but the three, and the admin, who is resource-independent) must get
 * the same answer from both, so a difference between the two columns of the
 * answer key is exactly a role at work.
 *
 * THE SAME TERMS AS `./personas.mjs`. This module writes roles above `pending`
 * (the other programme's lead is SU-recognised committee) and authority over
 * records (a programme's `leadUid`, a group's `facilitatorUids`), which is
 * what `tests/e2e-no-privilege-grants.test.mjs` forbids every other harness
 * file. It may, for the reason `./personas.mjs` may: every exported function
 * starts with `assertEmulator()`, which refuses unless `FIRESTORE_EMULATOR_HOST`
 * names a loopback host, so none of it can reach the dev project. The fence
 * guard admits this file on those terms, executes its refusal, and holds every
 * collection it names to its own declared list.
 *
 * Every record is restated from the code that writes it in the product (the
 * file is named beside each builder), because this is plain Node and those are
 * TypeScript. `dispose()` deletes every document it wrote, by the path it wrote
 * it at; the emulator dies with the run besides.
 */
import { randomBytes } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { adminApp } from "./admin.mjs";
import { assertEmulator } from "./personas.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far into its run the term is: the seed's day is in week 3 (days 14 to 20 of the plan). */
const DAYS_IN = 17;
/** Taught weeks in the run's plan, and how many of them an editor has published. */
const WEEK_COUNT = 6;
const PUBLISHED_WEEKS = 3;
/** A new group's default length, `NEW_GROUP_SESSION_MINUTES` in src/lib/courses/sessionLength.ts. */
const SESSION_MINUTES = 90;
const GROUP_CAPACITY = 6;
/** A learner's role on an enrolment, written through a constant as the browser world does. */
const LEARNER = "learner";

/** The two sets the battery asks with, in the order it asks. */
export const WORLD_SETS = Object.freeze(["theirs", "another"]);

function emulatorDb() {
  assertEmulator();
  return getFirestore(adminApp());
}

// ---------------------------------------------------------------------------
// Dates in London, restated from the browser world (scripts/e2e-fixtures/worlds/course-hub-term.mjs)
// ---------------------------------------------------------------------------

function londonDateKey(at) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDateKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

function weekdayOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function academicYearOf(key) {
  const [y, m] = key.split("-").map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** `weekDocId` in src/lib/courses/weekPlan.ts: "w01" for week 1. */
function weekDocId(weekNumber) {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

/** A survey link's secret: 43 characters of [A-Za-z0-9_-], the shape `isSurveyToken` accepts. */
function surveyToken() {
  return randomBytes(32).toString("base64url").slice(0, 43);
}

// ---------------------------------------------------------------------------
// One programme's ids
// ---------------------------------------------------------------------------

/**
 * The ids of one set, by the dynamic segment each fills. Every value is
 * unique to its set and its run, so a redirect the battery reads can be put
 * back into key shape by matching whole path segments.
 *
 * Only the segments that address a programme's own records are here: the
 * form, the programme, the course, the run, the facilitator's group, the
 * survey, the ask to facilitate, a person on the run (`uid`, the set's
 * participant) and week 1 (`weekId`, `n`). Every other segment (an answer, a note, a link, an ask, a
 * token) addresses a record the world does not write, and the battery keeps
 * its made-up value in both sets, so a request is asked at the record it names.
 */
function idsOf(runId, set, people) {
  const tag = set === "theirs" ? "t" : "a";
  return {
    roundId: `e2e-${runId}-${tag}-form`,
    programmeId: `e2e-${tag}-programme`,
    courseId: `e2e-${runId}-${tag}-course`,
    runId: `e2e-${runId}-${tag}-run`,
    groupId: `e2e-${runId}-${tag}-group-one`,
    surveyId: `e2e-${runId}-${tag}-survey`,
    askId: `e2e-${runId}-${tag}-ask`,
    uid: people.participant,
    weekId: weekDocId(1),
    n: "1",
  };
}

// ---------------------------------------------------------------------------
// The records, each restated from the code that writes it
// ---------------------------------------------------------------------------

/** A course, as the course editor publishes one (src/lib/firestore/courses.ts). */
function courseDoc({ title, now }) {
  return {
    title,
    tagline: "Throwaway fixture for the persona battery.",
    summaryBlocks: [{ id: "b1", type: "richText", html: "<p>Exists only while a persona battery runs.</p>" }],
    track: "governance",
    level: "No prior experience needed",
    estimatedWeeklyHours: 2,
    status: "published",
    showcaseRunId: null,
    authorUid: "",
    collaboratorUids: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The run: taking people by admissions, moved on to running before its
 * start and published, as the browser world's points three weeks in leave it.
 * Nobody is named on the run itself: its lead is the programme's.
 */
function runDoc({ ids, courseTitle, startDate, publishedAt, now }) {
  return {
    courseId: ids.courseId,
    courseTitle,
    label: `E2E persona run ${ids.runId}`,
    academicYear: academicYearOf(startDate),
    status: "running",
    enrolMode: "admissions",
    streams: [],
    enrolledCount: 2,
    startDate,
    weekPlan: Array.from({ length: WEEK_COUNT }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: weekDocId(i + 1) })),
    startHereBlocks: [],
    applicationForm: [],
    applicationsOpenAt: null,
    applicationsCloseAt: null,
    applicationCap: null,
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: [],
    applicationCounts: { pending: 0, accepted: 2, withdrawn: 0 },
    groupCount: 2,
    channel: `cohort:${ids.runId}`,
    archived: false,
    allocationPublishedAt: publishedAt,
    createdAt: now,
    updatedAt: publishedAt,
  };
}

/**
 * One group, its weekly session and its facilitators. A facilitator who holds
 * a place is in `facilitatorUids` and has a learner row in this group
 * (`writeFacilitatorChange` in src/lib/courses/groupFacilitators.ts), with the
 * record of how they got there.
 */
function groupDoc({ ids, name, weekday, startTimeLocal, room, facilitatorUids, memberCount, appointedAt, now }) {
  const facilitatorAppointments = {};
  for (const uid of facilitatorUids) {
    facilitatorAppointments[uid] = { at: appointedAt, byUid: "e2e-appointment-record", byName: "E2E", agreedAt: appointedAt };
  }
  return {
    runId: ids.runId,
    courseId: ids.courseId,
    name,
    facilitatorUids,
    facilitatorAppointments,
    streamId: null,
    capacity: GROUP_CAPACITY,
    memberCount,
    session: { weekday, startTimeLocal, durationMinutes: SESSION_MINUTES, location: room, meetingUrl: null, notes: "" },
    sessionOverrides: {},
    sessionModes: {},
    paceStartDate: null,
    paceWeekPlan: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** One taught week, as an editor publishes it (the browser world's `publishedWeekDoc`). */
function publishedWeekDoc({ weekNumber, at }) {
  return {
    weekNumber,
    title: `E2E week ${weekNumber}`,
    summary: "Published so the persona battery has a week to ask about.",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    estimatedMinutes: null,
    published: true,
    updatedAt: at,
    updatedByUid: null,
  };
}

/** One person's place, as the board makes it and Publish stamps it told (src/app/api/courses/runs/[runId]/allocate). */
function placementDoc({ ids, uid, groupId, placedAt, publishedAt }) {
  return {
    runId: ids.runId,
    courseId: ids.courseId,
    uid,
    groupId,
    status: "active",
    role: LEARNER,
    applicationId: `${ids.runId}__${uid}`,
    joinedWeekNumber: 1,
    allocatedEmailAt: publishedAt,
    allocatedEmailDelivery: "sent",
    createdAt: placedAt,
    updatedAt: publishedAt,
  };
}

/** A person's row on the run's own list, as the hand-over writes it (`buildFormPlaceRow`). */
function runListRowDoc({ ids, uid, displayName, at }) {
  return {
    runId: ids.runId,
    courseId: ids.courseId,
    uid,
    displayName,
    status: "accepted",
    fromForm: { roundId: ids.roundId, programmeId: ids.programmeId },
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * The application form, its decisions sent, with one fellowship that names
 * the run and its lead: what `setProgrammeRun` and `setProgrammeRoles` leave
 * (src/lib/applications/handover/run.ts, src/lib/applications/roles.ts),
 * the lead in the round's `reviewerUids` too, the union that write keeps.
 */
function formDoc({ ids, leadUid, programmeName, now, sentAt }) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: `E2E persona form ${ids.roundId}`,
    slug: ids.roundId,
    blurb: "A throwaway application form the persona battery writes to an emulator.",
    academicYear: academicYearOf(londonDateKey(now)),
    status: "deciding",
    opensAt: new Date(now.getTime() - 50 * DAY_MS),
    closesAt: new Date(now.getTime() - 35 * DAY_MS),
    decisionsByDate: londonDateKey(sentAt),
    invitationReplyBy: londonDateKey(new Date(sentAt.getTime() + 3 * DAY_MS)),
    stageIds: [],
    programmePreference: { enabled: false, streams: [], fellowships: [], maxRankedFellowships: 2, offerFellowshipFallback: false },
    availabilityGrid: { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 },
    accessRequirementsPrompt: "",
    criteria: [],
    scoreScale: { min: 1, max: 5 },
    reviewersPerApplication: 1,
    reviewerUids: [leadUid],
    finalDeciderUid: null,
    blind: { hideNames: false, hideMembership: true },
    evidenceRunIds: [],
    reminderOffsets: [],
    outcomeRunIds: [],
    applicationCounts: { draft: 0, submitted: 0, accepted: 2, invited: 0, "no-offer": 0, declined: 0, withdrawn: 0 },
    archived: false,
    clonedFromRoundId: null,
    authorUid: "",
    programmeIds: [ids.programmeId],
    programmes: {
      [ids.programmeId]: {
        kind: "fellowship",
        name: programmeName,
        shortName: programmeName,
        pitch: "A programme that exists so the persona battery has something to lead.",
        facts: `${WEEK_COUNT} WEEKS`,
        starts: "",
        places: 8,
        groupCount: 2,
        groupSize: `Up to ${GROUP_CAPACITY}`,
        leadUid,
        reviewerUids: [],
        useScores: false,
        closed: false,
        courseId: ids.courseId,
        runId: ids.runId,
        emailWording: {},
      },
    },
    questionSetIds: [],
    asksFacilitating: false,
    revealOtherReviews: false,
    noOfferWording: null,
    decisionEmailTest: null,
    decisionsSentAt: sentAt,
    decisionsSentByUid: null,
    createdAt: new Date(now.getTime() - 60 * DAY_MS),
    updatedAt: sentAt,
  };
}

/** One person's sent application, accepted and told, who said they are coming (the browser world's `applicationDoc`). */
function applicationDoc({ ids, uid, email, displayName, now, sentAt }) {
  const appliedAt = new Date(now.getTime() - 40 * DAY_MS);
  const content = {
    aboutYou: {
      preferredName: displayName,
      universityEmail: "",
      universityEmailVerified: false,
      status: "undergraduate",
      statusOther: "",
      subject: "BSc Fixture Studies",
      expectedGraduation: "",
      motivation: "Written by the persona battery.",
      interests: "",
    },
    rankedProgrammeIds: [ids.programmeId],
    wantsToFacilitate: null,
    answers: {},
    availability: null,
    suMembership: "not-yet",
  };
  return {
    formVersion: 2,
    roundId: ids.roundId,
    uid,
    email,
    displayName,
    draft: content,
    sent: content,
    sentChangedAt: null,
    sentHistory: [],
    sentHistoryDropped: 0,
    status: "accepted",
    submittedAt: appliedAt,
    sentAt: appliedAt,
    withdrawnAt: null,
    result: {
      kind: "accepted",
      programmeId: ids.programmeId,
      publishedAt: sentAt,
      email: "sent",
      emailedAt: sentAt,
      emailClaimedAt: sentAt,
    },
    invitation: null,
    attendance: { answer: "coming", answeredAt: new Date(sentAt.getTime() + DAY_MS) },
    releaseReason: null,
    createdAt: appliedAt,
    updatedAt: sentAt,
  };
}

/** What the programme decided about one person, recorded by no account (the browser world's `decisionDoc`). */
function decisionDoc({ ids, uid, decidedAt }) {
  return {
    roundId: ids.roundId,
    uid,
    programmes: {
      [ids.programmeId]: {
        decision: "accept",
        poolReason: null,
        couldSuitProgrammeId: null,
        decidedByUid: "e2e-decision-record",
        decidedAt,
      },
    },
    pooledOutcome: null,
    exception: null,
    updatedAt: decidedAt,
  };
}

/**
 * The programme's before survey, sent to both people holding a place, as
 * `createSurvey` makes it and its first send stamps it (src/lib/surveys/create.ts,
 * src/lib/surveys/sending.ts). One question, closing a week after the seed.
 */
function surveyDoc({ ids, programmeName, sentAt, now }) {
  return {
    kind: "before",
    privacy: "confidential",
    name: `${programmeName}: before`,
    title: "Before you start",
    intro: "Written by the persona battery.",
    items: [{ kind: "question", id: "q1", type: "longText", title: "What do you hope to get from this?", body: [], required: false }],
    minutes: 3,
    audience: { kind: "programme", roundId: ids.roundId, programmeId: ids.programmeId },
    roundId: ids.roundId,
    programmeName,
    programmeKind: "fellowship",
    runId: ids.runId,
    pairOf: null,
    strand: null,
    closesAt: new Date(now.getTime() + 7 * DAY_MS),
    closedAt: null,
    namesOffOn: shiftDateKey(londonDateKey(now), 120),
    namesOffAt: null,
    firstSentAt: sentAt,
    presses: [{ id: "e2e-press", kind: "first", at: sentAt, count: 2 }],
    reached: 0,
    tests: { survey: null, reminder: null },
    testToken: null,
    createdByUid: "e2e-survey-record",
    createdAt: sentAt,
    updatedAt: sentAt,
  };
}

/** One person's row on a survey, as a send writes it (`surveyPersonId` is `<survey>__<uid>`). */
function surveyPersonDoc({ ids, uid, sentAt }) {
  return {
    surveyId: ids.surveyId,
    roundId: ids.roundId,
    respondent: { kind: "account", uid },
    token: surveyToken(),
    pressId: "e2e-press",
    sentAt,
    delivery: "sent",
    remindedAt: null,
    reminders: 0,
    answered: false,
    consents: {},
    consentsAt: null,
  };
}

/**
 * The lead's ask to the participant to facilitate the run's second group,
 * still open (its reply-by day three days after the seed), as an ask leaves
 * `courseFacilitating` once its email has gone (`normalizeAsk` in
 * src/lib/courses/facilitatorAsks/model.ts): its own seat, nobody's answer
 * yet. The email is what the ask's page shows its person, so it is whole.
 */
function askDoc({ ids, groupId, askedByUid, askedAt, replyByKey }) {
  return {
    kind: "ask",
    runId: ids.runId,
    roundId: ids.roundId,
    programmeId: ids.programmeId,
    groupId,
    uid: ids.uid,
    seat: ids.askId,
    askedByUid,
    askedAt,
    replyBy: { dateKey: replyByKey, time: "18:00" },
    answer: null,
    answeredAt: null,
    remindedAt: null,
    reminders: 0,
    delivery: "sent",
    email: {
      subject: "Would you facilitate Group two?",
      greeting: "Hi E2E,",
      paragraphs: ["Written by the persona battery: would you facilitate Group two this term?"],
      button: { label: "Answer", href: `/learn/facilitate/${ids.askId}` },
      signOff: { name: "E2E", role: "Programme lead" },
    },
    toName: "E2E participant",
    firstName: "E2E",
    leadName: "E2E",
  };
}

/** The `users` document of an account on the other programme: no Auth account, nothing signs in as it. */
function otherAccountDoc({ uid, name, shape, now }) {
  return {
    uid,
    email: `${uid}@e2e.invalid`,
    displayName: `E2E ${name}`,
    ...shape,
    showOnMembers: false,
    createdAt: now,
    profile: { preferredName: name, status: "undergraduate", subject: "e2e", motivation: "the persona battery's other programme" },
  };
}

// ---------------------------------------------------------------------------
// Seeding and teardown
// ---------------------------------------------------------------------------

/**
 * Writes both programmes for one battery run and returns each set's ids and
 * a `dispose()` that deletes every document written. `people` are the three
 * personas holding roles on THEIRS, as `withPersona` returns them.
 */
export async function seedPersonaWorld(runId, people) {
  assertEmulator();
  for (const name of ["lead", "facilitator", "participant"]) {
    if (!people?.[name]?.uid) throw new Error(`seedPersonaWorld needs the ${name} persona's account first.`);
  }
  const db = emulatorDb();
  const written = [];
  const put = async (ref, data) => {
    await ref.set(data);
    written.push(ref);
  };

  const now = new Date();
  const todayKey = londonDateKey(now);
  const startDate = shiftDateKey(todayKey, -DAYS_IN);
  const startWeekday = weekdayOf(startDate);
  const placedAt = new Date(now.getTime() - (DAYS_IN + 6) * DAY_MS);
  const publishedAt = new Date(now.getTime() - (DAYS_IN + 2) * DAY_MS);
  const formSentAt = new Date(now.getTime() - (DAYS_IN + 10) * DAY_MS);
  const surveySentAt = new Date(now.getTime() - (DAYS_IN + 1) * DAY_MS);

  const others = {
    lead: `e2e-${runId}-another-lead`,
    facilitator: `e2e-${runId}-another-facilitator`,
    participant: `e2e-${runId}-another-participant`,
  };
  const cast = {
    theirs: {
      lead: people.lead.uid,
      facilitator: people.facilitator.uid,
      participant: people.participant.uid,
      emails: { facilitator: people.facilitator.email, participant: people.participant.email },
    },
    another: {
      ...others,
      emails: { facilitator: `${others.facilitator}@e2e.invalid`, participant: `${others.participant}@e2e.invalid` },
    },
  };

  // The other programme's three accounts: a lead who stands (SU-recognised
  // committee, appointed, so flagged), and two plain members.
  const shapes = {
    lead: { role: "committee", suRecognised: true, admissionsReviewer: true },
    facilitator: { role: "member" },
    participant: { role: "member" },
  };
  for (const [key, uid] of Object.entries(others)) {
    await put(db.collection("users").doc(uid), otherAccountDoc({ uid, name: `other ${key}`, shape: shapes[key], now }));
  }

  const sets = {};
  for (const set of WORLD_SETS) {
    const who = cast[set];
    const ids = idsOf(runId, set, who);
    sets[set] = ids;
    const programmeName = `E2E persona ${set} programme`;
    const courseTitle = `E2E persona ${set} course`;
    const secondGroupId = `e2e-${runId}-${set === "theirs" ? "t" : "a"}-group-two`;

    await put(db.collection("courses").doc(ids.courseId), courseDoc({ title: courseTitle, now }));
    await put(db.collection("courseRuns").doc(ids.runId), runDoc({ ids, courseTitle, startDate, publishedAt, now }));
    for (let weekNumber = 1; weekNumber <= PUBLISHED_WEEKS; weekNumber += 1) {
      await put(
        db.collection("courseRuns").doc(ids.runId).collection("weeks").doc(weekDocId(weekNumber)),
        publishedWeekDoc({ weekNumber, at: publishedAt }),
      );
    }
    await put(
      db.collection("courseGroups").doc(ids.groupId),
      groupDoc({
        ids,
        name: "Group one",
        weekday: (startWeekday + 1) % 7,
        startTimeLocal: "18:00",
        room: "Room E1",
        facilitatorUids: [who.facilitator],
        memberCount: 1,
        appointedAt: placedAt,
        now,
      }),
    );
    await put(
      db.collection("courseGroups").doc(secondGroupId),
      groupDoc({
        ids,
        name: "Group two",
        weekday: (startWeekday + 2) % 7,
        startTimeLocal: "13:00",
        room: "Room E2",
        facilitatorUids: [],
        memberCount: 1,
        appointedAt: placedAt,
        now,
      }),
    );

    // The places: the facilitator in the group they facilitate, the
    // participant in the other, both told by Publish, both on the run's list.
    const places = [
      { uid: who.facilitator, groupId: ids.groupId, email: who.emails.facilitator, name: "E2E facilitator" },
      { uid: who.participant, groupId: secondGroupId, email: who.emails.participant, name: "E2E participant" },
    ];
    for (const place of places) {
      await put(
        db.collection("courseEnrolments").doc(`${ids.runId}__${place.uid}`),
        placementDoc({ ids, uid: place.uid, groupId: place.groupId, placedAt, publishedAt }),
      );
      await put(
        db.collection("courseApplications").doc(`${ids.runId}__${place.uid}`),
        runListRowDoc({ ids, uid: place.uid, displayName: place.name, at: placedAt }),
      );
    }

    // The form whose programme names the run, and what decision day left.
    await put(db.collection("admissionRounds").doc(ids.roundId), formDoc({ ids, leadUid: who.lead, programmeName, now, sentAt: formSentAt }));
    for (const place of places) {
      await put(
        db.collection("admissionApplications").doc(`${ids.roundId}__${place.uid}`),
        applicationDoc({ ids, uid: place.uid, email: place.email, displayName: place.name, now, sentAt: formSentAt }),
      );
      await put(
        db.collection("admissionDecisions").doc(`${ids.roundId}__${place.uid}`),
        decisionDoc({ ids, uid: place.uid, decidedAt: new Date(formSentAt.getTime() - DAY_MS) }),
      );
    }

    // The lead's ask to the participant, for the group the participant is in.
    await put(
      db.collection("courseFacilitating").doc(ids.askId),
      askDoc({ ids, groupId: secondGroupId, askedByUid: who.lead, askedAt: surveySentAt, replyByKey: shiftDateKey(todayKey, 3) }),
    );

    // The before survey, sent to both people holding a place.
    await put(db.collection("surveys").doc(ids.surveyId), surveyDoc({ ids, programmeName, sentAt: surveySentAt, now }));
    for (const place of places) {
      await put(
        db.collection("surveyPeople").doc(`${ids.surveyId}__${place.uid}`),
        surveyPersonDoc({ ids, uid: place.uid, sentAt: surveySentAt }),
      );
    }
  }

  return {
    sets,
    /** Every document written, as paths: what teardown deletes, and what a test can count. */
    paths: () => written.map((ref) => ref.path),
    dispose: () => disposePersonaWorld(written),
  };
}

/**
 * Deletes every document the seed wrote, in reverse order, each by the path
 * it was written at, then reads every path again and returns how many it
 * deleted and how many are still there (none, unless a delete failed), so a
 * teardown can prove the world is gone rather than assume it. Anything a
 * route wrote in the emulator during the run is the emulator's, which dies
 * with the run.
 */
export async function disposePersonaWorld(written) {
  assertEmulator();
  for (const ref of [...written].reverse()) await ref.delete();
  const left = written.length > 0 ? (await emulatorDb().getAll(...written)).filter((snap) => snap.exists).length : 0;
  return { deleted: written.length, left };
}
