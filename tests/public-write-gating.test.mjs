/**
 * AN ENDPOINT A STRANGER CAN DRIVE TO A SIDE EFFECT IS GATED LIKE ONE.
 *
 * WHY. A public endpoint that answers a submission by writing a row and
 * posting an email to an address the caller chose, carrying a greeting name
 * and free-text answers the caller also chose, is an outbound mailer signed by
 * the society. `POST /api/events/[id]/rsvp` is one, so it is gated the way
 * `/api/register` is: a per-IP throttle before any document is read, a
 * per-address throttle after the format check, and reCAPTCHA.
 *
 * The class is wider than one route, so the guard walks the tree:
 *
 *  1. THE SCAN decides, per exported handler under `src/app/api`, whether an
 *     anonymous caller reaches its body. A handler is session-required only
 *     when a refusal keyed on an identity the session gate returned sits at
 *     the TOP LEVEL of the handler. A refusal nested inside another condition,
 *     such as `if (visibility === "members") { if (!viewer) return refuse(); }`,
 *     is not a gate, so a checker that asked whether the file mentions a
 *     session at all would call that handler gated. Nor is a refusal that
 *     holds only when something else is missing too, such as the self
 *     check-in's `if (!parsed.token && !user)`: a caller with no session who
 *     brings the token reaches the body, so the scan reads that handler as
 *     reached THROUGH what they bring, and it is anonymous-reachable.
 *  2. THE REGISTRY answers for each one what it does and what gates it, with a
 *     written reason. Both directions. A handler the scan calls
 *     anonymous-reachable and the registry does not name FAILS, so a new
 *     public route arrives already having to answer the question.
 *  3. THE RULE. An anonymous handler that SENDS to a caller-chosen address
 *     carries a rate limit, and either a captcha or a per-address cooldown
 *     that bounds how often one address can be written to. One that WRITES
 *     carries a rate limit or a credential the caller had to present. One
 *     reached THROUGH something a caller with no session brings names the
 *     credential that checks it. Every literal named is checked against the
 *     file rather than believed.
 *
 * The runtime half is `scripts/e2e/tests/public-write-gating.test.mjs`, which
 * asks a deployed backend whether the RSVP captcha is really live, the same
 * way `recaptcha-gate.test.mjs` asks it of `/api/register`. A gate that is
 * configured out of existence on one backend is invisible to a source scan.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";
import {
  HTTP_METHOD,
  UNREADABLE_EXPORT,
  assertReadableSource,
  balancedParens,
  braceDepths,
  handlerBody,
  readsAsAbsence,
  walkRoutes,
} from "./lib/routeScan.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(REPO_ROOT, "src", "app", "api");

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------
//
// Reading a route file as handlers (which functions are exported, where each
// body starts and ends, how a condition reads as "no session") is shared with
// tests/gate-before-data.test.mjs through tests/lib/routeScan.mjs. What is
// particular to this guard is below: which gates hand out an identity, and
// whether the refusal keyed on one sits at the handler's TOP LEVEL.

/** The session gates a handler can hold an identity from. */
const SESSION_GATES = [
  "getCurrentUser",
  "getSessionUid",
  "requireApplicant",
  "requireAdminPage",
  "requireCourseAuthorPage",
  "requireAdmissionsPage",
  "requireMembershipPage",
];

const ASSIGNMENT = new RegExp(
  `(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+(?:${SESSION_GATES.join("|")})\\s*\\(`,
  "g",
);

const HANDLER = new RegExp(`export\\s+async\\s+function\\s+(${HTTP_METHOD})\\s*\\(`, "g");

/**
 * The pieces of a condition at its top level, split on `op` ("||" or "&&").
 * Brackets of every kind nest, and the scanner's reading has already emptied
 * every string, so an operator inside either is never split on.
 */
function splitTopLevel(text, op) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0 && text.startsWith(op, i)) {
      parts.push(text.slice(start, i));
      i += op.length - 1;
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim());
}

/** A condition without the parentheses that wrap the whole of it, however many. */
function unwrap(text) {
  let inner = text.trim();
  while (inner.startsWith("(") && balancedParens(inner, 0).length === inner.length - 2) inner = inner.slice(1, -1).trim();
  return inner;
}

/**
 * HOW A TOP-LEVEL CONDITION TREATS A CALLER WITH NO SESSION:
 *
 *  - "session": it refuses every one of them, whatever else they bring:
 *    `!user`, `!user || !canDoIt(user)`, or `!user && !applicant` with both
 *    held from a session gate;
 *  - "or-else": it refuses one only when something else is missing too, so a
 *    caller with no session who brings that something reaches the body. The
 *    self check-in's `!parsed.token && !user` is one: the something is the
 *    token from a guest's own confirmation email;
 *  - null: the session has nothing to do with it.
 *
 * A disjunction refuses everybody with no session when any of its parts
 * does, a conjunction only when every one of its parts does. Each single
 * part is read by `readsAsAbsence`, the shapes the tree uses for "there is no
 * session".
 */
export function sessionRefusal(condition, identities) {
  const term = unwrap(condition);
  const ors = splitTopLevel(term, "||");
  if (ors.length > 1) {
    const kinds = ors.map((part) => sessionRefusal(part, identities));
    if (kinds.includes("session")) return "session";
    return kinds.includes("or-else") ? "or-else" : null;
  }
  const ands = splitTopLevel(term, "&&");
  if (ands.length > 1) {
    const kinds = ands.map((part) => sessionRefusal(part, identities));
    if (kinds.every((kind) => kind === "session")) return "session";
    return kinds.some((kind) => kind !== null) ? "or-else" : null;
  }
  return identities.some((v) => readsAsAbsence(term, v)) ? "session" : null;
}

/**
 * WHO REACHES A HANDLER'S BODY WITH NO SESSION, from its top-level refusals,
 * in order:
 *
 *  - "session": nobody; a refusal of every caller with no session leaves
 *    before the body does anything;
 *  - "through": a caller who brings what an "or-else" refusal asks for in
 *    place of a session (a token, a signed link), when no later refusal turns
 *    them away;
 *  - "open": anybody; nothing at its top level refuses on the session.
 *
 * A refusal nested inside another condition holds only on that branch, so it
 * is not one. And a refusal has to leave: `if (!user) user = anon;` is not one.
 */
export function handlerReach(body, identities) {
  const depths = braceDepths(body);
  let through = false;
  const ifs = /\bif\s*\(/g;
  let branch;
  while ((branch = ifs.exec(body)) !== null) {
    if (depths[branch.index] !== 0) continue; // nested: conditional on something else
    const paren = body.indexOf("(", branch.index);
    const kind = sessionRefusal(balancedParens(body, paren), identities);
    if (kind === null) continue;
    if (!/\breturn\b/.test(body.slice(paren, paren + 400))) continue;
    if (kind === "session") return "session";
    through = true;
  }
  return through ? "through" : "open";
}

/**
 * Every exported handler under `src/app/api` an anonymous caller reaches,
 * keyed `path#METHOD`, and among them (`through`) those reached only by
 * bringing something in place of a session.
 */
export function scanAnonymousHandlers() {
  const anonymous = new Set();
  const through = new Set();
  const unreadable = [];
  for (const file of walkRoutes(API_DIR)) {
    const raw = readFileSync(file, "utf8");
    const source = stripSource(raw);
    const path = relative(REPO_ROOT, file).split("\\").join("/");
    assertReadableSource(raw, source, path);
    if (UNREADABLE_EXPORT.test(source)) {
      unreadable.push(`${path} (a handler is exported in a form this scan cannot read)`);
    }
    const identities = new Set();
    ASSIGNMENT.lastIndex = 0;
    let assigned;
    while ((assigned = ASSIGNMENT.exec(source)) !== null) identities.add(assigned[1]);

    HANDLER.lastIndex = 0;
    let handler;
    while ((handler = HANDLER.exec(source)) !== null) {
      const body = handlerBody(source, handler.index);
      if (body === null) {
        unreadable.push(`${path}#${handler[1]}`);
        continue;
      }
      const reach = handlerReach(body, [...identities]);
      if (reach !== "session") anonymous.add(`${path}#${handler[1]}`);
      if (reach === "through") through.add(`${path}#${handler[1]}`);
    }
  }
  return { anonymous, through, unreadable };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * One entry per handler the scan reaches without a session.
 *
 *  - `anonymous: false` the scan cannot see this handler's gate, because it
 *    sits inside a helper in the same file. `gatedBy` names a literal that
 *    must be there, and the file must carry a 401. Reported rather than
 *    resolved, because resolving a gate through a helper is the
 *    gate-before-data guard's job and duplicating half of it here would leave
 *    two answers to one question.
 *  - `anonymous: true` a stranger reaches the body. Then:
 *      `sends`      it posts a message to an address the caller can choose.
 *                   Needs `throttle`, and `captcha` or `cooldown`.
 *      `writes`     it changes a document. Needs `throttle` or `credential`.
 *      neither      read-only, or it only touches the caller's own cookie.
 *
 * Every literal named is checked against the file.
 */
const PUBLIC_HANDLERS = new Map([
  // --- the public event RSVP -------------------------------------------------
  [
    "src/app/api/events/[id]/rsvp/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      throttle: "rateLimit(`events:rsvp:ip:${ip}`",
      captcha: "verifyRecaptcha(recaptchaToken)",
      why:
        "The public RSVP. A stranger chooses the address, the greeting name and the free-text " +
        "answers, and an accepted submission writes a row and posts a NAISI-branded email to " +
        "that address. Gated the way /api/register is: the per-IP " +
        "throttle runs before the session lookup and before any document is read, the " +
        "per-address throttle after the format check, and reCAPTCHA before the event is " +
        "fetched.",
    },
  ],

  // --- the other public writers, each already gated ------------------------
  [
    "src/app/api/register/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      throttle: "rateLimit(`register:ip:${ip}`",
      captcha: "verifyRecaptcha(recaptchaToken)",
      why:
        "Account creation from an address a stranger types. The pattern every other public " +
        "writer here is measured against.",
    },
  ],
  [
    "src/app/api/register/resend/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      throttle: "rateLimit(`resend:ip:${ip}`",
      cooldown: "COOLDOWN_SECONDS",
      why:
        "Re-sends a verification link. It can only ever mail an address that already has an " +
        "unverified registration row, so it addresses nobody new, and it answers every " +
        "outcome with one uniform body. Both throttle axes run before the Firestore read.",
    },
  ],
  [
    "src/app/api/subscriptions/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      throttle: "rateLimit(`subscriptions:ip:${ip}`",
      cooldown: "COOLDOWN_SECONDS",
      why:
        "The public subscribe form. It mails a confirmation to an address a stranger types, " +
        "which is the RSVP shape, and it carries a per-IP throttle and a sixty-second " +
        "per-(address, channel) cooldown. The cooldown bounds one address to one message a " +
        "minute while the rate limit bounds the spread.",
    },
  ],
  [
    "src/app/api/q/[slug]/route.ts#GET",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "A short link, naisi.uk/q/<slug>. It reads one tracked link and renders a redirect to " +
        "where that link goes. Read-only on purpose: link previews and mail scanners fetch a GET, " +
        "so the scan is counted by the POST below, fired from the page the redirect lands on.",
    },
  ],
  [
    "src/app/api/q/[slug]/scan/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      throttle: "rateLimit(`q:scan:ip:${ip}`",
      why:
        "The scan counter for printed QR codes, fired by the page a scan lands on. There is no " +
        "session to require: the person scanning a poster has no account. The per-IP throttle " +
        "runs first, only a link that exists is counted, and the write is an increment on a " +
        "bounded per-link per-day document with no caller-controlled field.",
    },
  ],

  // --- credentials: the caller presented something --------------------------
  [
    "src/app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      credential: "verifyRsvpToken",
      why:
        "An attendee freeing their own place from the link in their confirmation email. The " +
        "signed token IS the credential, and it names one RSVP row, so there is no address " +
        "for a caller to choose.",
    },
  ],
  [
    "src/app/api/events/[id]/rsvp/[rsvpId]/request-change/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      credential: "verifyRsvpToken",
      why:
        "The same signed token on the same row, asking an organiser for a change rather than " +
        "cancelling. The token names the row, so there is no address to choose.",
    },
  ],
  [
    "src/app/api/events/[id]/check-in/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      throttle: "rateLimit(`events:check-in:ip:${clientIp(req)}`",
      credential: "decideSelf(",
      why:
        "Checking yourself in at an event, on the page its door code lands on: signed in, or with no session and " +
        "the link from a guest's own confirmation email, `{ rsvpId, token }`. The token is signed for that one " +
        "sign-up and `decideSelf` checks it (verifyRsvpToken) before anything is written, so a wrong one checks " +
        "nobody in, and a session is asked for only when there is no token. A per-address throttle runs first, " +
        "generous because a hall full of phones shares one address. The one write is a check-in record for that " +
        "sign-up or that account, and nothing is emailed.",
    },
  ],
  [
    "src/app/api/unsubscribe/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      credential: "verifyToken",
      why:
        "The signed unsubscribe link. POST commits, because a mail scanner that fetches URLs " +
        "must not unsubscribe somebody on their behalf.",
    },
  ],
  [
    "src/app/api/unsubscribe/route.ts#GET",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "The preview page behind the same link. It renders a confirm form and writes nothing, " +
        "which is what stops an inbox scanner unsubscribing the recipient on their behalf.",
    },
  ],
  [
    "src/app/api/subscriptions/confirm/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      credential: "verifyToken",
      why:
        "The double opt-in commit, behind the signed token from the confirmation email. It is " +
        "separate from the GET preview for the same scanner reason as the unsubscribe link.",
    },
  ],
  [
    "src/app/api/subscriptions/confirm/route.ts#GET",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "The preview half of the same link. It reads the token and renders a confirm button, " +
        "and changes nothing: a mail scanner that fetches URLs must not opt somebody in.",
    },
  ],
  [
    "src/app/api/verify-email/confirm/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      credential: "confirmUniEmailVerification(",
      why:
        "The university-email magic link. The token is the credential, and the confirming " +
        "request must ALSO be the account the token was minted for, which is checked inside " +
        "`confirmUniEmailVerification` rather than here.",
    },
  ],
  [
    "src/app/api/webhooks/resend-events/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      credential: "verifySvixSignature(",
      why:
        "The delivery webhook. The signature is the credential; an unsigned request is refused " +
        "before anything is read. `tests/webhook-verification.test.mjs` is the guard for that " +
        "class.",
    },
  ],
  [
    "src/app/api/scheduler/tick/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: true,
      credential: "SCHEDULER_SECRET",
      why:
        "The scheduler's own door, opened by a shared secret the scheduler presents on every " +
        "tick. Nothing about the request comes from a person.",
    },
  ],
  [
    "src/app/api/auth/session/route.ts#POST",
    {
      anonymous: true,
      writes: false,
      sends: false,
      credential: "verifyIdToken",
      why:
        "Mints the session cookie from a Firebase ID token. The token is the credential, and " +
        "it must be anonymous-reachable: it is how a session begins.",
    },
  ],
  [
    "src/app/api/auth/session/route.ts#DELETE",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "Signing out. It clears the caller's own cookie and, outside a view-as session, revokes " +
        "their own refresh tokens. Nothing another person holds is touched.",
    },
  ],
  [
    "src/app/api/auth/session/clear/route.ts#POST",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "Clears a stale cookie so a broken session can be recovered from. It writes no " +
        "document and revokes nothing, which is the whole reason it is separate from DELETE " +
        "above.",
    },
  ],
  [
    "src/app/api/auth/google/callback/route.ts#POST",
    {
      anonymous: true,
      writes: false,
      sends: false,
      credential: "verifyIdToken({",
      why:
        "The Google sign-in callback. It reads the posted credential, checks the CSRF " +
        "double-submit cookie and verifies the token against Google's keys, then hands it on " +
        "in a cookie. No document is written and no message is sent, and it must be reachable " +
        "without a session because it is how one begins.",
    },
  ],
  [
    "src/app/api/courses/calendar/[token]/sessions.ics/route.ts#GET",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "A person's calendar, fetched by their calendar app, which has no session: the secret in the address " +
        "opens it. Read-only, and what it may carry is tests/course-hub-calendar-feed.test.mjs's subject.",
    },
  ],
  [
    "src/app/api/events/[id]/calendar.ics/route.ts#GET",
    {
      anonymous: true,
      writes: false,
      sends: false,
      why:
        "The public calendar feed for a published event. Read-only, and what it says about a " +
        "hidden location is `tests/event-location-disclosure.test.mjs`'s subject.",
    },
  ],
  [
    "src/app/api/admin/impersonate/exit/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      credential: "getImpersonator",
      why:
        "Ends a view-as session. The marker cookie is the credential: it names the " +
        "`impersonations` audit row to close, which is closed only when its actor matches the " +
        "marker and it is still open, and the marker and the borrowed session cookie are then " +
        "cleared.",
    },
  ],

  [
    "src/app/api/feedback/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      throttle: "rateLimit(`feedback:answer:ip:${clientIp(req)}`",
      credential: "formByToken(",
      why:
        "An answer to a programme's anonymous keep, change and drop form, which never asks who is sending it. " +
        "The 32-byte secret in the programme's one link IS the credential: a wrong one opens nothing, and a " +
        "closed form takes nothing. An in-memory per-address throttle runs first and keeps no address, and a " +
        "second, per form, after the secret; the one write is the three answers, the programme and the day, " +
        "and nothing is emailed.",
    },
  ],
  [
    "src/app/api/surveys/answer/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      throttle: "rateLimit(`surveys:answer:ip:${clientIp(req)}`",
      credential: "openLink(",
      why:
        "A person's answers to a survey, from the personal link in their email, with no session to require. The " +
        "32-byte secret IS the credential: it opens that person's own row and nobody else's, a wrong one opens " +
        "nothing, and a survey's test link keeps nothing. An in-memory per-IP throttle runs first and keeps no " +
        "address; the answers are kept once, in a transaction on the person's row, and nothing is emailed.",
    },
  ],
  [
    "src/app/api/surveys/blanks/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      throttle: "rateLimit(`surveys:blanks:ip:${clientIp(req)}`",
      credential: "openBlanksLink(",
      why:
        "A person's answers to the questions they left blank on a survey, from the link of blanks an admin's " +
        "press emailed them, with no session to require. The 32-byte secret IS the credential: it opens that " +
        "person's own row and nobody else's, a wrong or replaced one opens nothing, and a spent one keeps " +
        "nothing more. An in-memory per-IP throttle runs first and keeps no address; the answers are kept once, " +
        "beside the first ones, in a transaction that spends the link, and nothing is emailed.",
    },
  ],
  [
    "src/app/api/surveys/consent/route.ts#POST",
    {
      anonymous: true,
      writes: true,
      sends: false,
      throttle: "rateLimit(`surveys:consent:ip:${clientIp(req)}`",
      credential: "openLink(",
      why:
        "A person's own follow-ups consent, changed from the personal link in their survey email, with no " +
        "session to require. The 32-byte secret IS the credential: it opens that person's own row and nobody " +
        "else's, a wrong one opens nothing, and a survey's test link changes nothing. An in-memory per-IP " +
        "throttle runs first and keeps no address; the one write is the person's own row, in a transaction, and " +
        "nothing is emailed.",
    },
  ],

  // --- gated inside a helper the scan cannot follow -------------------------
  [
    "src/app/api/admin/members/[uid]/conduct-flag/route.ts#GET",
    {
      anonymous: false,
      gatedBy: "requireAdmin(",
      why: "Admin only, through a helper in the file that returns the refusal rather than throwing.",
    },
  ],
  [
    "src/app/api/admin/members/[uid]/conduct-flag/route.ts#POST",
    {
      anonymous: false,
      gatedBy: "requireAdmin(",
      why: "The same helper on the write that records a conduct flag against a member.",
    },
  ],
  [
    "src/app/api/courses/groups/[groupId]/attendance/route.ts#POST",
    {
      anonymous: false,
      gatedBy: "gateGroupRegister(",
      why: "The register gate refuses a missing session before anything is marked.",
    },
  ],
  [
    "src/app/api/courses/groups/[groupId]/attendance/route.ts#PATCH",
    {
      anonymous: false,
      gatedBy: "gateGroupRegister(",
      why: "The same gate on the edit of an attendance mark that is already recorded.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/email/route.ts#POST",
    {
      anonymous: false,
      gatedBy: "gateRunStaff(",
      refusedIn: "src/lib/email/courseFacilitatorEmails.ts",
      why:
        "Only a run's staff may address it. The gate lives in the shared course email module " +
        "and returns the refusal rather than throwing, which is why the status codes live there.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/enrol/route.ts#GET",
    {
      anonymous: false,
      gatedBy: '{ error: "Not signed in." }, { status: 401 }',
      why:
        "A helper in the file refuses a missing session before the run is read, which is why " +
        "the scan cannot see the gate from the handler itself. It also carries its own per-IP " +
        "and per-uid throttles.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/enrol/route.ts#POST",
    {
      anonymous: false,
      gatedBy: '{ error: "Not signed in." }, { status: 401 }',
      why:
        "The same helper on the enrol write, refusing before a seat is minted or a place is " +
        "taken from the run's capacity.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/enrol/route.ts#PATCH",
    {
      anonymous: false,
      gatedBy: '{ error: "Not signed in." }, { status: 401 }',
      why:
        "The same helper on the change of an existing enrolment, refusing before the seat or " +
        "the group is touched.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/enrol/route.ts#DELETE",
    {
      anonymous: false,
      gatedBy: '{ error: "Not signed in." }, { status: 401 }',
      why:
        "The same helper on the withdrawal from a run, refusing before the seat is released " +
        "back to the pool.",
    },
  ],
  [
    "src/app/api/events/[id]/audience/route.ts#POST",
    {
      anonymous: false,
      gatedBy: "planFor(req, ctx)",
      why:
        "Counting who an event for chosen people would reach: after the view-as guard, a helper " +
        "in the file refuses a missing session, then anybody who does not run events, before the " +
        "body or the event is read. It writes nothing.",
    },
  ],
  [
    "src/app/api/events/[id]/audience/route.ts#PUT",
    {
      anonymous: false,
      gatedBy: "planFor(req, ctx)",
      why:
        "The same helper on keeping who an event for chosen people is for, refusing a missing " +
        "session before anything is read or written.",
    },
  ],
  [
    "src/app/api/events/[id]/invitations/route.ts#GET",
    {
      anonymous: false,
      gatedBy: "gate(ctx)",
      why:
        "How many people are new to an event's tags: a helper in the file refuses a missing " +
        "session, then anybody who does not run events, before the event is read.",
    },
  ],
  [
    "src/app/api/events/[id]/invitations/route.ts#POST",
    {
      anonymous: false,
      gatedBy: "gate(ctx)",
      why:
        "Inviting the people new to an event's tags, which emails them: after the view-as guard, " +
        "the same helper refuses a missing session before anybody is invited.",
    },
  ],
]);

/**
 * Comment-free source WITH its strings, because every literal the registry
 * names is a call whose argument is a string or a template
 * (`rateLimit(\`events:rsvp:ip:${ip}\`)`), and the scanner's own reading empties
 * exactly those. Comments still go, so a gate mentioned in prose does not
 * count as a gate.
 */
const withStrings = (file) =>
  stripSource(readFileSync(join(REPO_ROOT, file), "utf8"), { keepStrings: true });

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

describe("every anonymous-reachable handler is registered", () => {
  const { anonymous, unreadable } = scanAnonymousHandlers();

  test("the scan could read every route in the tree", () => {
    assert.deepEqual(
      unreadable,
      [],
      "A handler could not be read. Report it rather than skipping it: a route the scanner " +
        "cannot read is a route nothing here asks about. Either write the handler as " +
        "`export async function`, which all 170 routes do today, or teach the scan the form.",
    );
    assert.ok(anonymous.size > 0, "The scan found no anonymous handlers at all, which cannot be right.");
  });

  test("both directions", () => {
    const missing = [...anonymous].filter((key) => !PUBLIC_HANDLERS.has(key)).sort();
    assert.deepEqual(
      missing,
      [],
      "A handler under src/app/api has no top-level refusal for a missing session and no entry " +
        "in PUBLIC_HANDLERS. Say what it does and what gates it. If its gate is inside a helper " +
        "the scan cannot follow, say `anonymous: false` and name the literal.",
    );
    const stale = [...PUBLIC_HANDLERS.keys()].filter((key) => !anonymous.has(key)).sort();
    assert.deepEqual(
      stale,
      [],
      "PUBLIC_HANDLERS names a handler the scan now considers session-required. Either it " +
        "grew a gate and the entry should go, or the scanner changed and that needs looking at.",
    );
  });

  test("every entry gives a written reason", () => {
    for (const [key, entry] of PUBLIC_HANDLERS) {
      assert.ok(
        typeof entry.why === "string" && entry.why.trim().length >= 60,
        `${key} needs a real reason, not a placeholder.`,
      );
    }
  });
});

describe("a handler declared gated names the gate, and the file carries it", () => {
  for (const [key, entry] of PUBLIC_HANDLERS) {
    if (entry.anonymous !== false) continue;
    test(key, () => {
      const [path] = key.split("#");
      const raw = readFileSync(join(REPO_ROOT, path), "utf8");
      const source = withStrings(path);
      assertReadable(raw, source, path, assert);
      assert.ok(typeof entry.gatedBy === "string", `${key} must name the literal that gates it.`);
      assert.ok(
        source.includes(entry.gatedBy),
        `${key} says it is gated by ${JSON.stringify(entry.gatedBy)}, which is not in ${path}.`,
      );
      // The refusal has to exist somewhere, and `refusedIn` says where: the
      // route itself for an in-file helper, or the shared module the gate
      // lives in. 401 OR 403, because several gates in this tree collapse
      // "not signed in" and "not allowed" onto one answer deliberately, so an
      // anonymous caller does not learn the endpoint is worth a session.
      const refusedIn = entry.refusedIn ?? path;
      const refusalSource = withStrings(refusedIn);
      assert.ok(
        /\b40[13]\b/.test(refusalSource),
        `${key} claims a session gate in ${refusedIn}, which never answers 401 or 403. A gate ` +
          "that refuses nobody is not a gate.",
      );
    });
  }
});

describe("an anonymous handler with a side effect is gated for one", () => {
  for (const [key, entry] of PUBLIC_HANDLERS) {
    if (entry.anonymous !== true) continue;
    test(key, () => {
      const [path] = key.split("#");
      const raw = readFileSync(join(REPO_ROOT, path), "utf8");
      const source = withStrings(path);
      assertReadable(raw, source, path, assert);

      for (const [field, value] of Object.entries(entry)) {
        if (!["throttle", "captcha", "cooldown", "credential", "gatedBy"].includes(field)) continue;
        assert.ok(
          source.includes(value),
          `${key} names ${field} as ${JSON.stringify(value)}, which is not in ${path}. A gate ` +
            "the registry claims and the file does not have is worse than no entry at all.",
        );
      }

      if (entry.sends) {
        const bounded = Boolean(entry.credential) || Boolean(entry.throttle);
        assert.ok(
          bounded,
          `${key} posts a message and a stranger reaches it, with no throttle and no ` +
            "credential. That is an outbound mailer signed by the society.",
        );
        if (!entry.credential) {
          assert.ok(
            entry.captcha || entry.cooldown,
            `${key} lets a stranger choose who receives a message, with a rate limit and ` +
              "nothing else. A rate limit caps the rate; a captcha or a per-address cooldown " +
              "is what stops one caller addressing a list. Name whichever it carries.",
          );
        }
      }

      if (entry.writes) {
        assert.ok(
          entry.credential || entry.throttle,
          `${key} changes a document and a stranger reaches it, with neither a credential nor ` +
            "a throttle.",
        );
      }

      if (!entry.writes && !entry.sends) {
        assert.ok(
          /read|clear|preview|render|feed|cookie|token/i.test(entry.why),
          `${key} claims no side effect, and the reason should say what it does instead.`,
        );
      }
    });
  }
});

/**
 * What the entry of a handler the scan reads as reached THROUGH something
 * brought in place of a session must say: that it is anonymous-reachable,
 * and the credential that checks what is brought. A refusal that lets such a
 * caller in is a gate only when what they bring is checked, and the registry
 * says where (the side-effect rule above then holds the literal to the file).
 */
function throughProblems(key, entry) {
  if (!entry) {
    return [`${key} lets in a caller with no session who brings something else instead, and PUBLIC_HANDLERS has no entry for it.`];
  }
  const out = [];
  if (entry.anonymous !== true) {
    out.push(`${key} is reached with no session by a caller who brings something else instead: its entry says anonymous: true.`);
  }
  if (typeof entry.credential !== "string" || entry.credential.length === 0) {
    out.push(
      `${key} refuses a caller with no session only when they bring nothing else, and its entry names no credential ` +
        "that checks what they bring. Name the call that checks it.",
    );
  }
  return out;
}

describe("a handler a stranger reaches by bringing something in place of a session names what checks it", () => {
  const { through } = scanAnonymousHandlers();

  test("the scan sees the self check-in reached that way, by a guest's own link", () => {
    assert.ok(through.has("src/app/api/events/[id]/check-in/route.ts#POST"), [...through].join(", "));
  });

  for (const key of through) {
    test(key, () => {
      assert.deepEqual(throughProblems(key, PUBLIC_HANDLERS.get(key)), []);
    });
  }
});

// ---------------------------------------------------------------------------
// The scanner itself
// ---------------------------------------------------------------------------

describe("the scanner still tells a gate from a branch", () => {
  const wrap = (body) =>
    `export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {${body}}`;

  /**
   * What the scan answers for a fixture handler: the scan's own decision
   * (`handlerReach`), asked of the fixture's body with the identities its
   * session gates hand out, as `scanAnonymousHandlers` asks it of a route.
   */
  const reachOf = (body) => {
    const source = wrap(body);
    const identities = new Set();
    ASSIGNMENT.lastIndex = 0;
    let assigned;
    while ((assigned = ASSIGNMENT.exec(source)) !== null) identities.add(assigned[1]);
    HANDLER.lastIndex = 0;
    const handler = HANDLER.exec(source);
    const inner = handlerBody(source, handler.index);
    assert.ok(inner !== null, "the fixture handler body must be readable");
    return handlerReach(inner, [...identities]);
  };
  const isAnonymous = (body) => reachOf(body) !== "session";

  test("a top-level refusal is a gate", () => {
    assert.equal(
      isAnonymous("const viewer = await getCurrentUser(); if (!viewer) return refuse();"),
      false,
    );
    assert.equal(
      isAnonymous("const caller = await requireApplicant(); if (caller instanceof NextResponse) return caller;"),
      false,
    );
    assert.equal(
      isAnonymous("const user = await getCurrentUser(); if (!user || !canDoIt(user)) return refuse();"),
      false,
    );
  });

  test("a refusal nested in another condition is NOT a gate", () => {
    // The shape a nested refusal takes, and the reason the depth check exists.
    assert.equal(
      isAnonymous(
        "const viewer = await getCurrentUser();" +
          " if (visibility === 'members') { if (!viewer) return refuse(); }" +
          " await write();",
      ),
      true,
    );
  });

  test("a branch that mentions the session is not a refusal", () => {
    assert.equal(
      isAnonymous("const viewer = await getCurrentUser(); if (viewer.role === 'admin') return everything();"),
      true,
    );
  });

  test("a condition with no return is not a refusal", () => {
    assert.equal(isAnonymous("const viewer = await getCurrentUser(); if (!viewer) { log('anon'); }"), true);
  });

  test("a refusal that holds only when something else is missing too is not a session gate: the self check-in's token or session", () => {
    const shape = "const user = await getCurrentUser(); const parsed = parse(body);";
    assert.equal(reachOf(`${shape} if (!parsed.token && !user) return refuse(); await recordCheckIn();`), "through");
    assert.equal(reachOf(`${shape} if (!user && !parsed.token) return refuse(); await recordCheckIn();`), "through");
    assert.equal(reachOf(`${shape} if ((!parsed.token && !user) || !parsed.ok) return refuse(); await recordCheckIn();`), "through");
    // The conditions themselves, part by part.
    assert.equal(sessionRefusal("!parsed.token && !user", ["user"]), "or-else");
    assert.equal(sessionRefusal("!user", ["user"]), "session");
    assert.equal(sessionRefusal("parsed.ok", ["user"]), null);
    // Split only at the top level: a call's or a bracket's own operators are inside one part.
    assert.deepEqual(splitTopLevel("a && (b || c) && d[e && f] && g({ h: i && j })", "&&"), ["a", "(b || c)", "d[e && f]", "g({ h: i && j })"]);
    assert.deepEqual(splitTopLevel("!user || (!parsed.token && other)", "||"), ["!user", "(!parsed.token && other)"]);
    assert.deepEqual(splitTopLevel("!user.can(a && b)", "&&"), ["!user.can(a && b)"]);
    assert.equal(unwrap(" ((!parsed.token && !user)) "), "!parsed.token && !user");
    assert.equal(unwrap("(a) && (b)"), "(a) && (b)");
  });

  test("a refusal of everybody with no session is still a gate, however it is written, and wherever it follows one that is not", () => {
    const shape = "const user = await getCurrentUser(); const parsed = parse(body);";
    assert.equal(reachOf(`${shape} if (!parsed.token && !user) return refuse(); if (!user) return refuse(); await write();`), "session");
    assert.equal(reachOf(`${shape} if (!user || (!parsed.token && other)) return refuse(); await write();`), "session");
    assert.equal(reachOf(`${shape} if (((!user))) return refuse(); await write();`), "session");
    // Both parts about a session gate's answer: nobody without one gets past.
    assert.equal(reachOf("const user = await getCurrentUser(); const caller = await requireApplicant(); if (!user && !caller) return refuse();"), "session");
  });

  test("a route that asks a stranger for neither a session nor anything else is still open, and still has to answer to the registry", () => {
    assert.equal(reachOf("const user = await getCurrentUser(); const parsed = parse(body); if (!parsed.ok) return bad(); await recordCheckIn();"), "open");
    // A check of something brought, with no session gate beside it, is no session refusal at all.
    assert.equal(reachOf("const parsed = parse(body); if (!parsed.token) return refuse(); await recordCheckIn();"), "open");
    // And one let in through a token is held to the registry: no entry, or an entry with no credential, fails.
    const key = "src/app/api/example/[id]/route.ts#POST";
    assert.equal(throughProblems(key, undefined).length, 1);
    assert.match(throughProblems(key, undefined)[0], /has no entry/);
    const noCredential = { anonymous: true, writes: true, sends: false, throttle: "rateLimit(", why: "x".repeat(60) };
    assert.match(throughProblems(key, noCredential).join(" "), /names no credential/);
    assert.match(throughProblems(key, { ...noCredential, anonymous: false, gatedBy: "x" }).join(" "), /anonymous: true/);
    assert.deepEqual(throughProblems(key, { ...noCredential, credential: "decideSelf(" }), []);
  });

  test("a parameter list with a brace in it does not swallow the handler", () => {
    const source = wrap("const viewer = await getCurrentUser(); if (!viewer) return refuse();");
    const body = handlerBody(source, 0);
    assert.match(body, /getCurrentUser/, "the body must start after the parameter list");
    assert.doesNotMatch(body, /Promise</, "the parameter type must not be read as the body");
  });
});
