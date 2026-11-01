/**
 * "WHO IS THIS FOR?": the one picker every message to chosen people shares
 * (src/lib/audience/, docs/messages.md).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. THE TAGS: every id is read back as the tag it names, in one spelling,
 *     and anything else is refused whole.
 *  2. THE SCOPE TABLE, run as every persona the standing red team knows: who
 *     may use which tag, and who reads why one person is left out.
 *  3. EACH TAG, read from the records of a real term: who is in it, for an
 *     admin, so a tag that starts reading the wrong records fails here.
 *  4. WHO IT REACHES: included, left out, how it would be sent (a programme
 *     notice only when the tags are about running a programme and the writer
 *     runs everybody; otherwise by the one row of their settings the writer
 *     chooses), and why each person left out is left out.
 *  5. THE ROUTES, as every kind of caller in the term: the gate first, the
 *     tags each may use, refusals whole, and no address in either answer.
 *
 * The term is `tests/lib/termWorld.mjs`'s, on Thu 10 Dec 2026, with AGI
 * Strategy's allocation published (so its groups have tags) and Technical AI
 * Safety's not (so its group has none), a few settings, two lists and one
 * bounced address added below. Every address is on a reserved domain.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { userDoc, session } from "./lib/applicationsSmallTerm.mjs";
import { A, B, C, TOLD } from "./lib/surveyWorld.mjs";
import { AFTER, AGI, EV, ROUND, RUN, TAIS, TAIS_GROUP, rsvpDoc, termSeed } from "./lib/termWorld.mjs";
import { PERSONA_NAMES, ROLE_PERSONAS } from "./persona-route-gates.registry.mjs";

const INCUBATOR = "research-incubator";

const w = makeWorld("__audiencePicker");
const lib = (...parts) => w.loadTs(join("lib", "audience", ...parts));
const tags = await lib("tags.ts");
const scopeTable = await lib("scope.ts");
const kind = await lib("kind.ts");
const words = await lib("words.ts");
const resolve = await lib("resolve.ts");
const { loadAudienceWorld, resolveAudience } = await lib("load.ts");
const route = await w.loadTs(join("app", "api", "audience", "route.ts"));
const whoRoute = await w.loadTs(join("app", "api", "audience", "who", "route.ts"));

const sub = (email, channel, audience, audienceId, over = {}) => ({
  email,
  channel,
  audience,
  audienceId,
  confirmed: true,
  subscribed: true,
  source: "test",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  ...over,
});
const subPath = (email, channel) => `subscriptions/sub_${email.replace(/[^a-z0-9@._+-]/g, "_")}__${channel}`;
const prefs = (categories) => ({ notifications: { channels: { gmail: true, uniEmail: false }, categories } });

/** The term on Thu 10 Dec 2026, with what this suite adds. `over` adds or replaces whole documents. */
function seed(over = {}) {
  const docs = termSeed({ templateItems: () => [] }, () => [], {});
  const user = (uid, extra) => ({ ...docs[`users/${uid}`], ...extra, profile: { ...docs[`users/${uid}`].profile, ...(extra.profile ?? {}) } });
  // Publish has told AGI Strategy's people their groups; Technical AI Safety's run has not been published.
  docs[`courseRuns/${RUN.agi}`] = { ...docs[`courseRuns/${RUN.agi}`], allocationPublishedAt: TOLD };
  // The VR night's door was opened, so check-in was used: Tariq had a place and did not come.
  docs[`events/${EV.vr}`] = { ...docs[`events/${EV.vr}`], doorOpenedAt: new Date("2026-11-01T13:30:00Z"), doorOpenedBy: "sue" };
  // Settings: Amara and Gwen said yes to event announcements, Bea to the newsletter; Dev said no to course announcements.
  docs["users/amara"] = user("amara", { profile: prefs({ newsletter: false, events: true, courses: true, tasks: true }) });
  docs["users/gwen"] = user("gwen", { profile: prefs({ newsletter: false, events: true, courses: true, tasks: true }) });
  docs["users/bea"] = user("bea", { profile: prefs({ newsletter: true, events: false, courses: true, tasks: true }), tracks: ["governance"] });
  docs["users/dev"] = user("dev", { profile: prefs({ newsletter: false, events: false, courses: false, tasks: true }) });
  docs["users/zach"] = user("zach", { tracks: ["technical", "governance"] });
  // An account waiting for approval.
  docs["users/penny"] = userDoc(session("penny", "pending", false, "Penny Lane"));
  // The two lists.
  docs[subPath("bea@example.com", "newsletter")] = sub("bea@example.com", "newsletter", "user", "bea");
  docs[subPath("sam@example.com", "newsletter")] = sub("sam@example.com", "newsletter", "guest", "g-sam");
  docs[subPath("amara@example.com", "events")] = sub("amara@example.com", "events", "user", "amara");
  docs[subPath("gwen@example.com", "events")] = sub("gwen@example.com", "events", "user", "gwen");
  docs[subPath("mo@example.com", "events")] = sub("mo@example.com", "events", "guest", "g-mo");
  docs[subPath("ola@example.com", "events")] = sub("ola@example.com", "events", "guest", "g-ola", { subscribed: false });
  // Gwen's address bounced.
  docs["suppressedEmails/gwen@example.com"] = { email: "gwen@example.com", reason: "bounce", source: "manual", addedAt: new Date("2026-11-20T10:00:00Z") };
  return { ...docs, ...over };
}

const id = tags.tagId;
const T = {
  applied: id({ kind: "term", roundId: ROUND, part: "applied" }),
  holding: id({ kind: "term", roundId: ROUND, part: "holding" }),
  facilitating: id({ kind: "term", roundId: ROUND, part: "facilitating" }),
  leading: id({ kind: "term", roundId: ROUND, part: "leading" }),
  invited: id({ kind: "term", roundId: ROUND, part: "invited" }),
  agiEveryone: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "everyone" }),
  agiHolding: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "holding" }),
  agiFacilitating: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "facilitating" }),
  taisEveryone: id({ kind: "programme", roundId: ROUND, programmeId: TAIS, part: "everyone" }),
  taisHolding: id({ kind: "programme", roundId: ROUND, programmeId: TAIS, part: "holding" }),
  incubatorEveryone: id({ kind: "programme", roundId: ROUND, programmeId: INCUBATOR, part: "everyone" }),
  groupA: id({ kind: "group", groupId: A }),
  groupB: id({ kind: "group", groupId: B }),
  groupC: id({ kind: "group", groupId: C }),
  taisGroup: id({ kind: "group", groupId: TAIS_GROUP }),
  vrCame: id({ kind: "event", eventId: EV.vr, part: "came" }),
  vrSignedUp: id({ kind: "event", eventId: EV.vr, part: "signed-up" }),
  vrNoShow: id({ kind: "event", eventId: EV.vr, part: "no-show" }),
  panelCame: id({ kind: "event", eventId: EV.panel, part: "came" }),
  talkCame: id({ kind: "event", eventId: EV.talk, part: "came" }),
  laterSignedUp: id({ kind: "event", eventId: EV.later, part: "signed-up" }),
  newsletter: id({ kind: "subscribed", channel: "newsletter" }),
  events: id({ kind: "subscribed", channel: "events" }),
  committee: id({ kind: "role", role: "committee" }),
  admins: id({ kind: "role", role: "admin" }),
  technical: id({ kind: "track", track: "technical" }),
  governance: id({ kind: "track", track: "governance" }),
  person: (uid) => id({ kind: "person", uid }),
};

/** One person's world, read as of Thu 10 Dec 2026. */
const worldOf = (uid, now = AFTER) => loadAudienceWorld(w.world.db, w.sessionOf(uid), now);

/** Who is in a tag, by key, as the world holds it, sorted. */
function membersOf(world, tagId) {
  const tag = world.tags.find((each) => each.id === tagId);
  assert.ok(tag, `${tagId} is not one of the tags`);
  return Object.fromEntries([...tag.members].sort(([a], [b]) => a.localeCompare(b)));
}
const inAll = (...uids) => Object.fromEntries(uids.sort().map((uid) => [`a:${uid}`, "in"]));

async function reach(uid, include, exclude = [], options = {}) {
  const world = await worldOf(uid);
  const answer = await resolveAudience(w.world.db, world, { include, exclude }, options);
  assert.ok(answer.ok, `refused: ${JSON.stringify(answer.unknown)}`);
  return { world, resolution: answer.resolution };
}
const line = (resolution) => Object.fromEntries(resolution.people.map((person) => [person.key, person.leftOut ?? "emailed"]));

// ---------------------------------------------------------------------------
// 1. The tags
// ---------------------------------------------------------------------------

describe("a tag is read back as the tag it names, and nothing else is a tag", () => {
  test("every kind of tag, in its one spelling", () => {
    const all = [
      { kind: "term", roundId: ROUND, part: "invited" },
      { kind: "programme", roundId: ROUND, programmeId: AGI, part: "facilitating" },
      { kind: "group", groupId: A },
      { kind: "event", eventId: EV.vr, part: "no-show" },
      { kind: "subscribed", channel: "events" },
      { kind: "role", role: "admin" },
      { kind: "track", track: "governance" },
      { kind: "person", uid: "amara" },
    ];
    for (const tag of all) assert.deepEqual(tags.parseTag(tags.tagId(tag)), tag);
  });

  test("anything that is not exactly a tag is no tag", () => {
    for (const raw of [
      "",
      "term",
      `term:${ROUND}`,
      `term:${ROUND}:everyone`,
      `programme:${ROUND}:${AGI}`,
      `programme:${ROUND}:constructor:holding`,
      "group:a/b",
      "group:__proto__",
      `event:${EV.vr}:went`,
      "subscribed:courses",
      "role:member",
      "track:design",
      "person:",
      "person:a.b",
      "team:x",
      42,
      null,
      { kind: "role", role: "admin" },
      `group:${"x".repeat(300)}`,
    ]) {
      assert.equal(tags.parseTag(raw), null, `${JSON.stringify(raw)} read as a tag`);
    }
  });

  test("a selection is read whole or refused whole, once each and in one spelling", () => {
    assert.deepEqual(tags.parseSelection(undefined), { ok: true, selection: { include: [], exclude: [] } });
    assert.deepEqual(tags.parseSelection({}), { ok: true, selection: { include: [], exclude: [] } });
    assert.deepEqual(tags.parseSelection({ include: [T.holding, T.holding], exclude: [T.admins] }), {
      ok: true,
      selection: { include: [T.holding], exclude: [T.admins] },
    });
    for (const raw of [[], "x", { include: "x" }, { include: [T.holding, "nope"] }, { exclude: [1] }, { include: new Array(61).fill(T.holding) }]) {
      assert.deepEqual(tags.parseSelection(raw), { ok: false }, JSON.stringify(raw).slice(0, 60));
    }
    assert.deepEqual(tags.parseAudienceBody({ include: [T.holding], row: "events" }), { ok: true, selection: { include: [T.holding], exclude: [] }, row: "events" });
    assert.deepEqual(tags.parseAudienceBody({ row: null }), { ok: true, selection: { include: [], exclude: [] }, row: null });
    assert.deepEqual(tags.parseAudienceBody({ row: "tasks" }), { ok: false }, "the tasks row is not one a message by settings may read");
  });
});

// ---------------------------------------------------------------------------
// 2. The scope table, as every persona
// ---------------------------------------------------------------------------

describe("the scope table, run as every persona", () => {
  const THEIRS = scopeTable.programmeKey(ROUND, AGI);
  const OTHER = scopeTable.programmeKey(ROUND, TAIS);
  const asks = {
    term: { kind: "term", roundId: ROUND, part: "holding" },
    ownProgramme: { kind: "programme", roundId: ROUND, programmeId: AGI, part: "holding" },
    otherProgramme: { kind: "programme", roundId: ROUND, programmeId: TAIS, part: "holding" },
    ownGroup: { kind: "group", groupId: A },
    otherGroup: { kind: "group", groupId: TAIS_GROUP },
    came: { kind: "event", eventId: EV.vr, part: "came" },
    signedUp: { kind: "event", eventId: EV.vr, part: "signed-up" },
    noShow: { kind: "event", eventId: EV.vr, part: "no-show" },
    subscribed: { kind: "subscribed", channel: "newsletter" },
    role: { kind: "role", role: "committee" },
    track: { kind: "track", track: "technical" },
    person: { kind: "person", uid: "amara" },
  };
  const NONE = Object.fromEntries(Object.keys(asks).map((key) => [key, false]));
  const COMMITTEE = { ...NONE, came: true, signedUp: true, role: true, person: true };
  const ALL = Object.fromEntries(Object.keys(asks).map((key) => [key, true]));

  /** Each persona as a session, and what the records give them: a lead leads THEIRS, a facilitator facilitates one of its groups. */
  const VIEWERS = {
    anonymous: null,
    pending: { uid: "p", role: "pending" },
    rejected: { uid: "r", role: "rejected" },
    member: { uid: "m", role: "member" },
    committee: { uid: "c", role: "committee", suRecognised: false },
    suCommittee: { uid: "s", role: "committee", suRecognised: true },
    admin: { uid: "z", role: "admin" },
  };
  const ROLES = { lead: { leads: [THEIRS], groups: [A] }, facilitator: { leads: [], groups: [A] } };
  /** What each persona may use. A permission is no tag: the plain member who holds it may use what a member may. */
  const EXPECT = {
    anonymous: null,
    pending: null,
    rejected: null,
    member: NONE,
    committee: NONE,
    suCommittee: COMMITTEE,
    admin: ALL,
    lead: { ...COMMITTEE, ownProgramme: true, ownGroup: true },
    facilitator: { ...NONE, ownGroup: true },
    participant: NONE,
  };

  for (const persona of PERSONA_NAMES) {
    test(`${persona}`, () => {
      const base = ROLE_PERSONAS[persona] ?? persona;
      const viewer = Object.hasOwn(VIEWERS, base) ? VIEWERS[base] : { uid: persona, role: "member" };
      const expected = Object.hasOwn(EXPECT, persona) ? EXPECT[persona] : NONE;
      const scope = scopeTable.scopeOf(viewer, ROLES[persona] ?? { leads: [], groups: [] });
      if (expected === null) {
        assert.equal(scope, null, `${persona} may use a tag`);
        return;
      }
      assert.ok(scope, `${persona} may use no tag at all`);
      for (const [name, tag] of Object.entries(asks)) {
        assert.equal(scopeTable.mayUse(scope, tag), expected[name], `${persona} and ${name}`);
      }
      // Why one person is left out is said by name to admins alone.
      assert.equal(scopeTable.seesReasonsByName(scope), persona === "admin", `${persona} reads reasons by name`);
      assert.equal(scopeTable.mayUse(scope, asks.otherProgramme), persona === "admin");
      assert.equal(scope.programmes.has(OTHER), false);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Each tag, from the records
// ---------------------------------------------------------------------------

describe("each tag is read from the records of the term", () => {
  test("the term's own tags", async () => {
    w.reset(seed());
    const world = await worldOf("zach");
    assert.deepEqual(world.term, { roundId: ROUND, label: "Autumn 2026" });
    // Nina gave her place back, so her application is out of the term.
    assert.deepEqual(membersOf(world, T.applied), inAll("amara", "bea", "dev", "ines", "omar", "tariq", "wen"));
    assert.deepEqual(membersOf(world, T.holding), inAll("amara", "bea", "dev", "tariq", "wen"));
    assert.deepEqual(membersOf(world, T.facilitating), inAll("rahul", "sofia", "tom", "tess"));
    assert.deepEqual(membersOf(world, T.leading), inAll("claudia", "tess"));
    assert.deepEqual(membersOf(world, T.invited), inAll("ines"));
  });

  test("a programme's tags, and its groups' from Publish on", async () => {
    w.reset(seed());
    const world = await worldOf("zach");
    assert.deepEqual(membersOf(world, T.agiHolding), inAll("amara", "bea", "dev", "tariq"));
    assert.deepEqual(membersOf(world, T.agiFacilitating), inAll("rahul", "sofia", "tom"));
    assert.deepEqual(membersOf(world, T.agiEveryone), inAll("amara", "bea", "claudia", "dev", "rahul", "sofia", "tariq", "tom"));
    assert.deepEqual(membersOf(world, T.taisEveryone), inAll("tess", "wen"));
    assert.deepEqual(membersOf(world, T.incubatorEveryone), inAll("tess"));
    assert.deepEqual(membersOf(world, T.groupB), inAll("amara", "rahul", "sofia"));
    assert.deepEqual(membersOf(world, T.groupA), inAll("bea", "dev"));
    assert.deepEqual(membersOf(world, T.groupC), inAll("tariq"));
    assert.ok(!world.tags.some((tag) => tag.id === T.taisGroup), "a group has a tag before its run's allocation was published");
    // Labels: the programme's short name, and the group's own.
    const label = (tagId) => world.tags.find((tag) => tag.id === tagId).label;
    assert.equal(label(T.agiHolding), "AGI Strategy: holding a place");
    assert.equal(label(T.groupC), "AGI Strategy: Group C");
  });

  test("holding a place includes somebody Publish has not told their group, and their group's tag does not", async () => {
    const base = seed();
    w.reset({ ...base, [`courseEnrolments/${RUN.agi}__dev`]: { ...base[`courseEnrolments/${RUN.agi}__dev`], allocatedEmailAt: null } });
    const world = await worldOf("zach");
    assert.ok(Object.hasOwn(membersOf(world, T.agiHolding), "a:dev"));
    assert.deepEqual(membersOf(world, T.groupA), inAll("bea"));
  });

  test("somebody who left a group is in its tag as having left, and is counted out of it", async () => {
    const base = seed();
    w.reset({ ...base, [`courseEnrolments/${RUN.agi}__dev`]: { ...base[`courseEnrolments/${RUN.agi}__dev`], status: "withdrawn" } });
    const world = await worldOf("zach");
    assert.deepEqual(membersOf(world, T.groupA), { "a:bea": "in", "a:dev": "left" });
    const listed = resolve.projectCatalogue(world).groups.flatMap((group) => group.tags).find((tag) => tag.id === T.groupA);
    assert.equal(listed.count, 1);
  });

  test("nobody holds a place, and nobody is invited, before decisions are sent; who applied is read all the same", async () => {
    const base = seed();
    w.reset({ ...base, [`admissionRounds/${ROUND}`]: { ...base[`admissionRounds/${ROUND}`], decisionsSentAt: null } });
    const world = await worldOf("zach");
    assert.deepEqual(membersOf(world, T.holding), {});
    assert.deepEqual(membersOf(world, T.invited), {});
    assert.equal(Object.keys(membersOf(world, T.applied)).length, 7);
  });

  test("the term's events: who came, who signed up, and who had a place and did not come", async () => {
    w.reset(seed());
    const world = await worldOf("zach");
    // Gwen's and Dev's guest sign-ups are at their accounts' own addresses, so they are those accounts.
    assert.deepEqual(membersOf(world, T.vrCame), {
      ...inAll("amara", "bea", "dev", "gwen"),
      "g:mo@example.com": "in",
      "w:vr-dan": "walk-in",
    });
    assert.deepEqual(membersOf(world, T.vrSignedUp), { ...inAll("amara", "bea", "dev", "gwen", "tariq"), "g:mo@example.com": "in" });
    assert.deepEqual(membersOf(world, T.vrNoShow), inAll("tariq"));
    assert.deepEqual(membersOf(world, T.panelCame), { ...inAll("amara", "dev", "gwen"), "w:panel-mo": "walk-in" });
    assert.deepEqual(membersOf(world, T.talkCame), { ...inAll("bea"), "w:talk-pat": "walk-in" });
    // An event to come has no one who came, and one whose door was never opened has nobody who didn't come.
    assert.deepEqual(membersOf(world, T.laterSignedUp), {});
    const ids = new Set(world.tags.map((tag) => tag.id));
    assert.ok(!ids.has(id({ kind: "event", eventId: EV.later, part: "came" })));
    assert.ok(!ids.has(id({ kind: "event", eventId: EV.panel, part: "no-show" })));
    // A drop-in has nobody who signed up; a draft, a cancelled event and one before the form opened are not the term's.
    assert.ok(!ids.has(id({ kind: "event", eventId: EV.talk, part: "signed-up" })));
    for (const eventId of [EV.draft, EV.cancelled, EV.early]) {
      assert.ok(![...ids].some((tagId) => tagId.startsWith(`event:${eventId}:`)), eventId);
    }
    // Newest first, each with its day.
    const events = resolve.projectCatalogue(world).groups.find((group) => group.heading === "Events");
    assert.equal(events.tags[0].label, "Signed up: Winter social");
    assert.equal(events.tags[0].hint, "Tue 15 Dec");
  });

  test("two of the term's events with one title are told apart by their day", async () => {
    const base = seed();
    w.reset({ ...base, [`events/${EV.pizza}`]: { ...base[`events/${EV.pizza}`], title: "VR games night" } });
    const world = await worldOf("zach");
    const label = (tagId) => world.tags.find((tag) => tag.id === tagId).label;
    assert.equal(label(T.vrCame), "Came to: VR games night, Sun 1 Nov");
    assert.equal(label(id({ kind: "event", eventId: EV.pizza, part: "signed-up" })), "Signed up: VR games night, Thu 19 Nov");
  });

  test("the lists, the roles and the tracks", async () => {
    w.reset(seed());
    const world = await worldOf("zach");
    assert.deepEqual(membersOf(world, T.newsletter), { ...inAll("bea"), "g:sam@example.com": "in" });
    // Ola unsubscribed, so is not on the list.
    assert.deepEqual(membersOf(world, T.events), { ...inAll("amara", "gwen"), "g:mo@example.com": "in" });
    assert.deepEqual(membersOf(world, T.committee), inAll("claudia", "iris", "lloyd", "nadia", "sue", "tess", "yusuf", "zach"));
    assert.deepEqual(membersOf(world, T.admins), inAll("zach"));
    assert.deepEqual(membersOf(world, T.technical), inAll("zach"));
    assert.deepEqual(membersOf(world, T.governance), inAll("bea", "zach"));
  });
});

// ---------------------------------------------------------------------------
// 4. Who it reaches
// ---------------------------------------------------------------------------

describe("who a selection reaches, how, and who is left out and why", () => {
  test("everybody holding a place, for an admin: a programme notice, everybody emailed", async () => {
    w.reset(seed());
    const { resolution } = await reach("zach", [T.holding]);
    assert.equal(resolution.mode, "notice");
    assert.deepEqual(resolution.counts, { people: 5, emailed: 5, leftOut: 0, you: false });
    // A notice reads no settings: Dev said no to course announcements and is emailed.
    assert.equal(line(resolution)["a:dev"], "emailed");
    assert.deepEqual(resolution.people.find((person) => person.key === "a:dev").addresses, ["dev@example.com"]);
  });

  test("who came to an event goes by their settings, on the events row, and says why each is left out", async () => {
    w.reset(seed());
    const { resolution } = await reach("zach", [T.vrCame]);
    assert.equal(resolution.mode, "grid");
    assert.equal(resolution.row, "events");
    assert.equal(resolution.suggestedRow, "events");
    assert.deepEqual(line(resolution), {
      "a:amara": "emailed",
      "a:bea": "settings",
      "a:dev": "settings",
      "a:gwen": "suppressed",
      "g:mo@example.com": "emailed",
      "w:vr-dan": "walk-in",
    });
    assert.deepEqual(resolution.counts, { people: 6, emailed: 2, leftOut: 4, you: false });
    assert.deepEqual(resolution.reasons, [
      { reason: "settings", count: 2 },
      { reason: "walk-in", count: 1 },
      { reason: "suppressed", count: 1 },
    ]);
  });

  test("leaving out wins, and the writer's chosen row is the only one read", async () => {
    w.reset(seed());
    const { resolution } = await reach("zach", [T.vrCame], [T.holding], { row: "newsletter" });
    assert.deepEqual(line(resolution), { "a:gwen": "settings", "g:mo@example.com": "settings", "w:vr-dan": "walk-in" });
    const newsletter = await reach("zach", [T.newsletter]);
    assert.equal(newsletter.resolution.row, "newsletter");
    assert.deepEqual(line(newsletter.resolution), { "a:bea": "emailed", "g:sam@example.com": "emailed" });
    const courses = await reach("zach", [T.vrCame], [], { row: "courses" });
    // A guest has no course announcements to say yes to.
    assert.equal(line(courses.resolution)["g:mo@example.com"], "settings");
    assert.equal(line(courses.resolution)["a:bea"], "emailed");
    assert.equal(line(courses.resolution)["a:dev"], "settings");
  });

  test("a notice only when every tag is about a programme and the writer runs everybody", async () => {
    w.reset(seed());
    assert.equal((await reach("zach", [T.agiEveryone, T.groupA])).resolution.mode, "notice");
    // Everybody who came to the VR night and holds a place is still an event's tag.
    assert.equal((await reach("zach", [T.vrCame], [T.vrCame])).resolution.mode, "grid");
    assert.equal((await reach("zach", [T.agiHolding, T.vrNoShow])).resolution.mode, "grid");
    // Applied is about applications, not running a programme.
    assert.equal((await reach("zach", [T.applied])).resolution.mode, "grid");
    // A person named who holds no place is somebody the admin does not run.
    assert.equal((await reach("zach", [T.agiHolding, T.person("nobody")])).resolution.mode, "grid");
    assert.equal((await reach("zach", [T.agiHolding, T.person("wen")])).resolution.mode, "notice");
    // The writer may say it is not about running the programme.
    assert.equal((await reach("zach", [T.agiHolding], [], { mode: "grid" })).resolution.mode, "grid");
  });

  test("a programme's lead runs its people and its facilitators, and is included when they match", async () => {
    w.reset(seed());
    const { resolution } = await reach("claudia", [T.agiEveryone]);
    assert.equal(resolution.mode, "notice");
    assert.equal(resolution.counts.people, 8);
    assert.equal(resolution.counts.you, true);
    assert.equal(resolution.people.find((person) => person.you).key, "a:claudia");
    assert.equal(words.headlineWords(resolution.counts.people, resolution.counts.you), "8 people, including you");
  });

  test("a facilitator runs the people in their own group, themselves included", async () => {
    w.reset(seed());
    const { resolution } = await reach("sofia", [T.groupB]);
    assert.equal(resolution.mode, "notice");
    assert.deepEqual(line(resolution), { "a:amara": "emailed", "a:rahul": "emailed", "a:sofia": "emailed" });
    assert.equal(resolution.counts.you, true);
  });

  test("per person: a notice for the people the writer runs, everybody else by their settings", async () => {
    w.reset(seed());
    const { resolution } = await reach("claudia", [T.agiHolding, T.person("gwen")], [], { policy: "per-person", row: "events" });
    const kinds = Object.fromEntries(resolution.people.map((person) => [person.key, person.kind]));
    assert.deepEqual(kinds, { "a:amara": "notice", "a:bea": "notice", "a:dev": "notice", "a:gwen": "grid", "a:tariq": "notice" });
    assert.deepEqual(resolution.people.find((person) => person.key === "a:dev").under, [scopeTable.programmeKey(ROUND, AGI)]);
    // Gwen said yes to event announcements, and her address bounced.
    assert.equal(line(resolution)["a:gwen"], "suppressed");
  });

  test("a tag the person may not use, or one that has gone, resolves nobody", async () => {
    w.reset(seed());
    const world = await worldOf("sue");
    for (const tagId of [T.holding, T.vrNoShow, T.newsletter, T.technical, T.agiHolding, T.groupA, T.person("penny"), T.person("refused"), id({ kind: "group", groupId: "gone" })]) {
      const answer = await resolveAudience(w.world.db, world, { include: [], exclude: [tagId] });
      assert.equal(answer.ok, false, tagId);
      assert.deepEqual(answer.unknown, [tagId]);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The routes, as every kind of caller
// ---------------------------------------------------------------------------

describe("the routes, as every kind of caller in the term", () => {
  const groupsOf = (body) => Object.fromEntries(body.groups.map((group) => [group.heading, group.tags.map((tag) => tag.listLabel)]));

  test("signed out, waiting or refused: refused before anything is read", async (t) => {
    mock.timers.enable({ apis: ["Date"], now: AFTER });
    t.after(() => mock.timers.reset());
    w.reset(seed());
    for (const [who, status] of [[null, 401], ["penny", 403], ["refused", 403]]) {
      assert.equal((await w.call(who, route.GET, {})).status, status, `${who} GET`);
      assert.equal((await w.call(who, route.POST, {}, { body: {} })).status, status, `${who} POST`);
      assert.equal((await w.call(who, whoRoute.POST, {}, { body: {} })).status, status, `${who} who`);
    }
  });

  test("each caller is offered the tags their records give them", async (t) => {
    mock.timers.enable({ apis: ["Date"], now: AFTER });
    t.after(() => mock.timers.reset());
    w.reset(seed());
    const admin = await w.call("zach", route.GET, {});
    assert.equal(admin.status, 200);
    assert.deepEqual(Object.keys(admin.body).sort(), ["groups", "names", "rows", "term"]);
    assert.equal(admin.body.term, "Autumn 2026");
    assert.deepEqual(Object.keys(groupsOf(admin.body)), ["This term: Autumn 2026", "Technical AI Safety", "AGI Strategy", "Research incubator", "Events", "Subscribed", "Roles and tags"]);
    assert.deepEqual(groupsOf(admin.body)["AGI Strategy"], ["Everyone", "Holding a place", "Facilitating", "Group B", "Group C", "Group A"]);
    assert.deepEqual(admin.body.rows.map((row) => row.id), ["newsletter", "events", "courses"]);
    assert.ok(admin.body.names.some((person) => person.name === "Nell Carter"));
    assert.ok(!admin.body.names.some((person) => person.name === "Penny Lane"), "an account waiting for approval can be named");

    const sue = await w.call("sue", route.GET, {});
    assert.deepEqual(Object.keys(groupsOf(sue.body)), ["Events", "Roles and tags"]);
    assert.ok(!groupsOf(sue.body).Events.some((label) => label.startsWith("Didn")), "SU-recognised committee is offered who didn't come");
    assert.deepEqual(groupsOf(sue.body)["Roles and tags"], ["Committee", "Admins"]);
    assert.ok(sue.body.names.length > 0);

    const claudia = await w.call("claudia", route.GET, {});
    assert.deepEqual(Object.keys(groupsOf(claudia.body)), ["AGI Strategy", "Events", "Roles and tags"]);

    // Tess leads Technical AI Safety and the incubator and facilitates its group, whose run is not published.
    const tess = await w.call("tess", route.GET, {});
    assert.deepEqual(groupsOf(tess.body)["Technical AI Safety"], ["Everyone", "Holding a place", "Facilitating"]);
    assert.ok(groupsOf(tess.body)["Research incubator"]);

    const sofia = await w.call("sofia", route.GET, {});
    assert.deepEqual(groupsOf(sofia.body), { "AGI Strategy": ["Group B", "Group A"] });
    assert.deepEqual(sofia.body.names, [], "a facilitator can name people");

    for (const who of ["amara", "iris", "nobody"]) {
      const answer = await w.call(who, route.GET, {});
      assert.equal(answer.status, 200, who);
      assert.deepEqual(answer.body.groups, [], `${who} is offered a tag`);
      assert.deepEqual(answer.body.names, [], `${who} can name people`);
    }
  });

  test("the count: numbers only, refused whole on a tag the caller may not use", async (t) => {
    mock.timers.enable({ apis: ["Date"], now: AFTER });
    t.after(() => mock.timers.reset());
    w.reset(seed());
    const empty = await w.call("amara", route.POST, {}, { body: {} });
    assert.equal(empty.status, 200);
    assert.deepEqual(Object.keys(empty.body), ["count"]);
    assert.equal(empty.body.count.people, 0);

    const counted = await w.call("zach", route.POST, {}, { body: { include: [T.vrCame], exclude: [T.holding] } });
    assert.equal(counted.status, 200);
    assert.deepEqual(counted.body.count, {
      people: 3,
      emailed: 1,
      leftOut: 2,
      you: false,
      mode: "grid",
      row: "events",
      suggestedRow: "events",
      tagsAllow: false,
      reasons: [
        { reason: "walk-in", count: 1 },
        { reason: "suppressed", count: 1 },
      ],
    });

    assert.equal((await w.call("zach", route.POST, {}, { body: { include: ["nope"] } })).status, 400);
    assert.equal((await w.call("zach", route.POST, {}, { body: { include: [T.holding], row: "tasks" } })).status, 400);
    for (const [who, tagId] of [
      ["sue", T.holding],
      ["sue", T.vrNoShow],
      ["claudia", T.taisHolding],
      ["sofia", T.groupC],
      ["sofia", T.person("amara")],
      ["amara", T.groupB],
      ["iris", T.vrCame],
    ]) {
      const answer = await w.call(who, route.POST, {}, { body: { include: [tagId] } });
      assert.equal(answer.status, 403, `${who} counted ${tagId}`);
      const who2 = await w.call(who, whoRoute.POST, {}, { body: { exclude: [tagId] } });
      assert.equal(who2.status, 403, `${who} listed ${tagId}`);
    }
  });

  test("see who: names, never an address or an account id, and reasons by name for admins alone", async (t) => {
    mock.timers.enable({ apis: ["Date"], now: AFTER });
    t.after(() => mock.timers.reset());
    w.reset(seed());
    const asAdmin = await w.call("zach", whoRoute.POST, {}, { body: { include: [T.vrCame] } });
    assert.equal(asAdmin.status, 200);
    assert.deepEqual(Object.keys(asAdmin.body), ["people"]);
    assert.deepEqual(asAdmin.body.people, [
      { name: "Amara Okafor", you: false, emailed: true, reason: null },
      { name: "Bea Lindqvist", you: false, emailed: false, reason: "settings" },
      { name: "Dan Fitzgerald", you: false, emailed: false, reason: "walk-in" },
      { name: "Dev Patel", you: false, emailed: false, reason: "settings" },
      { name: "Gwen Price", you: false, emailed: false, reason: "suppressed" },
      { name: "Mo Rahman", you: false, emailed: true, reason: null },
    ]);
    const asCommittee = await w.call("sue", whoRoute.POST, {}, { body: { include: [T.vrCame] } });
    assert.equal(asCommittee.status, 200);
    assert.ok(asCommittee.body.people.every((person) => person.reason === null), "a reason is named to somebody who is not an admin");
    assert.equal(asCommittee.body.people.filter((person) => person.emailed).length, 2);

    const asLead = await w.call("claudia", whoRoute.POST, {}, { body: { include: [T.agiEveryone] } });
    assert.ok(asLead.body.people.some((person) => person.name === "Claudia Reyes" && person.you));

    // No address and no account id in any answer.
    const everything = [asAdmin, asCommittee, asLead, await w.call("zach", route.POST, {}, { body: { include: [T.vrCame] } })];
    for (const answer of everything) {
      const text = JSON.stringify(answer.body);
      assert.doesNotMatch(text, /@/, "an address in an answer");
      for (const uid of ["amara", "bea", "dev", "gwen", "claudia"]) assert.ok(!text.includes(`"${uid}"`) && !text.includes(`a:${uid}`), `${uid}'s id in an answer`);
    }
    const catalogue = JSON.stringify((await w.call("zach", route.GET, {})).body);
    assert.doesNotMatch(catalogue, /@/, "an address in the catalogue");
  });
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

describe("the words", () => {
  const strings = [];
  const collect = (value) => {
    if (typeof value === "string") strings.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(words);
  for (const reason of words.LEFT_OUT_REASONS) for (const row of kind.GRID_ROWS) strings.push(words.leftOutWords(reason, row));
  for (const mode of ["notice", "grid"]) for (const row of kind.GRID_ROWS) for (const allow of [true, false]) strings.push(words.modeWords(mode, row, allow));
  strings.push(words.emailedWords(31, 53), words.headlineWords(1, true), words.termHeading("Autumn 2026"));

  test("no dashes anywhere, and the sign that leaves people out is a minus sign", () => {
    for (const each of strings) assert.doesNotMatch(each, /[–—]/, `a dash in: ${each}`);
    assert.equal(words.LEAVE_OUT_SIGN, "−");
    assert.ok(words.PICKER_WORDS.hint.endsWith("−"));
  });

  test("the count and its reasons", () => {
    assert.equal(words.emailedWords(31, 53), "31 will be emailed · 53 left out");
    assert.equal(words.headlineWords(1, false), "1 person");
    assert.equal(words.headlineWords(0, true), "0 people");
    assert.equal(words.leftOutWords("settings", "events"), "Didn’t say yes to event announcements");
    assert.equal(words.leftOutWords("settings", "newsletter"), "Didn’t say yes to the newsletter");
    assert.equal(words.MODE_LABELS.notice, "Programme notice");
    assert.equal(words.MODE_LABELS.grid, "By their settings");
  });

  test("the row a selection suggests", () => {
    const parse = (...ids) => ids.map((each) => tags.parseTag(each));
    assert.equal(kind.suggestedRow(parse(T.holding)), "courses");
    assert.equal(kind.suggestedRow(parse(T.holding, T.vrCame)), "events");
    assert.equal(kind.suggestedRow(parse(T.newsletter)), "newsletter");
    assert.equal(kind.suggestedRow(parse(T.newsletter, T.events)), "events");
    assert.equal(kind.tagsAllowNotice([]), false);
  });
});
