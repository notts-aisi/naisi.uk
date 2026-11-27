/**
 * A SERVER PAGE THAT READS ANYTHING ASKS WHO IS CALLING ITSELF, AND ASKS AT
 * LEAST WHAT EVERY LAYOUT ABOVE IT ASKS.
 *
 * WHY. A server component page or layout under `src/app` whose render can read
 * with the Admin SDK calls a gate from `GATES` in the same file, awaited, at
 * the top level of its body, before its first read and before it returns
 * anything, and reads nothing for somebody the gate refuses. The gate it calls
 * asks at least the question each layout above it asks: a page in the events
 * area asks the events area's question, not only whether somebody is signed
 * in. The layouts still gate (`tests/no-admin-gating.test.mjs`); each page
 * that reads also asks for itself.
 *
 * WHAT IT CHECKS, for every `page.tsx` and `layout.tsx` under `src/app`
 * outside `src/app/api`. Components are read with the compiler's own parser
 * (the `typescript` devDependency, syntax only, one file at a time, as
 * `tests/lib/functionScan.mjs` does), so the order of statements is the order
 * the code runs in, not the order of text.
 *
 *  1. WHETHER IT READS. A file that opens with `"use client"` reads through
 *     the Firestore rules and is out of scope. For the rest, its imports are
 *     followed by value (tests/lib/clientGraph.mjs, the walk the boundary
 *     guard uses) through every module that is not `"use client"`, and it
 *     reads when the walk reaches `src/lib/firebase/admin.ts` or the
 *     `firebase-admin` package. `session.ts` and `pageGates.ts` are not
 *     walked into: reaching only the session is asking, not reading. An
 *     import the walk cannot resolve fails.
 *  2. THE GATE COMES FIRST. In the component (the default export), and in
 *     `generateMetadata` when it reads, the statements of the body are read in
 *     order. The first statement that awaits a gate, at the top level of the
 *     body, is the gate: `await g()`, `const x = await g()`, or one
 *     `Promise.all` that awaits the gate beside nothing but `params` and
 *     `searchParams`. A gate on one branch, inside a `try`, a `catch`, a
 *     callback or a function nobody calls, or called without `await`, is not
 *     a gate. A helper of the same file counts as a gate where it is awaited
 *     when its own body passes this rule. Every statement before the gate
 *     reads nothing and returns nothing (a child component returned is a
 *     return). A read is a Firestore method (`.collection`, `.doc`, ...), a
 *     call to a function imported from this repository that is neither a gate
 *     nor in `PURE` (each with the reason it reads nothing), a call through a
 *     namespace import of a repository module (`repo.load(`), or a call to a
 *     helper of the file that reads.
 *  3. THE TREES ARE THE LAYOUTS. Every server `layout.tsx` whose component
 *     passes rule 2 asks a question: its gate's. When that gate asks only for
 *     the session (`SESSION_ONLY`) and the layout refuses more after it (an
 *     `if` that redirects, returns or throws, beyond refusing nobody signed
 *     in), the question is the layout's own, written in `INLINE_QUESTIONS`:
 *     the authed shell's "an approved account" is one. Every server page and
 *     layout beneath it that reads calls that gate, or one `IMPLIES` says asks
 *     at least as much, with the reason. No list of trees to forget: a new
 *     layout with a gate is a new tree from the day it lands.
 *  4. ASKING LESS IS WRITTEN DOWN. A page beneath a layout whose question its
 *     own gate does not meet is in `ASKS_LESS`, with the layout, its kind and
 *     the reason: `own` (it asks for the session and reads nothing but the
 *     caller's own rows or public data) or `door` (it refuses by the caller's
 *     own place after its gate). Both directions: an entry for a page that is
 *     gone, no longer reads, or now meets the layout's question fails as
 *     stale, as does an `own` entry whose gate asks more than the session or
 *     a `door` entry that refuses nothing after its gate.
 *  5. THE OPEN PAGES ARE WRITTEN DOWN. A page that reads with no gate first is
 *     in `OPEN`, with the reason. Both directions, as above. A directory entry
 *     covers the pages under it that read with no gate, and is stale when none
 *     is left.
 *  6. THE GATES ARE WHAT THEY SAY. Each entry in `GATES` is found in its
 *     module and its own body is held to the predicate it claims: the call it
 *     makes first, and each refusal it makes, compared as the exact text of
 *     the `if` condition, strings and all. An entry no page or layout uses
 *     fails, as does an `IMPLIES` or `INLINE_QUESTIONS` entry nothing uses.
 *     Each entry in `PURE` is checked to touch no Firestore method.
 *
 * WHAT IT DOES NOT HOLD. It compares questions by name: whether a gate's
 * predicate really asks at least what another asks is the written reason of
 * an `IMPLIES` entry, held in place by rule 6 (change a predicate and its
 * entry fails until somebody rereads the reason). A layout's own checks after
 * a gate that is more than the session (a run's learning space after
 * `getRunAccess`, a programme's tabs after `requireAdmissionsPage`) are not
 * compared with its pages' checks: the pages are held to the gate. A `door`
 * entry is checked for refusing something after its gate, and what it
 * refuses is its written reason. A page's own narrower checks after its gate
 * are not compared with anything.
 *
 * The scanner's own reading is exercised on synthetic components at the
 * bottom of this file, including every shape that must not count as a gate,
 * so a pattern that quietly stopped matching fails rather than passes.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isClientModule, walkEachFrom } from "./lib/clientGraph.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(REPO_ROOT, "src");
const APP_DIR = join(SRC_DIR, "app");
const API_DIR = join(APP_DIR, "api");
const ADMIN_MODULE = join(SRC_DIR, "lib", "firebase", "admin.ts");

/** Modules a page may reach without that counting as a read: they ask who is calling. */
const ASKING_MODULES = [
  join(SRC_DIR, "lib", "firebase", "session.ts"),
  join(SRC_DIR, "lib", "firebase", "pageGates.ts"),
];

// ---------------------------------------------------------------------------
// The registries
// ---------------------------------------------------------------------------

/**
 * A function whose awaited call establishes who is calling. `from` is the
 * module it is imported from; `proof` is what its own body must show:
 *  - `verifies`: it calls this method (the session cookie's verification);
 *  - `is`: the exported constant is exactly this expression;
 *  - `first`: the first call its body awaits at its top level;
 *  - `defines`: top-level constants it decides with, by exact initializer;
 *  - `refuses`: top-level `if` conditions, by exact text, each of which
 *    redirects or returns.
 */
const GATES = {
  getCurrentUser: {
    from: "@/lib/firebase/session",
    proves: "a verified session cookie, with the live role and permissions read off the user's document; null for no session",
    proof: { verifies: "verifySessionCookie", refuses: ["!cookie?.value", "!auth || !db"] },
    why: "every other session gate is built on it",
  },
  getCurrentCollaborator: {
    from: "@/lib/firebase/session",
    proves: "a verified session cookie resolved to its collaborator record; null for anybody else",
    proof: { verifies: "verifySessionCookie", refuses: ["!cookie?.value", "!auth || !db"] },
    why: "the collaborator area is its own audience, not a member's",
  },
  getSessionUser: {
    from: "@/features/courses/runAccess",
    proves: "getCurrentUser, memoised for the request",
    proof: { is: "cache(getCurrentUser)" },
    why: "the course pages ask once and read the answer in several places",
  },
  getRunAccess: {
    from: "@/features/courses/runAccess",
    proves: "the session, then the caller's own place on the run: their enrolment addressed by run and uid; null for no session",
    proof: { first: "getSessionUser", refuses: ["!user"] },
    why: "the session is asked before the run is read, and the place is the caller's own",
  },
  openGuidePage: {
    from: "@/features/courses/guide/pageGate",
    proves: "getRunAccess, then the guide's own door, redirecting everybody it refuses",
    proof: { first: "getRunAccess", refuses: ["!access", "!door"] },
    why: "the run's guide pages share one door",
  },
  surveyAdmin: {
    from: "@/lib/aiSurvey/adminStore",
    proves: "the session, then whether the AI at Nottingham survey's admin side is the caller's",
    proof: { first: "getCurrentUser", refuses: ["!user"] },
    why: "that survey's admin pages answer to their own list of admins",
  },
  requireAdminPage: {
    from: "@/lib/firebase/pageGates",
    proves: "a full admin; everybody else is redirected",
    proof: { first: "getCurrentUser", refuses: ['!user || user.role !== "admin"'] },
    why: "the (admin-only) tree's gate",
  },
  requireCourseAuthorPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an admin or a holder of draftCourse or approveCourse; everybody else is redirected",
    proof: {
      first: "getCurrentUser",
      refuses: ['!user || !(user.role === "admin" || canDraftCourse(user) || canApproveCourse(user))'],
    },
    why: "the course authoring tree's gate",
  },
  requireAdmissionsPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an author of admission rounds or an appointed reviewer still standing; everybody else is redirected",
    proof: {
      first: "getCurrentUser",
      defines: {
        namedReviewer: 'user?.admissionsReviewer === true && holdsStanding(user, "admissionRounds.reviewerUids")',
      },
      refuses: ["!user || !(canAuthorAdmissionRound(user) || namedReviewer)"],
    },
    why: "the admissions tree's gate",
  },
  requireMembershipPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an admin or a holder of manageMembership; everybody else is redirected",
    proof: { first: "getCurrentUser", refuses: ["!user || !canManageMembership(user)"] },
    why: "the membership tree's gate",
  },
  requireEventsPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an admin, a committee member, or a holder of draftEvent or approveEvent; everybody else is redirected",
    proof: {
      first: "getCurrentUser",
      defines: {
        allowed: 'user.role === "admin" || user.role === "committee" || canDraftEvent(user) || canApproveEvent(user)',
      },
      refuses: ["!user", "!allowed"],
    },
    why: "the events area's gate, which its layout calls too",
  },
};

/** The gates that ask only whether somebody is signed in, and who. */
const SESSION_ONLY = new Set(["getCurrentUser", "getSessionUser"]);

/**
 * A layout whose gate asks only whether somebody is signed in, and which
 * refuses more after it, inline. The question it asks, in words; a page
 * beneath it meets it through `IMPLIES`, or is in `ASKS_LESS`.
 */
const INLINE_QUESTIONS = {
  "src/app/(app)/layout.tsx": {
    asks: "an approved account: signed in, and neither pending nor rejected",
    why: "the authed shell; a pending account goes to wait for approval and a rejected one to the public site",
  },
  "src/app/(app)/admin/layout.tsx": {
    asks: "somebody the admin area admits: an admin, a course author, an admissions author or appointed reviewer, or a membership keeper",
    why: "the admin area's front door; each tree beneath it asks its own narrower question",
  },
  "src/app/(app)/committee/layout.tsx": {
    asks: "an admin or SU-recognised committee",
    why: "the committee task board shows every committee task and the member roster",
  },
  "src/app/(app)/newsletter/layout.tsx": {
    asks: "a holder of draftNewsletter or approveNewsletter",
    why: "the newsletter tools",
  },
  "src/app/(app)/worksheets/(author)/layout.tsx": {
    asks: "an admin or a committee member",
    why: "the worksheet library and editor, for the people who write worksheets",
  },
};

/** Approved accounts: a role of member, committee or admin. Every named gate below asks at least that. */
const APPROVED = "src/app/(app)/layout.tsx";
const ADMIN_AREA = "src/app/(app)/admin/layout.tsx";

/**
 * `IMPLIES[gate][question]`: the gate asks at least what the question asks,
 * and why. A question is a gate's name or an `INLINE_QUESTIONS` layout.
 */
const IMPLIES = {
  requireAdminPage: {
    [APPROVED]: "a role of admin is neither pending nor rejected",
    [ADMIN_AREA]: "an admin is the first person the admin area admits",
    requireCourseAuthorPage: "the course authors' gate admits every admin",
  },
  requireCourseAuthorPage: {
    [APPROVED]: "admin, or draftCourse or approveCourse held on the roster (member, committee or admin)",
    [ADMIN_AREA]: "the admin area admits course authors by the same two permissions",
  },
  requireAdmissionsPage: {
    [APPROVED]: "approveCourse is honoured only on the roster, and an appointed reviewer only while their account stands",
    [ADMIN_AREA]: "the admin area admits admissions authors and appointed reviewers by the same tests",
  },
  requireEventsPage: {
    [APPROVED]: "admin or committee, or draftEvent or approveEvent held on the roster",
  },
  openGuidePage: {
    getRunAccess: "it awaits getRunAccess first and redirects everybody it answers nothing for, then asks the guide's own door",
  },
};

/**
 * Pages and layouts beneath a layout whose question their own gate does not
 * meet, ON PURPOSE. `below` lists the layouts whose question it does not
 * meet. Two kinds, each checked:
 *  - `own`: the gate asks only for the session, and the page reads nothing
 *    but the caller's own rows, by their uid, or public data;
 *  - `door`: after its gate the page refuses by the caller's own place (an
 *    `if` that redirects, returns or throws, read the way a layout's inline
 *    question is read), or its gate does, and reads more only for somebody
 *    that door admits. What the door asks is the written reason.
 * Every one is beneath the authed shell, which turns away an account that is
 * not approved before any page under it is drawn.
 */
const RUN_LAYOUT = "src/app/(app)/learn/[runId]/layout.tsx";
const RUN_PLACE =
  "Asks getRunAccess: the session, then the caller's own place on the run, their enrolment addressed by run " +
  "and uid. It then refuses by that place with its own narrower question, and reads the run's other rows only " +
  "for somebody that question admits. getRunAccess does not itself ask for an approved account.";
const ASKS_LESS = new Map([
  [
    "src/app/(app)/learn/[runId]/admissions/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/another-session/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/change-group/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/email/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/glossary/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/coursework/[uid]/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/edit/[weekId]/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/edit/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/email/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/people/[uid]/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/question/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/ratings/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/register/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/report/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/review/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/sessions/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/group/[groupId]/update/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/layout.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/leave/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/notes/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/pitching/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/progress/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/reading/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/start-here/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/team/hand-in/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/team/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/learn/[runId]/weeks/[n]/page.tsx",
    { below: [APPROVED], kind: "door", why: RUN_PLACE },
  ],
  [
    "src/app/(app)/ask-the-team/page.tsx",
    { below: [APPROVED], kind: "own", why: "Reads only the caller's own messages to the team and their own places this term, both read by their uid." },
  ],
  [
    "src/app/(app)/dashboard/page.tsx",
    { below: [APPROVED], kind: "own", why: "Reads only the caller's own applications, places, cards, surveys and invitations by their uid, the public term and events, and the requests waiting, which requestsWaitingFor shows only to an admin or a programme's lead by the caller's own role." },
  ],
  [
    "src/app/(app)/learn/page.tsx",
    { below: [APPROVED], kind: "own", why: "Reads only the caller's own places, runs left, cards and surveys, each read by their uid." },
  ],
  [
    "src/app/(app)/profile/page.tsx",
    { below: [APPROVED], kind: "own", why: "Reads only the caller's own profile and their own sharing choice, read by their uid." },
  ],
  [
    "src/app/(app)/learn/draw/[groupId]/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then the group named in the address, then drawGate decides from the caller's own place on it and refuses everybody else before the roster is read." },
  ],
  [
    "src/app/(app)/learn/pairs/[groupId]/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then the group named in the address, then drawGate decides from the caller's own place on it and refuses everybody else before the pairs are read." },
  ],
  [
    "src/app/(app)/learn/facilitate/[askId]/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then loadAnswerPage reads the ask and answers not-yours to anybody it was not sent to." },
  ],
  [
    "src/app/(app)/learn/facilitator-guide/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then the groups the caller facilitates, by their uid, and the guides of those courses only." },
  ],
  [
    "src/app/(app)/learn/facilitator-guide/[courseId]/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then facilitatorGuideReader decides from the caller's own place whether the guide is theirs, and nothing more is read for anybody it refuses." },
  ],
  [
    "src/app/(app)/learn/facilitator-guide/[courseId]/[doc]/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then facilitatorGuideReader decides from the caller's own place whether the guide is theirs, and nothing more is read for anybody it refuses." },
  ],
  [
    "src/app/(app)/messages/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then messageWriterOf decides from the caller's own roles whether they write to members, and anybody else is told the page is not for them." },
  ],
  [
    "src/app/(app)/messages/sent/page.tsx",
    { below: [APPROVED], kind: "door", why: "Asks the session, then messageWriterOf decides from the caller's own roles whether they write to members, and anybody else is told the page is not for them before anything sent is read." },
  ],
  [
    "src/app/(app)/learn/[runId]/survey/[surveyId]/page.tsx",
    { below: [APPROVED, RUN_LAYOUT], kind: "own", why: "Reads the survey the address names and the caller's own row on it, by their uid, and shows the survey only to somebody that row names; anybody else is told it is not theirs." },
  ],
]);

/**
 * Pages and layouts that read with no gate first, ON PURPOSE. A key ending in
 * `/` is a directory and covers every page under it that reads with no gate.
 */
const OPEN = new Map([
  [
    "src/app/(public)/",
    "The public site: the landing page, events, courses, news, sources, the members directory and the " +
      "application pages. What each reads is published, or is the caller's own once a session is " +
      "asked for, and the fetchers in src/features project what a stranger may be shown.",
  ],
  [
    "src/app/survey/[token]/page.tsx",
    "A survey answered from the personal link in an email, which has no session to send: the random " +
      "secret in the address is the gate, and an unknown one reads nothing more (openLink).",
  ],
  [
    "src/app/feedback/[token]/page.tsx",
    "A programme's anonymous form, which reads no session by design: the random secret in the " +
      "programme's link is the gate (formScreenFor), and the form names nobody.",
  ],
  [
    "src/app/verify-email/[tokenId]/page.tsx",
    "The landing page of an emailed verification link: the signed token in the address is the gate, " +
      "checked before the record it names is read; the session is asked only to say where to go next.",
  ],
  [
    "src/app/links/page.tsx",
    "The public page most printed codes land on: upcoming published events and the page's own " +
      "content, which the fetcher projects (hidden rows and the editor's uid never leave the server).",
  ],
  [
    "src/app/ai-survey/page.tsx",
    "The anonymous AI at Nottingham survey, which reads no session by design: it asks only whether " +
      "the survey is closed. Its admin pages ask surveyAdmin().",
  ],
  [
    "src/app/events/[id]/calendar/page.tsx",
    "Where an event's calendar code lands: getEventForViewer returns an event only to somebody it is " +
      "for, and anybody else is told it is not listed.",
  ],
  [
    "src/app/events/[id]/check-in/page.tsx",
    "Where an event's door code lands, signed in or not: it reads the event's public facts first, as " +
      "the event's own page does, then the session; who may check in is decided by decideSelf and asked " +
      "again by the route behind the button.",
  ],
  [
    "src/app/(app)/anonymous-feedback/page.tsx",
    "The programmes' anonymous form, which reads nothing about its reader on purpose, so that nothing " +
      "it hands the browser can tie an answer to a person: it hands over only this term's programmes, " +
      "each one's round and programme ids, its name and how many weeks it runs. The (app) layout above " +
      "it asks for the session; the route behind the form does not.",
  ],
]);

/**
 * Functions imported from this repository that a component may call before
 * its gate, each with the reason it reads nothing. The claim is checked: the
 * function's own body must contain no Firestore method.
 */
const PURE = {
  getAdminDb: {
    from: "@/lib/firebase/admin",
    why: "obtains the Firestore handle; nothing is read until a method is called on it",
  },
  isAddressableId: {
    from: "@/lib/addressableId",
    why: "a string test on a path segment",
  },
  sessionParamOf: {
    from: "@/features/courses/register/RegisterPageBody",
    why: "which session of a register the address names: a pattern test on a query value",
  },
};

// ---------------------------------------------------------------------------
// Reading a module with the parser
// ---------------------------------------------------------------------------

const DATA_METHODS = new Set(["collection", "collectionGroup", "doc", "runTransaction", "batch", "getAll", "bulkWriter"]);
const REQUEST_INPUTS = new Set(["params", "searchParams"]);

const toRepo = (file) => relative(REPO_ROOT, file).split(sep).join("/");
const isRepositoryModule = (specifier) => specifier.startsWith("@/") || specifier.startsWith(".");
const textOf = (node) => node.getText().replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isClassDeclaration(node) ||
  ts.isClassExpression(node);

function parse(text, name = "page.tsx") {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** A module's value imports (local name to specifier and imported name) and its own top-level functions. */
export function moduleOf(text, name) {
  const file = parse(text, name);
  const imports = new Map();
  const locals = new Map();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      if (clause.name) imports.set(clause.name.text, { specifier, imported: "default" });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { specifier, imported: "*" });
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          imports.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      locals.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          locals.set(declaration.name.text, init);
        }
      }
    }
  }
  return { file, imports, locals };
}

const hasModifier = (node, kind) => (ts.getModifiers?.(node) ?? node.modifiers ?? []).some((m) => m.kind === kind);

/** The functions Next renders from a page or layout: the default export and generateMetadata. */
export function renderersOf(mod) {
  const out = [];
  let component;
  for (const statement of mod.file.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      component = statement.body ? statement : null;
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = statement.expression;
      if (ts.isIdentifier(expression)) component = mod.locals.get(expression.text) ?? null;
      else if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) component = expression;
      else component = null;
    }
  }
  out.push({ name: "default", fn: component ?? null });
  const metadata = mod.locals.get("generateMetadata");
  const exported = mod.file.statements.some(
    (s) =>
      (ts.isFunctionDeclaration(s) && s.name?.text === "generateMetadata" && hasModifier(s, ts.SyntaxKind.ExportKeyword)) ||
      (ts.isVariableStatement(s) &&
        hasModifier(s, ts.SyntaxKind.ExportKeyword) &&
        s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === "generateMetadata")),
  );
  if (metadata && exported) out.push({ name: "generateMetadata", fn: metadata });
  return out;
}

/** The statements of a function body; an expression body is one `return`. */
function statementsOf(fn) {
  if (!fn.body) return [];
  if (ts.isBlock(fn.body)) return [...fn.body.statements];
  return [ts.factory.createReturnStatement(fn.body)];
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression?.(current))
  ) {
    current = current.expression;
  }
  return current;
}

/** The gate `name` is, as imported here: the registry's name, or null. */
function gateNamed(mod, name) {
  const binding = mod.imports.get(name);
  if (!binding || binding.imported === "*" || binding.imported === "default") return null;
  const gate = GATES[binding.imported];
  return gate && gate.from === binding.specifier ? binding.imported : null;
}

function pureNamed(mod, name) {
  const binding = mod.imports.get(name);
  if (!binding) return false;
  const pure = PURE[binding.imported];
  return Boolean(pure) && pure.from === binding.specifier;
}

/**
 * The gate a call is, or null: a registered gate imported by name, or a
 * helper of this file whose own body asks a gate first.
 */
function gateOfCall(call, mod, seen) {
  if (!ts.isCallExpression(call)) return null;
  const callee = unwrap(call.expression);
  if (!ts.isIdentifier(callee)) return null;
  const gate = gateNamed(mod, callee.text);
  if (gate) return gate;
  const helper = mod.locals.get(callee.text);
  if (helper && !seen.has(callee.text)) {
    const inner = readFunction(helper, mod, new Set([...seen, callee.text]), { helper: true });
    if (inner.ok) return `${callee.text} -> ${inner.gate}`;
  }
  return null;
}

/**
 * `params`, `searchParams` (or `props.params`), or an optional one with an
 * empty answer in its place: `searchParams ?? Promise.resolve({})`.
 */
function isRequestInput(node, mod, seen) {
  const item = unwrap(node);
  if (ts.isIdentifier(item)) return REQUEST_INPUTS.has(item.text);
  if (ts.isPropertyAccessExpression(item) && ts.isIdentifier(item.expression)) return REQUEST_INPUTS.has(item.name.text);
  if (ts.isBinaryExpression(item) && item.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const fallback = unwrap(item.right);
    return (
      isRequestInput(item.left, mod, seen) &&
      ts.isCallExpression(fallback) &&
      textOf(fallback.expression) === "Promise.resolve" &&
      readIn(fallback, mod, seen) === null
    );
  }
  return false;
}

/** The gate a top-level statement awaits, or null. In a helper, `return g()` counts too. */
function gateOfStatement(statement, mod, seen, { helper = false } = {}) {
  let expression = null;
  let returned = false;
  if (ts.isExpressionStatement(statement)) expression = statement.expression;
  else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    expression = statement.declarationList.declarations[0].initializer ?? null;
  } else if (helper && ts.isReturnStatement(statement)) {
    expression = statement.expression ?? null;
    returned = true;
  }
  expression = unwrap(expression);
  if (!expression) return null;
  if (ts.isAwaitExpression(expression)) expression = unwrap(expression.expression);
  else if (!returned) return null;
  const direct = gateOfCall(expression, mod, seen);
  if (direct) return direct;
  // One Promise.all that awaits the gate beside nothing but the request's own inputs.
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    textOf(expression.expression) === "Promise.all" &&
    expression.arguments.length === 1 &&
    ts.isArrayLiteralExpression(expression.arguments[0])
  ) {
    let gate = null;
    for (const element of expression.arguments[0].elements) {
      const item = unwrap(element);
      if (isRequestInput(item, mod, seen)) continue;
      const found = gateOfCall(item, mod, seen);
      if (!found || gate) return null;
      gate = found;
    }
    return gate;
  }
  return null;
}

/** The first read inside `node`, anywhere in it, or null. */
function readIn(node, mod, seen) {
  let found = null;
  const visit = (current) => {
    if (found) return;
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const callee = unwrap(current.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const object = unwrap(callee.expression);
        if (DATA_METHODS.has(callee.name.text)) {
          found = `.${callee.name.text}(`;
          return;
        }
        if (ts.isIdentifier(object)) {
          const binding = mod.imports.get(object.text);
          if (binding?.imported === "*" && isRepositoryModule(binding.specifier)) {
            found = `${object.text}.${callee.name.text} (${binding.specifier})`;
            return;
          }
        }
      }
      const named = ts.isIdentifier(callee) ? callee.text : null;
      const reads = (name) => {
        const binding = mod.imports.get(name);
        if (binding && isRepositoryModule(binding.specifier)) {
          if (gateNamed(mod, name) || pureNamed(mod, name)) return null;
          return `${name} (${binding.specifier})`;
        }
        const helper = mod.locals.get(name);
        if (helper && !seen.has(name)) {
          const inner = readIn(helper, mod, new Set([...seen, name]));
          if (inner) return `${name} -> ${inner}`;
        }
        return null;
      };
      if (named) {
        const read = reads(named);
        if (read) {
          found = read;
          return;
        }
      }
      // A repository function or a reading helper handed on to be called (`ids.map(load)`).
      for (const argument of current.arguments ?? []) {
        const item = unwrap(argument);
        if (ts.isIdentifier(item)) {
          const read = reads(item.text);
          if (read) {
            found = read;
            return;
          }
        }
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

/** Whether `node` returns, not counting the returns of functions inside it. */
function returnsIn(node) {
  let found = false;
  const visit = (current) => {
    if (found || isFunctionLike(current)) return;
    if (ts.isReturnStatement(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return found || ts.isReturnStatement(node);
}

/**
 * A function read as the rule reads it: `{ ok, gate, index, before }`.
 * `gate` is the first top-level gate statement's gate and `index` that
 * statement's place; `before` is the first read or return ahead of it, or,
 * with no gate at all, the first read or return in the body.
 */
export function readFunction(fn, mod, seen = new Set(), { helper = false } = {}) {
  const statements = statementsOf(fn);
  let before = null;
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const gate = gateOfStatement(statement, mod, seen, { helper });
    if (gate) return { ok: before === null, gate, index, before, statements };
    if (before) continue;
    const read = readIn(statement, mod, seen);
    if (read) before = `reads (${read})`;
    else if (returnsIn(statement)) before = `returns (line ${lineOf(statement)})`;
  }
  return { ok: false, gate: null, index: -1, before, statements };
}

function lineOf(node) {
  const file = node.getSourceFile?.();
  return file ? file.getLineAndCharacterOfPosition(node.getStart()).line + 1 : "?";
}

/**
 * Whether a component refuses more after its gate: a top-level `if` after the
 * gate statement whose branch redirects, calls notFound, returns or throws,
 * beyond refusing the gate's own empty answer (`if (!user) redirect(...)`).
 */
function refusesAfterGate(read, mod) {
  if (!read.ok) return false;
  const statement = read.statements[read.index];
  const declared = ts.isVariableStatement(statement) ? statement.declarationList.declarations[0].name : null;
  const bound = declared && ts.isIdentifier(declared) ? declared.text : null;
  const refusing = (node) => {
    let found = false;
    const visit = (current) => {
      if (found || isFunctionLike(current)) return;
      if (ts.isReturnStatement(current) || ts.isThrowStatement(current)) {
        found = true;
        return;
      }
      if (ts.isCallExpression(current) && ts.isIdentifier(unwrap(current.expression))) {
        const binding = mod.imports.get(unwrap(current.expression).text);
        if (binding?.specifier === "next/navigation" && (binding.imported === "redirect" || binding.imported === "notFound")) {
          found = true;
          return;
        }
      }
      ts.forEachChild(current, visit);
    };
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return true;
    ts.forEachChild(node, visit);
    return found;
  };
  return read.statements.slice(read.index + 1).some((each) => {
    if (!ts.isIfStatement(each) || !refusing(each.thenStatement)) return false;
    return !(bound && textOf(each.expression) === `!${bound}` && !each.elseStatement);
  });
}

/**
 * What a layout asks of the pages beneath it, or null: its gate's name; or,
 * when that gate asks only whether somebody is signed in and the layout
 * refuses more after it, the layout's own path, standing for the inline
 * question written in `INLINE_QUESTIONS`. A session-only gate would hold the
 * pages beneath to nothing.
 */
function questionOf(path, read, mod) {
  if (!read.ok) return null;
  const gate = read.gate.split(" -> ").pop();
  return SESSION_ONLY.has(gate) && refusesAfterGate(read, mod) ? path : gate;
}

const meets = (gate, question) => gate === question || Boolean(IMPLIES[gate]?.[question]);

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/** Every page.tsx and layout.tsx under src/app outside src/app/api. */
function routeFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== API_DIR) routeFiles(full, out);
    } else if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
      out.push(full);
    }
  }
  return out;
}

function scanPages() {
  const files = routeFiles(APP_DIR);
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const server = files.filter((file) => !isClientModule(sources.get(file)));
  const { unresolved, walks } = walkEachFrom(server, {
    stopAt: (file, source) => ASKING_MODULES.includes(file) || isClientModule(source),
  });
  const pages = [];
  const unreadable = [];
  for (const file of server) {
    const { reached, packages } = walks.get(file);
    const adminChain = reached.get(ADMIN_MODULE) ?? [...packages].find(([s]) => /^firebase-admin(?:\/|$)/.test(s))?.[1];
    // A chain that ends in a module the walk stopped at (the session) is not a read.
    const reads = Boolean(adminChain) && !adminChain.slice(0, -1).some((f) => ASKING_MODULES.includes(f));
    const path = toRepo(file);
    const mod = moduleOf(sources.get(file), path);
    const renderers = renderersOf(mod).map(({ name, fn }) => {
      if (!fn) {
        unreadable.push(`${path}#${name}`);
        return { name, ok: false, gate: null, before: null, readsHere: true };
      }
      return { name, readsHere: Boolean(readIn(fn, mod, new Set())), ...readFunction(fn, mod) };
    });
    const isLayout = path.endsWith("/layout.tsx");
    const component = renderers.find((r) => r.name === "default");
    const question = isLayout && component?.ok ? questionOf(path, component, mod) : null;
    const refusesMore = Boolean(component?.ok) && refusesAfterGate(component, mod);
    pages.push({
      path,
      dir: path.slice(0, path.lastIndexOf("/") + 1),
      isLayout,
      reads,
      chain: adminChain ? adminChain.map(toRepo) : null,
      renderers,
      gate: component?.ok ? component.gate.split(" -> ").pop() : null,
      question,
      refusesMore,
    });
  }
  const layouts = pages.filter((p) => p.isLayout && p.question);
  for (const page of pages) {
    page.above = layouts.filter((l) => l !== page && page.path.startsWith(l.dir));
    page.unmet = page.gate ? page.above.filter((l) => !meets(page.gate, l.question)) : [];
  }
  return { files, server, pages, layouts, unresolved, unreadable };
}

/** Does this page ask first, by rule 2, with no OPEN entry? */
function passes(page) {
  if (!page.reads) return true;
  return page.renderers.every((r) => (r.name === "generateMetadata" && !r.readsHere) || r.ok);
}

function openEntryFor(path) {
  if (OPEN.has(path)) return path;
  for (const key of OPEN.keys()) if (key.endsWith("/") && path.startsWith(key)) return key;
  return null;
}

/** An exported function's or constant's declaration in the module a specifier names. */
function exportedIn(specifier, name) {
  const base = join(SRC_DIR, specifier.slice(2));
  const file = [`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
  if (!file) return null;
  const mod = moduleOf(readFileSync(file, "utf8"), file);
  for (const statement of mod.file.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return { mod, fn: statement, init: null };
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) continue;
        const init = declaration.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return { mod, fn: init, init };
        // `cache(async (...) => { ... })`: the function it memoises.
        if (ts.isCallExpression(init)) {
          const inner = init.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
          return { mod, fn: inner ?? null, init };
        }
        return { mod, fn: null, init };
      }
    }
  }
  return null;
}

/** Each way a gate's own body falls short of the predicate it claims. */
export function proofGaps(found, proof) {
  const gaps = [];
  if (proof.is !== undefined) {
    if (!found.init || textOf(found.init) !== proof.is) gaps.push(`it is not ${proof.is}`);
    return gaps;
  }
  if (!found.fn) return ["its body cannot be found"];
  const statements = statementsOf(found.fn);
  if (proof.verifies) {
    let calls = false;
    const visit = (node) => {
      if (calls) return;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === proof.verifies) calls = true;
      else ts.forEachChild(node, visit);
    };
    visit(found.fn);
    if (!calls) gaps.push(`it never calls .${proof.verifies}(`);
  }
  if (proof.first) {
    const awaited = statements
      .map((s) => {
        const e = ts.isVariableStatement(s)
          ? s.declarationList.declarations[0]?.initializer
          : ts.isExpressionStatement(s)
            ? s.expression
            : null;
        const inner = e && ts.isAwaitExpression(unwrap(e)) ? unwrap(unwrap(e).expression) : null;
        return inner && ts.isCallExpression(inner) && ts.isIdentifier(unwrap(inner.expression)) ? unwrap(inner.expression).text : null;
      })
      .find(Boolean);
    if (awaited !== proof.first) gaps.push(`the first call it awaits is ${awaited ?? "nothing"}, not ${proof.first}`);
  }
  for (const [name, expected] of Object.entries(proof.defines ?? {})) {
    const declared = statements
      .filter(ts.isVariableStatement)
      .flatMap((s) => [...s.declarationList.declarations])
      .find((d) => ts.isIdentifier(d.name) && d.name.text === name);
    if (!declared?.initializer || textOf(declared.initializer) !== expected) gaps.push(`${name} is not ${expected}`);
  }
  for (const condition of proof.refuses ?? []) {
    const refusal = statements.find((s) => ts.isIfStatement(s) && textOf(s.expression) === condition);
    const refuses =
      refusal &&
      (ts.isReturnStatement(refusal.thenStatement) ||
        ts.isThrowStatement(refusal.thenStatement) ||
        /\b(?:redirect|notFound)\(|\breturn\b|\bthrow\b/.test(refusal.thenStatement.getText()));
    if (!refuses) gaps.push(`it does not refuse when ${condition}`);
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

const { files, server, pages, layouts, unresolved, unreadable } = scanPages();

describe("every server page that reads asks who is calling first", () => {
  test("the scan is not vacuous, and it could read and resolve everything", () => {
    assert.ok(files.length > 150, `only ${files.length} pages and layouts found under src/app`);
    assert.ok(server.length > 150, `only ${server.length} server pages and layouts found`);
    const reading = pages.filter((p) => p.reads).length;
    assert.ok(reading > 100, `only ${reading} pages found that reach the Admin SDK; the walk is broken`);
    assert.ok(layouts.length >= 10, `only ${layouts.length} layouts found that ask a question; the tree reading is broken`);
    assert.deepEqual(unresolved, [], "an import the walk cannot follow is a page it has not checked");
    assert.deepEqual(
      unreadable,
      [],
      "a component this scan cannot find is a component it cannot check. Use `export default " +
        "async function Name(...)`, or teach this file the new form.",
    );
  });

  test("the first gate comes before the first read and the first return, or the page is in OPEN", () => {
    const failures = [];
    for (const page of pages) {
      if (passes(page) || openEntryFor(page.path)) continue;
      for (const r of page.renderers) {
        if (r.ok || (r.name === "generateMetadata" && !r.readsHere)) continue;
        if (r.gate) failures.push(`${page.path}#${r.name} ${r.before} before its gate (${r.gate}).`);
        else {
          failures.push(
            `${page.path}#${r.name} reaches the Admin SDK (${page.chain.join(" -> ")}) and awaits no gate at ` +
              `the top level of its body${r.before ? `; it ${r.before} first` : ""}.`,
          );
        }
      }
    }
    assert.deepEqual(
      failures,
      [],
      `\n${failures.join("\n")}\n\nAwait a gate from GATES as the body's first statement that does anything, ` +
        "or add an OPEN entry with the reason the page is open.\n",
    );
  });

  test("a page asks at least what every layout above it asks, or is in ASKS_LESS", () => {
    const failures = [];
    for (const page of pages) {
      if (!page.reads || !page.gate || page.unmet.length === 0) continue;
      const entry = ASKS_LESS.get(page.path);
      const listed = new Set(entry?.below ?? []);
      for (const layout of page.unmet) {
        if (listed.has(layout.path)) continue;
        const asks = INLINE_QUESTIONS[layout.question]?.asks ?? layout.question;
        failures.push(`${page.path} asks ${page.gate}, and ${layout.path} above it asks ${asks}.`);
      }
    }
    assert.deepEqual(
      failures,
      [],
      `\n${failures.join("\n")}\n\nCall the layout's gate (or one IMPLIES says asks as much) first, or, if the ` +
        "page reads nothing but the caller's own rows or public data, add an ASKS_LESS entry with the reason.\n",
    );
  });

  test("every layout that refuses more after a session-only gate has its question written down, and every entry is such a layout", () => {
    const inline = new Set(layouts.filter((l) => l.question === l.path).map((l) => l.path));
    const failures = [];
    for (const path of inline) {
      if (!INLINE_QUESTIONS[path]) failures.push(`${path} refuses more after a session-only gate. Write its question in INLINE_QUESTIONS.`);
    }
    for (const [path, entry] of Object.entries(INLINE_QUESTIONS)) {
      if (!inline.has(path)) failures.push(`INLINE_QUESTIONS["${path}"] is not a layout that refuses more after a session-only gate. Delete the entry.`);
      assert.ok(entry.asks.length > 15 && entry.why.length > 15, `INLINE_QUESTIONS["${path}"] needs its question and reason.`);
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every IMPLIES entry is used, in both directions", () => {
    const used = new Set();
    for (const page of pages) {
      if (!page.reads || !page.gate) continue;
      for (const layout of page.above) {
        if (page.gate !== layout.question && IMPLIES[page.gate]?.[layout.question]) used.add(`${page.gate} => ${layout.question}`);
      }
    }
    const failures = [];
    for (const [gate, questions] of Object.entries(IMPLIES)) {
      if (!GATES[gate]) failures.push(`IMPLIES["${gate}"] names no gate in GATES.`);
      for (const [question, why] of Object.entries(questions)) {
        if (!GATES[question] && !INLINE_QUESTIONS[question]) failures.push(`IMPLIES["${gate}"]["${question}"] names no question.`);
        if (!used.has(`${gate} => ${question}`)) failures.push(`IMPLIES["${gate}"]["${question}"] is used by no page. Delete it.`);
        assert.ok(why.length > 20, `IMPLIES["${gate}"]["${question}"] needs its reason.`);
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every ASKS_LESS entry is still needed, in both directions", () => {
    const failures = [];
    for (const [path, entry] of ASKS_LESS) {
      assert.ok(entry.why.length > 40, `ASKS_LESS["${path}"] needs its reason written out.`);
      const page = pages.find((p) => p.path === path);
      if (!page) {
        failures.push(`${path} is in ASKS_LESS but is not a server page or layout any more. Delete the entry.`);
        continue;
      }
      if (!page.reads) failures.push(`${path} is in ASKS_LESS but no longer reaches the Admin SDK. Delete the entry.`);
      const unmet = new Set(page.unmet.map((l) => l.path));
      for (const layout of entry.below) {
        if (!unmet.has(layout)) failures.push(`${path} is in ASKS_LESS below ${layout}, and now asks what it asks. Delete that.`);
      }
      if (entry.kind === "own" && !SESSION_ONLY.has(page.gate)) {
        failures.push(`${path} is in ASKS_LESS as reading only its own rows, and asks ${page.gate}, which is more than the session.`);
      } else if (entry.kind === "door") {
        const gateRefuses = (GATES[page.gate]?.proof.refuses ?? []).length > 1;
        if (!page.refusesMore && !gateRefuses) failures.push(`${path} is in ASKS_LESS as asking its own door, and refuses nothing after its gate.`);
      } else if (entry.kind !== "own") {
        failures.push(`${path} is in ASKS_LESS with no kind.`);
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every OPEN entry is still needed, in both directions", () => {
    const failures = [];
    for (const [key, why] of OPEN) {
      assert.ok(why.length > 60, `OPEN["${key}"] needs its reason written out.`);
      const covered = pages.filter((p) => (key.endsWith("/") ? p.path.startsWith(key) : p.path === key));
      if (!key.endsWith("/")) {
        const page = covered[0];
        if (!page) failures.push(`${key} is in OPEN but is not a server page or layout any more. Delete the entry.`);
        else if (!page.reads) failures.push(`${key} is in OPEN but no longer reaches the Admin SDK. Delete the entry.`);
        else if (passes(page)) failures.push(`${key} is in OPEN but now asks who is calling first. Delete the entry.`);
        continue;
      }
      if (!covered.some((p) => !passes(p))) {
        failures.push(`${key} is in OPEN but no page under it reads with no gate first. Delete the entry.`);
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every gate's own body holds the predicate it claims, and every gate is used", () => {
    const failures = [];
    const used = new Set(pages.map((p) => p.gate).filter(Boolean));
    for (const [name, gate] of Object.entries(GATES)) {
      const found = exportedIn(gate.from, name);
      if (!found) {
        failures.push(`GATES["${name}"] says it is exported from ${gate.from}, and it is not.`);
        continue;
      }
      for (const gap of proofGaps(found, gate.proof)) failures.push(`GATES["${name}"] claims ${gate.proves}, and ${gap}.`);
      if (!used.has(name)) failures.push(`GATES["${name}"] is the gate of no page or layout. Delete the entry.`);
      assert.ok(gate.why.length > 15, `GATES["${name}"] needs a reason.`);
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every PURE function reads nothing", () => {
    for (const [name, entry] of Object.entries(PURE)) {
      const found = exportedIn(entry.from, name);
      assert.ok(found?.fn, `PURE["${name}"] says it is exported from ${entry.from}, and it is not.`);
      let touch = null;
      const visit = (node) => {
        if (touch) return;
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && DATA_METHODS.has(node.expression.name.text)) {
          touch = node.expression.name.text;
        } else ts.forEachChild(node, visit);
      };
      visit(found.fn);
      assert.equal(touch, null, `PURE["${name}"] calls .${touch}(, so it reads.`);
      assert.ok(entry.why.length > 15, `PURE["${name}"] needs a reason.`);
    }
  });
});

// ---------------------------------------------------------------------------
// The scanner, on synthetic components
// ---------------------------------------------------------------------------

describe("the scanner reads order the way the rule means it", () => {
  const header =
    'import { requireAdminPage } from "@/lib/firebase/pageGates";\n' +
    'import { getAdminDb } from "@/lib/firebase/admin";\n' +
    'import { redirect } from "next/navigation";\n' +
    'import * as repo from "@/lib/thing/repo";\n' +
    'import { loadThing } from "@/lib/thing";\n';
  const read = (text) => {
    const mod = moduleOf(`${header}${text}`, "synthetic.tsx");
    return readFunction(renderersOf(mod)[0].fn, mod);
  };
  const fails = (text, why) => assert.equal(read(text).ok, false, why);

  test("a gate first, then a read, passes", () => {
    const r = read(`export default async function P({ params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      await requireAdminPage();
      const db = getAdminDb();
      return await loadThing(db, id);
    }`);
    assert.equal(r.ok, true);
    assert.equal(r.gate, "requireAdminPage");
  });

  test("a gate bound to a name, and a gate beside params in one Promise.all, pass", () => {
    assert.equal(read(`export default async function P() { const user = await requireAdminPage(); return loadThing(user); }`).ok, true);
    const beside = read(`export default async function P({ params }: { params: Promise<{ id: string }> }) {
      const [{ id }, user] = await Promise.all([params, requireAdminPage()]);
      return loadThing(getAdminDb(), id, user);
    }`);
    assert.equal(beside.ok, true);
    const optional = read(`export default async function P({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ q?: string }> }) {
      const [{ id }, query, user] = await Promise.all([params, searchParams ?? Promise.resolve({} as { q?: string }), requireAdminPage()]);
      return loadThing(getAdminDb(), id, query, user);
    }`);
    assert.equal(optional.ok, true);
    const fallbackReads = read(`export default async function P({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
      const [query, user] = await Promise.all([searchParams ?? Promise.resolve(loadThing()), requireAdminPage()]);
      return [query, user];
    }`);
    assert.equal(fallbackReads.ok, false, "a fallback that reads is a read beside the gate");
  });

  test("a read before the gate fails", () => {
    const r = read(`export default async function P() {
      const db = getAdminDb();
      const thing = await db.collection("x").get();
      await requireAdminPage();
      return thing;
    }`);
    assert.equal(r.ok, false);
    assert.match(r.before, /reads \(\.collection\(\)/);
  });

  test("a gate awaited beside a read in one Promise.all fails", () => {
    fails(`export default async function P() {
      const [user, thing] = await Promise.all([requireAdminPage(), loadThing(getAdminDb())]);
      return [user, thing];
    }`);
  });

  test("a helper the file defines counts as the gate where it is awaited", () => {
    const r = read(`async function ask() {
      return requireAdminPage();
    }
    export default async function P() {
      await ask();
      return loadThing(getAdminDb());
    }`);
    assert.equal(r.ok, true);
    assert.equal(r.gate, "ask -> requireAdminPage");
  });

  test("a gate named in a comment or a string is not a gate", () => {
    fails(`export default async function P() {
      // await requireAdminPage() is asked by the layout
      const label = "await requireAdminPage()";
      return loadThing(getAdminDb(), label);
    }`);
  });

  test("a gate on one branch only fails", () => {
    fails(`export default async function P({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
      const { a } = await searchParams;
      if (a) await requireAdminPage();
      return loadThing(getAdminDb());
    }`);
    fails(`export default async function P() {
      if (Math.random() > 0.5) { await requireAdminPage(); } else { redirect("/"); }
      return loadThing(getAdminDb());
    }`, "a gate on one branch and a redirect on the other is still not asked of everybody");
  });

  test("a gate called without await fails", () => {
    fails(`export default async function P() {
      requireAdminPage();
      return loadThing(getAdminDb());
    }`);
    fails(`export default async function P() {
      const pending = requireAdminPage();
      const thing = await loadThing(getAdminDb());
      await pending;
      return thing;
    }`);
  });

  test("a gate only inside a try, a catch, a callback or an arrow nobody calls fails", () => {
    fails(`export default async function P() {
      try { await requireAdminPage(); } catch { redirect("/"); }
      return loadThing(getAdminDb());
    }`, "inside a try");
    fails(`export default async function P() {
      try { JSON.parse("{"); } catch { await requireAdminPage(); }
      return loadThing(getAdminDb());
    }`, "inside a catch");
    fails(`export default async function P() {
      [1].forEach(async () => { await requireAdminPage(); });
      return loadThing(getAdminDb());
    }`, "inside a callback");
    fails(`export default async function P() {
      const ask = async () => { await requireAdminPage(); };
      return loadThing(getAdminDb());
    }`, "inside an arrow nobody calls");
  });

  test("a read through a namespace import of a repository module fails", () => {
    const r = read(`export default async function P() {
      const thing = await repo.load("x");
      await requireAdminPage();
      return thing;
    }`);
    assert.equal(r.ok, false);
    assert.match(r.before, /repo\.load \(@\/lib\/thing\/repo\)/);
  });

  test("a return before the gate fails, a child server component included", () => {
    fails(`export default async function P({ params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      if (!id) return null;
      await requireAdminPage();
      return loadThing(getAdminDb(), id);
    }`, "an early return");
    fails(`async function Inner() { await requireAdminPage(); return loadThing(getAdminDb()); }
    export default async function P() {
      return <Inner />;
    }`, "a child server component returned");
  });

  test("a helper that reads, called before the gate, is a read where it is called", () => {
    const r = read(`async function fetchIt() { return loadThing(getAdminDb()); }
    export default async function P() {
      const thing = await fetchIt();
      await requireAdminPage();
      return thing;
    }`);
    assert.equal(r.ok, false);
    assert.match(r.before, /fetchIt -> loadThing/);
  });

  test("a layout's question is its gate's, or its own when it refuses more after a session-only gate", () => {
    const questionFor = (text) => {
      const mod = moduleOf(
        'import { getCurrentUser } from "@/lib/firebase/session";\n' + `${header}${text}`,
        "layout.tsx",
      );
      return questionOf("L", readFunction(renderersOf(mod)[0].fn, mod), mod);
    };
    assert.equal(questionFor(`export default async function L({ children }) { await requireAdminPage(); return children; }`), "requireAdminPage");
    assert.equal(
      questionFor(`export default async function L({ children }) { const user = await getCurrentUser(); if (!user) redirect("/login"); return children; }`),
      "getCurrentUser",
      "refusing nobody signed in is the session's own question",
    );
    assert.equal(
      questionFor(`export default async function L({ children }) {
        const user = await getCurrentUser();
        if (!user) redirect("/login");
        if (user.role !== "admin") redirect("/dashboard");
        return children;
      }`),
      "L",
    );
    assert.equal(
      questionFor(`export default async function L({ children }) {
        const user = await getCurrentUser();
        if (!user || user.role === "pending") return null;
        return children;
      }`),
      "L",
      "a refusal by return is a refusal",
    );
    assert.equal(questionFor(`export default async function L({ children }) { return children; }`), null, "no gate, no question");
    assert.equal(meets("requireAdminPage", "requireCourseAuthorPage"), true);
    assert.equal(meets("getCurrentUser", "requireAdminPage"), false);
    assert.equal(meets("getRunAccess", APPROVED), false);
  });

  test("a gate's refusal is held to its exact text, strings and all", () => {
    const at = (body) => {
      const mod = moduleOf(`export async function g() { ${body} }`, "gate.ts");
      return proofGaps({ mod, fn: mod.locals.get("g"), init: null }, { first: "getCurrentUser", refuses: ['!user || user.role !== "admin"'] });
    };
    assert.deepEqual(at('const user = await getCurrentUser(); if (!user || user.role !== "admin") redirect("/dashboard"); return user;'), []);
    assert.equal(at('const user = await getCurrentUser(); if (!user || user.role !== "member") redirect("/dashboard"); return user;').length, 1);
    assert.equal(at('const user = await getCurrentUser(); if (!user || user.role !== "") redirect("/dashboard"); return user;').length, 1);
    assert.equal(at('const user = await getCurrentUser(); return user;').length, 1, "no refusal at all");
    assert.equal(at('const user = await loadSomebody(); if (!user || user.role !== "admin") redirect("/dashboard"); return user;').length, 1, "asks something else first");
  });
});
