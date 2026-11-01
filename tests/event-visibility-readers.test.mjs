/**
 * WHO AN EVENT IS FOR IS READ IN ONE PLACE.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The failure
 *
 * An event is for anyone (`visibility: "public"`), for people with a NAISI
 * account (`"members"`), or only for the people its organiser chose
 * (`"chosen"`). Until the third existed, about twenty-three places in fifteen
 * files compared the stored string for themselves, and several read anything
 * that was not "members" as public: the publish route would have announced an
 * event for chosen people to every subscriber, the post-publish save would
 * have written it back as "public", and Home, the landing page and /links
 * would have listed it. Each was correct the day it was written and each
 * would have been wrong the day a third value arrived.
 *
 * ## What this holds
 *
 *  1. THE ONE READING, EXECUTED. `src/lib/events/reach.ts` reads the stored
 *     value: missing reads as "members", as it always did, and any value that
 *     is none of the three reads as "chosen", so an event nobody can tell the
 *     audience of is listed nowhere and announced to nobody. Every question a
 *     reader asks (listed, needs an account, may be announced, may this person
 *     open it, may a live event change its audience) is run here against
 *     every value.
 *  2. NOBODY ELSE COMPARES IT. Every `.ts` and `.tsx` under `src` is read for
 *     a comparison of something called `visibility` (`===`, `!==`, `==`, `!=`
 *     either way round, a `switch`, an `includes`), comments out. Outside
 *     `reach.ts` the only ones allowed are the files in `OTHER_VISIBILITIES`,
 *     which compare a TASK's or a WORKSHEET question's visibility, each with
 *     its reason, and each is held to comparing none of the event's three
 *     values. Both directions: an entry that no longer compares anything
 *     fails as stale. A presence test (`!== undefined`) is not a comparison of
 *     a value.
 *  3. THE READERS ARE KNOWN. Every file that imports the helper is in
 *     `READERS` with what it asks, and every entry still imports it, so a
 *     reader that drops the helper for a comparison of its own fails twice.
 *  4. THE RULES MAKE THE SAME TWO DECISIONS. `firestore.rules` lets a
 *     signed-in browser read a published event only when its value is one of
 *     the two listed ones, missing reading as "members", and nothing else.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const HELPER = "src/lib/events/reach.ts";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const reach = await loadTs("lib/events/reach.ts");
const { normalizeEvent } = await loadTs("lib/firestore/events.ts");

// ---------------------------------------------------------------------------
// 1. The one reading
// ---------------------------------------------------------------------------

describe("the one reading of who an event is for", () => {
  test("the three values read as themselves; missing reads as members; anything else as chosen", () => {
    assert.equal(reach.visibilityOf("public"), "public");
    assert.equal(reach.visibilityOf("members"), "members");
    assert.equal(reach.visibilityOf("chosen"), "chosen");
    assert.equal(reach.visibilityOf(undefined), "members");
    assert.equal(reach.visibilityOf(null), "members");
    for (const unknown of ["", "Public", "private", "invite", 0, 1, true, false, {}, [], ["public"]]) {
      assert.equal(reach.visibilityOf(unknown), "chosen", JSON.stringify(unknown));
    }
  });

  test("the normaliser reads through it, so a stored event fails closed too", () => {
    assert.equal(normalizeEvent("e", { visibility: "public" }).visibility, "public");
    assert.equal(normalizeEvent("e", {}).visibility, "members");
    assert.equal(normalizeEvent("e", { visibility: "secret" }).visibility, "chosen");
  });

  test("a request's value is one of the three or nothing", () => {
    for (const value of ["public", "members", "chosen"]) assert.equal(reach.parseVisibility(value), value);
    for (const value of [undefined, null, "", "secret", 3]) assert.equal(reach.parseVisibility(value), null);
  });

  test("each question, for every value", () => {
    const rows = [
      // [stored, reach, listed, needsAccount, guestsMayHear]
      ["public", "listed", true, false, true],
      ["members", "listed-account", true, true, false],
      [undefined, "listed-account", true, true, false],
      ["chosen", "chosen", false, true, false],
      ["anything", "chosen", false, true, false],
    ];
    for (const [visibility, expected, listed, account, guests] of rows) {
      const event = { visibility };
      assert.equal(reach.eventReach(event), expected, String(visibility));
      assert.equal(reach.isListed(event), listed, String(visibility));
      assert.equal(reach.isForChosenPeople(event), !listed, String(visibility));
      assert.equal(reach.needsAccount(event), account, String(visibility));
      assert.equal(reach.guestsMayHear(event), guests, String(visibility));
    }
  });

  test("announced: a listed event unless a stored false says not; an event for chosen people never", () => {
    assert.equal(reach.announces({ visibility: "public" }), true);
    assert.equal(reach.announces({ visibility: "members" }), true);
    assert.equal(reach.announces({}), true, "every event stored before the switch announces as it did");
    assert.equal(reach.announces({ visibility: "public", announce: true }), true);
    assert.equal(reach.announces({ visibility: "public", announce: false }), false);
    assert.equal(reach.announces({ visibility: "public", announce: "false" }), true, "only a stored false is off");
    assert.equal(reach.announces({ visibility: "chosen" }), false);
    assert.equal(reach.announces({ visibility: "chosen", announce: true }), false);
    assert.equal(reach.announces({ visibility: "nonsense", announce: true }), false);
    assert.equal(normalizeEvent("e", {}).announce, true);
    assert.equal(normalizeEvent("e", { announce: false }).announce, false);
  });

  test("who may open an event for chosen people: invited, named on it, or running events; every listed event opens", () => {
    const viewers = {
      none: null,
      pending: { uid: "p", role: "pending" },
      rejected: { uid: "r", role: "rejected", permissions: { approveEvent: true } },
      member: { uid: "m", role: "member" },
      drafter: { uid: "d", role: "member", permissions: { draftEvent: true } },
      approver: { uid: "a", role: "member", permissions: { approveEvent: true } },
      committee: { uid: "c", role: "committee", suRecognised: false },
      admin: { uid: "z", role: "admin" },
    };
    const nobody = { invited: false, organiser: false };
    for (const [name, viewer] of Object.entries(viewers)) {
      for (const visibility of ["public", "members", undefined]) {
        assert.equal(reach.mayOpen({ visibility }, viewer, nobody), true, `${name} opens a listed event`);
      }
    }
    const opens = (viewer, named) => reach.mayOpen({ visibility: "chosen" }, viewer, named);
    assert.equal(opens(null, { invited: true, organiser: true }), false, "nobody signed in opens it");
    assert.equal(opens(viewers.pending, { invited: true, organiser: false }), false);
    assert.equal(opens(viewers.rejected, { invited: true, organiser: false }), false);
    assert.equal(opens(viewers.member, nobody), false);
    assert.equal(opens(viewers.member, { invited: true, organiser: false }), true);
    assert.equal(opens(viewers.member, { invited: false, organiser: true }), true);
    for (const name of ["drafter", "approver", "committee", "admin"]) {
      assert.equal(opens(viewers[name], nobody), true, `${name} runs events`);
    }
  });

  test("a live event keeps its side of the line between listed and for chosen people", () => {
    assert.deepEqual(reach.liveVisibilityChange("public", "members"), { ok: true, visibility: "members" });
    assert.deepEqual(reach.liveVisibilityChange("members", "public"), { ok: true, visibility: "public" });
    assert.deepEqual(reach.liveVisibilityChange("chosen", "chosen"), { ok: true, visibility: "chosen" });
    assert.deepEqual(reach.liveVisibilityChange("chosen", undefined), { ok: true, visibility: "chosen" });
    assert.deepEqual(reach.liveVisibilityChange(undefined, undefined), { ok: true, visibility: "members" });
    for (const [stored, asked] of [["chosen", "public"], ["chosen", "members"], ["public", "chosen"], [undefined, "chosen"]]) {
      assert.equal(reach.liveVisibilityChange(stored, asked).ok, false, `${stored} to ${asked}`);
    }
    assert.equal(reach.liveVisibilityChange("public", "secret").ok, false);
    assert.equal(reach.liveVisibilityChange("public", null).ok, false);
  });

  test("its words: one name for an event that needs an account, no dash, no pronoun", () => {
    const words = JSON.stringify(reach.REACH_WORDS);
    assert.equal(reach.REACH_WORDS.badge["listed-account"], "Account needed");
    assert.equal(reach.REACH_WORDS.choice["listed-account"], "People with a NAISI account");
    assert.equal(reach.REACH_WORDS.onlyInvited, "This event is only for the people invited to it.");
    assert.doesNotMatch(words, /[–—]/, "no en or em dash");
    assert.doesNotMatch(words, /\b(he|she|him|her|his|hers)\b/i, "no gendered pronoun");
    assert.doesNotMatch(words, /Members only|Members-only|naisi\.uk account/, "the old names are gone");
  });
});

// ---------------------------------------------------------------------------
// 2. Nobody else compares it
// ---------------------------------------------------------------------------

/**
 * Files that compare something else called `visibility`, with what it is.
 * Held to comparing none of an event's three values.
 */
const OTHER_VISIBILITIES = {
  "src/app/api/tasks/[id]/notify/route.ts": "a task's visibility: committee or assignees-only",
  "src/app/api/tasks/[id]/delete/route.ts": "a task's visibility: committee or assignees-only",
  "src/app/api/tasks/[id]/send-for-review/route.ts": "a task's visibility: committee or assignees-only",
  "src/app/api/tasks/[id]/send-review-outcome/route.ts": "a task's visibility: committee or assignees-only",
  "src/app/api/tasks/[id]/delete-subtask/route.ts": "a task's visibility: committee or assignees-only",
  "src/app/api/tasks/[id]/delete-block/route.ts": "a task's visibility: committee or assignees-only",
  "src/features/tasks/components/TaskDetailModal.tsx": "a task's visibility: committee or assignees-only",
  "src/features/tasks/components/TaskBoard.tsx": "a task's visibility: committee or assignees-only",
  "src/app/api/worksheets/circulations/[circulationId]/aggregate/route.ts":
    "a worksheet question's results visibility: before-submit, after-submit or staff",
  "src/features/worksheets/respond/WorksheetQuestionField.tsx":
    "a worksheet question's results visibility: before-submit, after-submit or staff",
  "src/lib/firestore/worksheets.ts": "a worksheet question's results visibility: before-submit, after-submit or staff",
};

const EVENT_VALUES = /["'](public|members|chosen)["']/;

/** Every comparison of something called `visibility` in stripped code (strings kept), one string each. */
function comparisonsIn(code) {
  const found = [];
  const patterns = [
    // `x.visibility === "y"`, `data["visibility"] !== y`, `visibility == y`: not a presence test.
    /\bvisibility\b["'\]]*\s*[!=]==?(?!=)(?!\s*(?:undefined|null)\b)[^;\n)&|]*/g,
    // `"y" === x.visibility`, the other way round.
    /(?<![=!])[!=]==?(?!=)\s*[\w$.?\[\]"']*\bvisibility\b(?!\s*[(:])(?!\s*[!=]==?\s*(?:undefined|null)\b)/g,
    /\bswitch\s*\([^)]*\bvisibility\b[^)]*\)/g,
    /\.(?:includes|indexOf|has)\(\s*[\w$.?\[\]"']*\bvisibility\b/g,
  ];
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) found.push(match[0].trim());
  return found;
}

function tsFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFilesUnder(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (file) => relative(REPO_ROOT, file).split(sep).join("/");
const FILES = tsFilesUnder(SRC).map((file) => {
  const source = readFileSync(file, "utf8");
  const code = stripSource(source, { keepStrings: true });
  assertReadable(source, code, rel(file), assert);
  return { path: rel(file), source, code };
});

describe("nobody but the helper compares who an event is for", () => {
  test("the walk reads the tree, and its patterns read what they are meant to", () => {
    assert.ok(FILES.length > 500, `only ${FILES.length} files read`);
    const helper = FILES.find((file) => file.path === HELPER);
    assert.ok(helper && comparisonsIn(helper.code).length >= 2, "the helper's own comparisons are not seen");
    for (const snippet of [
      'if (event.visibility === "members") {}',
      'const x = "public" === event.visibility;',
      'const y = data["visibility"] !== "public";',
      "switch (event.visibility) {}",
      "LISTED.includes(e.visibility)",
    ]) {
      assert.ok(comparisonsIn(snippet).length > 0, `missed: ${snippet}`);
    }
    for (const snippet of [
      "if (fields.visibility !== undefined) patch.visibility = fields.visibility;",
      "visibility: EventDoc[\"visibility\"];",
      "const reach = eventReach({ visibility });",
      "visibility?: TaskVisibility;",
      "<RsvpForm visibility={event.visibility} />",
    ]) {
      assert.deepEqual(comparisonsIn(snippet), [], `read as a comparison: ${snippet}`);
    }
  });

  test("no file outside the helper compares an event's visibility", () => {
    const offenders = [];
    for (const file of FILES) {
      if (file.path === HELPER || file.path in OTHER_VISIBILITIES) continue;
      const found = comparisonsIn(file.code);
      if (found.length > 0) offenders.push(`${file.path}: ${found.join(" | ")}`);
    }
    assert.deepEqual(
      offenders,
      [],
      "These files compare a visibility themselves. If it is an event's, ask src/lib/events/reach.ts " +
        "(eventReach, isListed, isForChosenPeople, needsAccount, announces, mayOpen) instead: a third " +
        "value read by hand is read wrongly. If it is something else's, add the file to " +
        "OTHER_VISIBILITIES with what it is.",
    );
  });

  test("every other visibility is somebody else's, and still compared", () => {
    for (const [path, why] of Object.entries(OTHER_VISIBILITIES)) {
      assert.ok(why.length > 20, `${path}: say what it compares`);
      const file = FILES.find((each) => each.path === path);
      assert.ok(file, `${path} has moved or gone: update OTHER_VISIBILITIES`);
      const found = comparisonsIn(file.code);
      assert.ok(found.length > 0, `${path} no longer compares a visibility: take it off OTHER_VISIBILITIES`);
      for (const each of found) {
        assert.doesNotMatch(each, EVENT_VALUES, `${path} compares an event's value: ${each}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The readers are known
// ---------------------------------------------------------------------------

/** Every file that asks the helper, and what it asks. */
const READERS = {
  "src/lib/firestore/events.ts": "the normaliser reads the stored value through visibilityOf",
  "src/lib/events/opening.ts": "mayOpen, with the invitation read only when it can change the answer",
  "src/lib/events/invitationAccess.ts": "who runs events, for who may see and change an event's list",
  "src/lib/events/invitations.ts": "only an event for chosen people has a list",
  "src/features/events/fetchEvents.ts": "the published list leaves out events for chosen people; one event opens only for its people",
  "src/app/api/events/[id]/publish/route.ts": "announces only what announces; invites an event for chosen people",
  "src/app/api/events/[id]/update/route.ts": "a live event keeps its side of the line",
  "src/app/api/events/[id]/rsvp/route.ts": "an account for an event that needs one, and an invitation for one for chosen people",
  "src/app/api/events/[id]/audience/route.ts": "counts only for an event for chosen people",
  "src/app/api/events/[id]/invitations/route.ts": "only a published event for chosen people takes more invitations",
  "src/lib/scheduler/jobs/eventAnnouncements.ts": "refuses a queued event that does not announce; drops guests from one that needs an account",
  "src/app/(app)/dashboard/homeData.ts": "the Account needed chip, and For you",
  "src/app/(app)/dashboard/ComingUp.tsx": "the Account needed chip's words",
  "src/app/(app)/events/manage/[id]/attendees/page.tsx": "Invite the N new since, on a published event for chosen people",
  "src/app/(app)/events/manage/page.tsx": "the note under the sign-ups: Account needed, or Invitation only",
  "src/app/(public)/UpcomingEvents.tsx": "the landing page lists only events open to anyone",
  "src/app/(public)/events/page.tsx": "the Account needed badge on the list",
  "src/app/links/page.tsx": "/links lists only events open to anyone",
  "src/app/events/[id]/calendar/page.tsx": "who the event is for, under its title",
  "src/app/events/[id]/check-in/page.tsx": "the door code names nothing of an event for chosen people to somebody else",
  "src/app/events/[id]/survey/page.tsx": "the survey's code names nothing of an event for chosen people to somebody else",
  "src/features/events/EventDetailView.tsx": "the badge and who can come",
  "src/features/events/RsvpForm.tsx": "whether a guest may sign up, and the form's line",
  "src/features/events/EventEditor.tsx": "the preview's chip, the summary, the form note and the Publish confirm",
  "src/features/events/WhoItsFor.tsx": "the three choices, and which may follow a published one",
  "src/features/events/OnlyForInvited.tsx": "the calm page's words",
};

const IMPORTS_HELPER = /from\s+["'](?:@\/lib\/events\/reach|\.\/reach|\.\.\/events\/reach)["']/;

describe("every reader asks the helper, and is known", () => {
  test("each file that imports the helper is listed, and each listed file imports it", () => {
    const importers = FILES.filter((file) => file.path !== HELPER && IMPORTS_HELPER.test(file.source)).map((file) => file.path).sort();
    assert.deepEqual(importers, Object.keys(READERS).sort());
    for (const [path, why] of Object.entries(READERS)) assert.ok(why.length > 20, `${path}: say what it asks`);
  });
});

// ---------------------------------------------------------------------------
// 4. The rules
// ---------------------------------------------------------------------------

describe("the rules make the same two decisions for a browser", () => {
  const rules = readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8");
  const events = rules.slice(rules.indexOf("match /events/{eventId} {"), rules.indexOf("match /eventRsvps/{rsvpId}"));
  // The events block alone: up to the next match at its own depth.
  const eventsBlock = events.slice(0, events.indexOf("\n    match /", 1));

  test("a signed-in browser reads a published event only when it is listed, missing reading as members", () => {
    assert.match(
      events,
      /allow get: if[^;]*\(isSignedIn\(\) && resource\.data\.status == 'published'\s*&& resource\.data\.get\('visibility', 'members'\) in \['public', 'members'\]\);/,
    );
  });

  test("a browser lists published events only with who they are for constrained, never through a default", () => {
    // A list is checked against the query: `get` with a default would let a
    // query for published events alone through, events for chosen people
    // and all. The list branch reads the field itself, so the query has to
    // constrain it. No `allow read` covers both, which would bring the
    // default back.
    assert.ok(eventsBlock.includes("allow list:") && eventsBlock.length > 500, "the events block was not found");
    assert.match(
      eventsBlock,
      /allow list: if[^;]*\(isSignedIn\(\) && resource\.data\.status == 'published'\s*&& resource\.data\.visibility in \['public', 'members'\]\);/,
    );
    assert.doesNotMatch(eventsBlock, /allow read:/);
    const list = eventsBlock.slice(eventsBlock.indexOf("allow list:"), eventsBlock.indexOf(";", eventsBlock.indexOf("allow list:")));
    assert.doesNotMatch(list, /get\('visibility'/);
  });

  test("a browser writes one of the three values and no programme", () => {
    assert.match(events, /request\.resource\.data\.visibility in \['public', 'members', 'chosen'\]/);
    assert.match(events, /request\.resource\.data\.announce is bool/);
    assert.match(events, /allow create: if[\s\S]*?!\('programme' in request\.resource\.data\)/);
    assert.match(events, /allow update: if[^;]*programmeUnchanged\(\)/);
  });

  test("the choice and the list are closed to every browser", () => {
    assert.match(rules, /match \/eventAudiences\/\{eventId\} \{\s*allow read, write: if false;\s*\}/);
    assert.match(rules, /match \/eventInvitations\/\{invitationId\} \{\s*allow read, write: if false;\s*\}/);
  });
});
