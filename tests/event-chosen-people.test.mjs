/**
 * EVENTS FOR CHOSEN PEOPLE, executed as every kind of person.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * An event can be only for the people its organiser chose: listed nowhere,
 * announced to nobody, on each chosen person's Home, opened by them alone,
 * and each of them emailed an invitation when it is published (the privacy
 * policy's "Events for chosen people"). This suite runs the shipping code
 * against a real term (`tests/lib/termWorld.mjs`, Thu 10 Dec 2026: AGI
 * Strategy led by Claudia, with Amara, Bea, Dev and Tariq holding a place on
 * it) and holds:
 *
 *  1. CHOOSING. Who may choose who it is for, with which tags, and which
 *     programme it may be part of; the count the editor shows; the choice
 *     kept as tags and never as a list.
 *  2. PUBLISHING. The confirm's count is the send: the list written in the
 *     write that publishes, a programme notice to the people holding a place
 *     on the programme, everybody else by their events row, the author never
 *     emailed, no announcement and no push. A choice whose maker can no
 *     longer use its tags publishes nothing.
 *  3. EVERYBODY ELSE. The lists leave it out; its page answers calmly and
 *     names nothing of it; link previews get a plain title; the sign-up, the
 *     calendar file and the calendar page refuse anybody not invited.
 *  4. LATER. "Invite the N new since" reaches only the people new to its
 *     tags, says how many first, and nothing goes by itself; a live event
 *     stays for chosen people.
 *  5. AN EVENT THAT IS NOT ANNOUNCED. A listed event whose announcement is
 *     switched off claims nothing and mails nobody; one that is not switched
 *     off announces as it always did.
 *  6. THE PRIVACY POLICY's "Events for chosen people", held to the code.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { TOLD } from "./lib/surveyWorld.mjs";
import { AFTER, AGI, EV, ROUND, RUN, eventDoc, termSeed } from "./lib/termWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const w = makeWorld("__chosenPeople", [
  ["@/lib/recaptcha/server", "export const verifyRecaptcha = async () => true;"],
  ["@/lib/recaptcha/bypass", "export const recaptchaBypassGranted = () => false;"],
  ["@/lib/rateLimit", "export const clientIp = () => '203.0.113.1';\nexport const rateLimit = () => ({ ok: true, retryAfterSeconds: 0 });"],
  ["@/lib/events/sendRsvpEmail", "export const sendRsvpEmail = async (args) => { globalThis.__chosenPeople.rsvpMail.push(args); };"],
  [
    "@/lib/push/send",
    "export async function sendPushToUid(uid, note) { globalThis.__chosenPeople.pushes.push({ uid, ...note }); return { sent: 1, removed: 0 }; }",
  ],
]);
w.world.rsvpMail = [];
process.env.EVENTS_TOKEN_SECRET ??= "chosen-people-suite-secret-at-least-32-bytes";

const route = (...parts) => w.loadTs(join("app", "api", "events", "[id]", ...parts, "route.ts"));
const audienceRoute = await route("audience");
const invitationsRoute = await route("invitations");
const publishRoute = await route("publish");
const rsvpRoute = await route("rsvp");
const updateRoute = await route("update");
const icsRoute = await route("calendar.ics");
const fetchEvents = await w.loadTs(join("features", "events", "fetchEvents.ts"));
const home = await w.loadTs(join("app", "(app)", "dashboard", "homeData.ts"));
const tags = await w.loadTs(join("lib", "audience", "tags.ts"));
const words = await w.loadTs(join("lib", "events", "inviteWords.ts"));

const DINNER = "pitching-dinner__ev000099";
const SOCIAL = "winter-quiz__ev000098";

const id = tags.tagId;
const T = {
  agiHolding: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "holding" }),
  person: (uid) => id({ kind: "person", uid }),
};

const prefs = (events) => ({
  notifications: { channels: { gmail: true, uniEmail: false }, categories: { newsletter: false, events, courses: true, tasks: true } },
});

/** The term, with an event for chosen people being drafted by Iris and Claudia, and a few settings. */
function seed(over = {}) {
  const docs = termSeed({ templateItems: () => [] }, () => [], {});
  const user = (uid, extra) => ({ ...docs[`users/${uid}`], ...extra, profile: { ...docs[`users/${uid}`].profile, ...(extra.profile ?? {}) } });
  docs[`courseRuns/${RUN.agi}`] = { ...docs[`courseRuns/${RUN.agi}`], allocationPublishedAt: TOLD };
  // Gwen and Iris said yes to event announcements; Nina did not answer, so no.
  docs["users/gwen"] = user("gwen", { profile: prefs(true) });
  docs["users/iris"] = user("iris", { profile: prefs(true) });
  docs["users/yusuf"] = user("yusuf", { profile: prefs(true) });
  docs[`events/${DINNER}`] = eventDoc("Pitching dinner", "2026-12-15T19:00:00Z", "2026-12-15T21:00:00Z", {
    visibility: "chosen",
    status: "draft",
    authorUid: "iris",
    authorDisplayName: "Iris Walker",
    collaboratorUids: ["claudia"],
    location: "Cobden Room",
    capacity: 30,
  });
  return { ...docs, ...over };
}

/** A person, with the permissions this suite gives them, as the session hands them over. */
const NONE = { draftNewsletter: false, approveNewsletter: false, draftEvent: false, approveEvent: false, draftCourse: false, approveCourse: false, manageMembership: false, circulateWorksheet: false };
function as(uid, permissions = {}) {
  const account = w.world.db.read(`users/${uid}`);
  if (!account) return null;
  return {
    uid,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    suRecognised: account.suRecognised === true,
    permissions: { ...NONE, ...permissions },
  };
}
const approver = () => as("lloyd", { approveEvent: true });

let requests = 0;
/** One request to a real handler, as this session (null: nobody signed in). */
async function call(who, handler, id, { body, viewAs = false } = {}) {
  requests += 1;
  w.world.user = who;
  w.world.viewAs = viewAs;
  const init = {
    method: handler.name,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${(requests >> 8) & 255}.${requests & 255}` },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const res = await handler(new Request("https://naisi.invalid/api", init), { params: Promise.resolve({ id }) });
    return { status: res.status, body: res.body === undefined ? null : structuredClone(res.body) };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    w.world.viewAs = false;
  }
}

/** The day this suite lives on: Thu 10 Dec 2026, noon. */
function today(t) {
  mock.timers.enable({ apis: ["Date"], now: AFTER });
  t.after(() => mock.timers.reset());
}

const CHOICE = {
  include: [T.agiHolding, T.person("gwen"), T.person("nina"), T.person("claudia"), T.person("iris")],
  exclude: [],
  programme: { roundId: ROUND, programmeId: AGI },
};

/** Claudia chooses, the event is approved: ready to publish. */
async function chosenAndApproved() {
  const put = await call(as("claudia"), audienceRoute.PUT, DINNER, { body: CHOICE });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  await w.world.db.collection("events").doc(DINNER).update({ status: "approved" });
  return put;
}

const invitationsOf = (eventId) =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("eventInvitations/"))
    .map((path) => w.world.db.read(path))
    .filter((row) => row.eventId === eventId);

const byUid = (rows) => Object.fromEntries(rows.map((row) => [row.uid, row.outcome === "not-emailed" ? `not:${row.why}` : `${row.how}:${row.outcome}`]));

// ---------------------------------------------------------------------------
// 1. Choosing
// ---------------------------------------------------------------------------

describe("choosing who it is for", () => {
  test("a collaborator who leads the programme chooses its tags and names, and makes it part of the programme", async (t) => {
    today(t);
    w.reset(seed());
    const put = await chosenAndApproved();
    // The count is the plan publishing walks.
    assert.deepEqual(
      { home: put.body.count.home, emails: put.body.count.emails, notices: put.body.count.notices, bySettings: put.body.count.bySettings },
      { home: 8, emails: 5, notices: 4, bySettings: 1 },
    );
    assert.deepEqual(put.body.count.notEmailed, { author: 1, settings: 2, noAddress: 0, suppressed: 0 });
    // Kept as the tags, in Claudia's name, never as a list of people.
    const kept = w.world.db.read(`eventAudiences/${DINNER}`);
    assert.deepEqual(kept.include, CHOICE.include);
    assert.equal(kept.setBy, "claudia");
    assert.equal(Object.keys(kept).some((key) => /uids|people|list/i.test(key)), false);
    // The programme is on the event, with its short name for Home.
    assert.deepEqual(w.world.db.read(`events/${DINNER}`).programme, { roundId: ROUND, programmeId: AGI, name: "AGI Strategy" });
    // Choosing sends nothing.
    assert.equal(w.world.mail.length, 0);
  });

  test("who may choose: whoever may edit it; the tags and the programme are the chooser's own", async (t) => {
    today(t);
    w.reset(seed());
    const put = (who, body = CHOICE) => call(who, audienceRoute.PUT, DINNER, { body });
    assert.equal((await put(null)).status, 401);
    // A member who runs no events, and an account waiting for approval.
    assert.equal((await put(as("gwen"))).status, 403);
    assert.equal((await put(as("penny") ?? { uid: "penny", role: "pending", suRecognised: false, permissions: NONE })).status, 403);
    // SU-recognised committee who neither wrote it nor approves it.
    assert.equal((await put(as("sue"))).status, 403);
    // The author, who holds no permission to draft: refused, as the rules refuse.
    assert.equal((await put(as("iris"))).status, 403);
    // The author holding draftEvent may choose, but not a programme Iris does not lead.
    const notHers = await put(as("iris", { draftEvent: true }));
    assert.equal(notHers.status, 403);
    assert.match(notHers.body.error, /lead or an admin/);
    // Nor tags Iris may not use: a programme's people are its lead's.
    const tagsNotHers = await put(as("iris", { draftEvent: true }), { include: [T.agiHolding], exclude: [], programme: null });
    assert.equal(tagsNotHers.status, 403);
    // Names, as committee who is not SU-recognised, Iris may not use either.
    assert.equal((await put(as("iris", { draftEvent: true }), { include: [T.person("gwen")], exclude: [], programme: null })).status, 403);
    // An admin may choose anybody, and make it part of any of the term's programmes.
    assert.equal((await put(as("zach"))).status, 200);
    // A view-as session writes nothing.
    assert.equal((await call(as("zach"), audienceRoute.PUT, DINNER, { body: CHOICE, viewAs: true })).status, 403);
    // A body that is not a choice is refused whole.
    assert.equal((await put(as("zach"), { include: ["person:a/b"] })).status, 400);
    assert.equal((await put(as("zach"), { include: [], programme: { roundId: ROUND } })).status, 400);
  });

  test("once it has been sent for approval, only approvers and admins may change who it is for", async (t) => {
    today(t);
    w.reset(seed());
    await w.world.db.collection("events").doc(DINNER).update({ status: "pending" });
    assert.equal((await call(as("claudia"), audienceRoute.PUT, DINNER, { body: CHOICE })).status, 403);
    // An approver may change it, with the tags an approver may use: a member who approves names nobody.
    assert.equal((await call(as("nina", { approveEvent: true }), audienceRoute.PUT, DINNER, { body: { include: [T.person("gwen")], exclude: [] } })).status, 403);
    assert.equal((await call(approver(), audienceRoute.PUT, DINNER, { body: { include: [T.person("gwen")], exclude: [] } })).status, 200);
    assert.equal((await call(as("zach"), audienceRoute.PUT, DINNER, { body: CHOICE })).status, 200);
  });

  test("the programme it is part of is kept by whoever saves the people; only its lead or an admin takes it off", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    const programme = () => w.world.db.read(`events/${DINNER}`).programme;
    const agi = { roundId: ROUND, programmeId: AGI, name: "AGI Strategy" };
    const gwenOnly = (partOf) => ({ include: [T.person("gwen")], exclude: [], programme: partOf });
    // An approver who leads no programme changes the people, sending the programme back as it is: kept.
    const kept = await call(approver(), audienceRoute.PUT, DINNER, { body: gwenOnly({ roundId: ROUND, programmeId: AGI }) });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    assert.deepEqual(programme(), agi);
    // Saved in the approver's name, who runs nobody on it: the invitation goes by settings.
    assert.equal(kept.body.count.notices, 0);
    // The editor shows it to them, and offers no way to take it off.
    assert.equal((await call(approver(), audienceRoute.GET, DINNER)).body.programmeFixed, true);
    // Taking it off is refused, and changes nothing.
    const off = await call(approver(), audienceRoute.PUT, DINNER, { body: gwenOnly(null) });
    assert.equal(off.status, 403);
    assert.match(off.body.error, /lead or an admin/);
    assert.deepEqual(programme(), agi);
    // An admin may take it off.
    assert.equal((await call(as("zach"), audienceRoute.GET, DINNER)).body.programmeFixed, false);
    assert.equal((await call(as("zach"), audienceRoute.PUT, DINNER, { body: gwenOnly(null) })).status, 200);
    assert.equal(programme(), undefined);
  });

  test("the preview counts a choice on the screen and writes nothing", async (t) => {
    today(t);
    w.reset(seed());
    const before = JSON.stringify(w.world.db.paths().sort().map((path) => [path, w.world.db.read(path)]));
    const preview = await call(as("claudia"), audienceRoute.POST, DINNER, { body: CHOICE });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.count.home, 8);
    assert.equal(JSON.stringify(w.world.db.paths().sort().map((path) => [path, w.world.db.read(path)])), before);
  });

  test("what is stored is read back as numbers, the choice only to its chooser or an admin", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    const mine = await call(as("claudia"), audienceRoute.GET, DINNER);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.choice, { include: CHOICE.include, exclude: [] });
    assert.equal(mine.body.count.home, 8);
    const theirs = await call(as("sue"), audienceRoute.GET, DINNER);
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body.choice, null, "somebody else reads who chose it, not the tags");
    assert.equal(theirs.body.chosenByYou, false);
    assert.equal(typeof theirs.body.chosenBy, "string");
    assert.equal(theirs.body.count.home, 8);
    // No address and no account id anywhere in either answer.
    for (const answer of [mine.body, theirs.body]) assert.doesNotMatch(JSON.stringify(answer), /@example\.com|"(amara|bea|dev|tariq|gwen|nina)"/);
    assert.equal((await call(as("gwen"), audienceRoute.GET, DINNER)).status, 403);
    assert.equal((await call(null, audienceRoute.GET, DINNER)).status, 401);
  });
});

// ---------------------------------------------------------------------------
// 2. Publishing
// ---------------------------------------------------------------------------

describe("publishing an event for chosen people", () => {
  test("the confirm's count is the send: the list, a notice to the programme's people, the rest by their events row, never its author", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    const count = await call(as("zach"), publishRoute.GET, DINNER);
    assert.equal(count.status, 200);
    assert.deepEqual(count.body, { ok: true, emailed: 0, notified: 0, invited: { home: 8, emails: 5, overCeiling: false } });
    assert.equal(
      words.confirmChosenWords(count.body.invited),
      "Publish this event? Publishing shows it on 8 people’s Home and emails 5 invitations. It won’t be listed on the events page or announced.",
    );

    const published = await call(as("zach"), publishRoute.POST, DINNER);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.deepEqual(published.body, { ok: true, announced: false, invited: { home: 8, emailed: 5, failed: 0 } });
    const event = w.world.db.read(`events/${DINNER}`);
    assert.equal(event.status, "published");
    assert.equal(event.announcedAt, undefined, "nothing was announced, so nothing was claimed");
    assert.equal(event.announcementState, undefined);

    assert.deepEqual(byUid(invitationsOf(DINNER)), {
      amara: "notice:sent",
      bea: "notice:sent",
      dev: "notice:sent",
      tariq: "notice:sent",
      gwen: "grid:sent",
      nina: "not:settings",
      claudia: "not:settings",
      iris: "not:author",
    });
    const mail = w.world.mail;
    assert.equal(mail.length, count.body.invited.emails, "the number the confirm said is the number sent");
    const notices = mail.filter((each) => each.kind === "notice");
    assert.deepEqual(notices.map((each) => each.to).sort(), ["amara@example.com", "bea@example.com", "dev@example.com", "tariq@example.com"]);
    assert.ok(notices.every((each) => each.surface === "event-invitation" && !each.listUnsubscribe));
    const grid = mail.filter((each) => each.kind === "event-invitation");
    assert.deepEqual(grid.map((each) => each.to), ["gwen@example.com"]);
    assert.ok(grid[0].listUnsubscribe?.url.includes("/api/unsubscribe?t="));
    assert.ok(mail.every((each) => each.subject === "You’re invited: Pitching dinner"));
    assert.equal(mail.some((each) => each.to === "iris@example.com"), false, "its author is never emailed");
    assert.equal(mail.some((each) => each.kind === "event-announcement"), false);
    assert.equal(w.world.pushes.length, 0, "no notification on anybody's phone");

    // What each copy says, rendered: the notice carries the marker and no way
    // to switch it off; the copy by settings carries the events channel's link.
    const notice = await render(notices[0].react);
    assert.match(notice, /Sent as an important notice/);
    assert.match(notice, /you are on the programme this event is part of/);
    assert.match(notice, /You’re invited to Pitching dinner, part of AGI Strategy\./);
    assert.match(notice, /Ask for a place/);
    assert.doesNotMatch(notice, /unsubscribe/i);
    const bySettings = await render(grid[0].react);
    assert.doesNotMatch(bySettings, /Sent as an important notice/);
    assert.match(bySettings, /you said yes to event announcements/);
    assert.match(bySettings, /\/api\/unsubscribe\?t=/);
    for (const html of [notice, bySettings]) {
      assert.match(html, /Cobden Room/, "the public place");
      assert.doesNotMatch(html, /[\u2013\u2014]/, "no dash");
    }
  });

  test("publishing twice invites nobody twice", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    assert.equal((await call(as("zach"), publishRoute.POST, DINNER)).status, 200);
    const sent = w.world.mail.length;
    assert.equal((await call(as("zach"), publishRoute.POST, DINNER)).status, 400, "only an approved event publishes");
    assert.equal(w.world.mail.length, sent);
  });

  test("a choice nobody can resolve any more publishes nothing, and says so", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    // Claudia steps down from the committee: Claudia leads nothing now and may name nobody.
    await w.world.db.collection("users").doc("claudia").update({ role: "member", suRecognised: false });
    const refused = await call(as("zach"), publishRoute.POST, DINNER);
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /choose who it’s for again/i);
    assert.equal(w.world.db.read(`events/${DINNER}`).status, "approved");
    assert.deepEqual(invitationsOf(DINNER), []);
    assert.equal(w.world.mail.length, 0);
  });

  test("an event for chosen people with nobody chosen is not published", async (t) => {
    today(t);
    w.reset(seed());
    await w.world.db.collection("events").doc(DINNER).update({ status: "approved" });
    const refused = await call(as("zach"), publishRoute.POST, DINNER);
    assert.equal(refused.status, 400);
    assert.equal(w.world.db.read(`events/${DINNER}`).status, "approved");
  });

  test("with the announcement queue switched on, it is still invited and never queued", async (t) => {
    today(t);
    w.reset(seed({ "config/scheduler": { jobs: { "event-announcements": { enabled: true } } } }));
    await chosenAndApproved();
    const published = await call(as("zach"), publishRoute.POST, DINNER);
    assert.equal(published.status, 200);
    assert.equal(published.body.invited.emailed, 5);
    const event = w.world.db.read(`events/${DINNER}`);
    assert.equal(event.announcementState, undefined);
    assert.equal(event.announcedAt, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Everybody else
// ---------------------------------------------------------------------------

describe("to everybody it is not for, it is not there", () => {
  async function publishedDinner(t) {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    await call(as("zach"), publishRoute.POST, DINNER);
    w.world.mail.length = 0;
  }

  test("no list shows it", async (t) => {
    await publishedDinner(t);
    w.world.course = true;
    try {
      const listed = await fetchEvents.listPublishedEvents();
      assert.equal(listed.some((event) => event.id === DINNER), false);
      assert.ok(listed.some((event) => event.id === EV.vr), "the listed events are still listed");
    } finally {
      w.world.course = false;
    }
  });

  test("its page opens for the people invited and those who run events; anybody else is told calmly, and the preview names nothing", async (t) => {
    await publishedDinner(t);
    const open = async (who) => {
      w.world.user = who;
      return fetchEvents.getEventForViewer(DINNER);
    };
    assert.deepEqual(await open(null), { kind: "invited-only", signedIn: false });
    assert.deepEqual(await open(as("omar")), { kind: "invited-only", signedIn: true });
    for (const who of ["gwen", "amara", "nina", "claudia"]) assert.equal((await open(as(who)))?.kind, "open", who);
    for (const who of ["iris", "sue", "zach"]) assert.equal((await open(as(who)))?.kind, "open", `${who} runs events`);
    assert.equal((await open(as("refused") ?? { uid: "refused", role: "rejected", suRecognised: false, permissions: NONE }))?.kind, "invited-only");
    const meta = await fetchEvents.eventMetaFor(DINNER);
    assert.deepEqual(meta, { title: "NAISI event", description: "An event on naisi.uk.", chosen: true });
    assert.equal((await fetchEvents.eventMetaFor(EV.vr)).title, "VR games night");
  });

  test("the sign-up takes a request from the people invited and nobody else", async (t) => {
    await publishedDinner(t);
    const ask = (who) => call(who, rsvpRoute.POST, DINNER, { body: { name: "Somebody", email: "somebody@example.com", answers: {} } });
    assert.equal((await ask(null)).status, 401);
    const stranger = await ask(as("omar"));
    assert.equal(stranger.status, 403);
    assert.equal(stranger.body.error, "This event is only for the people invited to it.");
    assert.equal((await ask(as("sue"))).status, 403, "running events is not being invited");
    const invited = await ask(as("gwen"));
    assert.equal(invited.status, 200);
    const rows = w.world.db.paths().filter((path) => path.startsWith("eventRsvps/")).map((path) => w.world.db.read(path)).filter((row) => row.eventId === DINNER);
    assert.deepEqual(rows.map((row) => [row.uid, row.status]), [["gwen", "pending"]], "a request, decided as every other");
  });

  test("the calendar file is there only for somebody who may open it", async (t) => {
    await publishedDinner(t);
    const file = (who) => call(who, icsRoute.GET, DINNER);
    assert.equal((await file(null)).status, 404);
    assert.equal((await file(as("omar"))).status, 404);
    assert.equal((await file(as("gwen"))).status, 200);
  });

  test("Home shows it to the people invited, as For you, and to nobody else", async (t) => {
    await publishedDinner(t);
    const forGwen = await home.forYouEvents("gwen", AFTER);
    assert.deepEqual(forGwen, [
      {
        eventId: DINNER,
        title: "Pitching dinner",
        when: "Tue 15 Dec, 7pm",
        place: "Cobden Room",
        programme: "AGI Strategy",
        dropIn: false,
        asked: null,
      },
    ]);
    assert.deepEqual(await home.forYouEvents("omar", AFTER), []);
    // After asking, the card says where it stands.
    await call(as("gwen"), rsvpRoute.POST, DINNER, { body: { answers: {} } });
    assert.equal((await home.forYouEvents("gwen", AFTER))[0].asked, "pending");
    w.world.course = true;
    try {
      const listed = await home.homeEvents(AFTER);
      assert.equal(listed.upcoming.some((event) => event.eventId === DINNER), false);
    } finally {
      w.world.course = false;
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Later
// ---------------------------------------------------------------------------

describe("after it is published", () => {
  test("Invite the N new since reaches only the people new to its tags, and counts them first", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    await call(as("zach"), publishRoute.POST, DINNER);
    w.world.mail.length = 0;
    // Nothing new: the button has nothing to say.
    assert.deepEqual((await call(as("claudia"), invitationsRoute.GET, DINNER)).body, { ok: true, newSince: 0, emails: 0 });
    // An admin adds Yusuf to the choice.
    const changed = await call(as("zach"), audienceRoute.PUT, DINNER, { body: { ...CHOICE, include: [...CHOICE.include, T.person("yusuf")] } });
    assert.equal(changed.status, 200);
    assert.equal(w.world.mail.length, 0, "nothing is sent by itself");
    const count = await call(as("claudia"), invitationsRoute.GET, DINNER);
    assert.deepEqual(count.body, { ok: true, newSince: 1, emails: 1 });
    assert.equal(words.newSinceWords(count.body.newSince), "Invite the 1 new since");
    // Somebody who does not organise it is told there is no such event.
    assert.equal((await call(as("sue"), invitationsRoute.POST, DINNER)).status, 404);
    assert.equal((await call(as("gwen"), invitationsRoute.POST, DINNER)).status, 403);
    const invited = await call(as("claudia"), invitationsRoute.POST, DINNER);
    assert.deepEqual(invited.body, { ok: true, invited: 1, emailed: 1 });
    assert.deepEqual(w.world.mail.map((each) => each.to), ["yusuf@example.com"]);
    assert.equal(invitationsOf(DINNER).find((row) => row.uid === "yusuf").via, "new-since");
    // A second press invites nobody again.
    assert.deepEqual((await call(as("claudia"), invitationsRoute.POST, DINNER)).body, { ok: true, invited: 0, emailed: 0 });
    assert.equal(w.world.mail.length, 1);
  });

  test("a live event for chosen people stays one, and a listed one cannot become one", async (t) => {
    today(t);
    w.reset(seed());
    await chosenAndApproved();
    await call(as("zach"), publishRoute.POST, DINNER);
    const event = w.world.db.read(`events/${DINNER}`);
    const save = (visibility, eventId = DINNER) =>
      call(as("zach"), updateRoute.POST, eventId, {
        body: { ...event, startAt: "2026-12-15T19:00:00.000Z", endAt: "2026-12-15T21:00:00.000Z", visibility },
      });
    for (const visibility of ["public", "members"]) {
      const refused = await save(visibility);
      assert.equal(refused.status, 400, visibility);
      assert.match(refused.body.error, /stays one/);
    }
    assert.equal((await save("chosen")).status, 200);
    assert.equal(w.world.db.read(`events/${DINNER}`).visibility, "chosen");
    assert.equal((await save("secret")).status, 400, "an unknown value is refused, never read as one of the three");
    const listed = w.world.db.read(`events/${EV.later}`);
    const toChosen = await call(as("zach"), updateRoute.POST, EV.later, {
      body: { ...listed, startAt: listed.startAt.toISOString(), endAt: listed.endAt.toISOString(), visibility: "chosen" },
    });
    assert.equal(toChosen.status, 400);
  });
});

// ---------------------------------------------------------------------------
// 5. An event that is not announced
// ---------------------------------------------------------------------------

describe("Announce, for a listed event", () => {
  const subscriber = {
    email: "mo@example.com",
    channel: "events",
    audience: "guest",
    audienceId: "g-mo",
    confirmed: true,
    subscribed: true,
    source: "test",
    createdAt: new Date("2026-10-01T10:00:00Z"),
  };
  const withSocial = (over) =>
    seed({
      [`events/${SOCIAL}`]: eventDoc("Winter quiz", "2026-12-17T19:00:00Z", "2026-12-17T21:00:00Z", { status: "approved", ...over }),
      "subscriptions/sub_mo@example.com__events": subscriber,
    });

  test("switched off: published, nobody mailed, nothing claimed, and the confirm says so", async (t) => {
    today(t);
    w.reset(withSocial({ announce: false }));
    assert.deepEqual((await call(as("zach"), publishRoute.GET, SOCIAL)).body, { ok: true, emailed: 0, notified: 0, announces: false });
    const published = await call(as("zach"), publishRoute.POST, SOCIAL);
    assert.equal(published.status, 200);
    assert.equal(published.body.announced, false);
    const event = w.world.db.read(`events/${SOCIAL}`);
    assert.equal(event.status, "published");
    assert.equal(event.announcedAt, undefined);
    assert.equal(w.world.mail.length, 0);
  });

  test("not switched off, as every event made before the switch: announced as it always was", async (t) => {
    today(t);
    w.reset(withSocial({}));
    const published = await call(as("zach"), publishRoute.POST, SOCIAL);
    assert.equal(published.status, 200);
    assert.ok(w.world.db.read(`events/${SOCIAL}`).announcedAt, "claimed");
    assert.deepEqual(w.world.mail.map((each) => [each.to, each.kind]), [["mo@example.com", "event-announcement"]]);
  });
});

// ---------------------------------------------------------------------------
// 6. The privacy policy
// ---------------------------------------------------------------------------

describe("the privacy policy's Events for chosen people, held to the code", () => {
  const policy = readFileSync(join(REPO_ROOT, "src", "content", "legal", "privacy", "v15.tsx"), "utf8").replace(/\s+/g, " ");

  test("the paragraph says what this suite executes", () => {
    for (const sentence of [
      "Some events may be for people we choose.",
      "They are not listed or announced: they show on your Home, and we email you an invitation.",
      "If an event is part of a programme you are on, its invitation is a programme email and reaches you whatever your settings.",
    ]) {
      assert.ok(policy.includes(sentence.replace(/’/g, "&apos;")), sentence);
    }
  });

  test("the code's own words agree: on the programme means holding a place, and the email is the invitation's", () => {
    const marker = readFileSync(join(REPO_ROOT, "src", "emails", "NoticeMarker.tsx"), "utf8");
    assert.match(marker, /"event-invitation": "you are on the programme this event is part of"/);
    const resolve = readFileSync(join(REPO_ROOT, "src", "lib", "audience", "resolve.ts"), "utf8");
    assert.match(resolve, /world\.holds\.get\(key\)\?\.has\(plan\.noticeUnder\)/, "a notice under a programme reaches only the people holding a place on it");
    const invitations = readFileSync(join(REPO_ROOT, "src", "lib", "events", "invitations.ts"), "utf8");
    assert.doesNotMatch(invitations, /sendNoticePush|sendPushToUid|sendPushToRowAudience/, "an invitation is an email and only an email");
  });
});
