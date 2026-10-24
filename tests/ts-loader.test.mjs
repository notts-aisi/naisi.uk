/**
 * The shared TypeScript loader: `tests/lib/tsLoader.mjs`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What is worth executing here
 *
 * The loader exists because fifty hand-copied versions of it could not read a
 * `.tsx`, and the failure that produced was the worst shape a test failure
 * comes in: the FIRST email template a suite's graph reached killed the whole
 * FILE with a bare `SyntaxError` at import time, before one test ran. It looked
 * like a broken suite rather than a missing compiler option, and the way out
 * everybody found was to stub the template. That is a stub whose only reason to
 * exist is that the tool cannot read the file, which means the template is
 * never executed by anything and a change to it is never noticed.
 *
 * So the class is closed here rather than asserted in prose:
 *
 *  1. a real `.tsx` template compiles and RENDERS through the loader;
 *  2. the same template renders when it is reached the way production reaches
 *     it, through a `.ts` server helper that imports it. That is the exact
 *     failure that bit twice while the worksheet routes were being built;
 *  3. the two resolution rules that make (1) and (2) work are pinned on a
 *     fixture pair of their own: a `.ts` importing a relative `.tsx` with no
 *     extension finds it, and a local import that is NOT TypeScript (a
 *     stylesheet, which every client module's graph reaches within a step or
 *     two) is refused by name instead of being fed to the compiler as if it
 *     were code;
 *  4. a stub still wins over a real module, because every suite's fakes (the
 *     transport, the Admin SDK, the session) depend on that and a loader that
 *     resolved eagerly would put mail on the wire;
 *  5. no file that imports the shared loader also carries a copy of the old
 *     one, AND no file outside the frozen list below carries a copy at all.
 *     Two loaders in one file is the confusion this change removes; a
 *     forty-fourth copy is the class itself coming back, in the one shape a
 *     check that only looks at adopters would never see. A tree walk is what
 *     keeps both out once nobody remembers why.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

/** Nothing in this file reaches a project, a bucket or an inbox. */
const DOORS = [
  ["server-only", "export {};"],
  [
    "@/lib/email/send",
    "export async function sendEmail(args) {\n  (globalThis.__sent ||= []).push(args);\n}",
  ],
  ["@/lib/push/taskNotifications", "export async function mirrorTaskEmailToPush() {}"],
  ["@/lib/firestore/taskEmailConfig", "export async function isTaskEmailEnabled() {\n  return true;\n}"],
  [
    "@/lib/email/taskMembership",
    "export async function resolveTaskUsers(db, uids) {\n" +
      "  return new Map(uids.map((uid) => [uid, { email: `${uid}@example.com`, displayName: 'Ada' }]));\n" +
      "}",
  ],
];

const TEMPLATE_PROPS = {
  recipientName: "Ada",
  worksheetTitle: "Week 3: scaling laws",
  reviewerName: "Sam",
  link: "https://naisi.uk/worksheets/respond/circ1",
};

// ---------------------------------------------------------------------------
// The loader itself
// ---------------------------------------------------------------------------

describe("the shared loader reads JSX", () => {
  test("a real `.tsx` template compiles and renders to HTML", async () => {
    const { loadTs } = createLoader({ stubs: DOORS });
    const { default: WorksheetFeedbackEmail } = await loadTs(
      "emails/WorksheetFeedbackEmail.tsx",
    );

    const html = await render(WorksheetFeedbackEmail(TEMPLATE_PROPS));

    assert.match(
      html,
      /Read the feedback/,
      "the button that takes somebody to the respond page is the whole point of this message",
    );
    assert.match(html, /Week 3: scaling laws/);
    assert.match(
      html,
      /<html/i,
      "the chrome came from the real `EmailChrome.tsx`, reached as a relative `.tsx` import",
    );
    assert.doesNotMatch(
      html,
      /Sam has written/,
      "the feedback words themselves stay on the respond page; the email only says there are some",
    );
  });

  test("the same template renders when a `.ts` server helper reaches it", async () => {
    // The failure this loader was built for, executed. `notify.ts` is a plain
    // `.ts` module that imports four `.tsx` templates by alias, and each of
    // those imports `./EmailChrome` relatively: a `.ts` entry, an aliased
    // `.tsx`, and a relative `.tsx` beneath it. Every hand-copied loader died
    // on the first of those with a `SyntaxError`, and the four suites that hit
    // it stubbed the templates to get moving, which left the rendering of a
    // real message untested by anything.
    //
    // (The `.ts` importing a relative `.tsx` is the same shape, pinned on its
    // own against a fixture in the test below: `src` has no server-side
    // example to load here, because the seven `.ts` files that import a
    // relative `.tsx` are all client modules whose graphs reach CSS modules.)
    const { loadTs } = createLoader({ stubs: DOORS });
    const { notifyWorksheetEvent } = await loadTs("lib/worksheets/notify.ts");

    globalThis.__sent = [];
    const result = await notifyWorksheetEvent(
      {},
      {
        circulation: {
          title: "Week 3: scaling laws",
          notifications: { feedbackReturned: { email: true, push: false } },
        },
        circulationId: "circ1",
        event: "feedbackReturned",
        recipientUids: ["member1"],
        actor: { uid: "staff1", displayName: "Sam" },
      },
    );

    assert.deepEqual(result, { sent: 1, failed: 0, optedOut: 0 });
    assert.equal(globalThis.__sent.length, 1);

    const html = await render(globalThis.__sent[0].react);
    assert.match(
      html,
      /Read the feedback/,
      "the element the send path handed the transport is the real template, rendered",
    );
    assert.equal(globalThis.__sent[0].to, "member1@example.com");
  });

  test("a stub still wins over a real module", async () => {
    // The specifier is matched as WRITTEN, before anything is resolved, so a
    // relative key stubs that import from whichever file wrote it. Every suite
    // depends on this for its doors: `@/lib/email/send` resolves to a real
    // module that would reach a transport, and a loader that preferred the file
    // on disk would put mail on the wire from `npm test`.
    const { loadTs } = createLoader({
      stubs: [
        ...DOORS,
        [
          "./EmailChrome",
          "export default function EmailChrome(props) {\n  return props.children;\n}\n" +
            "export const emailLinkStyle = {};",
        ],
      ],
    });
    const { default: WorksheetFeedbackEmail } = await loadTs(
      "emails/WorksheetFeedbackEmail.tsx",
    );

    const html = await render(WorksheetFeedbackEmail(TEMPLATE_PROPS));

    assert.match(html, /Read the feedback/, "the template itself is still the real one");
    assert.doesNotMatch(
      html,
      /<html/i,
      "the chrome came from the stub, so the real `EmailChrome.tsx` was never loaded",
    );
  });

  test("a `.ts` module reaches a relative `.tsx` neighbour", async () => {
    // The literal case, on a two-file fixture: `entry.ts` imports `./Panel`
    // with no extension, so the loader tries `.ts`, misses, and has to accept
    // the `.tsx`. Both halves matter and both used to fail: without the
    // candidate the import is unresolvable, and without the JSX option the
    // neighbour dies as a `SyntaxError`.
    const { loadTs } = createLoader();
    const { panelFor } = await loadTs(join(TESTS_DIR, "fixtures", "ts-loader", "entry.ts"));

    const element = panelFor("Ada");
    assert.equal(
      element.type,
      "span",
      "the `.tsx` compiled to an element rather than being read as a type assertion",
    );
    assert.equal([element.props.children].flat().join(""), "Hello Ada");
  });

  test("a local import that is not TypeScript is refused by name", async () => {
    // A stylesheet is ON DISK, so a loader that accepted the bare path would
    // hand `transpileModule` some CSS and the reader would get a parse error
    // from inside a `data:` URL with nothing naming the import. Refusing it
    // here is what turns that into one readable line.
    const { loadTs } = createLoader();
    await assert.rejects(
      () => loadTs(join(TESTS_DIR, "fixtures", "ts-loader", "notTypeScript.ts")),
      /"\.\/panel\.module\.css"[\s\S]*is not TypeScript/,
    );
  });

  test("a module that is not there is named, rather than failing as something else", async () => {
    const { loadTs } = createLoader({ stubs: DOORS });
    await assert.rejects(
      () => loadTs("lib/worksheets/thereIsNoSuchModule.ts"),
      /no module at src\/lib\/worksheets\/thereIsNoSuchModule\.ts/,
    );
  });
});

// ---------------------------------------------------------------------------
// The guard: one loader per file, and the register of who uses this one
// ---------------------------------------------------------------------------

/**
 * Every suite that imports the shared loader, and why.
 *
 * The seven below are the files this change migrated. Six of them have a `.tsx`
 * in their module graph and had already paid for the missing JSX option, either
 * with template stubs standing in for code nothing executed or with a door
 * stubbed a step earlier than the suite wanted. Those stubs are gone; the doors
 * each suite still fakes (the transport, the Admin SDK handle, the session, the
 * impersonation guard, `firebase-admin` sentinels) stayed, because those are
 * about reaching the outside world rather than about reading a file. The
 * seventh, `worksheet-aggregate`, is the third suite over a tree whose other
 * routes reach the templates, and it moved with its siblings.
 *
 * The list is checked BOTH WAYS: an entry naming a file that no longer imports
 * the loader fails, and a suite importing the loader with no entry fails. A
 * list that can only grow is a list nobody trusts, and the reason column is
 * what makes the next person's decision to adopt it legible.
 *
 * The forty-three suites that still carry their own copy are not required to
 * migrate. That they pass at all is the proof their graphs stop short of a
 * `.tsx`, so a wholesale rewrite would be a large diff with no failure behind
 * it. They move when they next need to change, and until then they are held
 * still by `LEGACY_LOADERS` below.
 */
const USERS = new Map([
  [
    "admissions-form-fence.test.mjs",
    "executes every older round route against a stored application form and against a round " +
      "of the older kind, with the session, the Admin SDK handle and every sending door faked, " +
      "because whether a form is refused before anything is written is decided by the handler " +
      "that runs; it also renders the two notices the older pages return for a form, which " +
      "are .tsx components and need the JSX option this loader sets",
  ],
  [
    "application-decision-lifetime.test.mjs",
    "executes the whole account cascade against a store that records each committed batch as " +
      "a unit, to prove a decision document leaves in the same batch as the application it is " +
      "about; its graph is `accountDeletion.ts` and every collection helper it imports, and " +
      "the Admin SDK sentinels are its only stub, because atomicity proved against a copy of " +
      "the sweep would say nothing about the sweep that ships",
  ],
  [
    "applications-access.test.mjs",
    "executes src/lib/applications/access.ts and roles.ts with the real eligibility bar " +
      "underneath, against a cast that includes a lead who lost their standing, and the roles " +
      "writer against an in-memory Firestore, because who may read applications is decided " +
      "by the code that runs and not by its comments",
  ],
  [
    "applications-apply-draft.test.mjs",
    "executes the draft clean-up (src/lib/applications/applicant/draft.ts, account.ts, keys.ts) " +
      "against a small form, including ids that are only the names of things every object " +
      "inherits, because what a save may store is decided by the code that runs",
  ],
  [
    "applications-apply-form.test.mjs",
    "executes the applicant form's pure helpers (step names, availability wording, the typed " +
      "route into the grid, the lines on the last step) against the sample term, because they " +
      "have to produce the boards' own words",
  ],
  [
    "applications-apply-projection.test.mjs",
    "executes the three applicant projections over a form, a question set and an application " +
      "whose every staff-only field carries a marker, because only running them shows no " +
      "marker survives",
  ],
  [
    "applications-apply-routes.test.mjs",
    "executes the applicant's GET, PUT and send handlers with the real gate, rate limiter and " +
      "application modules against an in-memory Firestore, because the two copies and the " +
      "counters are transactions and only running them shows what was written",
  ],
  [
    "applications-blind-first.test.mjs",
    "executes the review screen's read, the review save, a programme's list and its settings " +
      "route as leads and reviewers who are not admins, against an in-memory term with every " +
      "kind of programme that has nothing to score, because whose scores and comments somebody " +
      "is sent before they have saved a review of their own is decided by the code that runs",
  ],
  [
    "applications-d2-delta-join.test.mjs",
    "executes the rules of joining on the application form (src/lib/applications/applicant/join.ts: " +
      "what stops a join request, what is sent as one, what is kept while somebody signs in, " +
      "what holds a send) against the contract's own About you rules and the site's notification " +
      "defaults, because each is a promise only running the function shows is kept",
  ],
  [
    "applications-d2-gamma-find-the-form.test.mjs",
    "executes the form lookup, the older round lookup, the catalogue's fetcher and the flattener a public " +
      "course page calls, against a database that records its reads, and renders the page's call to " +
      "action and the dashboard's applications card (both .tsx) to HTML, because what the Apply button " +
      "says and where it leads in each state of the form is decided by the code that runs",
  ],
  [
    "applications-decision-day-emails.test.mjs",
    "executes the pure email copy and the settings page's projection against the same form, " +
      "and renders the three decision-day templates through the real `@react-email/components`, " +
      "because what an applicant reads is the property under test and the templates are `.tsx`",
  ],
  [
    "applications-decision-day-plan.test.mjs",
    "executes the pure decision-day modules (the line-up, what may be picked for a pooled " +
      "person, why the send is held, the sentences built from numbers) against a small term " +
      "and against the 122 applicants the design was drawn for",
  ],
  [
    "applications-decision-day-pool.test.mjs",
    "executes the pooled outcome writer, the board builder and the pool route against an " +
      "in-memory Firestore, with the real access predicates underneath, because what matters " +
      "is what is written where and what is read before the gate",
  ],
  [
    "applications-decision-day-send.test.mjs",
    "executes the decision-day send, the account approval inside it and four route handlers " +
      "against an in-memory Firestore and a mail door that records; its graph reaches the three " +
      "`.tsx` templates, and what was handed to the door is rendered and read",
  ],
  [
    "applications-editor-routes.test.mjs",
    "executes the six route files under src/app/api/admissions/forms against an in-memory " +
      "Firestore as every kind of caller, with the real access predicates, the real roles " +
      "writer and the real eligibility bar underneath, because who may edit a form and when " +
      "its questions lock are decided by the code that runs",
  ],
  [
    "applications-editor-rules.test.mjs",
    "executes the pure modules under src/lib/applications/editor (the lock, id minting, who " +
      "sees a set, every request body, the three projections) against the autumn form the " +
      "design was drawn for, because the sentences and the field lists are only right if " +
      "running them says so",
  ],
  [
    "applications-handover-member-area.test.mjs",
    "executes the member area's own route and the gate every page under /learn/[runId] asks, " +
      "for somebody an admin's hand-over put on a course run, and renders the run card (.tsx) " +
      "to HTML, because that the hand-over is announced as nothing, and that the first thing " +
      "the person is shown is their group, are only true if the route and the card say so",
  ],
  [
    "applications-handover-older-way-in.test.mjs",
    "executes the older per-run apply route and renders its page (a .tsx server component) to " +
      "HTML for a run a programme on the application form names, because whether that run " +
      "takes an application is decided by reading the forms when the request arrives, and the " +
      "route reaches the course email templates through the mail door it stubs",
  ],
  [
    "applications-handover-panel.test.mjs",
    "renders a programme's Settings tab (a .tsx server component) for an admin, for the " +
      "programme's lead and for a reviewer, against a database that records its reads, " +
      "because whether the \"Course run\" panel is drawn, and whether anything was read to " +
      "draw it, is decided by the page as it runs",
  ],
  [
    "applications-journey-in-term.test.mjs",
    "executes the contract's term arithmetic beside every builder and loader that counts with " +
      "it (the review list, the decision-day plan, the two editor loaders) on one stored term, " +
      "to prove a place given back is free on all of them at once; `../staffRepo` is stubbed " +
      "so the two loaders are handed this file's applications with no database",
  ],
  [
    "applications-journey.test.mjs",
    "executes every route handler under src/app/api/admissions/forms and the member-record " +
      "writer against one in-memory store, as one term from an empty form to a settled one, " +
      "because a disagreement between two parts of the application system exists only when " +
      "both run on the same documents; the mail door is stubbed to record and the email " +
      "templates behind it are compiled for real. Its last chapter also executes the course " +
      "routes a hand-over feeds (the older apply route, the allocation board, a placement and " +
      "the member area), on the same documents",
  ],
  [
    "applications-own-application.test.mjs",
    "executes the pooled applicants, decision day, test email and decision handlers for an " +
      "admin who has applied, beside what a second admin is sent, against an in-memory term, " +
      "because whether a page lists or counts the viewer's own application, and whether the " +
      "send still tells them, are decided by the code that runs",
  ],
  [
    "applications-public-term.test.mjs",
    "executes the lookup a public page asks what a visitor may be told about this term, against a " +
      "database that records its queries, and renders the three components a page draws the term " +
      "with (all .tsx) to HTML, because the stage, what leaves for a visitor's page and the words " +
      "and dates printed for each stage are decided by the code that runs",
  ],
  [
    "reskin-programme-pages.test.mjs",
    "executes the words of the programme pages' closing band and renders a course's call to action " +
      "(a .tsx client component) to HTML from the same dates, because whether the two say the same " +
      "thing is decided by the code that runs; it also runs the helpers that word a chip and split " +
      "an authored paragraph",
  ],
  [
    "applications-rank-question.test.mjs",
    "executes the checks, the draft clean-up and the editor's reader over every type a question " +
      "can have, drives the applicant's, the editor's and the review screen's handlers with a " +
      "ranking question against one in-memory term, and renders the form's ranking control and " +
      "the review screen's answer, which are .tsx and need the JSX option this loader sets, " +
      "because what a ranking is, and that it is never scored, is decided by the code that runs",
  ],
  [
    "applications-readable-before-answering.test.mjs",
    "executes the decision route and the route that decides several at once as a programme's " +
      "lead, against an in-memory term, for every way an application can be one she may not " +
      "read, because whether an answer names somebody or says where their application stands " +
      "is decided by the writer that runs",
  ],
  [
    "applications-review-routes.test.mjs",
    "executes the review loaders, builders and writers under src/lib/applications/review with " +
      "access.ts and the real eligibility bar underneath, against an in-memory Firestore, " +
      "because who is sent which score, and whether a decision touches an applicant's own " +
      "document, are decided by the code that runs",
  ],
  [
    "applications-review-views.test.mjs",
    "executes the pure halves of the review screens (the availability picture and its lines " +
      "of words, the line under a name, the list's filters and sorts, the queue), because " +
      "each is worked out from stored data and only running it shows the words match",
  ],
  [
    "applications-roles-in-transaction.test.mjs",
    "executes the route that names a programme's lead and reviewers against an in-memory " +
      "store whose documents change before the transaction opens and while it runs, because " +
      "whether a refusal is decided from what the transaction read is only shown by running it",
  ],
  [
    "applications-set-for-everybody.test.mjs",
    "executes the editor's, the applicant's and the review screen's handlers against one " +
      "in-memory term with a set asked of everybody, and the pure rules that say who is asked " +
      "it and where, because whether somebody is asked it once, and who then reads the answer, " +
      "is decided by the code that runs",
  ],
  [
    "applications-set-line-for-applicants.test.mjs",
    "executes the editor's, the applicant's and the review screen's handlers against one " +
      "in-memory term whose sets carry both a note for admins and a line for applicants, and " +
      "renders the component that draws the line, which is .tsx and needs the JSX option this " +
      "loader sets, because which of a set's two lines an applicant is sent is decided by the " +
      "code that runs",
  ],
  [
    "applications-su-membership-answer.test.mjs",
    "executes the decision-day, pooled applicants and review handlers as two admins, a lead, a " +
      "reviewer and people with no role, and the applicant's own read and form (a .tsx server " +
      "component) with the real view-as module reading a cookie the test sets, against an " +
      "in-memory term in which each person gave an answer, because which payloads carry " +
      "somebody's answer about SU membership, and for whom, is decided by the code that runs",
  ],
  [
    "applications-versions.test.mjs",
    "executes the rules for what a send keeps of the application it replaces " +
      "(src/lib/applications/versions/kept.ts), then the review loaders and builders, the " +
      "applicant's projections, the status page's read and the member record's builder " +
      "against one in-memory store, because who is sent an earlier version of an application, " +
      "and who is not, is decided by the code that runs",
  ],
  [
    "applications-view-as-own-application.test.mjs",
    "executes the applicant's two GET handlers with the real view-as module reading a cookie " +
      "the test sets, and renders the form's screen, the page for one application, the list and " +
      "the dashboard (all .tsx server components) to HTML for a member and for an admin viewing " +
      "as that member, against a database that records its reads, because whether anything of " +
      "an application is read or drawn in a view-as session is decided by the code that runs",
  ],
  [
    "applications-wave-e1-lifecycle.test.mjs",
    "executes the three pure modules under src/lib/applications/lifecycle (the readiness " +
      "list, the moves a form may make, and what the term page is handed), because each " +
      "sentence an admin is shown is built from stored dates and only running it shows the words",
  ],
  [
    "applications-wave-e1-open-form.test.mjs",
    "executes the lookup a public page asks which application form is open, against a " +
      "database that records its queries, because what leaves it for a visitor's page and " +
      "the shape of its one read are decided by the code that runs",
  ],
  [
    "applications-wave-e1-status-route.test.mjs",
    "executes the form status route and the transaction behind it with access.ts and the " +
      "readiness list underneath, against an in-memory Firestore, because whether an unready " +
      "form opens, and what a move writes, are decided by the code that runs",
  ],
  [
    "applications-wave-e1-term-home.test.mjs",
    "executes the term page's numbers beside the loaders of the two screens they link to " +
      "(the programme's list and the pooled applicants), on one stored term, because a " +
      "button that says 23 is only right if the list behind it walks 23",
  ],
  [
    "applications-wave-e2b-closed-on.test.mjs",
    "executes closedOnLabel in src/features/applications/apply/closedOn.ts, the one rule both of the " +
      "applicant's pages ask before printing the day a form closed, against a form closed by hand before " +
      "its time and one closed by the clock, because the sentence was untrue for eleven days of a term " +
      "and only running the rule shows which day it prints",
  ],
  [
    "applications-wave-e2b-email-text.test.mjs",
    "renders the three decision-day templates through the real renderer, .tsx graph and all, and holds " +
      "every address in the plain-text part to be followed by white space, because the join between two " +
      "buttons is made by the renderer and can only be seen in what it returns",
  ],
  [
    "applications-wave-e2b-review.test.mjs",
    "executes filterRows in src/features/applications/review/listModel.ts against rows that have " +
      "withdrawn from every standing, because which tab a withdrawn applicant is listed under is decided " +
      "by that function and nowhere else",
  ],
  [
    "applications-wave-f-replies.test.mjs",
    "executes the standing and reply rules (src/lib/applications/status/standing.ts, replies.ts, " +
      "view.ts) for every state of an application against every reply, and the contract's own " +
      "tallyTerm and freePlaces over a term, because what a reply does and whether a place " +
      "comes free are decided by the code that runs",
  ],
  [
    "applications-wave-f-reply-route.test.mjs",
    "executes the applicant's reply handler with the real gate, rate limiter and application " +
      "modules against an in-memory Firestore, because the reply, the status and the counters " +
      "are one transaction and only running it shows what was written and what was not",
  ],
  [
    "applications-wave-f-status.test.mjs",
    "executes the status view (src/lib/applications/status/view.ts) over the sample term and " +
      "the page's read (load.ts) against an in-memory Firestore holding somebody else's " +
      "application, a decision and a review, because only running them shows no result is " +
      "said early and no other document is read",
  ],
  [
    "applications-wave-g-approve.test.mjs",
    "executes the one function that approves a waiting account against an in-memory Firestore, " +
      "as every kind of account and in every kind of approver's name, because it changes a role " +
      "and what matters is what is written and what is left alone",
  ],
  [
    "applications-wave-g-reminders.test.mjs",
    "executes the invitation reminder job, its rule and its words against an in-memory " +
      "Firestore and a mail door that records; its graph reaches the invitation `.tsx` " +
      "template, and what was handed to the door is rendered and read",
  ],
  [
    "applications-wave-h-joined.test.mjs",
    "executes src/lib/applications/access.ts, decisions.ts and the review loaders against one stored " +
      "term in which an invitation stands every way it can, as every kind of account, because who " +
      "may read somebody invited is decided by the code that runs",
  ],
  [
    "applications-wave-h-list-words.test.mjs",
    "executes src/lib/applications/status/words.ts for every way an application can stand, because " +
      "the list of somebody's applications and their own page have to say the same words",
  ],
  [
    "applications-wave-h-places.test.mjs",
    "executes src/lib/applications/decisions.ts and every caller of its arithmetic over one stored " +
      "term in which every kind of reply has been made, because each screen has to count the same place",
  ],
  [
    "applications-d2-zeta-access-requirements.test.mjs",
    "executes the applicant's two access-requirements handlers and the admin's one, with the " +
      "real gate, rate limiter, access.ts and application modules, against an in-memory " +
      "Firestore, because who is refused before anything is read and what an open writes to " +
      "the log are decided by the code that runs",
  ],
  [
    "applications-d2-zeta-access-requirements-boundary.test.mjs",
    "executes the review loaders for an admin, a lead and a reviewer over a term in which " +
      "two people wrote in the access-requirements box, because only running them shows the " +
      "collection is never addressed and the words are in no payload",
  ],
  [
    "applications-d2-zeta-access-requirements-deletion.test.mjs",
    "executes the applicant's writer, then the round destroy and the account cascade over " +
      "what it wrote, because that an answer leaves in its application's own batch is a " +
      "claim about a commit and only a run can show one",
  ],
  [
    "applications-d2-zeta-audit-names.test.mjs",
    "executes every writer of an application audit line (a decision, several at once, a " +
      "revoked acceptance, a pooled outcome, the send's sentence) against a term whose " +
      "applicants have names no other string contains, because whether a row names somebody " +
      "is decided by what the writer is handed when it runs",
  ],
  [
    "applications-wave-h-small.test.mjs",
    "executes src/lib/applications/lifecycle/status.ts against a form in every stage, because the " +
      "term page and the route that adds a programme have to stop on the same answer",
  ],
  [
    "applications-linked-text.test.mjs",
    "executes the function that says which parts of an author's line are links against a table " +
      "of hostile input, and renders the component that draws them and the form's own question " +
      "step over the same table, which are .tsx and need the JSX option this loader sets, " +
      "because what becomes an address somebody can press is decided by the code that runs",
  ],
  [
    "applications-own-keys.test.mjs",
    "executes every exported function of every module under src/lib/applications against " +
      "each name Object.prototype carries, with the real eligibility bar and the real roles " +
      "writer underneath, because whether such a name reads as a programme is decided by how " +
      "each function reads its map, and only running each one shows it",
  ],
  [
    "applications-model.test.mjs",
    "executes every pure module under src/lib/applications (reading, steps, send validation, " +
      "scoring, placement, the decision-day tallies) against a small term and against the " +
      "full one the design was drawn for, because each rule there is arithmetic and only " +
      "running it shows the counts add up",
  ],
  [
    "authority-at-use.test.mjs",
    "executes the real bar registry from src/lib/firebase/eligibility.ts against every persona, " +
      "plus `isEligibleAdmissionsReviewer` and `canCirculateWorksheet` from the users module and " +
      "the two admissions access modules, because the whole point is that the bar a gate applies " +
      "is the one its appointment applied",
  ],
  [
    "deadlines-enforced.test.mjs",
    "executes the real release boundary from src/lib/admissions/stageRelease.ts, the draft " +
      "save and the applicant projection from applyRoutes.ts, and the later-stage submit " +
      "route itself either side of a stage's own deadline, because a deadline is enforced " +
      "by the write it bounds, and only the shipping route can show that",
  ],
  [
    "send-recipient-scope.test.mjs",
    "executes src/lib/tasks/recipientScope.ts and the three task send routes that use it, " +
      "because what matters is who a real run of the handler addresses and not which " +
      "line it contains",
  ],
  [
    "api-addressable-ids.test.mjs",
    "runs the real `isAddressableId` and `hasEncodedPathSeparator` from src/lib/addressableId.ts, " +
      "the chokepoint the proxy applies to every /api path",
  ],
  [
    "ts-loader.test.mjs",
    "the loader's own suite: it proves the JSX class is closed and walks the tree below",
  ],
  [
    "worksheet-routes.test.mjs",
    "the circulation routes reach `notify.ts` and the four `.tsx` templates behind it; all four " +
      "were stubbed, two of them for no reason but the missing JSX option, and the messages this " +
      "file sends are now asserted as rendered HTML",
  ],
  [
    "worksheet-review-routes.test.mjs",
    "the other half of the same tree, through the same `notify.ts` and the same four templates; " +
      "the no-feedback-in-the-email promise is now checked against the rendered message",
  ],
  [
    "worksheet-destroy.test.mjs",
    "the destroy and delete routes over the same worksheet tree, loading the cascade engine and " +
      "the shared audit module for real; the routes it loads import `access.ts` beside every " +
      "sibling that reaches `notify.ts` and its four templates",
  ],
  [
    "worksheet-aggregate.test.mjs",
    "the third suite over the same tree, sharing the other two's fake store; nothing it loads " +
      "reaches a `.tsx` yet, and every route beside the three it loads imports `notify.ts`",
  ],
  [
    "worksheet-due-reminders.test.mjs",
    "it loads `registry.ts` for `policyFor`, and the registry imports every job by value, so every " +
      "job's send path is in its graph; its comments named the missing JSX option as a reason to " +
      "stub two of those doors, and now only the transport is",
  ],
  [
    "task-email-routes.test.mjs",
    "the five task email routes, executed: each one imports one of the four task `.tsx` " +
      "templates by alias and every one of those imports `./EmailChrome` relatively, which is " +
      "the two-level JSX graph a hand-copied loader dies on",
  ],
  [
    "event-editor-unsaved-edits.test.mjs",
    "it executes the two functions in `src/features/events/editorSync.ts` that decide, one field " +
      "at a time, whether the event editor keeps what somebody has typed when the event changes " +
      "underneath it; a copy of that comparison would prove nothing about what the editor does, " +
      "and the module imports nothing, so nothing is stubbed",
  ],
  [
    "event-location-disclosure.test.mjs",
    "the RSVP, approve, cancel, broadcast and update routes executed with `sendRsvpEmail` and " +
      "the two event `.tsx` templates loaded for real, because what it asserts is the rendered " +
      "HTML a recipient sees and not the line a route passed",
  ],
  [
    "events-ics.test.mjs",
    "it executes the calendar builders in `src/lib/events/ics.ts` for real: the file leaves the " +
      "site and is read by software nobody here controls, so a copy of the URL arithmetic would " +
      "prove nothing about what a phone receives; the module has no imports, so nothing is stubbed",
  ],
  [
    "events-when.test.mjs",
    "it executes `src/features/events/eventWhen.ts` for real under a process zone far from " +
      "London: the words the public events pages print for a time, a date and the places left " +
      "are built there from `formatSiteDate`, and a copy of that arithmetic would prove nothing " +
      "about what a deployed page says; its graph is that module and `siteTime.ts`, so nothing " +
      "is stubbed",
  ],
  [
    "event-rsvp-identity.test.mjs",
    "the RSVP route executed as a guest, a member, a pending and a rejected account; its graph " +
      "reaches `sendRsvpEmail` by alias, stubbed here because the rendering is the sibling " +
      "suite's subject, and the shared loader is the rule for a new suite either way",
  ],
  [
    "scheduler-markers.test.mjs",
    "same shape: `registry.ts` is loaded for the caps and windows and drags every job's graph in " +
      "with it, and the stub comments said so in as many words",
  ],
  [
    "admissions-reminders.test.mjs",
    "same again, plus the admissions job it actually runs; un-stubbing any one of those doors to " +
      "assert on what a job sends used to fail the file with a SyntaxError instead",
  ],
  [
    "admissions-stage-release.test.mjs",
    "it loads `admissionEmails.ts` FOR REAL for the token contract, so all six admissions " +
      "templates are compiled here; they were the eight `return null` stubs this change deleted",
  ],
  [
    "email-audience.test.mjs",
    "it executes `send.ts` in-process to prove a recipient outside this copy of the site's " +
      "audience never reaches the transport and is logged as held, under a table of " +
      "environments; the transport, the renderer and the Admin SDK door are its only stubs",
  ],
  [
    "email-suppression-chokepoint.test.mjs",
    "it executes `send.ts` in-process to prove a suppressed recipient never reaches the " +
      "transport and is logged as held; the transport, the renderer and the Admin SDK door are " +
      "its only stubs, so any template a caller renders compiles for real",
  ],
  [
    "reminder-slots.test.mjs",
    "the shared reminder-slot model and its resolver: `schedule.ts` reaches `schedulerMarkers.ts` " +
      "and the suite also loads the admissions adapter to prove the two features resolve through " +
      "one piece of arithmetic, so it is a multi-module graph rather than one leaf file",
  ],
  [
    "account-deletion-worksheets.test.mjs",
    "it executes the whole account cascade to prove what that cascade KEEPS, so its graph is " +
      "`accountDeletion.ts` plus every collection helper it imports, `memberRecords.ts` among " +
      "them; the Admin SDK is its only stub, because a retention proved against a copy of the " +
      "sweep would say nothing about the sweep that ships",
  ],
  [
    "notice-lane.test.mjs",
    "the notice lane's marker is a `.tsx` component that `sendNotice` builds and a template " +
      "renders as a slot, so the suite's graph reaches three email templates and the real " +
      "`@react-email/render`: what the recipient actually sees is the property under test, and a " +
      "loader that could not read JSX would have to stub away the very thing being asserted",
  ],
  [
    "event-announcements-job.test.mjs",
    "the queued announcement job, executed: its graph is the audience resolver, the real " +
      "`EventAnnouncementEmail` behind it, the marker layer and `registry.ts`, which drags every " +
      "other job in with it; the two transports and the junction read are its doors, so the " +
      "audience arithmetic under test is the shipping arithmetic",
  ],
  [
    "newsletter-push.test.mjs",
    "the newsletter send route is the module under test and it imports `NewsletterEmail`, a " +
      "`.tsx` that imports the rest of the template tree, so the route cannot be executed at " +
      "all by a loader that cannot read JSX; the graph behind it reaches the real push " +
      "pipeline and the real preference read, which are what the suite measures",
  ],
  [
    "member-records.test.mjs",
    "`memberRecords.ts` derives an entry from the round, application and review types, so its " +
      "graph is four admissions modules deep; the Admin SDK is its only stub, because the " +
      "arithmetic under test has to be the shipping arithmetic and not a copy of it",
  ],
  [
    "admissions-destroy.test.mjs",
    "it runs the round destroy end to end, so its graph is the cascade, the member-record sweep, " +
      "`memberRecords.ts`, the audit module and three route handlers at once; the promise under " +
      "test is an ORDER of writes across those modules, which only the shipping modules can hold",
  ],
  [
    "subscriptions-consent.test.mjs",
    "it executes `subscriptions.ts` (the re-subscribe gate and the confirm flow) and the public " +
      "subscribe route for the anonymous-response contract; the route imports the two subscription " +
      "email templates, so a loader that could not read JSX would fail the file before a test ran",
  ],
  [
    "uni-email-ownership.test.mjs",
    "it executes `confirmUniEmailVerification.ts` against a fake Firestore to prove the confirming " +
      "caller must be the token's own account; the helper reaches `signedTokens` and the ownership " +
      "helper, both stubbed, and the shared loader is what compiles the TypeScript in-process",
  ],
  [
    "profile-study-changes.test.mjs",
    "it executes the function that builds the profile's save of a member's degree and graduation " +
      "(src/features/profile/studyChange.ts), the users normaliser and the words the admin's page " +
      "uses for the entries, because what is written in each case and what an admin then reads " +
      "are decided by the code that runs; nothing is stubbed, the graph is four pure modules",
  ],
  [
    "server-date-formatting.test.mjs",
    "it executes `siteTime.ts` and `formatEventWhen` under a process zone that is not London, " +
      "because the promise is what the shipping formatter prints on a UTC container and a copy " +
      "of the formatter would prove nothing; nothing is stubbed, the graph is two pure modules",
  ],
  [
    "source-numbering.test.mjs",
    "it executes the real minting, reordering and validation from " +
      "src/lib/firestore/sourceSheets.ts, because a source number is printed on paper and a " +
      "copy of the counter in the test would prove nothing about the one that ships; the graph " +
      "reaches courses.ts for the shared link validator, so nothing is stubbed",
  ],
  [
    "links-page-content.test.mjs",
    "it executes the /links fetcher, because the promise is that the page most printed codes land on " +
      "cannot be emptied or have a hostile address put on it by whatever is stored, and only running " +
      "the shipping fetcher over missing, damaged and hostile documents shows that; `server-only` and " +
      "the Admin SDK handle are stubbed so the document comes from the test, and nothing else is",
  ],
  [
    "link-stats.test.mjs",
    "it executes the dashboard's arithmetic, because the ways its numbers could be wrong are all small " +
      "(a person counted once per channel, a day lost to a clock change, a gap closed up in a chart) " +
      "and only running `linkStats.ts` on rows shaped like the real ones shows any of them; nothing is stubbed",
  ],
  [
    "tracked-links.test.mjs",
    "it executes the short-link route, because the promise is that every printed code answers with " +
      "the exact status and Location production sent before the route existed, and only the shipping " +
      "route can show that; `server-only` and the Admin SDK handle are stubbed so the read comes from a " +
      "fake database the test controls, including one that refuses to answer, and nothing else is",
  ],
  [
    "printed-code-landing-pages.test.mjs",
    "it reads `printedLinks.ts` for the destinations the printed codes really have, so a code pointed " +
      "at a new kind of page is checked against the landing pages without anybody copying the list " +
      "into the test; nothing is stubbed",
  ],
  [
    "event-no-signup.test.mjs",
    "it executes `normalizeEvent`, because the promise that an event made before the switch existed " +
      "still takes sign-ups is a promise about what the shipping normaliser does with a missing " +
      "field and with values that are nearly true; nothing is stubbed",
  ],
  [
    "signup-schedule.test.mjs",
    "it executes the comparison behind an RSVP email's changed-since-you-signed-up block, because the " +
      "bug was two formatted lines differing when only the formatter had changed, and that can only be " +
      "shown by running the shipping comparison on a label the old formatter wrote; nothing is stubbed",
  ],
  [
    "scan-counting.test.mjs",
    "it executes the scan counter, its route and the beacon's decision, because what a scan writes is " +
      "a privacy promise and only the shipping code can show which fields reach the database; " +
      "`server-only`, `next/server`, the Admin SDK handle and the `FieldValue.increment` sentinel are " +
      "stubbed so the write lands in a fake database the test can read back, and nothing else is",
  ],
  [
    "campaign-attribution.test.mjs",
    "it executes `attribution.ts`, the pure function that turns a visitor-controlled query string " +
      "into a subscription's `source`, because the promise is about what the shipping code lets " +
      "through and a copy of its regular expression would prove nothing; nothing is stubbed",
  ],
  [
    "registration-status.test.mjs",
    "it executes the signup tracker end to end: the status rule, the three write helpers, and the " +
      "list, summary and profile-complete routes against one small fake database, because the claim " +
      "is about what an admin is SHOWN for a row whose stored status is stale, and that is decided " +
      "across five modules. `server-only`, `next/server`, the Admin SDK handle, the session and the " +
      "impersonation guard are stubbed; `firebase-admin/firestore` is the real one",
  ],
  [
    "html-neuter-reader.test.mjs",
    "it executes `neuterRichTextHtml` over several thousand generated documents and times it on " +
      "two hundred thousand characters, because the claim is about what the shipping reader writes " +
      "and how long it takes, and a copy of it would prove neither; nothing is stubbed",
  ],
  [
    "input-pattern-bounds.test.mjs",
    "it runs the `/api/register` handler up to its first gate with an oversized, a malformed and a " +
      "non-string address, because the order of the cap and the pattern is only real when the " +
      "handler is executed. Every door past the validation (the Admin SDK, the mailer, the captcha, " +
      "the rate limiter, the tracker writes) is stubbed, and the test asserts none of them is reached",
  ],
  [
    "app-frame.test.mjs",
    "executes src/layout/appNav.ts, the signed-in menu as data: its matchers decide which admin " +
      "page an address belongs to and `currentEntry` decides which menu entry is lit, and both " +
      "are held to the page files in the tree by running them rather than by reading their text",
  ],
  [
    "public-nav-pages.test.mjs",
    "executes src/layout/publicNav.ts, the public menus as data, and its own `addressOf`: which " +
      "entries are drawn and where each leads is decided by that function and by constants the " +
      "file imports, so the addresses are held to the page files in the tree by running the " +
      "module rather than by reading its text; nothing is stubbed",
  ],
  [
    "pwa-display-mode.test.mjs",
    "it executes `isStandaloneNow` (src/lib/pwa/displayMode.ts) against windows made of plain " +
      "objects, beside the script StandaloneFlag.tsx puts on every page, because the two are one " +
      "rule written twice and only running both on the same windows shows they agree; it also " +
      "runs src/app/manifest.ts for the display mode the rule relies on; nothing is stubbed",
  ],
  [
    "sign-in-return.test.mjs",
    "it executes src/lib/signInReturn.ts (the guard on a return address, the cookie's text, the " +
      "tab's copy, what each end of a trip to Google takes) and the Google callback route's POST " +
      "handler. `next/server` is stubbed only to re-export the framework's real request and " +
      "response, so cookies are read and written by the code production runs; " +
      "`google-auth-library` is stood in for, because nobody but Google can sign a credential",
  ],
  [
    "site-path.test.mjs",
    "it executes the three askers of `safeReturnPath` that are not about signing in (the last page " +
      "an installed app had open, and the two modules that hand a destination to a notification), " +
      "because what each does with an address it is refused is only real when the module runs; " +
      "the notification modules' three doors (`./config`, `./preferences`, `./send`) are stubbed " +
      "so nothing is sent, and what would have been sent is kept to be looked at",
  ],
  [
    "slug-id.test.mjs",
    "it executes `slugId`, with the platform's random source replaced, because where the suffix " +
      "comes from and what happens to a byte that would bias it are both about the shipping code; " +
      "nothing is stubbed",
  ],
  [
    "home-words.test.mjs",
    "it executes `homeWords.ts`, the pure functions that say what the homepage's two buttons, " +
      "the chip on a programme and the sentence under This term read at each stage of the term, " +
      "in a time zone far from London, because the promise is the words a visitor is given and " +
      "a copy of the table would prove nothing; nothing is stubbed",
  ],
  [
    "hero-scene.test.mjs",
    "it executes `mountHero` and `startScene` against a page made of plain objects, because what " +
      "the homepage's scene gives back when it stops, whether it asks for a frame under reduced " +
      "motion and when a drag is held are only real when the modules run. `./engine.js` is stubbed " +
      "with the engine's own source, which is plain script this loader does not compile; nothing " +
      "else is stubbed",
  ],
  [
    "incubators-on-the-form.test.mjs",
    "it executes `incubatorWords.ts` and renders the incubator's page and the fellowships page " +
      "from a term with no, one and two incubators on its form, because what each page says for " +
      "each count is only real when the page is drawn. The term's fetcher, the list of published " +
      "courses, `next/link`, the network drawing and the stylesheets are stubbed",
  ],
  [
    "applications-place-next-words.test.mjs",
    "it composes the standard You are in email and draws the person's own page from one stored " +
      "form, for a place on a fellowship and on an incubator, because that the two say the same " +
      "thing for each kind is only real when both are run. `server-only`, `next/link`, the " +
      "router the reply buttons ask for and the two stylesheets are stubbed",
  ],
  [
    "applications-place-in-the-member-area.test.mjs",
    "it stores every way an application can stand and runs Home and the list of programmes " +
      "for each, on the server and drawn to HTML, because that neither page states an outcome " +
      "is only real when the pages run. `server-only`, three `next` modules, `next/link`, the " +
      "Admin SDK handle, the session, the hook that lists a member's runs, the public term, the " +
      "parts of Home that are not about an application, a run's card, the entrance wrapper and " +
      "the stylesheets are stubbed",
  ],
  [
    "email-unfilled-tokens.test.mjs",
    "it runs the placement email's composer over generated wording, the allocation publish " +
      "handler against a stored run, and every sender that fills tokens on its own seed copy, " +
      "because which tokens reach a reader is only real when the email is written and rendered. " +
      "`server-only`, `next/server`, the Admin SDK handle, the session, the view-as guard, the " +
      "standing check, the subscription, push and suppression doors and the mail door are stubbed",
  ],
]);

/**
 * The forty-three suites that still carry a hand-copied loader, frozen.
 *
 * One reason covers the list, because it is one decision: each of these works
 * today, each one's module graph stops short of a `.tsx`, and rewriting them
 * all would be a large diff with no failure behind it. They are here so the
 * check below can tell an OLD copy from a NEW one. That distinction is the
 * whole point: a check that only asks its question of files importing the
 * shared loader would pass a forty-fourth copy pasted into a new suite, which
 * is exactly how this class arrived twice already. The next person to write a
 * suite that reaches an email template would meet the same bare `SyntaxError`
 * and nothing would tell them why.
 *
 * Checked both ways. A file missing from the list fails (import the shared
 * loader instead of pasting a copy), and an entry whose file no longer has a
 * copy fails (migrate it, then delete its line here, so the list can only
 * shrink). Deleting the last entry deletes the check.
 */
const LEGACY_LOADERS = [
  "account-deletion-admission-roles.test.mjs",
  "account-deletion-attendance.test.mjs",
  "account-deletion-memberships.test.mjs",
  "admissions-apply-flow.test.mjs",
  "admissions-appointment-decide.test.mjs",
  "admissions-appointment-round.test.mjs",
  "admissions-predicates.test.mjs",
  "admissions-round-console.test.mjs",
  "admissions-stage-ids.test.mjs",
  "admissions-status-hub.test.mjs",
  "course-cohort-audience.test.mjs",
  "course-deletion.test.mjs",
  "course-enrol.test.mjs",
  "course-group-resolve.test.mjs",
  "course-nudge.test.mjs",
  "course-offer.test.mjs",
  "course-pages.test.mjs",
  "course-programme-page.test.mjs",
  "course-schedule-changes.test.mjs",
  "course-sessions.test.mjs",
  "course-streams.test.mjs",
  "course-task-mirror.test.mjs",
  "course-templates.test.mjs",
  "course-window.test.mjs",
  "data-exports.test.mjs",
  "form-question-limits.test.mjs",
  "impersonation-guard.test.mjs",
  "member-conduct-flag.test.mjs",
  "membership-grant-route.test.mjs",
  "membership-import-routes.test.mjs",
  "membership-import.test.mjs",
  "membership.test.mjs",
  "privacy-policy.test.mjs",
  "push-preferences.test.mjs",
  "recaptcha-bypass.test.mjs",
  "scheduler.test.mjs",
  "task-artefact.test.mjs",
  "unmarked-registers.test.mjs",
  "week-plan.test.mjs",
  "worksheet-editor-helpers.test.mjs",
  "worksheet-respond-helpers.test.mjs",
  "worksheets-circulation-view.test.mjs",
  "worksheets-model.test.mjs",
];

/**
 * A CALL to the compiler, in either shape a copy is written in: qualified on
 * the compiler object, or destructured out of it and called bare. It matches a
 * call rather than the name, so the prose in this file, which names the
 * function repeatedly and never follows it with an opening bracket, is not
 * itself read as a loader.
 */
const LOCAL_LOADER = /\btranspileModule\s*\(/;

/**
 * Every `*.test.mjs` under `tests/`, at any depth. The recursion is not
 * decoration: this change created `tests/lib/`, and a suite parked in a
 * subdirectory is exactly the one a top-level-only walk would stop seeing.
 */
function testFiles() {
  return readdirSync(TESTS_DIR, { recursive: true })
    .map((entry) => entry.split(sep).join("/"))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort();
}

function readTest(name) {
  return readFileSync(join(TESTS_DIR, name), "utf8");
}

const importsSharedLoader = (source) => source.includes("lib/tsLoader.mjs");

describe("one loader per file", () => {
  test("no file imports the shared loader AND defines its own", () => {
    const offenders = testFiles().filter((name) => {
      const source = readTest(name);
      return importsSharedLoader(source) && LOCAL_LOADER.test(source);
    });

    assert.deepEqual(
      offenders,
      [],
      "these files have two loaders in them. Delete the local `transpileModule` dance and " +
        "move its `STUBS` into `createLoader({ stubs })`: a file with both will quietly " +
        "load half its graph through a loader that cannot read JSX.",
    );
  });

  test("no suite outside the frozen list carries a hand-copied loader", () => {
    const copies = testFiles().filter((name) => LOCAL_LOADER.test(readTest(name)));

    assert.deepEqual(
      copies,
      [...LEGACY_LOADERS].sort(),
      "a suite is compiling TypeScript with a loader of its own. If it is NEW, delete the " +
        "copy and `import { createLoader } from \"./lib/tsLoader.mjs\"`: a copy cannot read " +
        "a `.tsx`, so the first email template its graph reaches will kill the whole file " +
        "with a bare SyntaxError before one test runs, which is the afternoon this shared " +
        "loader exists to give back. If instead a listed suite has just been MIGRATED, " +
        "delete its line from `LEGACY_LOADERS` and add it to `USERS` with its reason.",
    );
  });

  test("every user of the shared loader is registered, with a reason", () => {
    const users = testFiles().filter((name) => importsSharedLoader(readTest(name)));

    assert.deepEqual(
      users,
      [...USERS.keys()].sort(),
      "the register in this file and the suites importing `tests/lib/tsLoader.mjs` disagree. " +
        "Add the new suite with the reason its graph needs the shared loader, or delete the " +
        "entry for a suite that no longer uses it.",
    );

    for (const [name, why] of USERS) {
      assert.ok(
        typeof why === "string" && why.length > 30,
        `${name} needs a written reason, not a placeholder`,
      );
    }
  });

  test("no registered file still stubs an email template to dodge JSX", () => {
    // The stubs this change deleted, named. A template stub that comes back is
    // either a real need (a suite that wants to assert on props rather than on
    // HTML, which should say so in a comment) or the old reflex returning, and
    // the failure message asks the question rather than assuming.
    const offenders = [];
    for (const name of USERS.keys()) {
      const source = readTest(name);
      for (const [specifier] of source.matchAll(/"@\/emails\/[A-Za-z]+"/g)) {
        offenders.push(`${name}: ${specifier}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "the shared loader compiles `.tsx`, so an email template no longer has to be stubbed. " +
        "If a suite stubs one for a different reason, that reason belongs in a comment and " +
        "this check belongs alongside it.",
    );
  });
});
