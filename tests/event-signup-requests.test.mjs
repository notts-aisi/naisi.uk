/**
 * AN EVENT'S SIGN-UP REQUESTS SAY WHO IS ASKING, and the people organising
 * the event see and decide them.
 *
 * The rule (`src/lib/events/signupAccess.ts`):
 *
 *  - who signed up, all of it, with addresses: admins and SU-recognised
 *    committee, client-direct, as before;
 *  - the requests waiting for a decision: those two, and the event's author
 *    and collaborators while their accounts stand, through
 *    `GET /api/events/[id]/signups`;
 *  - who decides (Approve, Turn down): admins, approvers, the author while
 *    they hold draftEvent, and the collaborators.
 *
 * And what each is sent (`src/lib/events/requestCard.ts`): the name by the
 * name rule for the person looking, when they asked, the card ("AGI Strategy
 * · Group K", "Facilitator · AGI Strategy, Group C", "SU member", "Guest, no
 * account"), and the answers to the event's own questions; an address, the
 * dietary and accessibility answers, the membership's source, the offer to
 * facilitate and the way to the person's page only as the privacy policy
 * says. Nobody already given a place is ever in it.
 *
 * Through the real route, the real approve and deny routes and the real
 * Sign-ups page, as every kind of caller: an author who is a member holding
 * draftEvent (Ada), a collaborator the SU does not recognise (Cal),
 * SU-recognised committee who organise nothing (Sue), an admin (Zach), an
 * approver who organises nothing (Abe), a member holding draftEvent who did
 * not write this event (Ed), committee the SU does not recognise who
 * organise nothing (Nia), a member (Mo), a pending account (Ines), a
 * collaborator whose account was turned down (Rex) and signed out. The world
 * is `tests/lib/checkInWorld.mjs`, with the event's author changed to Ada and
 * a programme, memberships and an application added. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_ID, PEOPLE, RSVP, makeCheckInWorld, person, rsvp, textOf, withEvent } from "./lib/checkInWorld.mjs";

const MAIL = "__signupRequestsMail";
const w = await makeCheckInWorld("__signupRequests", {
  stubs: [
    // A decision emails the person; here the email is kept, never sent.
    ["@/lib/events/sendRsvpEmail", `export const sendRsvpEmail = async (args) => { (globalThis.${MAIL} ||= []).push(args); };`],
    // The browser's own session and database, which a server render never reaches.
    [
      "@/auth/AuthProvider",
      "export function useAuth() { const u = globalThis.__signupRequests.user; return { user: u, role: u ? u.role : null, permissions: u ? u.permissions : {}, suRecognised: Boolean(u && u.suRecognised) }; }",
    ],
    ["@/lib/firebase/client", "export function getClientDb() { throw new Error('no browser database in a server render'); }"],
    [
      "firebase/firestore",
      "export const collection = () => null; export const query = () => null; export const where = () => null;" +
        " export const onSnapshot = () => () => {}; export const getDocsFromServer = async () => ({ docs: [] });",
    ],
  ],
});
const { call, render, load } = w;
const signups = await load("app/api/events/[id]/signups/route.ts");
const approve = await load("app/api/events/[id]/rsvp/[rsvpId]/approve/route.ts");
const deny = await load("app/api/events/[id]/rsvp/[rsvpId]/deny/route.ts");
const page = await load("app/(app)/events/manage/[id]/attendees/page.tsx");
const { SignupRequestsView } = await load("features/events/SignupRequests.tsx");
const { default: EventTabs } = await load("features/events/checkIn/EventTabs.tsx");
const words = await load("lib/events/requestWords.ts");
const manageWords = await load("features/events/manageWords.ts");
const access = await load("lib/events/signupAccess.ts");

// --- The people ------------------------------------------------------------

const ADA = person("ada", "member", "Ada Byron", { permissions: { draftEvent: true } });
const ADA_WITHOUT_DRAFT = person("ada", "member", "Ada Byron");
const ED = person("ed", "member", "Ed Stone", { permissions: { draftEvent: true } });
const ABE = person("abe", "member", "Abe Nash", { permissions: { approveEvent: true } });
const NIA = person("nia", "committee", "Nia Cole");
const REX = person("rex", "rejected", "Rex Hart");
const { zach: ZACH, sue: SUE, cal: CAL, mo: MO, ines: INES } = PEOPLE;

// --- The world ----------------------------------------------------------------

const PERIOD = "2026-27";
const TOLD = new Date("2026-10-20T10:00:00Z");
const QUESTIONS = [
  { id: "q_diet", type: "dietaryAllergies", label: "Dietary needs", required: false },
  { id: "q_why", type: "longText", label: "Why would you like to come?", required: false },
  { id: "q_access", type: "yesNo", label: "Do you have any access needs?", required: false },
  { id: "q_access_more", type: "shortText", label: "If yes, please tell us", required: false },
  { id: "q_game", type: "singleSelect", label: "Which game first?", required: false, options: ["Beat Saber", "Half-Life"] },
  { id: "q_else", type: "longText", label: "Anything else we should know?", required: false },
];
const PAT_ANSWERS = {
  q_diet: { checked: ["Vegetarian"], other: "" },
  q_why: "I loved the last one",
  q_access: true,
  q_access_more: "Step-free entrance please",
  q_game: "Beat Saber",
  q_else: "I am coeliac",
};
const RSVP_TOM = "rsvp-tom";
const RSVP_RAHUL = "rsvp-rahul";
const RSVP_SAM = "rsvp-sam";

function userDoc(who, extra = {}) {
  return {
    uid: who.uid,
    email: who.email,
    displayName: who.displayName,
    role: who.role,
    suRecognised: who.suRecognised,
    permissions: who.permissions,
    profile: { preferredName: who.displayName.split(" ")[0] },
    ...extra,
  };
}

/**
 * The event, run by Ada with Cal helping, four requests waiting: Pat (a told
 * place in Group K, membership bought, offered to facilitate, and a place on
 * a run that has ended), Tom (a place in Group K nobody has told him about
 * yet, no membership), Rahul (facilitates Group C, membership marked by an
 * admin) and Sam (a guest who gave one word).
 */
function world(over = {}) {
  return {
    ...withEvent({
      authorUid: "ada",
      authorDisplayName: "Ada Byron",
      collaboratorUids: ["cal", "rex"],
      signupForm: QUESTIONS,
      rsvpCountPending: 4,
      rsvpCountConfirmed: 3,
      rsvpCountWaitlisted: 1,
    }),
    "users/ada": userDoc(ADA),
    "users/ed": userDoc(ED),
    "users/abe": userDoc(ABE),
    "users/nia": userDoc(NIA),
    "users/rex": userDoc(REX),
    "users/pat": userDoc(PEOPLE.pat, { profile: { preferredName: "Pat", fullName: "Patricia Ellis" } }),
    "users/tom": userDoc(person("tom", "member", "Tom Okafor")),
    "users/rahul": userDoc(person("rahul", "member", "Rahul Mehta")),
    [`eventRsvps/${RSVP.pat}`]: rsvp(RSVP.pat, "pending", "Pat", "pat@example.com", "pat", {
      answers: PAT_ANSWERS,
      createdAt: new Date("2026-10-16T09:40:00Z"),
    }),
    [`eventRsvps/${RSVP_TOM}`]: rsvp(RSVP_TOM, "pending", "Tom", "tom@example.com", "tom", {
      createdAt: new Date("2026-10-17T18:12:00Z"),
    }),
    [`eventRsvps/${RSVP_RAHUL}`]: rsvp(RSVP_RAHUL, "pending", "Rahul", "rahul@example.com", "rahul", {
      createdAt: new Date("2026-10-18T14:05:00Z"),
    }),
    [`eventRsvps/${RSVP_SAM}`]: rsvp(RSVP_SAM, "pending", "Sam", "sam@example.com", null, {
      answers: { q_game: "Half-Life" },
      createdAt: new Date("2026-10-19T23:30:00Z"),
    }),
    "config/membership": { currentPeriodId: PERIOD },
    [`memberships/pat__${PERIOD}`]: { uid: "pat", periodId: PERIOD, tier: "paid", source: "su-import" },
    [`memberships/rahul__${PERIOD}`]: { uid: "rahul", periodId: PERIOD, tier: "comped", source: "manual" },
    "courseRuns/run-agi": { courseTitle: "AGI Strategy", status: "running", archived: false },
    "courseRuns/run-old": { courseTitle: "Intro to AI Safety", status: "completed", archived: false },
    "courseGroups/group-k": { runId: "run-agi", name: "Group K", facilitatorUids: [], archived: false },
    "courseGroups/group-c": { runId: "run-agi", name: "Group C", facilitatorUids: ["rahul"], archived: false },
    "courseGroups/group-old": { runId: "run-old", name: "Group A", facilitatorUids: ["pat"], archived: false },
    "courseEnrolments/run-agi__pat": {
      runId: "run-agi",
      uid: "pat",
      groupId: "group-k",
      status: "active",
      role: "learner",
      selfEnrolled: false,
      allocatedEmailAt: TOLD,
    },
    "courseEnrolments/run-old__pat": { runId: "run-old", uid: "pat", groupId: "group-old", status: "active", role: "learner", selfEnrolled: true },
    "courseEnrolments/run-agi__tom": { runId: "run-agi", uid: "tom", groupId: "group-k", status: "active", role: "learner", selfEnrolled: false },
    "courseEnrolments/run-agi__rahul": { runId: "run-agi", uid: "rahul", groupId: "group-c", status: "active", role: "facilitator", selfEnrolled: false },
    "admissionApplications/round-1__pat": {
      formVersion: 2,
      roundId: "round-1",
      uid: "pat",
      status: "accepted",
      draft: {},
      sent: { wantsToFacilitate: true, rankedProgrammeIds: [], answers: {} },
      sentAt: new Date("2026-09-20T10:00:00Z"),
    },
    "admissionApplications/round-1__tom": {
      formVersion: 2,
      roundId: "round-1",
      uid: "tom",
      status: "submitted",
      draft: {},
      sent: { wantsToFacilitate: false, rankedProgrammeIds: [], answers: {} },
      sentAt: new Date("2026-09-21T10:00:00Z"),
    },
    ...over,
  };
}

const ask = (as, id = EVENT_ID) => call(signups.GET, { as, params: { id } });
const byId = (res) => Object.fromEntries(res.body.requests.map((request) => [request.id, request]));
const aboutOf = (res, id) => byId(res)[id].about.map((line) => line.words);
const answersOf = (res, id) => byId(res)[id].answers.map((line) => `${line.question}: ${line.answer}`);
const nameOf = (res, id) => {
  const name = byId(res)[id].name;
  return [name.name, name.goBy, name.apart, name.note].filter(Boolean).join(" | ");
};

// ---------------------------------------------------------------------------
// 1. Who the route answers
// ---------------------------------------------------------------------------

describe("who is sent the requests", () => {
  test("the people organising the event, SU-recognised committee and admins; everybody else is refused", async () => {
    w.reset(world());
    for (const who of [ADA, ADA_WITHOUT_DRAFT, CAL, SUE, ZACH]) {
      const res = await ask(who);
      assert.equal(res.status, 200, who.uid);
      assert.deepEqual(Object.keys(res.body).sort(), ["decides", "requests"], who.uid);
    }
    assert.equal((await ask(null)).status, 401);
    for (const who of [INES, REX]) {
      const res = await ask(who);
      assert.equal(res.status, 403, who.uid);
    }
    for (const who of [NIA, ED, ABE, MO]) {
      const res = await ask(who);
      assert.equal(res.status, 403, who.uid);
      assert.equal(res.body.error, "Only the people organising this event can see who has asked for a place.", who.uid);
      assert.ok(!("requests" in res.body), who.uid);
    }
  });

  test("an event that is not there is not found, for an approved account; an id that could not be one is not read", async () => {
    w.reset(world());
    assert.equal((await ask(ADA, "no-such-event")).status, 404);
    assert.equal((await ask(ZACH, "not/an/id")).status, 404);
  });

  test("a pending account is refused before anything is read", async () => {
    w.reset(world());
    const before = w.everything();
    const res = await ask(INES);
    assert.equal(res.status, 403);
    assert.equal(w.everything(), before, "a refusal wrote something");
  });

  test("only the requests waiting for a decision, oldest first: nobody with a place, on the list, turned down or gone", async () => {
    w.reset(world());
    for (const who of [ADA, CAL, SUE, ZACH]) {
      const res = await ask(who);
      assert.deepEqual(
        res.body.requests.map((request) => request.id),
        [RSVP.pat, RSVP_TOM, RSVP_RAHUL, RSVP_SAM],
        who.uid,
      );
    }
  });

  test("who decides: admins, the author holding draftEvent, the collaborators; never SU-recognised committee who organise nothing", async () => {
    w.reset(world());
    assert.equal((await ask(ZACH)).body.decides, true);
    assert.equal((await ask(ADA)).body.decides, true);
    assert.equal((await ask(CAL)).body.decides, true);
    assert.equal((await ask(SUE)).body.decides, false);
    assert.equal((await ask(ADA_WITHOUT_DRAFT)).body.decides, false, "an author who no longer holds draftEvent sees and does not decide");
  });

  test("every request carries the same fields, whoever asks", async () => {
    w.reset(world());
    for (const who of [ADA, CAL, SUE, ZACH]) {
      for (const request of (await ask(who)).body.requests) {
        assert.deepEqual(Object.keys(request).sort(), ["about", "answers", "askedAt", "email", "id", "name", "page", "test"], who.uid);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. What each is sent
// ---------------------------------------------------------------------------

describe("what each viewer is sent about who is asking", () => {
  test("an address only for admins and SU-recognised committee", async () => {
    w.reset(world());
    for (const who of [ZACH, SUE]) {
      assert.equal(byId(await ask(who))[RSVP.pat].email, "pat@example.com", who.uid);
      assert.equal(byId(await ask(who))[RSVP_SAM].email, "sam@example.com", who.uid);
    }
    for (const who of [ADA, CAL]) {
      const res = await ask(who);
      for (const request of res.body.requests) assert.equal(request.email, null, `${who.uid} was sent ${request.id}'s address`);
      assert.ok(!JSON.stringify(res.body).includes("@example.com"), `${who.uid} was sent an address somewhere`);
    }
  });

  test("the name by the name rule: the full name for the committee, the name people go by for a member", async () => {
    w.reset(world());
    for (const who of [ZACH, SUE, CAL]) {
      assert.equal(nameOf(await ask(who), RSVP.pat), "Patricia Ellis | Pat", who.uid);
      assert.equal(nameOf(await ask(who), RSVP_TOM), "Tom Okafor", who.uid);
    }
    const ada = await ask(ADA);
    assert.equal(nameOf(ada, RSVP.pat), "Pat");
    assert.equal(nameOf(ada, RSVP_TOM), "Tom");
    assert.ok(!JSON.stringify(ada.body).includes("Patricia"), "a member organiser was sent a full name");
    // A guest is the name they typed, with what tells the room it is one word.
    for (const who of [ZACH, ADA]) assert.equal(nameOf(await ask(who), RSVP_SAM), "Sam | Guest: first name only", who.uid);
  });

  test("an account that holds no name: the name the sign-up kept for the whole list's viewers, never for anybody else", async () => {
    // A sign-up made by an account with no name keeps its address for one
    // (the RSVP route's rule), which only the whole list's viewers may read.
    const over = world({ "users/tom": { uid: "tom", role: "member", email: "tom@example.com" } });
    over[`eventRsvps/${RSVP_TOM}`] = { ...over[`eventRsvps/${RSVP_TOM}`], name: "tom@example.com" };
    w.reset(over);
    assert.equal(nameOf(await ask(ZACH), RSVP_TOM), "tom@example.com");
    assert.equal(nameOf(await ask(ADA), RSVP_TOM), "NAISI member");
    assert.equal(nameOf(await ask(CAL), RSVP_TOM), "NAISI member");
  });

  test("when they asked, as an instant", async () => {
    w.reset(world());
    assert.equal(byId(await ask(ADA))[RSVP.pat].askedAt, "2026-10-16T09:40:00.000Z");
  });

  test("the card: a place and its group once its owner was told, facilitating, and membership without its source", async () => {
    w.reset(world());
    for (const who of [ADA, CAL, SUE]) {
      const res = await ask(who);
      // The run that has ended says nothing, and Pat's place in Group A on it neither.
      assert.deepEqual(aboutOf(res, RSVP.pat), ["AGI Strategy · Group K", "SU member"], who.uid);
      assert.deepEqual(aboutOf(res, RSVP_TOM), ["AGI Strategy · not in a group yet", "Not an SU member"], who.uid);
      assert.deepEqual(aboutOf(res, RSVP_RAHUL), ["Facilitator · AGI Strategy, Group C", "SU member"], who.uid);
      assert.deepEqual(aboutOf(res, RSVP_SAM), ["Guest, no account"], who.uid);
      assert.equal(byId(res)[RSVP.pat].page, null, who.uid);
    }
  });

  test("an admin also reads the offer to facilitate, where the membership came from, the untold group and the way to each person's page", async () => {
    w.reset(world());
    const res = await ask(ZACH);
    assert.deepEqual(aboutOf(res, RSVP.pat), ["AGI Strategy · Group K", "Offered to facilitate", "SU member: bought"]);
    assert.deepEqual(aboutOf(res, RSVP_TOM), ["AGI Strategy · Group K", "Not an SU member"]);
    assert.deepEqual(aboutOf(res, RSVP_RAHUL), ["Facilitator · AGI Strategy, Group C", "SU member: marked by an admin"]);
    assert.deepEqual(aboutOf(res, RSVP_SAM), ["Guest, no account"]);
    assert.equal(byId(res)[RSVP.pat].page, "/admin/members/pat");
    assert.equal(byId(res)[RSVP_SAM].page, null, "a guest has no page");
  });

  test("a membership from the SU's list that was not bought says so, to an admin", async () => {
    w.reset(world({ [`memberships/pat__${PERIOD}`]: { uid: "pat", periodId: PERIOD, tier: "staff", source: "su-import" } }));
    assert.ok(aboutOf(await ask(ZACH), RSVP.pat).includes("SU member: on the SU’s list"));
    assert.ok(aboutOf(await ask(ADA), RSVP.pat).includes("SU member"));
  });

  test("an alumni row, or a row in another year, is not membership; with no current year set, nothing is said either way", async () => {
    w.reset(world({ [`memberships/pat__${PERIOD}`]: { uid: "pat", periodId: PERIOD, tier: "alumni", source: "su-import" } }));
    assert.ok(aboutOf(await ask(ZACH), RSVP.pat).includes("Not an SU member"));
    w.reset(world({ "config/membership": { currentPeriodId: "2025-26" } }));
    assert.ok(aboutOf(await ask(ADA), RSVP_RAHUL).includes("Not an SU member"));
    w.reset(world({ "config/membership": {} }));
    for (const who of [ZACH, ADA]) {
      const res = await ask(who);
      for (const id of [RSVP.pat, RSVP_TOM, RSVP_RAHUL]) {
        assert.ok(!aboutOf(res, id).some((line) => /SU member/.test(line)), `${who.uid}: ${id}`);
      }
    }
  });

  test("a facilitator who holds a place in the group they facilitate is said once, as its facilitator", async () => {
    w.reset(
      world({
        "courseEnrolments/run-agi__rahul": { runId: "run-agi", uid: "rahul", groupId: "group-c", status: "active", role: "learner", selfEnrolled: false, allocatedEmailAt: TOLD },
      }),
    );
    assert.deepEqual(aboutOf(await ask(ADA), RSVP_RAHUL), ["Facilitator · AGI Strategy, Group C", "SU member"]);
  });

  test("a place that was left, or a group that was archived, says nothing", async () => {
    w.reset(
      world({
        "courseEnrolments/run-agi__pat": { runId: "run-agi", uid: "pat", groupId: "group-k", status: "withdrawn", role: "learner", selfEnrolled: false, allocatedEmailAt: TOLD },
        "courseGroups/group-c": { runId: "run-agi", name: "Group C", facilitatorUids: ["rahul"], archived: true },
      }),
    );
    const res = await ask(ZACH);
    assert.deepEqual(aboutOf(res, RSVP.pat), ["Offered to facilitate", "SU member: bought"]);
    assert.deepEqual(aboutOf(res, RSVP_RAHUL), ["SU member: marked by an admin"]);
  });

  test("the offer to facilitate is the latest application's, and one given back offers nothing", async () => {
    w.reset(
      world({
        "admissionApplications/round-2__pat": {
          formVersion: 2,
          roundId: "round-2",
          uid: "pat",
          status: "submitted",
          draft: {},
          sent: { wantsToFacilitate: false, rankedProgrammeIds: [], answers: {} },
          sentAt: new Date("2026-10-01T10:00:00Z"),
        },
      }),
    );
    assert.ok(!aboutOf(await ask(ZACH), RSVP.pat).includes("Offered to facilitate"), "an older application's yes outlived the newer no");
    w.reset(
      world({
        "admissionApplications/round-1__pat": {
          formVersion: 2,
          roundId: "round-1",
          uid: "pat",
          status: "withdrawn",
          draft: {},
          sent: { wantsToFacilitate: true, rankedProgrammeIds: [], answers: {} },
          sentAt: new Date("2026-09-20T10:00:00Z"),
        },
      }),
    );
    assert.ok(!aboutOf(await ask(ZACH), RSVP.pat).includes("Offered to facilitate"));
  });

  test("answers: every one for the whole list's viewers; for anybody else none to a dietary, accessibility or catch-all question", async () => {
    w.reset(world());
    for (const who of [ZACH, SUE]) {
      assert.deepEqual(
        answersOf(await ask(who), RSVP.pat),
        [
          "Dietary needs: Vegetarian",
          "Why would you like to come?: I loved the last one",
          "Do you have any access needs?: Yes",
          "If yes, please tell us: Step-free entrance please",
          "Which game first?: Beat Saber",
          "Anything else we should know?: I am coeliac",
        ],
        who.uid,
      );
    }
    for (const who of [ADA, CAL]) {
      const res = await ask(who);
      assert.deepEqual(answersOf(res, RSVP.pat), ["Why would you like to come?: I loved the last one", "Which game first?: Beat Saber"], who.uid);
      for (const secret of ["Vegetarian", "Step-free", "coeliac", "access needs"]) {
        assert.ok(!JSON.stringify(res.body).includes(secret), `${who.uid} was sent "${secret}"`);
      }
      assert.deepEqual(answersOf(res, RSVP_SAM), ["Which game first?: Half-Life"], who.uid);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Deciding
// ---------------------------------------------------------------------------

describe("who decides a request", () => {
  const decide = (route, as, rsvpId, body) => call(route.POST, { as, params: { id: EVENT_ID, rsvpId }, body });
  const statusOf = (rsvpId) => w.world.db.read(`eventRsvps/${rsvpId}`).status;
  const mail = () => globalThis[MAIL] ?? [];

  test("a collaborator the SU does not recognise approves, and the person is told", async () => {
    w.reset(world());
    globalThis[MAIL] = [];
    const res = await decide(approve, CAL, RSVP.pat);
    assert.equal(res.status, 200);
    assert.equal(statusOf(RSVP.pat), "confirmed");
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.pat}`).decidedBy, "cal");
    assert.deepEqual(mail().map((m) => [m.variant, m.to]), [["approved", "pat@example.com"]]);
  });

  test("a collaborator turns a request down with a note, and the person is told", async () => {
    w.reset(world());
    globalThis[MAIL] = [];
    const res = await decide(deny, CAL, RSVP_RAHUL, { note: "This one is for this term’s fellows." });
    assert.equal(res.status, 200);
    assert.equal(statusOf(RSVP_RAHUL), "denied");
    assert.deepEqual(mail().map((m) => [m.variant, m.to, m.decisionNote]), [["denied", "rahul@example.com", "This one is for this term’s fellows."]]);
  });

  test("the author holding draftEvent decides; without it, the author is refused", async () => {
    w.reset(world());
    assert.equal((await decide(approve, ADA, RSVP_TOM)).status, 200);
    assert.equal((await decide(deny, ADA, RSVP_SAM)).status, 200);
    w.reset(world());
    assert.equal((await decide(approve, ADA_WITHOUT_DRAFT, RSVP_TOM)).status, 403);
    assert.equal((await decide(deny, ADA_WITHOUT_DRAFT, RSVP_TOM)).status, 403);
    assert.equal(statusOf(RSVP_TOM), "pending");
  });

  test("an admin and an approver decide, whether or not they organise the event", async () => {
    w.reset(world());
    assert.equal((await decide(approve, ZACH, RSVP.pat)).status, 200);
    assert.equal((await decide(approve, ABE, RSVP_TOM)).status, 200);
  });

  test("SU-recognised committee who organise nothing, other committee, another drafter, a member and a turned-down collaborator are refused, and nothing changes", async () => {
    w.reset(world());
    const before = w.everything();
    for (const who of [SUE, NIA, ED, MO, REX]) {
      assert.equal((await decide(approve, who, RSVP.pat)).status, 403, `${who.uid} approved`);
      assert.equal((await decide(deny, who, RSVP.pat)).status, 403, `${who.uid} turned down`);
    }
    assert.equal((await decide(approve, null, RSVP.pat)).status, 401);
    assert.equal(w.everything(), before);
  });

  test("the rule is one function, and the buttons are the routes' own", () => {
    const viewer = (who) => ({ ...who, permissions: { draftEvent: false, approveEvent: false, ...who.permissions } });
    const event = { authorUid: "ada", collaboratorUids: ["cal", "rex"] };
    const table = [ADA, ADA_WITHOUT_DRAFT, CAL, SUE, ZACH, ABE, ED, NIA, MO, INES, REX].map((who) => {
      const seen = access.signupAccessFor(viewer(who), event);
      return [who.uid + (who === ADA_WITHOUT_DRAFT ? "-without-draft" : ""), seen.everyone, seen.requests, seen.decides, access.decidesSignups(viewer(who), event)];
    });
    assert.deepEqual(table, [
      ["ada", false, true, true, true],
      ["ada-without-draft", false, true, false, false],
      ["cal", false, true, true, true],
      ["sue", true, true, false, false],
      ["zach", true, true, true, true],
      ["abe", false, false, false, true],
      ["ed", false, false, false, false],
      ["nia", false, false, false, false],
      ["mo", false, false, false, false],
      ["ines", false, false, false, false],
      ["rex", false, false, false, false],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. The page, the tabs and the words
// ---------------------------------------------------------------------------

describe("the Sign-ups page", () => {
  const open = (as, id = EVENT_ID) => render(page, { as, params: { id } });

  test("signed out goes to sign in; an event that is not there is not found; somebody it is not for goes back to the event", async () => {
    w.reset(world());
    assert.deepEqual(await open(null), { redirect: "/login" });
    await assert.rejects(open(ADA, "no-such-event"), /NEXT_NOT_FOUND/);
    for (const who of [NIA, ED, ABE]) assert.deepEqual(await open(who), { redirect: `/events/manage/${EVENT_ID}` }, who.uid);
  });

  test("its head says how it stands, and its tab how many are waiting", async () => {
    w.reset(world());
    const { text } = await open(ADA);
    assert.match(text, /^Manage events VR games night Published Sun 1 Nov, 2pm 3 confirmed of 30 4 waiting 1 on the waiting list Details Sign-ups 3 4 waiting Check-in Survey after /);
    assert.ok(!/Attendees/.test(text), "the page still calls itself Attendees");
  });

  test("an organiser the SU does not recognise is drawn the requests alone, and the whole list never opens for them", async () => {
    w.reset(world());
    for (const who of [ADA, CAL]) {
      const { text } = await open(who);
      assert.match(text, /Loading the requests…/, who.uid);
      assert.match(text, /Admins and the committee members the Students’ Union recognises see everybody who signed up\./, who.uid);
      for (const theirs of ["Loading sign-ups", "Everyone who signed up", "Send an update", "Kofi", "@example.com"]) {
        assert.ok(!text.includes(theirs), `${who.uid} was drawn "${theirs}"`);
      }
    }
  });

  test("admins and SU-recognised committee are drawn the requests and the whole list", async () => {
    w.reset(world());
    for (const who of [ZACH, SUE]) {
      const { text } = await open(who);
      assert.match(text, /Loading the requests… Loading sign-ups…/, who.uid);
    }
  });

  const view = (answer) =>
    textOf(
      renderToStaticMarkup(
        createElement(SignupRequestsView, {
          answer,
          busyId: null,
          actionErr: null,
          denyFor: null,
          denyNote: "",
          onDenyNote() {},
          onApprove() {},
          onTurnDown() {},
          onConfirmTurnDown() {},
          onCancelTurnDown() {},
        }),
      ),
    );

  test("each request as the route sent it: Approve and Turn down only for those who decide", async () => {
    w.reset(world());
    const zach = view((await ask(ZACH)).body);
    assert.match(
      zach,
      /^Waiting for a decision \(4\) An approved request gets a place if there is one left; .* Patricia Ellis \(Pat\) pat@example\.com Asked Fri 16 Oct, 10:40am Turn down… Approve AGI Strategy · Group K Offered to facilitate SU member: bought Dietary needs: Vegetarian /,
    );
    assert.match(zach, /Open Patricia Ellis’s page/);
    assert.match(zach, /Sam Guest: first name only sam@example\.com Asked Tue 20 Oct, 12:30am Turn down… Approve Guest, no account Which game first\?: Half-Life$/);

    const sue = view((await ask(SUE)).body);
    assert.ok(!/Approve|Turn down/.test(sue), "SU-recognised committee who organise nothing were offered the buttons");
    assert.match(sue, /^Waiting for a decision \(4\) The event’s organisers and the people who approve events decide these\. /);
    assert.ok(!/Open .*’s page/.test(sue));

    const ada = view((await ask(ADA)).body);
    assert.match(ada, /Pat Asked Fri 16 Oct, 10:40am Turn down… Approve AGI Strategy · Group K SU member Why would you like to come\?: I loved the last one Which game first\?: Beat Saber Tom /);
  });

  test("with nobody waiting it says so", () => {
    assert.equal(view({ requests: [], decides: true }), "Waiting for a decision (0) Nobody is waiting. A new request shows here.");
  });

  test("the tabs say how many are waiting after how many have a place, and nothing when nobody is", () => {
    const tabs = (props) => textOf(renderToStaticMarkup(createElement(EventTabs, { eventId: EVENT_ID, ...props })));
    assert.equal(tabs({ current: "signups", showSignups: true, signups: 3, waiting: 4, showCheckIn: true }), "Details Sign-ups 3 4 waiting Check-in Survey after");
    assert.equal(tabs({ current: "signups", showSignups: true, signups: 3, waiting: 0, showCheckIn: true }), "Details Sign-ups 3 Check-in Survey after");
  });

  test("the words", () => {
    assert.equal(words.signupsButtonWords(4), "Sign-ups · 4 waiting");
    assert.equal(words.signupsButtonWords(0), "Sign-ups");
    assert.deepEqual(words.signupCountWords({ confirmed: 21, capacity: 30, waiting: 4, waitlisted: 3 }), ["21 confirmed of 30", "4 waiting", "3 on the waiting list"]);
    assert.deepEqual(words.signupCountWords({ confirmed: 21, capacity: null, waiting: 0, waitlisted: 0 }), ["21 confirmed"]);
    assert.equal(words.waitingHeading(4), "Waiting for a decision (4)");
    assert.equal(words.placeWords("AGI Strategy", "Group K"), "AGI Strategy · Group K");
    assert.equal(words.placeWords("AGI Strategy", null), "AGI Strategy · not in a group yet");
    assert.equal(words.facilitatesWords("AGI Strategy", "Group C"), "Facilitator · AGI Strategy, Group C");
    assert.equal(words.openPageWords("Priya Shah"), "Open Priya Shah’s page");
    // In London: Mon 16 Nov 2026 is GMT, so 9:40 in the morning is 09:40Z.
    assert.equal(manageWords.askedWords(new Date("2026-11-16T09:40:00Z")), "Asked Mon 16 Nov, 9:40am");
    assert.equal(manageWords.dayTimeWords(new Date("2026-11-19T19:00:00Z")), "Thu 19 Nov, 7pm");
  });
});

// ---------------------------------------------------------------------------
// 5. Which questions may carry dietary or accessibility details
// ---------------------------------------------------------------------------

describe("which answers an organiser the SU does not recognise is not shown", () => {
  const hidden = (questions) => [...words.foodHealthOrAccessQuestions(questions)].sort();
  const q = (id, type, label, extra = {}) => ({ id, type, label, required: false, ...extra });

  test("the allergies checklist, whatever it is called", () => {
    assert.deepEqual(hidden([q("a", "dietaryAllergies", "Anything we should cater for?"), q("b", "dietaryAllergies", "Pick any")]), ["a", "b"]);
  });

  test("questions about food, diet, health, access or needs, by their label, help text or example", () => {
    assert.deepEqual(
      hidden([
        q("diet", "yesNo", "Any dietary requirements?"),
        q("access", "yesNo", "Do you need step-free access?"),
        q("help", "shortText", "Is there anything we can do?", { helpText: "For example a wheelchair space" }),
        q("example", "shortText", "Your order", { placeholder: "e.g. vegan, halal, nut allergy" }),
        q("why", "longText", "Why would you like to come?"),
        q("game", "singleSelect", "Which game first?", { options: ["Beat Saber"] }),
      ]),
      ["access", "diet", "example", "help"],
    );
  });

  test("a catch-all, and a follow-up to a question that is one", () => {
    assert.deepEqual(
      hidden([
        q("access", "yesNo", "Any access needs?"),
        q("more", "shortText", "If yes, please specify"),
        q("why", "longText", "Why would you like to come?"),
        q("which", "shortText", "If so, which session?"),
        q("else", "longText", "Anything else we should know?"),
        q("notes", "longText", "Notes"),
      ]),
      ["access", "else", "more", "notes"],
    );
  });

  test("the sign-up form's own starting points for food: every question in them is left out", async () => {
    const { FORM_PRESETS } = await load("features/events/formPresets.ts");
    const food = FORM_PRESETS.filter((preset) => ["burger", "pizza", "genericDietary"].includes(preset.id));
    assert.equal(food.length, 3, "a food starting point was renamed or taken away: say here which ones are about food");
    for (const preset of food) {
      const questions = preset.build();
      assert.deepEqual(hidden(questions), questions.map((question) => question.id).sort(), `${preset.id} has a question an organiser would be shown`);
    }
  });

  test("the whole list's viewers are shown every answer", () => {
    const questions = [q("diet", "dietaryAllergies", "Dietary needs"), q("why", "longText", "Why?")];
    const answers = { diet: { checked: ["Vegan"], other: "" }, why: "Fun" };
    assert.deepEqual(words.answerLines(questions, answers, { withFoodHealthAndAccess: true }), [
      { question: "Dietary needs", answer: "Vegan" },
      { question: "Why?", answer: "Fun" },
    ]);
    assert.deepEqual(words.answerLines(questions, answers, { withFoodHealthAndAccess: false }), [{ question: "Why?", answer: "Fun" }]);
  });
});
