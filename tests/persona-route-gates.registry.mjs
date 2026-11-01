/**
 * THE STANDING RED TEAM'S ANSWER KEY: what every route and every authed page
 * answers each persona.
 *
 * One entry per route (by method) and per page under `src/app/(app)`, keyed
 * the way `tests/e2e-coverage-map.test.mjs` keys them (the path under
 * `src/app` with `/route.ts` or `/page.tsx` removed, route groups kept). Each
 * entry says what every persona gets and why, and `tests/persona-route-gates.test.mjs`
 * (offline) checks the tree and this file agree in both directions while
 * `scripts/e2e/tests/persona-route-gates.test.mjs` (a real build, an emulator
 * behind it) drives every cell and asserts the answer.
 *
 * PERSONAS. `anonymous` has no session. `pending`, `rejected`, `member`,
 * `committee` (not SU-recognised), `suCommittee`, `admin`, and one plain
 * member per permissions key (`draftNewsletter`, `approveNewsletter`,
 * `draftEvent`, `approveEvent`, `draftCourse`, `approveCourse`,
 * `manageMembership`, `circulateWorksheet`). Their documents are written by
 * `scripts/e2e/lib/personas.mjs`, to an emulator only.
 *
 * WHAT A CELL MEANS. The battery requests each route with an id that
 * addresses nothing (`e2e-missing-<segment>`) and an empty JSON body, so the
 * status is the GATE's answer, or the first validation's, never a document's.
 * `expect` maps a persona (or `"*"` for everyone not named) to a status. For
 * a page the value is a status, the name of a redirect target from
 * `REDIRECTS`, or a list of names when a gating layout and the page beneath
 * it both redirect and the stream decides which the browser sees first:
 * every target observed must then be one of the list. `fields` lists the top-level keys a 2xx JSON body may carry;
 * a key outside it fails. `drive` overrides the request (a body, a query
 * string) with the reason, for a route whose gate sits behind a validation
 * an empty body never reaches.
 *
 * The helpers below are the recurring shapes, so an entry reads as a
 * decision rather than a table. Every entry carries `why`.
 *
 * THE SECOND PASS: TWO PROGRAMMES, THEIRS AND ANOTHER. Three personas hold a
 * role on a record: `lead` leads a programme whose run is running,
 * `facilitator` facilitates one of that run's groups and holds a place in it,
 * and `participant` holds a place in its other group
 * (`scripts/e2e/lib/personaWorld.mjs` writes THEIRS, and ANOTHER, the same
 * shapes led and staffed by accounts that are none of the personas). Every
 * course hub route and page with a segment the world fills (`asksBothSets`) is
 * asked again by every persona with each programme's ids, and its entry
 * carries two columns, each a map from a persona (or `"*"`) to
 * `[outcome, reason]`, so every cell has its reason:
 *
 *  - `another`: what each persona gets on a programme it holds no role on.
 *    A role persona not named resolves through its base (`ROLE_PERSONAS`),
 *    then `"*"`: on somebody else's programme a lead is SU-recognised
 *    committee and a facilitator or a participant is a member.
 *  - `theirs`: the three role personas, always named, on their own
 *    programme. Everybody else holds no role on either programme, so their
 *    cell is the `another` column's: the two programmes are mirrors in every
 *    field a gate reads, and a difference between the columns is a role at
 *    work.
 *
 * In the second pass a mutating route is sent an EMPTY body and a GET its
 * `realDrive.query` (filled from the set's ids, `{segment}`), so a refusal is
 * the gate's and a persona the gate admits meets the first validation. Where
 * the gate admits somebody and nothing stops the request after it (the route
 * takes no body, or reads an empty one as a choice), the cell is `ACTS`, with
 * the reason, and the battery does not send it: no write ever lands. A
 * mutating route whose body is checked before its gate may carry a whole
 * `realDrive.body` instead, so the gate is reached; then every cell is a
 * refusal or `ACTS`, and the body only ever goes to somebody refused. A page
 * that draws a calm "not here" in place of itself answers a 200 either way,
 * so the second pass names that state (`STATES`) rather than the status.
 *
 * THE SAME PASS ON TWO EVENTS, THEIRS AND ANOTHER. Two more personas hold a
 * role on a record: `eventAuthor` wrote THEIRS' event (a member holding
 * draftEvent) and `eventCollaborator` helps run it (committee the SU does not
 * recognise); ANOTHER's event is written and helped by accounts that are none
 * of the personas, and each event has a request waiting for a decision (the
 * world fills `[id]` and `[rsvpId]`, `EVENT_WORLD_SEGMENTS`). Every route and
 * page whose code asks the sign-ups rule (`src/lib/events/signupAccess.ts`)
 * is asked about both events: its columns say `world: "event"`, and their
 * `theirs` names exactly the two event roles. Found from the code, not the
 * address, and held both ways by `tests/persona-route-gates.test.mjs`.
 */

export const PERSONA_NAMES = [
  "anonymous",
  "pending",
  "rejected",
  "member",
  "committee",
  "suCommittee",
  "admin",
  "draftNewsletter",
  "approveNewsletter",
  "draftEvent",
  "approveEvent",
  "draftCourse",
  "approveCourse",
  "manageMembership",
  "circulateWorksheet",
  "lead",
  "facilitator",
  "participant",
  "eventAuthor",
  "eventCollaborator",
];

/**
 * THE PERSONAS WHO HOLD A ROLE ON A RECORD, and the persona each one is
 * everywhere else: on a record it holds no role on, a programme's lead is an
 * SU-recognised committee member (the bar a lead stands behind), a
 * facilitator or a participant is a member, an event's author is a member
 * holding draftEvent and its collaborator is committee the SU does not
 * recognise. An expectation that does not name one of them is read through
 * its base before `"*"`, in the first pass and in the `another` column alike.
 *
 * One difference is real and is named wherever it shows: appointing a lead
 * flags the account (`users.admissionsReviewer`, which `setProgrammeRoles`
 * sets), and the admissions tree's gate admits a flagged account that still
 * stands, so on the pages under /admin/admissions the lead is named.
 */
export const ROLE_PERSONAS = Object.freeze({
  lead: "suCommittee",
  facilitator: "member",
  participant: "member",
  eventAuthor: "draftEvent",
  eventCollaborator: "committee",
});

/** The three who hold a role on a programme: a course hub column's `theirs` names exactly these. */
export const PROGRAMME_ROLES = Object.freeze(["lead", "facilitator", "participant"]);

/** The two who hold a role on an event: an event column's `theirs` names exactly these. */
export const EVENT_ROLES = Object.freeze(["eventAuthor", "eventCollaborator"]);

/** The roles a key's `theirs` column names, by the world its columns ask about. */
export function rolesOf(columns) {
  return columns?.world === "event" ? EVENT_ROLES : PROGRAMME_ROLES;
}

/** A second-pass cell the battery does not send: the gate admits the persona and the request would act. */
export const ACTS = "acts";

/**
 * The calm states a page draws IN PLACE of itself, with a 200, for somebody
 * it does not admit, by the words that say so. The second pass names them;
 * the first keeps reading a status.
 */
export const STATES = {
  /** The programme head's refusal (`NoProgrammeHere` in src/features/applications/editor/Refusals.tsx). */
  noProgramme: "There is no programme here",
  /**
   * The applications list's and one application's (`NotHere` in
   * src/features/applications/review/NotHere.tsx), by its own sentence: its
   * heading, "We can’t find that", begins the site's not-found page too, which
   * every page carries in its payload, so the heading would read on every page.
   */
  notReviewed: "If there should be, ask an admin to check who is named on the programme.",
  /** The facilitator guide's (`GUIDE_REFUSED` in src/lib/courses/facilitatorGuide/words.ts). */
  guideRefused: "Only a course’s facilitators, its programme’s lead and admins can open its facilitator guide.",
  /** A survey that was not sent to the caller (`STATE_WORDS.notYours` in src/lib/surveys/words.ts). */
  surveyNotYours: "This survey isn’t one you were sent",
  /** An ask to facilitate that is not the caller's own (`NOT_YOURS` in src/lib/courses/facilitatorAsks/words.ts). */
  askNotYours: "This page is for the person we asked.",
};

/**
 * The dynamic segments the second pass fills from a programme's own records.
 * Every other segment keeps its made-up value in both sets: it names a
 * record the world does not write (an answer, a note, a link, a team, a
 * token), so the request is asked at the record it names.
 */
export const WORLD_SEGMENTS = Object.freeze([
  "roundId",
  "programmeId",
  "courseId",
  "runId",
  "groupId",
  "surveyId",
  "askId",
  "uid",
  "weekId",
  "n",
]);

/**
 * The segments the event world fills: THEIRS' or ANOTHER's event, and the
 * request waiting for a decision on it.
 */
export const EVENT_WORLD_SEGMENTS = Object.freeze(["id", "rsvpId"]);

/**
 * Does the second pass ask this key about the two events? Exactly when its
 * columns say so (`world: "event"`); which keys must is the code's to say,
 * and the offline guard holds the two together. `method` is null for a page.
 */
export function asksAboutTheEvent(key, method) {
  return realColumnsFor(key, method)?.world === "event";
}

/**
 * THE COURSE HUB, walked from the address and never listed: every route under
 * /api/courses, the programme surveys' routes (/api/surveys), the routes under
 * a programme on an application form, every page under /learn, and every page
 * under a programme on an application form (its tabs and the pages beside
 * them). A new route or page there is asked about by the second pass the day
 * it lands.
 */
export function isHubKey(key) {
  return (
    key.startsWith("/api/courses/") ||
    key === "/api/surveys" ||
    key.startsWith("/api/surveys/") ||
    key.startsWith("/api/admissions/forms/[roundId]/programmes/[programmeId]") ||
    key === "/(app)/learn" ||
    key.startsWith("/(app)/learn/") ||
    key.startsWith("/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]")
  );
}

/** The dynamic segments of a key, by name. */
export function segmentsOf(key) {
  return [...key.matchAll(/\[\.{0,3}(\w+)\]/g)].map((match) => match[1]);
}

/**
 * Does the second pass ask this key? A course hub key with at least one
 * segment the world fills. One with none (`/api/courses/me`, a calendar
 * token's feed) is the same request in both sets, so it is asked once, in the
 * first pass, by every persona.
 */
export function asksBothSets(key) {
  return isHubKey(key) && segmentsOf(key).some((name) => WORLD_SEGMENTS.includes(name));
}

/** One column's cell for a persona: the persona, then its base, then `"*"`. Returns the `[outcome, reason]` pair. */
export function cellIn(column, persona) {
  if (!column) return undefined;
  if (persona in column) return column[persona];
  const base = ROLE_PERSONAS[persona];
  if (base && base in column) return column[base];
  if ("*" in column) return column["*"];
  return undefined;
}

/**
 * A key's two columns (`REAL_ROUTES[key][method]`, or `REAL_PAGES[key]` when
 * `method` is null), or undefined when it has none.
 */
export function realColumnsFor(key, method) {
  return method ? REAL_ROUTES[key]?.[method] : REAL_PAGES[key];
}

/** A second-pass cell: `theirs` names the role personas on their own programme; everybody else reads `another`. */
export function realCellFor(columns, set, persona) {
  if (!columns) return undefined;
  if (set === "theirs" && columns.theirs && persona in columns.theirs) return columns.theirs[persona];
  return cellIn(columns.another, persona);
}

/** The outcome alone of a second-pass cell. */
export function realExpectedFor(columns, set, persona) {
  return realCellFor(columns, set, persona)?.[0];
}

/** Redirect targets a page may name. */
export const REDIRECTS = {
  login: "/login",
  pendingApproval: "/pending-approval",
  home: "/",
  dashboard: "/dashboard",
  collaborator: "/collaborator",
  learn: "/learn",
  eventsManage: "/events/manage",
  event: "/events/manage/[id]",
  newsletter: "/newsletter",
  /** A run's home under /learn, where a page beneath it sends somebody it does not admit (second pass). */
  run: "/learn/[runId]",
  /** A week of a run under /learn (second pass). */
  week: "/learn/[runId]/weeks/[n]",
};

/** Anonymous is refused for having no session; everyone signed in gets `rest`. */
export const signedIn = (rest, overrides = {}) => ({ anonymous: 401, "*": rest, ...overrides });
/** Only an admin gets `ok`; every other session is forbidden. */
export const adminOnly = (ok, overrides = {}) => ({ anonymous: 401, "*": 403, admin: ok, ...overrides });
/** An approved account (member, committee, admin, the permission holders) gets `ok`. */
export const approvedOnly = (ok, overrides = {}) => ({
  anonymous: 401,
  "*": ok,
  pending: 403,
  rejected: 403,
  ...overrides,
});
/** Everyone, signed in or not, gets `status`: a public route or a uniform answer. */
export const everyone = (status, overrides = {}) => ({ "*": status, ...overrides });

/** Resolve one persona's expectation out of an `expect` map: the persona, then its base (`ROLE_PERSONAS`), then `"*"`. */
export function expectedFor(expect, persona) {
  if (persona in expect) return expect[persona];
  const base = ROLE_PERSONAS[persona];
  if (base && base in expect) return expect[base];
  if ("*" in expect) return expect["*"];
  return undefined;
}

/** Routes: key -> { METHOD: { expect, fields?, drive?, public?, why } }. */
export const ROUTES = {
  "/api/account/delete": {
    POST: {
      expect: signedIn(409),
      why:
        "Self-service account deletion needs a typed confirmation, so every signed-in persona " +
        "meets the 409 that asks for it; an outsider has no account to delete.",
    },
  },
  "/api/account/kairos": {
    POST: {
      expect: signedIn(400),
      why:
        "Changing the caller's own Kairos choice from their profile: view-as first, then the session, then the " +
        "body, so every signed-in persona meets the same 400 on an empty one. There is no uid in the request: the " +
        "record changed is the caller's own, and anybody signed in may say no, before they take part included.",
    },
  },
  "/api/account/reconsent": {
    POST: {
      expect: signedIn(400),
      why:
        "Accepting the current policy needs the version in the body; every signed-in persona " +
        "meets that validation, including pending and rejected, because their consent is " +
        "their own to give.",
    },
  },
  "/api/admin/application-emails/[templateId]/send-test": {
    POST: {
      expect: everyone(403, { admin: 404 }),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/admin/application-emails/preview": {
    POST: {
      expect: everyone(403, { admin: 200 }),
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
  },
  "/api/admin/application-emails/send": {
    POST: {
      expect: everyone(400, { anonymous: 403 }),
      why:
        "A missing session is refused outright. The body is validated next, because who may " +
        "send depends on what it asks for: an admin may send any template, and an applicant " +
        "may trigger their own 'submitted' mail, which the check reads from the uid in the " +
        "body. An empty body from any signed-in persona meets the same 400.",
    },
  },
  "/api/admin/backfill-subscriptions": {
    POST: {
      expect: everyone(403, { admin: 200 }),
      fields: ["legacyRowsMigrated", "memberRowsWritten", "ok", "usersScanned", "usersWithNoEmail"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The backfill is idempotent and ran against the emulator here.",
    },
  },
  "/api/admin/collaborators/verification": {
    POST: {
      expect: everyone(403, { admin: 200 }),
      fields: ["verified"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
  },
  "/api/admin/config/task-emails": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["enabled", "updatedAt", "updatedByUid"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
    PATCH: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/admin/course-emails/[templateId]/send-test": {
    POST: {
      expect: everyone(403, { admin: 404 }),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/admin/course-emails/preview": {
    POST: {
      expect: everyone(403, { admin: 200 }),
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
  },
  "/api/admin/courses-config": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: [
        "defaults",
        "dropOutFeedbackUrl",
        "nextWeekEmailDaysBefore",
        "registerTaskHours",
        "unmarkedRegisterGraceHours",
        "weeklyFeedbackUrl",
      ],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
    POST: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/admin/deliverability/exports": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["items"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The rows are the server-written export log.",
    },
  },
  "/api/admin/deliverability/sends": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["items"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The rows are the server-written send log.",
    },
  },
  "/api/admin/deliverability/suppressed": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["items"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The rows are the suppression list.",
    },
  },
  "/api/admin/deliverability/suppressed/[docId]": {
    DELETE: {
      expect: everyone(403, { admin: 200 }),
      fields: ["ok"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. Removing a suppression that does not exist is reported as done.",
    },
  },
  "/api/admin/impersonate": {
    POST: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. A view-as session needs a target uid.",
    },
  },
  "/api/admin/impersonate/exit": {
    POST: {
      expect: everyone(400),
      why:
        "Ends a view-as session, which needs the marker cookie that starting one sets. The " +
        "battery sends no marker, so every persona here, signed in or not, is answered with " +
        "the same 400.",
    },
  },
  "/api/admin/members/[uid]/conduct-flag": {
    GET: {
      expect: adminOnly(200),
      fields: ["byName", "flagged", "flaggedAt", "reason"],
      why:
        "Admin only through requireAdmin; a missing session is a 401 here rather than the " +
        "tree's usual 403, and the admin gets the empty flag shape for an unknown uid.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only through requireAdmin; the admin then meets the body validation before any " +
        "member is read.",
    },
  },
  "/api/admin/members/[uid]/notes": {
    GET: {
      expect: adminOnly(404),
      why:
        "The admins' route to the notes about a person (privacy v13, v15) is an admin's alone, about somebody else, " +
        "decided on the session before anything is read; the admin is then told nobody has this account. A " +
        "programme's lead reads the notes kept for leads through the programme's own route instead.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Keeping a note on the admins' route: an admin's alone, decided on the session; the admin then meets the " +
        "body check, an empty note, before the account is read.",
    },
  },
  "/api/admin/members/[uid]/notes/[noteId]": {
    PATCH: {
      expect: adminOnly(400),
      why: "Changing a note's words: an admin's alone, decided on the session; the admin then meets the body check.",
    },
    DELETE: {
      expect: adminOnly(404),
      why: "Deleting a note: an admin's alone, decided on the session; the admin is then told the note is not here.",
    },
  },
  "/api/admin/members/[uid]/notes/draft": {
    POST: {
      expect: adminOnly(400),
      why:
        "Claude's draft of a note: an admin's alone, decided on the session; the admin then meets the body " +
        "check, which run to draft from, before anything is read or sent.",
    },
  },
  "/api/admin/membership/current": {
    POST: {
      expect: adminOnly(400),
      why:
        "Moving the current period pointer is admin only even for a manageMembership holder, " +
        "decided before the body is read; the admin meets the validation.",
    },
  },
  "/api/admin/membership/export": {
    POST: {
      expect: adminOnly(400, { manageMembership: 400 }),
      why:
        "Admins and manageMembership holders keep the membership record; both meet the " +
        "validation on an empty body, everyone else is forbidden.",
    },
  },
  "/api/admin/membership/grant": {
    POST: {
      expect: adminOnly(400, { manageMembership: 400 }),
      why:
        "Admins and manageMembership holders may grant a membership; both meet the " +
        "validation, everyone else is forbidden.",
    },
  },
  "/api/admin/membership/import": {
    POST: {
      expect: adminOnly(400, { manageMembership: 400 }),
      why:
        "Admins and manageMembership holders may start an import; both meet the validation, " +
        "everyone else is forbidden.",
    },
    GET: {
      expect: adminOnly(400, { manageMembership: 400 }),
      why:
        "Admins and manageMembership holders may read an import; the batch id is required, so " +
        "both meet the validation.",
    },
  },
  "/api/admin/membership/import/[batchId]/abandon": {
    POST: {
      expect: adminOnly(404, { manageMembership: 404 }),
      why:
        "Admins and manageMembership holders; the batch is missing for both, everyone else is " +
        "forbidden before the read.",
    },
  },
  "/api/admin/membership/import/[batchId]/commit": {
    POST: {
      expect: adminOnly(404, { manageMembership: 404 }),
      why:
        "Admins and manageMembership holders; the batch is missing for both, everyone else is " +
        "forbidden before the read.",
    },
  },
  "/api/admin/membership/list": {
    GET: {
      expect: adminOnly(400, { manageMembership: 400 }),
      why:
        "Admins and manageMembership holders may list the record; a period id is required, so " +
        "both meet the validation.",
    },
  },
  "/api/admin/membership/periods": {
    GET: {
      expect: adminOnly(200, { manageMembership: 200 }),
      fields: ["canSetCurrent", "currentPeriodId", "periods"],
      why:
        "Admins and manageMembership holders read the periods; the list is empty here. " +
        "canSetCurrent is the admin-only flag the console renders from.",
    },
    POST: {
      expect: adminOnly(400, { manageMembership: 400 }),
      why:
        "Admins and manageMembership holders may create a period; both meet the validation on " +
        "an empty body.",
    },
  },
  "/api/admin/membership/periods/[periodId]": {
    PATCH: {
      expect: adminOnly(404, { manageMembership: 404 }),
      why:
        "Admins and manageMembership holders; the period is missing for both, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/admin/membership/periods/[periodId]/recount": {
    POST: {
      expect: adminOnly(404, { manageMembership: 404 }),
      why:
        "Admins and manageMembership holders; the period is missing for both, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/admin/migrate-notifications": {
    POST: {
      expect: everyone(403, { admin: 200 }),
      fields: ["alreadyNew", "migrated", "ok", "skipped"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The migration is idempotent and ran against the emulator here.",
    },
  },
  "/api/admin/registrations": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["nextCursor", "rows"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The rows are projected signup-tracker rows (toRegistrationView).",
    },
  },
  "/api/admin/registrations/[uid]": {
    DELETE: {
      expect: everyone(403, { admin: 200 }),
      fields: ["admissionApplicationPrivateDeleted", "admissionApplicationsDeleted", "admissionAssessmentsDeleted", "admissionDecisionsDeleted", "admissionReviewsAuthoredDeleted", "admissionReviewsDeleted", "admissionRoundRolesCleared", "authDeleted", "calendarLinkDeleted", "collaboratorDeleted", "conductFlagDeleted", "courseApplicationsDeleted", "courseAttendanceMarksCleared", "courseBestAnswersCleared", "courseCertificatesDeleted", "courseCertificatesKept", "courseEnrolmentsDeleted", "courseExerciseResponsesDeleted", "courseFacilitatingCleared", "courseFeedbackCleared", "courseFeedbackDeleted", "courseFinishingCleared", "courseGroupNotesDeleted", "courseGroupSharedNotesDeleted", "coursePacksAndCasesDeleted", "coursePairsDeleted", "coursePangramChecksDeleted", "coursePitchesCleared", "coursePlacementNotesDeleted", "coursePredictionsDeleted", "courseProgressDeleted", "courseSessionReportsCleared", "courseTeamEntriesCleared", "courseTeamsCleared", "courseWeekWorkDeleted", "courseWorkLogDeleted", "courseWorkRatingsDeleted", "emailVerificationsDeleted", "eventCheckInsNamesTakenOff", "kairosChoiceDeleted", "memberNotesDeleted", "memberRecordApplicationsRetained", "membershipImportRowsDeleted", "membershipsDeleted", "ok", "programmeRatingsDeleted", "pushSubscriptionsDeleted", "registrationDeleted", "schedulerMarkersDeleted", "subscriptionsDeleted", "surveyAnswersNamesTakenOff", "surveyPeopleDeleted", "userDocDeleted", "worksheetResponsesRetained"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. Deleting an unknown uid reports every sweep as zero and answers ok, " +
        "which is the cascade's own idempotency.",
    },
  },
  "/api/admin/registrations/summary": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["counts", "flags", "recaptcha", "velocity"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
  },
  "/api/admin/scheduler": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["enabled", "failedMarkers", "jobMarkers", "jobs", "receipts", "updatedAt", "updatedByUid"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
  },
  "/api/admin/scheduler/config": {
    POST: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/admin/scheduler/run": {
    POST: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. A job id is required.",
    },
  },
  "/api/admin/site-notice": {
    GET: {
      expect: everyone(403, { admin: 200 }),
      fields: ["audit", "notice"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not.",
    },
    PATCH: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/admin/subscriptions/[id]": {
    DELETE: {
      expect: everyone(403, { admin: 404 }),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/admin/subscriptions/[id]/set-status": {
    POST: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/admin/test-email": {
    POST: {
      expect: everyone(403, { admin: 200 }),
      fields: ["held", "messageId", "ok", "sentTo"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The admin's own address is the recipient; it went to Mailpit here.",
    },
  },
  "/api/admin/users/[uid]": {
    DELETE: {
      expect: everyone(403, { admin: 200 }),
      fields: ["admissionApplicationPrivateDeleted", "admissionApplicationsDeleted", "admissionAssessmentsDeleted", "admissionDecisionsDeleted", "admissionReviewsAuthoredDeleted", "admissionReviewsDeleted", "admissionRoundRolesCleared", "authDeleted", "calendarLinkDeleted", "collaboratorDeleted", "conductFlagDeleted", "courseApplicationsDeleted", "courseAttendanceMarksCleared", "courseBestAnswersCleared", "courseCertificatesDeleted", "courseCertificatesKept", "courseEnrolmentsDeleted", "courseExerciseResponsesDeleted", "courseFacilitatingCleared", "courseFeedbackCleared", "courseFeedbackDeleted", "courseFinishingCleared", "courseGroupNotesDeleted", "courseGroupSharedNotesDeleted", "coursePacksAndCasesDeleted", "coursePairsDeleted", "coursePangramChecksDeleted", "coursePitchesCleared", "coursePlacementNotesDeleted", "coursePredictionsDeleted", "courseProgressDeleted", "courseSessionReportsCleared", "courseTeamEntriesCleared", "courseTeamsCleared", "courseWeekWorkDeleted", "courseWorkLogDeleted", "courseWorkRatingsDeleted", "emailVerificationsDeleted", "eventCheckInsNamesTakenOff", "kairosChoiceDeleted", "memberNotesDeleted", "memberRecordApplicationsRetained", "membershipImportRowsDeleted", "membershipsDeleted", "ok", "programmeRatingsDeleted", "pushSubscriptionsDeleted", "registrationDeleted", "schedulerMarkersDeleted", "subscriptionsDeleted", "surveyAnswersNamesTakenOff", "surveyPeopleDeleted", "userDocDeleted", "worksheetResponsesRetained"],
      why:
        "Admin only through the tree's own requireAdmin helper, which answers a missing " +
        "session with the same 403 an outsider gets, so an anonymous probe learns nothing an " +
        "admin would not. The hard delete of an unknown uid reports every sweep as zero and " +
        "answers ok.",
    },
  },
  "/api/admissions/applications/me": {
    GET: {
      expect: signedIn(200, { rejected: 403 }),
      fields: ["rows"],
      why:
        "The applicant lane: a pending account is an applicant and sees its own (empty) list, " +
        "a rejected one is refused, and every approved account sees its own.",
    },
  },
  "/api/admissions/forms": {
    GET: {
      expect: signedIn(200),
      fields: ["canCreate", "forms"],
      why:
        "Any signed-in account may list application forms, and canSeeForm filters the list " +
        "per caller: an admin sees every form, a lead or a reviewer the forms that name them. " +
        "Here the list is empty but for the battery's world (both its forms for the admin, the " +
        "one naming them for the lead), so pending and rejected see nothing and canCreate is false " +
        "for everybody but the admin.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Only an admin makes an application form; everyone else is forbidden before the body " +
        "is read, and the admin meets the validation: a form needs a name.",
    },
  },
  "/api/admissions/forms/[roundId]": {
    GET: {
      expect: signedIn(404),
      why:
        "404 for a form the caller has no role on, the same as for one that does not exist: " +
        "whether a form exists is not something a stranger is told. Here it does not exist, " +
        "so every session including pending and rejected gets the same answer.",
    },
    PATCH: {
      expect: adminOnly(400),
      why:
        "The form itself is an admin's to change; everyone else is forbidden before the body " +
        "is read, and the admin meets the validation on an empty change before any read.",
    },
  },
  "/api/admissions/forms/[roundId]/application": {
    GET: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is " +
        "admitted, a rejected one is refused, and the form is then missing. A form that is " +
        "still a draft answers with the same 404.",
    },
    PUT: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The applicant lane, then the body is checked before any document is read: a save " +
        "with no draft in it is a 400 for every session that gets past requireApplicant, and " +
        "a rejected account is refused first.",
    },
  },
  "/api/admissions/forms/[roundId]/application/availability": {
    PUT: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is admitted, one " +
        "turned down at approval is refused. The body (the painted week's days) is then checked before any document " +
        "is read, so an empty one is a 400 for every session that gets past the gate.",
    },
  },
  "/api/admissions/forms/[roundId]/application/reply": {
    POST: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is " +
        "admitted, a rejected one is refused. The body is then checked before any document " +
        "is read, so a request that carries none of the four replies is a 400 for every " +
        "session that gets past the gate, whatever form the address names.",
    },
  },
  "/api/admissions/forms/[roundId]/application/send": {
    POST: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): pending is admitted and rejected refused. The " +
        "send reads nothing from the body, so the first answer after the gate is that the " +
        "form is missing.",
    },
  },
  "/api/admissions/forms/[roundId]/applications/[uid]": {
    GET: {
      expect: signedIn(404),
      why:
        "404 rather than 403 by design: a staff role comes from the form, so a form that is " +
        "missing and an application the caller has no claim on get the same answer, and nobody " +
        "learns an application exists by asking.",
    },
  },
  "/api/admissions/forms/[roundId]/application/access-requirements": {
    GET: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is " +
        "admitted, a rejected one is refused, and the form is then missing. It answers with " +
        "the caller's own answer and nobody else's, so there is no role to tell apart.",
    },
    PUT: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The applicant lane, then the body is checked before any document is read: a save " +
        "that carries no answer is a 400 for every session that gets past requireApplicant, " +
        "and a rejected account is refused first.",
    },
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/access-requirements": {
    POST: {
      expect: adminOnly(404),
      why:
        "Opening an applicant's access-requirements answer is admin only, decided before " +
        "anything is read: a lead, a reviewer and every other session are forbidden in the " +
        "same words whatever they asked about, and the admin is then told the form is missing.",
    },
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/assessment": {
    GET: {
      expect: adminOnly(404),
      why:
        "Claude's read and Pangram's check of an application are an admin's alone, decided " +
        "on the session before anything is read; the admin is then told the form is missing.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Asking Claude or Pangram is admin only, decided before the body is read, so no other " +
        "session learns what a request looks like; the admin then meets the body check, which " +
        "an empty body fails before anything is read or sent anywhere.",
    },
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/decision": {
    PUT: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the form is " +
        "read: a decision has to name its programme and be Accept, Pool or Decline, and an " +
        "empty body does neither, so every signed-in persona meets the same 400.",
    },
    DELETE: {
      expect: adminOnly(400),
      why:
        "Revoking an acceptance is admin only, decided before the body is read: every other " +
        "session is forbidden and the admin meets the validation, which asks for a programme " +
        "and a reason.",
    },
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/review": {
    PUT: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the form is " +
        "read: a review save has to carry a score, a comment or an overall comment, so every " +
        "signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/placement": {
    GET: {
      expect: adminOnly(404),
      why:
        "One person's placement is an admin's alone, decided on the session before anything is read; " +
        "the admin is then told the form is missing.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "Placing somebody is admin only, decided before the body is read; the admin then meets the " +
        "body check, which an empty body fails before anything is read or written.",
    },
  },
  "/api/admissions/forms/[roundId]/intake/fill": {
    POST: {
      expect: adminOnly(400),
      why:
        "The one-button fill is admin only, decided before the body is read; the admin then meets the " +
        "body check, which an empty body fails before anything is read or written.",
    },
  },
  "/api/admissions/forms/[roundId]/intake": {
    POST: {
      expect: adminOnly(400),
      why:
        "Planning the whole intake is admin only, decided before the body is read; the admin " +
        "then meets the body check, which an empty body fails before anything is read or sent anywhere.",
    },
  },
  "/api/admissions/forms/[roundId]/intake/clear": {
    POST: {
      expect: adminOnly(400),
      why:
        "Clearing every read is admin only, decided before the body is read; the admin then " +
        "meets the body check, which an empty body fails without confirm: true, so nothing is deleted.",
    },
  },
  "/api/admissions/forms/[roundId]/pool": {
    GET: {
      expect: adminOnly(404),
      why:
        "Admin only (running the term), decided before the read: every other session is " +
        "forbidden whether or not the form exists, and the admin is told the id is missing.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. A pooled outcome has to say who it is for.",
    },
  },
  "/api/admissions/forms/[roundId]/pool/note": {
    PUT: {
      expect: adminOnly(400),
      why:
        "Saving an invitation's personal note is admin only, decided before the body is read; the " +
        "admin then meets the body check, which an empty body fails before anything is read or written.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Asking Claude to draft that note is admin only, decided before the body is read; the admin " +
        "then meets the body check, which an empty body fails before anything is read or sent to Claude.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]": {
    GET: {
      expect: signedIn(404),
      fields: ["programme"],
      why:
        "A programme's settings are for its lead and for admins. A caller with no role on the " +
        "programme gets the 404 a missing programme gets, and here the form is missing for " +
        "everybody.",
    },
    PATCH: {
      expect: signedIn(400),
      why:
        "Session required, then the body is validated before any document is read, so every " +
        "signed-in persona meets the same 400 on an empty change whether or not the programme " +
        "exists. Who may edit is decided from the form, inside the write.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/applications": {
    GET: {
      expect: signedIn(404),
      fields: ["board"],
      why:
        "404 rather than 403 by design: a missing form, a missing programme and a programme " +
        "the caller has no role on are answered in the same words, so the list never confirms " +
        "that a form or a programme exists.",
    },
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the form is " +
        "read: a bulk decision has to be Accept or Pool and name at least one application, so " +
        "every signed-in persona meets the same 400 on an empty body.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement": {
    POST: {
      expect: adminOnly(400),
      why:
        "Asking for an arrangement into groups is admin only, decided before the body is read; " +
        "the admin then meets the body check, which an empty body fails before anything is read " +
        "or sent anywhere.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/best-answers": {
    GET: {
      expect: adminOnly(400),
      why:
        "Claude's best answers to a week (privacy v13): an admin's alone since privacy v15, decided on the " +
        "session before anything is read; the admin then meets the query check, which week.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Asking Claude for a week's best answers: an admin's alone since privacy v15, decided on the session " +
        "before the body is read; the admin then meets the body check, which week, before anything is sent.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/pangram": {
    GET: {
      expect: adminOnly(400),
      why:
        "Who a week's Pangram check would send: an admin's alone, decided on the session before anything is " +
        "read; the admin then meets the query check, which week.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/pangram": {
    GET: {
      expect: adminOnly(404),
      fields: ["notCounted", "pangram", "parts", "tooShort"],
      why:
        "Pangram's readings of one person's coursework: an admin's alone, decided on the session before " +
        "anything is read; the admin is then told the programme is not there.",
    },
    POST: {
      expect: adminOnly(404),
      why:
        "Asking Pangram about one person's coursework: an admin's alone, decided on the session; an empty " +
        "body asks for every week, and the admin is then told the programme is not there.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes": {
    GET: {
      expect: signedIn(404),
      fields: ["agreed", "claude", "forLeads", "hidden", "notes", "runs"],
      why:
        "The notes about one person on a programme (privacy v15), for its lead and admins, decided from the form " +
        "(loadProgrammeRun) before anything about the person is read: a form the address does not name is the same " +
        "404 for everybody signed in, an admin included. Of the fields, the lead is sent notes and forLeads alone " +
        "(projectNotesForLead); an admin is sent the programme's page as the admin area shows it.",
    },
    POST: {
      expect: signedIn(404),
      why:
        "Keeping a note about somebody on a programme: a view-as session refused first, then the programme's own " +
        "gate from the form before the body is read, so a form the address does not name is the same 404 for " +
        "everybody signed in.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/[noteId]": {
    PATCH: {
      expect: signedIn(404),
      why:
        "Changing a note about somebody on a programme: a view-as session refused first, then the programme's own " +
        "gate from the form before the body or the note is read, so a form the address does not name is the same " +
        "404 for everybody signed in.",
    },
    DELETE: {
      expect: signedIn(404),
      why:
        "Deleting a note about somebody on a programme: a view-as session refused first, then the programme's own " +
        "gate from the form before the note is read, so a form the address does not name is the same 404 for " +
        "everybody signed in.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/circles": {
    GET: {
      expect: adminOnly(404),
      fields: ["circles"],
      why:
        "Reading Circles (the run's groups as they are, each person's week and Claude's reads) is admin only, " +
        "decided on the session before anything is read; the admin is then told the programme is missing.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/assessments": {
    GET: {
      expect: adminOnly(404),
      fields: ["configured", "marks"],
      why:
        "The Claude and Pangram marks on a programme's list are an admin's alone, decided on " +
        "the session before anything is read; the admin is then told the programme is missing.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Asking Claude about a whole programme is admin only, decided before the body is read; " +
        "the admin then meets the body check, which an empty body fails before anything is read " +
        "or sent anywhere.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles": {
    PUT: {
      expect: signedIn(400),
      why:
        "Session required, then the body is validated before any document is read: a roles " +
        "change has to say who leads or who reviews. Who may name whom is setProgrammeRoles's " +
        "decision, taken from the form once it is read.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/run": {
    GET: {
      expect: adminOnly(404),
      fields: ["panel"],
      why:
        "Admin only (placing people on a run is part of running the term), decided before the " +
        "read: every other session is forbidden whether or not the form or the programme " +
        "exists, a programme's own lead included, and the admin is told the id is missing.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Naming a run has to say which run, or no run.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over": {
    POST: {
      expect: adminOnly(404),
      fields: ["ok", "receipt", "panel"],
      why:
        "Admin only, decided before anything is read: every other session is forbidden " +
        "whether or not the form exists. It takes no body, so the admin goes straight to the " +
        "form, and is told the id is missing.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places": {
    POST: {
      expect: signedIn(400),
      why:
        "The body is checked before anything is read, so every signed-in persona meets the " +
        "validation (an empty body picks nobody). Who may offer is decided from the form once a " +
        "valid body arrives: an admin; the programme's lead and reviewer are forbidden; anybody " +
        "with no role on it is told the programme is not there.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places/test": {
    POST: {
      expect: signedIn(400),
      why:
        "As the press: the body (who, which group, which day to accept by) is checked before " +
        "anything is read, then the role from the form. A test goes only to the address on the " +
        "session.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export": {
    POST: {
      expect: signedIn(404),
      why:
        "The Attendance tab's Download CSV, gated like the tab: signed in, then the role from the " +
        "form (loadProgrammeRun), so a form, a programme or a role that is not there is the same " +
        "404 for everybody, a reviewer is refused, and only the programme's lead and admins are " +
        "handed a file, after its export-log row is written. It takes no body.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind": {
    POST: {
      expect: signedIn(400),
      why:
        "The Overview's Remind: the body (which group, which session, how many the button said " +
        "it emails) is checked before anything is read, so every signed-in persona meets the same " +
        "400 on an empty body. Then the role from the form, as the Overview's own gate: only the " +
        "programme's lead and admins email a group's facilitators.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind": {
    POST: {
      expect: signedIn(400),
      why:
        "Remind on the Overview's card of who has not said when they are free: the body (how many " +
        "the button said it emails) is checked before anything is read, so every signed-in persona " +
        "meets the same 400 on an empty body. Then the role from the form, as the Overview's own " +
        "gate: only the programme's lead and admins remind anybody.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing": {
    PUT: {
      expect: signedIn(400),
      why:
        "One person's Finished switch on the Overview, once the run's last session is over. View-as " +
        "is refused first, then the session, then the body (whose switch, and which way) is checked " +
        "before anything is read, so every signed-in persona meets the same 400 on an empty one. Who " +
        "may (the programme's lead or an admin) is decided from the form once a valid body arrives; a " +
        "reviewer is refused and anybody with no role on it is told the programme is not there.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask": {
    POST: {
      expect: signedIn(400),
      why:
        "Asking one person to facilitate one group: the body (who, which group, the day and time to " +
        "answer by, the number of emails the button showed) is checked before anything is read, so " +
        "every signed-in persona meets the same 400 on an empty one. Who may ask is decided from the " +
        "form after it: the programme's lead or an admin.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask/test": {
    POST: {
      expect: signedIn(400),
      why:
        "As the ask: the body (whose email, which group, the day and time to answer by) is checked " +
        "before anything is read, then the role from the form. A test goes only to the address on the " +
        "session.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/case/draft": {
    POST: {
      expect: signedIn(400),
      why:
        "Claude's draft of the sentence that makes the case to somebody who did not offer: the body " +
        "(whose sentence) is checked before anything is read, so every signed-in persona meets the same " +
        "400 on an empty one. Who may is decided from the form after it: an admin, never the lead.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/remind": {
    POST: {
      expect: signedIn(400),
      why:
        "Reminding one person of their ask: the body (the ask, and the number of emails the button " +
        "showed) is checked before anything is read, then the role from the form.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/training": {
    PUT: {
      expect: signedIn(400),
      why:
        "The facilitators' training, from the Settings tab: the body (a day, a time and a room, or " +
        "null) is checked before anything is read, then the role from the form.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing/rule": {
    PUT: {
      expect: signedIn(400),
      why:
        "The rule for who finished, from the Settings tab: as the switch's route, the body (a whole " +
        "number of sessions, or null) is checked before anything is read, then the role from the " +
        "form. Only the programme's lead and admins are ever shown the number.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups": {
    POST: {
      expect: signedIn(400),
      why:
        "Add a group, from the Groups tab's Times view: view-as is refused first, then the session, then the " +
        "body (a name, a day, a start, a length and the places) is checked before anything is read, then the role " +
        "from the form. Only the programme's lead and admins add one.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups-go-out": {
    PUT: {
      expect: signedIn(400),
      why:
        "When groups go out, from the Groups tab: view-as is refused first, then the session, then the " +
        "body (a whole date, or null) is checked before anything is read, then the role from the form. " +
        "Only the programme's lead and admins set it.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/room": {
    PUT: {
      expect: signedIn(400),
      why:
        "A group's weekly room, beside its campus on the Groups tab: view-as is refused first, then the session, " +
        "then the body (the room as text) is checked before anything is read, then the role from the form. Only " +
        "the programme's lead and admins change it, before Publish and after.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus": {
    PUT: {
      expect: signedIn(400),
      why:
        "A group's campus, from the Groups tab's Sessions view: view-as is refused first, then the session, " +
        "then the body (one of the three campuses, or null) is checked before anything is read, then the role " +
        "from the form. Only the programme's lead and admins change it, before Publish and after.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/time": {
    PUT: {
      expect: signedIn(400),
      why:
        "A group's day and start, from the Groups tab's Times view: view-as is refused first, then the session, " +
        "then the body (a day, a start and the time the dialog was opened on) is checked before anything is read, " +
        "then the role from the form. Only the programme's lead and admins change it, and not once Publish has " +
        "told somebody when the group meets.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read, so every signed-in persona meets the same 400 on an empty one. Who may make and " +
        "change an incubator's teams (its lead or an admin) is decided from the form once a valid " +
        "body arrives; a reviewer is refused and anybody with no role on it is told the programme is not there.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body (the two numbers the button showed) " +
        "is checked before anything is read, so every signed-in persona meets the same 400 on an empty " +
        "one. The role comes from the form once a valid body arrives, and nothing is sent until the " +
        "presser has sent themselves a test.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates/test": {
    POST: {
      expect: signedIn(404),
      why:
        "It takes no body: after the session it reads the form the ids name, and the battery's ids name " +
        "none, so every signed-in persona is told the programme is not there. With real ids the role " +
        "comes from the form, and a test goes only to the address on the session.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell": {
    POST: {
      expect: signedIn(400),
      why:
        "As the teams route: the body (how many emails the button showed) is checked before " +
        "anything is read, then the role from the form. Nothing is sent until the presser has " +
        "sent themselves a test.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell/test": {
    POST: {
      expect: signedIn(404),
      why:
        "It takes no body: after the session it reads the form the ids name, and the battery's ids " +
        "name none, so every signed-in persona is told the programme is not there. With real ids the " +
        "role comes from the form, and a test goes only to the address on the session.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/hand-in": {
    PUT: {
      expect: signedIn(400),
      why:
        "An incubator's hand-in dates, from the Teams tab: view-as is refused first, then the session, then " +
        "the body (a whole date or null, and a week from 1 to 60 or null) is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may set them (the programme's " +
        "lead or an admin) is decided from the form once a valid body arrives.",
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/test-email": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the body is validated before any document is read: a test has " +
        "to name one of the programme's three emails, so every signed-in persona meets the same " +
        "400 whether or not the programme exists. Who may ask (its lead or an admin) is decided " +
        "from the form once it is read, and the test goes to the caller's own address.",
    },
  },
  "/api/admissions/forms/[roundId]/review-settings": {
    PUT: {
      expect: adminOnly(400),
      why:
        "The switch that shows other reviewers' scores is admin only, decided before the body " +
        "is read: every other session is forbidden and the admin meets the validation, which " +
        "wants true or false.",
    },
  },
  "/api/admissions/forms/[roundId]/send": {
    GET: {
      expect: adminOnly(404),
      why:
        "Admin only (running the term), decided before the read: every other session is " +
        "forbidden whether or not the form exists, and the admin is told the id is missing.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. The send has to say how many emails the page showed.",
    },
  },
  "/api/admissions/forms/[roundId]/send/test": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. A test has to name one of the three emails.",
    },
  },
  "/api/admissions/forms/[roundId]/sets": {
    GET: {
      expect: adminOnly(404),
      why:
        "The question sets are the form, and the form is an admin's to edit: everyone else is " +
        "forbidden before the read, and the admin is told the form is missing.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read; the admin meets the validation: a new " +
        "question set needs a name and somebody to show it to.",
    },
  },
  "/api/admissions/forms/[roundId]/sets/[setId]": {
    PATCH: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read; the admin meets the validation on an " +
        "empty change before any read.",
    },
    DELETE: {
      expect: adminOnly(404),
      why:
        "Admin only, decided before the read: everyone else is forbidden and the admin is " +
        "told the form is missing.",
    },
  },
  "/api/admissions/forms/[roundId]/status": {
    POST: {
      expect: adminOnly(400),
      why:
        "Moving a form along its term is admin only, decided before the body or any document " +
        "is read: every other session is forbidden in the same words whether or not the form " +
        "exists, and the admin meets the validation, which asks for a status.",
    },
  },
  "/api/admissions/rounds": {
    GET: {
      expect: signedIn(200),
      fields: ["canAuthor", "rounds"],
      why:
        "Any signed-in account may list rounds, and canSeeRound filters the list per caller; " +
        "here the list is empty, so pending and rejected see nothing and canAuthor is false.",
    },
    POST: {
      expect: adminOnly(400, { approveCourse: 400 }),
      why:
        "Round authors (admin or approveCourse) may create a round and meet the validation; " +
        "everyone else is forbidden before the body is read.",
    },
  },
  "/api/admissions/rounds/[roundId]": {
    GET: {
      expect: signedIn(404),
      why:
        "404 rather than 403 by design: whether a round exists is itself information about an " +
        "intake, so every session including pending and rejected is told the same thing.",
    },
    PATCH: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Round authors (admin or approveCourse) may edit; for them the round is missing, " +
        "everyone else is forbidden before the read.",
    },
  },
  "/api/admissions/rounds/[roundId]/apply": {
    GET: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is " +
        "admitted, a rejected one is refused, and the round or run is then missing.",
    },
    POST: {
      expect: approvedOnly(403),
      why:
        "The applicant lane, then the captcha: every session that gets past requireApplicant " +
        "is refused by reCAPTCHA on a tokenless request before the round is read, rejected " +
        "accounts included.",
    },
    PATCH: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is " +
        "admitted, a rejected one is refused, and the round or run is then missing.",
    },
    DELETE: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The applicant lane, then the withdrawal needs its typed word; a rejected account is " +
        "refused first.",
    },
  },
  "/api/admissions/rounds/[roundId]/apply/stage/[stageId]": {
    POST: {
      expect: approvedOnly(403),
      why:
        "The applicant lane, then the captcha before the round is read; every session past " +
        "requireApplicant meets the captcha refusal.",
    },
  },
  "/api/admissions/rounds/[roundId]/apply/submit": {
    POST: {
      expect: approvedOnly(403),
      why:
        "The applicant lane, then the captcha before the round is read; every session past " +
        "requireApplicant meets the captcha refusal.",
    },
  },
  "/api/admissions/rounds/[roundId]/decide": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one. A decision has " +
        "to name the application it is about, and an empty body names none.",
    },
  },
  "/api/admissions/rounds/[roundId]/destroy": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Destroying a round needs its typed confirmation.",
    },
  },
  "/api/admissions/rounds/[roundId]/destroy-manifest": {
    GET: {
      expect: adminOnly(404),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/admissions/rounds/[roundId]/reminders/send-now": {
    POST: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Round authors (admin or approveCourse); the round is missing for them, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/admissions/rounds/[roundId]/roles": {
    PUT: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Appointing reviewers is admin only.",
    },
  },
  "/api/admissions/rounds/[roundId]/stages": {
    GET: {
      expect: signedIn(404),
      why:
        "404 for every session, like the round itself: a stage list is information about an " +
        "intake and the applicant projection serves it only to those the round admits.",
    },
  },
  "/api/admissions/rounds/[roundId]/stages/[stageId]": {
    PUT: {
      expect: adminOnly(400, { approveCourse: 400 }),
      why:
        "Round authors (admin or approveCourse) meet the validation; everyone else is " +
        "forbidden before the body is read.",
    },
    DELETE: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Round authors (admin or approveCourse); the round is missing for them, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/admissions/rounds/[roundId]/stages/[stageId]/release": {
    POST: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Round authors (admin or approveCourse); the round is missing for them, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/admissions/rounds/[roundId]/status": {
    POST: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Round authors (admin or approveCourse); the round is missing for them, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/audience": {
    GET: {
      expect: approvedOnly(200),
      fields: ["groups", "names", "rows", "term"],
      why:
        "The tags a person may use to choose who a message is for, from their own records: every approved " +
        "account is answered, a member who leads and facilitates nothing with an empty list, and a pending or " +
        "rejected account is refused before anything is read. Names come only to admins and SU-recognised " +
        "committee, and never an address.",
    },
    POST: {
      expect: approvedOnly(200),
      fields: ["count"],
      why:
        "Who a choice of tags reaches, as counts: an empty body is a choice of nothing, which every approved " +
        "account may count, so the answer is the gate's and never a record's. A tag the caller may not use " +
        "refuses the whole request (tests/audience-picker.test.mjs runs that as every kind of caller).",
    },
  },
  "/api/audience/who": {
    POST: {
      expect: approvedOnly(200),
      fields: ["people"],
      why:
        "The names behind the picker's count, never an address or an account id: an empty body names nobody " +
        "to every approved account, and a tag the caller may not use refuses the whole request before a name " +
        "is read.",
    },
  },
  "/api/auth/google/callback": {
    POST: {
      expect: everyone(303),
      why:
        "The Google redirect-mode sign-in lands here with a credential; without one, " +
        "everybody is sent back to the sign-in page with an error, cookie or not.",
    },
  },
  "/api/auth/session": {
    POST: {
      expect: everyone(400),
      why:
        "The cookie mint needs an id token; without one everybody gets the same 400, and " +
        "nothing about the caller is read first.",
    },
    DELETE: {
      expect: everyone(200),
      fields: ["ok"],
      public: "Sign-out; there is no session to protect and nothing is read.",
      why:
        "Sign-out answers ok to everyone: with a session it revokes and clears, without one " +
        "there is nothing to clear. Requested last, because it revokes the persona's cookie.",
    },
  },
  "/api/auth/session/clear": {
    POST: {
      expect: everyone(200),
      fields: ["ok"],
      public: "Cookie clear; nothing is read.",
      why:
        "Clears the cookie without revoking, for a client whose two halves drifted apart; " +
        "answers ok to everyone and reads nothing.",
    },
  },
  "/api/collaborators": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the application body is validated; every signed-in persona " +
        "meets the same 400.",
    },
    PATCH: {
      expect: signedIn(400),
      why:
        "Session required, then the body is validated; every signed-in persona meets the same " +
        "400.",
    },
  },
  "/api/collaborators/[id]": {
    POST: {
      expect: everyone(403, { admin: 400 }),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Deciding a collaborator application is admin only.",
    },
    DELETE: {
      expect: everyone(403, { admin: 404 }),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/courses/[courseId]/crest": {
    PUT: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation (the battery sends no crest).",
    },
  },
  "/api/courses/[courseId]/destroy": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Destroying a course needs its typed confirmation.",
    },
  },
  "/api/courses/[courseId]/destroy-manifest": {
    GET: {
      expect: adminOnly(404),
      fields: ["course", "counts", "blockers", "interrupted"],
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/courses/[courseId]/facilitator-guide": {
    GET: {
      expect: signedIn(403),
      fields: ["courseId", "documents", "weeks"],
      why:
        "The titles of a course's facilitator guide, behind the guide's own gate: a facilitator of a " +
        "live group on a run of the course, the lead of a programme naming a run of it, or an admin. " +
        "A course that is not there is the same 403 for everybody, an admin included, so nobody " +
        "learns which courses exist.",
    },
  },
  "/api/courses/[courseId]/facilitator-guide/[slot]": {
    GET: {
      expect: adminOnly(400),
      why:
        "Copying a document of a course's facilitator guide out as Markdown is for admins, decided on the " +
        "session, and the lead of a programme naming a live run of the course (the Weeks tab's guide box), " +
        "decided from the course's runs and the forms before any document is read: every other session is " +
        "forbidden, and the admin meets the place check, which a slot that is not a course document or a " +
        "week's plan or notes fails.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: reading a pasted document is for admins " +
        "and the programme's lead, decided before the body or any document is read, and the admin meets the " +
        "place check.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: saving a pasted document is for admins " +
        "and the programme's lead, decided before the body or any document is read, and the admin meets the " +
        "place check.",
    },
  },
  "/api/courses/[courseId]/facilitator-guide/printables/pdf": {
    GET: {
      expect: everyone(200, { anonymous: 307 }),
      why:
        "A course's printables as an A4 PDF, behind the facilitator guide's own gate: a facilitator of a live " +
        "group on a run of the course, the lead of a programme naming a run of it, or an admin. Everybody it " +
        "refuses, and everybody asking about a course that is not there, an admin included, is given the " +
        "guide's one calm sentence at 200, as plain text and with no PDF, so nobody learns which courses exist. " +
        "Somebody signed out is sent to sign in (a 307 to /login), because the route is opened by a link.",
    },
  },
  "/api/courses/[courseId]/page": {
    PUT: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Authorship is per course, so the course is read " +
        "first.",
    },
  },
  "/api/courses/[courseId]/page/generate-themes": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing.",
    },
  },
  "/api/courses/[courseId]/predictions": {
    POST: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: reading a pasted predictions card is an " +
        "admin's, decided before the body or any document is read, and the admin meets the body check on an " +
        "empty one.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: saving or taking off a course's predictions " +
        "card is an admin's, decided before the body or any document is read, and the admin meets the body " +
        "check on an empty one.",
    },
  },
  "/api/courses/[courseId]/publish": {
    POST: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Course approvers (admin or approveCourse) may publish; the course is missing for " +
        "them, everyone else is forbidden before the read.",
    },
  },
  "/api/courses/[courseId]/rubric": {
    POST: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: reading a pasted rubric is an " +
        "admin's, decided before the body or any document is read, and the admin meets the body " +
        "check, since an empty body sends no table.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: saving a course's rubric is an " +
        "admin's, decided before the body or any document is read, and the admin meets the body " +
        "check, since an empty body sends no table.",
    },
  },
  "/api/courses/[courseId]/routes": {
    POST: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: reading a pasted list of routes is an " +
        "admin's, decided before the body or any document is read, and the admin meets the body check " +
        "on an empty one.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: saving a course's routes and " +
        "deadlines is an admin's, decided before the body or any document is read, and the admin meets " +
        "the body check on an empty one.",
    },
  },
  "/api/courses/[courseId]/templates": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
    GET: {
      expect: adminOnly(200, { draftCourse: 200, approveCourse: 200 }),
      fields: ["templates"],
      why:
        "Course authors (admin, draftCourse, approveCourse) read a course's templates; the " +
        "list is empty here, everyone else is forbidden.",
    },
  },
  "/api/courses/calendar": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. The caller's own calendar link is " +
        "made, or replaced, once a valid body arrives; there is no uid in the request.",
    },
  },
  "/api/courses/calendar/[token]/sessions.ics": {
    GET: {
      expect: everyone(200),
      public: "A calendar app fetches it with no session; the secret in the address is the gate, and a link that opens nothing answers one empty calendar.",
      why:
        "A person's calendar, fetched by their calendar app with no session: the secret in the address is " +
        "the gate, and every link that opens nothing, this battery's made-up one included, answers the same " +
        "empty calendar whoever asks. A calendar file, not JSON, so no fields.",
    },
  },
  "/api/courses/exercise-responses/[responseId]/review": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/courses/groups/[groupId]/attendance": {
    GET: {
      expect: adminOnly(404),
      fields: ["group", "sessions", "members", "notYetTold", "leavers", "records", "participantNotes", "canEditPushed", "ending"],
      why:
        "The register gate (gateGroupRegister) collapses missing, archived and not-yours onto " +
        "one 403 for a non-admin and tells an admin the group is missing.",
    },
    POST: {
      expect: adminOnly(404),
      why:
        "The register gate collapses missing, archived and not-yours onto one 403 for a " +
        "non-admin; an admin is told the group is missing.",
    },
    PATCH: {
      expect: adminOnly(404),
      why:
        "The register gate collapses missing, archived and not-yours onto one 403 for a " +
        "non-admin; an admin is told the group is missing.",
    },
  },
  "/api/courses/groups/[groupId]/attendance/push": {
    POST: {
      expect: adminOnly(404),
      why:
        "The register gate collapses missing, archived and not-yours onto one 403 for a " +
        "non-admin; an admin is told the group is missing.",
    },
  },
  "/api/courses/groups/[groupId]/check-in": {
    GET: {
      expect: adminOnly(404),
      fields: ["sessionKey", "card", "last"],
      why:
        "What the register's check-in card shows: the register's own gate (gateGroupRegister) collapses " +
        "missing, archived and not-yours onto one 403 for a non-admin and tells an admin the group is " +
        "missing, before the session in the query is read. Never the programme's lead, who reads the " +
        "register and runs no session.",
    },
    POST: {
      expect: adminOnly(404),
      why:
        "Opening a session's check-in: view-as first, then the register's own gate, which collapses " +
        "missing, archived and not-yours onto one 403 for a non-admin and tells an admin the group is " +
        "missing, before the body is read.",
    },
  },
  "/api/courses/groups/[groupId]/check-in/close": {
    POST: {
      expect: adminOnly(404),
      why:
        "Closing a session's check-in: view-as first, then the register's own gate, one 403 for a " +
        "non-admin, and an admin is told the group is missing, before the body is read.",
    },
  },
  "/api/courses/groups/[groupId]/email": {
    POST: {
      expect: adminOnly(404),
      why:
        "Group staff only, collapsed onto one 403 for a non-admin; an admin is told the group " +
        "is missing.",
    },
  },
  "/api/courses/groups/[groupId]/exercises": {
    GET: {
      expect: signedIn(400),
      fields: ["group", "week", "rows", "notYetTold"],
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one. A week " +
        "id is required in the query.",
    },
  },
  "/api/courses/facilitator-asks/[askId]/answer": {
    POST: {
      expect: signedIn(400),
      why:
        "The answer to an ask to facilitate, from the person asked: the body (yes or no) is checked " +
        "before anything is read, so every signed-in persona meets the same 400 on an empty one. An " +
        "ask that is not the caller's own is answered as one that is not there.",
    },
  },
  "/api/courses/groups/[groupId]/facilitators": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. A group is staffed by admins and by the track leads of its run.",
    },
  },
  "/api/courses/groups/[groupId]/notes": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may write a note on the group " +
        "(its live facilitators, and nobody else: the lead and admins read the notes) is asked once a valid " +
        "body arrives.",
    },
  },
  "/api/courses/groups/[groupId]/notice": {
    POST: {
      expect: adminOnly(404),
      why:
        "Group staff only, collapsed onto one 403 for a non-admin; an admin is told the group " +
        "is missing.",
    },
  },
  "/api/courses/groups/[groupId]/pace": {
    PATCH: {
      expect: adminOnly(404),
      why:
        "Group staff only, collapsed onto one 403 for a non-admin; an admin is told the group " +
        "is missing.",
    },
  },
  "/api/courses/groups/[groupId]/participant-notes": {
    POST: {
      expect: adminOnly(404),
      why:
        "Group staff only, collapsed onto one 403 for a non-admin; an admin is told the group " +
        "is missing.",
    },
  },
  "/api/courses/groups/[groupId]/ratings": {
    POST: {
      expect: signedIn(400),
      why:
        "One rating of one fellow at a programme's end: view-as first, then the session, then the body is checked " +
        "before anything is read, so every signed-in persona meets the same 400 on an empty one. Who may rate in " +
        "the group (its live facilitators, the programme's lead, admins) and whom (nobody themselves, never a " +
        "co-facilitator) is asked once a valid body arrives.",
    },
  },
  "/api/courses/groups/[groupId]/roster": {
    GET: {
      expect: signedIn(404),
      fields: ["group", "facilitators", "members", "notYetTold"],
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. A roster is read by the group's facilitators, its active members and admins.",
    },
  },
  "/api/courses/groups/[groupId]/session": {
    PATCH: {
      expect: adminOnly(404),
      why:
        "Group staff only, collapsed onto one 403 for a non-admin; an admin is told the group " +
        "is missing.",
    },
  },
  "/api/courses/groups/[groupId]/session/change": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may change a session of the " +
        "group (its live facilitators, the lead of the programme naming its run, the run's track leads, " +
        "admins) is asked once a valid body arrives.",
    },
  },
  "/api/courses/groups/[groupId]/session-report": {
    PUT: {
      expect: signedIn(400),
      why:
        "One facilitator's own report on a session of their group: view-as is refused first, then the session, then " +
        "the body is checked before anything is read, so every signed-in persona meets the same 400 on an empty one. " +
        "Who may write one (the group's live facilitators, each their own, and nobody else: the programme's lead and " +
        "admins read reports on the programme's page) is asked once a valid body arrives.",
    },
  },
  "/api/courses/groups/[groupId]/draw": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may type the draw (the " +
        "group's live facilitators, the lead of the programme that names the run, and admins) is asked " +
        "once a valid body arrives, before the run's people or the week are read.",
    },
  },
  "/api/courses/groups/[groupId]/pairs": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may type the pairs (the " +
        "group's live facilitators, the lead of the programme that names the run, and admins, the " +
        "draw's own gate) is asked once a valid body arrives, before the run's people or the week are read.",
    },
  },
  "/api/courses/groups/[groupId]/shared-notes": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may add a note to the group " +
        "(its people told by Publish and its live facilitators, and nobody else: the programme's lead and " +
        "admins read the notes) is asked once a valid body arrives.",
    },
  },
  "/api/courses/groups/[groupId]/shared-notes/[noteId]": {
    DELETE: {
      expect: adminOnly(404),
      why:
        "Only a note's own writer deletes it. The roster floor is asked first, so a waiting or refused " +
        "account meets a 403; then a note that is not there, or not the caller's, is one 403 for a " +
        "non-admin, and an admin is told it is missing. The battery's ids address no note.",
    },
  },
  "/api/courses/groups/[groupId]/summary": {
    GET: {
      expect: adminOnly(404),
      fields: ["groupId", "expected", "notYetTold", "toReview", "writtenToGive", "writtenWeeks", "writtenNext", "nextEmail", "leftRecently", "coFacilitators", "whosComing", "write"],
      why:
        "What a facilitator's Home says about their group, behind the group page's own gate: a live " +
        "facilitator of the group or an admin. A missing group and one that is not the caller's collapse " +
        "onto one 403 for a non-admin, and an admin is told the group is missing.",
    },
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]": {
    PATCH: {
      expect: everyone(404),
      why:
        "404 for everyone including outsiders: the route checks the shape of its ids before " +
        "the session, and the battery's week id is not a week id ('w01' and so on), so the " +
        "address names nothing and no document is read.",
    },
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]/blocks": {
    GET: {
      expect: adminOnly(404),
      why:
        "A week for one group (Q39): the group is read first, because it names its facilitators and its " +
        "run, and a group that is missing, no longer meets or is somebody else's is one 403 for everybody " +
        "but an admin, who is told the group is not there. Nothing else is read.",
    },
    POST: {
      expect: adminOnly(404),
      why:
        "View-as is refused first, then the session, then the gate on the group, before the body: one 403 " +
        "for everybody but an admin, who is told the group is not there.",
    },
    PUT: {
      expect: adminOnly(404),
      why:
        "View-as is refused first, then the session, then the gate on the group, before the body: one 403 " +
        "for everybody but an admin, who is told the group is not there. Nothing is written.",
    },
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]/fork": {
    POST: {
      expect: everyone(404),
      why:
        "404 for everyone including outsiders: the same id-shape check as the week route above.",
    },
  },
  "/api/courses/me": {
    GET: {
      expect: signedIn(200),
      fields: ["runs"],
      why:
        "Any signed-in account, pending and rejected included, sees its own runs; the list is empty " +
        "here for every persona but the facilitator and the participant, whose places in the battery's " +
        "world are listed.",
    },
  },
  "/api/courses/progress/[progressId]/moderate": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/courses/runs/[runId]/allocate": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/courses/runs/[runId]/allocation": {
    GET: {
      expect: signedIn(404),
      fields: ["run", "groups", "people", "publish"],
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Track leads are per run, so the run is read " +
        "first.",
    },
  },
  "/api/courses/runs/[runId]/allocation/publish": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read: it carries the number of emails the board showed, so every signed-in persona " +
        "meets the same 400 on an empty one.",
    },
  },
  "/api/courses/runs/[runId]/allocation/publish/test": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required (with an address on it to send the test to), then the document is read " +
        "and its own membership decides. The battery's id addresses nothing, so every signed-in " +
        "persona is told that the document is missing. Track leads are per run, so the run is " +
        "read first.",
    },
  },
  "/api/courses/runs/[runId]/allocation/publish/notes": {
    GET: {
      expect: signedIn(404),
      fields: ["ok", "section"],
      why:
        "The notes for people placed outside the times they gave, for Publish's own page: session required, then " +
        "the run is read. The battery's id addresses nothing, so every signed-in persona is told the run is " +
        "missing. It writes nothing.",
    },
    PUT: {
      expect: signedIn(404),
      why:
        "Saving a note, or none: a view-as session is refused first, then the session, then the run is read before " +
        "the body, so every signed-in persona is told the run is missing.",
    },
    POST: {
      expect: adminOnly(404),
      why:
        "Asking Claude to draft a note is an admin's, refused before anything is read; the admin then meets the " +
        "missing run.",
    },
  },
  "/api/courses/runs/[runId]/allocation/publish/preview": {
    GET: {
      expect: signedIn(404),
      fields: ["incubator", "people", "facilitators", "joined", "noted", "notedEmail", "push", "notesNeeded", "refusals"],
      why:
        "Publish's two emails, for Publish's own page: session required, then the run is read and " +
        "Publish's own gate decides. The battery's id addresses nothing, so every signed-in persona " +
        "is told the run is missing. It writes nothing.",
    },
  },
  "/api/courses/runs/[runId]/time-answer": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body (a group id and yes or cant, with why and " +
        "which times would for cant) is checked before anything is read, so every signed-in persona meets the " +
        "same 400 on an empty one. The caller's own seat is read once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/applications": {
    GET: {
      expect: signedIn(404),
      fields: ["run", "groups", "applications"],
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Reviewers are per run, so the run is read " +
        "first.",
    },
  },
  "/api/courses/runs/[runId]/applications/[uid]/decide": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/courses/runs/[runId]/applications/[uid]/notes": {
    PATCH: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing.",
    },
  },
  "/api/courses/runs/[runId]/apply": {
    POST: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane refuses a rejected account; everyone else meets the body " +
        "validation before the run is read.",
    },
    PATCH: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The applicant lane (requireApplicant): a pending account is an applicant and is " +
        "admitted, a rejected one is refused, and the round or run is then missing.",
    },
    DELETE: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The applicant's own application is looked up by " +
        "run.",
    },
  },
  "/api/courses/runs/[runId]/apply-template": {
    POST: {
      expect: adminOnly(400, { approveCourse: 400 }),
      why:
        "Course authors (admin or approveCourse) meet the validation; everyone else is " +
        "forbidden before the body is read.",
    },
  },
  "/api/courses/runs/[runId]/archive": {
    PATCH: {
      expect: adminOnly(400, { approveCourse: 400 }),
      why:
        "Course authors (admin or approveCourse) meet the validation; everyone else is " +
        "forbidden before the body is read.",
    },
  },
  "/api/courses/runs/[runId]/clone-weeks": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/courses/runs/[runId]/comments": {
    GET: {
      expect: signedIn(400),
      fields: ["items"],
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one. A week " +
        "is required in the query.",
    },
  },
  "/api/courses/runs/[runId]/destroy": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Destroying a run needs its typed confirmation.",
    },
  },
  "/api/courses/runs/[runId]/destroy-manifest": {
    GET: {
      expect: adminOnly(404),
      fields: ["run", "counts", "blockers", "interrupted"],
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/courses/runs/[runId]/email": {
    POST: {
      expect: adminOnly(404),
      why:
        "Run staff only through gateRunStaff, collapsed onto one 403 for a non-admin; an " +
        "admin is told the run is missing.",
    },
  },
  "/api/courses/runs/[runId]/enrol": {
    GET: {
      expect: signedIn(404, { rejected: 403 }),
      fields: ["groups", "enrolment"],
      why:
        "The enroller gate refuses a rejected account; every other session is told the run is " +
        "missing.",
    },
    POST: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The enroller gate refuses a rejected account; everyone else meets the body " +
        "validation before the run is read.",
    },
    PATCH: {
      expect: signedIn(400, { rejected: 403 }),
      why:
        "The enroller gate refuses a rejected account; everyone else meets the body " +
        "validation before the run is read.",
    },
    DELETE: {
      expect: signedIn(404, { rejected: 403 }),
      why:
        "The enroller gate refuses a rejected account; every other session is told the run is " +
        "missing.",
    },
  },
  "/api/courses/runs/[runId]/enrol-mode": {
    PATCH: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation.",
    },
  },
  "/api/courses/runs/[runId]/enrolments/[uid]/reinstate": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing.",
    },
  },
  "/api/courses/runs/[runId]/enrolments/[uid]/remove": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing.",
    },
  },
  "/api/courses/runs/[runId]/exercises/[exerciseId]/submit": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/courses/runs/[runId]/facilitators/asking": {
    GET: {
      expect: signedIn(404),
      fields: ["roundId", "programmeId", "runId", "viewer", "shortName", "programmeName", "kind", "headline", "groups", "email", "training", "leadName", "columns", "people", "notOffered", "asksFacilitating", "decisionsSent", "today", "test", "caseTest", "siteAddress", "grid"],
      why:
        "The Facilitators view as one model: session required, then the programme that names the run " +
        "is found, and its lead or an admin is answered. The battery's id names no run any programme " +
        "names, so every signed-in persona is told there is no programme here. `notOffered` (the people " +
        "who did not offer, for making the case) is filled for an admin and empty for a lead.",
    },
  },
  "/api/courses/runs/[runId]/facilitators": {
    GET: {
      expect: { anonymous: 401, "*": 403, suCommittee: 404, admin: 404 },
      fields: ["groups", "people"],
      why:
        "The run's groups and the approved accounts by name, for the Facilitators view of a programme's Groups tab. " +
        "Refused from the session alone to anybody outside the roster's own tier (an admin or SU-recognised " +
        "committee, as firestore.rules reads users); for those inside it, a run that is not there is a 404, and a run " +
        "they do not staff (admin, track lead, or the lead of the programme that names it) is a 403.",
    },
  },
  "/api/courses/runs/[runId]/guide/[doc]": {
    GET: {
      expect: adminOnly(400),
      why:
        "Copying a programme's Start here or Glossary out as Markdown is an admin's for now (Q39), decided " +
        "before anything is read: every other session is forbidden, and the admin meets the page check, " +
        "which a name that is not start-here or glossary fails.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: reading a pasted Start here or Glossary " +
        "is an admin's, decided before the body or any document is read, and the admin meets the page check.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: saving a pasted Start here or Glossary " +
        "is an admin's, decided before the body or any document is read, and the admin meets the page check.",
    },
  },
  "/api/courses/runs/[runId]/fill-in-boxes": {
    GET: {
      expect: signedIn(400),
      fields: ["boxes"],
      why:
        "Session required, then the query is checked before anything is read (whose boxes, and which " +
        "week), so every signed-in persona meets the same 400 on an empty one. Once a valid query arrives " +
        "the one gate decides (the writer's group's facilitators, the programme's lead and admins; a " +
        "facilitator's own, the lead and admins) before a row is read.",
    },
  },
  "/api/courses/runs/[runId]/fill-in-boxes/[boxId]": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read, so every signed-in persona meets the same 400 on an empty one. The caller's own seat, " +
        "or a group they facilitate, is asked once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/material-notes": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/courses/runs/[runId]/my-exercises": {
    GET: {
      expect: signedIn(400),
      fields: ["responses"],
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one. A week " +
        "is required in the query.",
    },
  },
  "/api/courses/runs/[runId]/normalise-weeks": {
    POST: {
      expect: adminOnly(404, { approveCourse: 404 }),
      why:
        "Course authors (admin or approveCourse); the run is missing for them, everyone else " +
        "is forbidden before the read.",
    },
  },
  "/api/courses/runs/[runId]/overview": {
    GET: {
      expect: signedIn(404),
      fields: ["run", "calendarSource", "currentWeek", "weeks", "askToSwap", "weekSchedule", "programme", "shownCrest", "forkedWeekIds", "enrolment", "group", "groups", "ownAttendance", "finished", "access", "beforeGroups", "whatsNext"],
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing.",
    },
  },
  "/api/courses/runs/[runId]/pitching": {
    GET: {
      expect: signedIn(403),
      why:
        "Pitching week is read by somebody with a live learner seat in one of the run's groups, " +
        "told by Publish, whose account stands, and by nobody else: every signed-in persona has no " +
        "seat on a run that addresses nothing, and is refused the same way whether or not it exists.",
    },
  },
  "/api/courses/runs/[runId]/pitching/picks": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read, so every signed-in persona meets the same 400 on an empty one. The caller's own seat " +
        "is asked once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/pitching/pitch": {
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read, so every signed-in persona meets the same 400 on an empty one. The caller's own seat " +
        "is asked once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/team/check-in": {
    POST: {
      expect: signedIn(400),
      why:
        "This week's check-in on a team's page: view-as is refused first, then the session, then the body " +
        "is checked before anything is read, so every signed-in persona meets the same 400 on an empty one. " +
        "Whether the caller is in a team they have been told about is asked once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/team/hand-in": {
    POST: {
      expect: signedIn(400),
      why:
        "A team's one hand-in: as the check-in, the body (a link, a summary, who did what, the tick) is " +
        "checked before anything is read, then whether the caller is in a team they have been told about, " +
        "then the due day's 23:59.",
    },
  },
  "/api/courses/runs/[runId]/team/links": {
    POST: {
      expect: signedIn(400),
      why:
        "Adding a link to a team's page: as the check-in, the body (a label and an https address) is " +
        "checked before anything is read, then whether the caller is in a team they have been told about.",
    },
  },
  "/api/courses/runs/[runId]/team/links/[linkId]": {
    DELETE: {
      expect: signedIn(403),
      why:
        "Removing a link takes no body: after the session the caller's own seat on the run is read first, " +
        "and the battery's run addresses nothing, so every signed-in persona is refused the same way " +
        "whether or not the run exists, before any link is read.",
    },
  },
  "/api/courses/runs/[runId]/packs-and-cases/[blockId]": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read, so every signed-in persona meets the same 400 on an empty one. The caller's own seat, " +
        "or a group they facilitate, is asked once a valid body arrives; the record written is always " +
        "the caller's own.",
    },
  },
  "/api/courses/runs/[runId]/predictions": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read " +
        "(which card, which question, the answer's type), so every signed-in persona meets the same 400 on " +
        "an empty one. Who has a card is asked once a valid body arrives; the card written is always the " +
        "caller's own.",
    },
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read (seal " +
        "or open), so every signed-in persona meets the same 400 on an empty one. The card sealed or opened " +
        "is always the caller's own.",
    },
  },
  "/api/courses/runs/[runId]/predictions/people": {
    GET: {
      expect: adminOnly(404),
      fields: ["people"],
      why:
        "Whose predictions cards exist on a run is an admin's to know, decided before anything is read; the " +
        "admin is told the run is missing. Never an answer: three fields are asked for.",
    },
  },
  "/api/courses/runs/[runId]/predictions/people/[uid]": {
    POST: {
      expect: adminOnly(404),
      why:
        "View-as is refused first, then the session, then the gate: opening somebody's predictions card is an " +
        "admin's, decided before anything is read, and the admin is told the run is missing before any opening " +
        "is recorded.",
    },
  },
  "/api/courses/runs/[runId]/reflections": {
    GET: {
      expect: signedIn(400),
      fields: ["reflections"],
      why:
        "Session required, then the query is checked before anything is read (whose reflections, and " +
        "which week), so every signed-in persona meets the same 400 on an empty one. Once a valid query " +
        "arrives the programme's lead and admins read; everybody else is refused before a row is read.",
    },
  },
  "/api/courses/runs/[runId]/reflections/[promptId]": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read, so every signed-in persona meets the same 400 on an empty one. The caller's own seat, " +
        "or a group they facilitate, is asked once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/retrospective": {
    GET: {
      expect: adminOnly(404, { draftCourse: 404, approveCourse: 404 }),
      fields: ["run", "enrolledCount", "ratingFloor", "truncated", "materials"],
      why:
        "Course authors (admin, draftCourse, approveCourse) read a run's retrospective; the " +
        "run is missing for them, everyone else is forbidden before the read.",
    },
  },
  "/api/courses/runs/[runId]/roles": {
    GET: {
      expect: adminOnly(404),
      fields: ["candidates", "admissionsReviewerUids", "trackLeadUids", "runFacilitatorUids"],
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing. Run roles are admin only.",
    },
    POST: {
      expect: adminOnly(404),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing. Assigning run roles is admin only.",
    },
  },
  "/api/courses/runs/[runId]/status": {
    POST: {
      expect: adminOnly(400, { approveCourse: 400 }),
      why:
        "Course authors (admin or approveCourse) meet the validation; everyone else is " +
        "forbidden before the body is read.",
    },
  },
  "/api/courses/runs/[runId]/updates": {
    GET: {
      expect: adminOnly(404),
      fields: ["updates"],
      why:
        "A run's updates are read by somebody they are to: its lead, track leads and admins, a facilitator " +
        "of one of its live groups, or somebody placed on it whom Publish has told. A missing run is the " +
        "same 403 as a run the caller reads nothing on, so a run id says nothing; an admin is told it is missing.",
    },
    POST: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read, " +
        "so every signed-in persona meets the same 400 on an empty one. Who may write to whom is asked " +
        "once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/sync-tasks": {
    POST: {
      expect: approvedOnly(403),
      why:
        "Forbidden to every session on a missing run, including admins: the run's staff is " +
        "the bar and a missing run has none. Anonymous is refused first.",
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/blocks": {
    GET: {
      expect: adminOnly(400),
      why:
        "Copying a week out as Markdown is for admins and the lead of the programme that names the run " +
        "(the Weeks tab, Q39), decided before anything of the run is read (only the forms, for whether the " +
        "caller leads it): every other session is forbidden, and the admin meets the week address check, " +
        "which an id that is not w01 to w60 fails.",
    },
    POST: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: reading a pasted week is for admins " +
        "and the programme's lead, decided before the body or any document of the run is read, and the " +
        "admin meets the week address check.",
    },
    PUT: {
      expect: adminOnly(400),
      why:
        "View-as is refused first, then the session, then the gate: saving a pasted week is for admins " +
        "and the programme's lead, decided before the body or any document of the run is read, and the " +
        "admin meets the week address check.",
    },
  },
  "/api/courses/runs/[runId]/ticks/[itemId]": {
    PUT: {
      expect: signedIn(400),
      why:
        "Ticking a week's item off, the one way every tick is written: view-as is refused first, then the " +
        "session, then the body is checked before anything is read (which week, and whether it is done), so " +
        "every signed-in persona meets the same 400 on an empty one. Once a valid body arrives the caller's " +
        "own seat, a group they facilitate, or week 1's door decides, and none of them is here.",
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/submit": {
    POST: {
      expect: signedIn(400),
      why:
        "Submitting one's own week: view-as is refused first, then the session, then the body is checked " +
        "before anything is read (it must say to submit), so every signed-in persona meets the same 400 on " +
        "an empty one. Once a valid body arrives the caller's own seat decides.",
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/reopen": {
    POST: {
      expect: signedIn(400),
      why:
        "Reopening somebody's week: view-as is refused first, then the session, then the body is checked " +
        "before anything is read (whose week), so every signed-in persona meets the same 400 on an empty " +
        "one. The one gate on whose work a reader may act on is asked once a valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/ready": {
    PUT: {
      expect: adminOnly(404),
      drive: {
        body: { ready: true },
        why:
          "An empty body is the same 400 for every signed-in persona; a body that says ready reaches " +
          "the gate, which every persona here but the admin fails, and the admin meets the week address check.",
      },
      why:
        "View-as is refused first, then the session, then the body, then the gate: storing a week's Ready " +
        "is for the lead of the programme that names the run and admins, decided before anything of the run " +
        "is read (only the forms, for whether the caller leads it). Every other session is forbidden, and " +
        "the admin is told an id that is not w01 to w60 is no week.",
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/owner": {
    PUT: {
      expect: adminOnly(404),
      drive: {
        body: { ownerUid: null },
        why:
          "An empty body is the same 400 for every signed-in persona; a body naming the lead reaches the " +
          "gate, which every persona here but the admin fails, and the admin meets the week address check.",
      },
      why:
        "View-as is refused first, then the session, then the body, then the gate: choosing a week's owner " +
        "on the Weeks tab is for the lead of the programme that names the run and admins, decided before " +
        "anything of the run is read (only the forms). Every other session is forbidden, and the admin is " +
        "told an id that is not w01 to w60 is no week.",
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/mode": {
    PUT: {
      expect: adminOnly(404),
      drive: {
        body: { online: false },
        why:
          "An empty body is the same 400 for every signed-in persona; a body saying in person reaches the " +
          "gate, which every persona here but the admin fails, and the admin meets the week address check.",
      },
      why:
        "View-as is refused first, then the session, then the body, then the gate: saying how a whole week " +
        "meets is for the lead of the programme that names the run and admins, decided before anything of " +
        "the run is read (only the forms). Every other session is forbidden, and the admin is told an id " +
        "that is not w01 to w60 is no week.",
    },
  },
  "/api/courses/runs/[runId]/written-answers/[answerId]": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is " +
        "read (which week, and the answer as text or as boxes), so every signed-in persona meets the " +
        "same 400 on an empty one. The caller's own seat, or a group they facilitate, is asked once a " +
        "valid body arrives.",
    },
  },
  "/api/courses/runs/[runId]/feedback": {
    POST: {
      expect: signedIn(400),
      why:
        "Saving a piece of feedback on somebody's week: view-as is refused first, then the session, then " +
        "the body is checked before anything is read (whose week, which week, what it is on, and its " +
        "words), so every signed-in persona meets the same 400 on an empty one. The one gate on whose " +
        "work a reader may act on is asked once a valid body arrives, before anything of theirs is read.",
    },
    PATCH: {
      expect: signedIn(400),
      why:
        "Changing a piece's words: view-as is refused first, then the session, then the body is checked " +
        "before anything is read (which piece, and its words), so every signed-in persona meets the same " +
        "400 on an empty one. The piece, the one gate on whose work it is about and its writer are asked " +
        "once a valid body arrives, every refusal before the gate the same 404.",
    },
    DELETE: {
      expect: signedIn(400),
      why:
        "Deleting a piece: view-as is refused first, then the session, then the body is checked before " +
        "anything is read (which piece), so every signed-in persona meets the same 400 on an empty one. " +
        "The piece and the one gate are asked once a valid body arrives; its writer deletes it until its " +
        "email has gone, an admin whenever.",
    },
  },
  "/api/courses/runs/[runId]/feedback/send": {
    POST: {
      expect: adminOnly(400),
      why:
        "Sending the \"you have feedback\" emails: view-as is refused first, then the session, then an " +
        "admin, decided on the session before anything is read, so every other persona is forbidden. The " +
        "admin meets the body check: an empty one names no feedback and no numbers.",
    },
  },
  "/api/courses/runs/[runId]/feedback/send/test": {
    POST: {
      expect: adminOnly(404),
      why:
        "A test of the feedback emails takes no body: view-as is refused first, then the session, then an " +
        "admin, decided on the session before anything is read, so every other persona is forbidden. The " +
        "admin is told the battery's run is not there, and nothing is sent.",
    },
  },
  "/api/courses/runs/[runId]/work-ratings": {
    PUT: {
      expect: signedIn(400),
      why:
        "Saving a rating for the team of somebody's written answer: view-as is refused first, then the " +
        "session, then the body is checked before anything is read (whose answer, which week and answer, " +
        "a rating from 1 to 10 and a comment), so every signed-in persona meets the same 400 on an empty " +
        "one. The gate (an admin or the programme's lead, on work the one gate lets them read) is asked " +
        "once a valid body arrives, before anything of the person's is read.",
    },
    DELETE: {
      expect: signedIn(400),
      why:
        "Clearing the caller's own rating: view-as is refused first, then the session, then the body is " +
        "checked before anything is read (whose answer, which week), so every signed-in persona meets the " +
        "same 400 on an empty one. The same gate is asked once a valid body arrives, and only the rating " +
        "the caller gave, by the id that names them, is ever cleared.",
    },
  },
  "/api/courses/certificates/[code]": {
    PUT: {
      expect: signedIn(400),
      why:
        "View-as is refused first, then the session, then the body is checked before anything is read " +
        "(whether the link is on), so every signed-in persona meets the same 400 on an empty one. Once a " +
        "valid body arrives the owner alone is answered; everybody else, and a code that opens nothing, " +
        "is told there is no certificate here.",
    },
  },
  "/api/courses/certificates/[code]/pdf": {
    GET: {
      expect: signedIn(404),
      why:
        "The session first; then the battery's id is no certificate's code, so every signed-in persona " +
        "is told there is no certificate here, the answer anybody but its owner gets for a real one, " +
        "whether or not its link is on. It reads and draws, and writes nothing.",
    },
  },
  "/api/courses/templates/[templateId]": {
    DELETE: {
      expect: adminOnly(404),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/events/[id]/archive": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/events/[id]/broadcast": {
    POST: {
      expect: adminOnly(404, { suCommittee: 404 }),
      why:
        "SU-recognised committee and admins may address an event's attendees; for them the " +
        "event is missing, and every other session is forbidden before the read, draftEvent " +
        "and approveEvent holders included. A body of { preview: true } asks how many the send " +
        "would email and meets the same gate before its body is read; it answers ok and people, " +
        "a count, and writes nothing.",
    },
  },
  "/api/events/[id]/calendar.ics": {
    GET: {
      expect: everyone(404),
      why:
        "The public calendar feed of a published event: everybody gets the same 404 for an " +
        "unknown id, and nothing about the caller is read.",
    },
  },
  "/api/events/[id]/cancel": {
    POST: {
      expect: adminOnly(404, { approveEvent: 404 }),
      why:
        "Event approvers (admin or approveEvent) may cancel; for them the event is missing, " +
        "everyone else is forbidden before the read.",
    },
  },
  "/api/events/[id]/check-in": {
    POST: {
      expect: signedIn(404),
      why:
        "Checking yourself in with the door code: signed in, the empty body is the signed-in " +
        "case, so every session meets the missing event's 404; signed out with no link from a " +
        "confirmation email is refused for having no session.",
    },
  },
  "/api/events/[id]/check-ins": {
    POST: {
      expect: adminOnly(400, { suCommittee: 400 }),
      why:
        "The door list's tick and a walk-in, for the people who run check-in (admins and " +
        "SU-recognised committee, as sign-up names are): everybody else is refused before " +
        "anything is read, and the two who run it meet the body's own validation.",
    },
  },
  "/api/events/[id]/check-ins/[checkInId]": {
    DELETE: {
      expect: adminOnly(404, { suCommittee: 404 }),
      why:
        "Undoing a check-in, for the people who run check-in: everybody else is refused before " +
        "the event is read, and the two who run it are told the event is missing.",
    },
  },
  "/api/events/[id]/collaborators": {
    GET: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Authorship is per event.",
    },
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Authorship is per event.",
    },
  },
  "/api/events/[id]/delete": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Authorship is per event.",
    },
  },
  "/api/events/[id]/door": {
    POST: {
      expect: adminOnly(404),
      why:
        "Opening an event's door is for its author, while their account stands, and admins, decided " +
        "before the event is shown to exist: the battery's id addresses nothing, so nobody is its author, " +
        "every session but the admin's is forbidden (SU-recognised committee and the permission holders " +
        "included) and the admin is told the event is missing.",
    },
  },
  "/api/events/[id]/door-code": {
    POST: {
      expect: adminOnly(404, { suCommittee: 404 }),
      why:
        "Making an event's door code, a permanent short link, is for the people who run " +
        "check-in; everybody else is refused before the event is read.",
    },
  },
  "/api/events/[id]/publish": {
    GET: {
      expect: adminOnly(404, { approveEvent: 404 }),
      why:
        "How many publishing would reach, for the Publish confirm: the press's own gate, written " +
        "the same way, so event approvers (admin or approveEvent) are told the event is missing " +
        "and everyone else is forbidden before the read. On an event it answers ok, emailed and " +
        "notified, counts only, and writes nothing.",
    },
    POST: {
      expect: adminOnly(404, { approveEvent: 404 }),
      why:
        "Event approvers (admin or approveEvent) may publish; for them the event is missing, " +
        "everyone else is forbidden before the read.",
    },
  },
  "/api/events/[id]/rsvp": {
    POST: {
      expect: everyone(400),
      why:
        "The public RSVP: the per-IP throttle, then reCAPTCHA before the event is read, so a " +
        "tokenless request from anybody meets the same 400.",
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/approve": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The event decides who may approve.",
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/approve-change": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The event decides who may approve.",
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/cancel": {
    POST: {
      expect: everyone(404),
      why:
        "The attendee's own signed link: without a valid token everybody, cookie or not, is " +
        "told the RSVP is missing.",
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/deny": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The event decides who may deny.",
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/deny-change": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The event decides who may deny.",
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/request-change": {
    POST: {
      expect: everyone(404),
      why:
        "The attendee's own signed link: without a valid token everybody, cookie or not, is " +
        "told the RSVP is missing.",
    },
  },
  "/api/events/[id]/signups": {
    GET: {
      expect: signedIn(404, { pending: 403, rejected: 403 }),
      fields: ["decides", "requests"],
      why:
        "The requests waiting for a decision on one event, with who is asking. Nobody below an approved account " +
        "organises an event, so a pending or refused account is refused before anything is read; every approved " +
        "account is told the battery's event is missing, because who sees the requests (the event's author and " +
        "collaborators, SU-recognised committee, admins) is the event's to say. The second pass asks it about two events.",
    },
  },
  "/api/events/[id]/test-rsvps": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Test attendees are an admin's tool.",
    },
    DELETE: {
      expect: adminOnly(200),
      fields: ["deleted", "ok"],
      why:
        "Admin only; removing test attendees from an unknown event deletes nothing and " +
        "answers ok.",
    },
  },
  "/api/events/[id]/update": {
    POST: {
      expect: adminOnly(404, { approveEvent: 404 }),
      why:
        "Event approvers (admin or approveEvent) may edit a live event; for them the event is " +
        "missing, everyone else is forbidden before the read.",
    },
  },
  "/api/kairos/export": {
    POST: {
      expect: adminOnly(400),
      why:
        "The Kairos file is an admin's alone, recorded before it is handed over: everybody else is refused before " +
        "anything is read, and an admin is told the empty body names no programme. A file, not JSON, so no fields.",
    },
  },
  "/api/feedback": {
    POST: {
      expect: everyone(400),
      why:
        "An answer to a programme's anonymous keep, change and drop form, with no session and no cookie read: " +
        "the form's secret in the body is the credential, after an in-memory rate limit, so every caller " +
        "meets the same 400 for a body with no secret in it, signed in or not.",
    },
  },
  "/api/links/[slug]/qr": {
    GET: {
      expect: adminOnly(404, { suCommittee: 404 }),
      why:
        "A short link's code: admins draw any link's, SU-recognised committee only an event's " +
        "door code and an event survey's code while it takes answers, so both read the link " +
        "and are told a missing one is missing; everybody else is refused before it is read.",
    },
  },
  "/api/members/roster": {
    GET: {
      expect: everyone(200, { anonymous: 403, pending: 403, rejected: 403 }),
      fields: ["members"],
      why:
        "Every approved account may read a roster derived from its own task memberships, " +
        "empty here; pending, rejected and outsiders are forbidden with one 403.",
    },
  },
  "/api/membership/me": {
    GET: {
      expect: signedIn(200),
      fields: ["currentPeriod", "history", "membership"],
      why:
        "Any signed-in account reads its own membership through projectMembershipForMe; " +
        "nothing about anybody else is in it.",
    },
  },
  "/api/newsletter/[id]/send": {
    POST: {
      expect: everyone(403, { admin: 404, approveNewsletter: 404 }),
      why:
        "Newsletter approvers (admin or approveNewsletter) may send; for them the draft is " +
        "missing, and every other session, a missing one included, is forbidden with one 403.",
    },
  },
  "/api/newsletter/[id]/send-test": {
    POST: {
      expect: everyone(403, { admin: 404, draftNewsletter: 404, approveNewsletter: 404 }),
      why:
        "Drafters and approvers (admin, draftNewsletter, approveNewsletter) may test-send; " +
        "for them the draft is missing, everyone else is forbidden with one 403.",
    },
  },
  "/api/newsletter/preview": {
    POST: {
      expect: everyone(403, { admin: 200, draftNewsletter: 200, approveNewsletter: 200 }),
      why:
        "Drafters and approvers (admin, draftNewsletter, approveNewsletter) may render a " +
        "preview of what they post; everyone else is forbidden with one 403.",
    },
  },
  "/api/push/subscribe": {
    POST: {
      expect: signedIn(400, { pending: 401, rejected: 401 }),
      why:
        "Approved accounts only; a pending, rejected or missing session gets the same 401, " +
        "and an approved one meets the subscription validation.",
    },
  },
  "/api/push/test": {
    POST: {
      expect: signedIn(200, { pending: 401, rejected: 401 }),
      fields: ["deferred", "failed", "ok", "pruned", "retried", "sent"],
      why:
        "Approved accounts only; a pending, rejected or missing session gets the same 401, " +
        "and an approved one gets its own delivery counts (zero here).",
    },
  },
  "/api/push/unsubscribe": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the endpoint is validated; every signed-in persona meets the " +
        "same 400.",
    },
  },
  "/api/q/[slug]": {
    GET: {
      expect: everyone(307),
      why:
        "A short link, naisi.uk/q/<slug>, reached through a rewrite. Nothing about the caller is " +
        "read: everybody is redirected, and a slug that names nothing lands on /links, never a 404.",
    },
  },
  "/api/q/[slug]/scan": {
    POST: {
      expect: everyone(404),
      why:
        "The scan counter for short links: the per-IP throttle, then the slug's shape, then " +
        "whether the link exists. The battery's slug has the right shape and names no link, " +
        "so everybody meets the same 404 and nothing about the caller is read.",
    },
  },
  "/api/register": {
    POST: {
      expect: everyone(400),
      why:
        "Public registration: the per-IP throttle, then the address validation; an empty body " +
        "from anybody meets the same 400 before the captcha is spent.",
    },
  },
  "/api/register/password-set": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the password is validated; every signed-in persona meets the " +
        "same 400 on an empty body.",
    },
  },
  "/api/register/profile-complete": {
    POST: {
      expect: signedIn(200),
      fields: ["ok"],
      why:
        "Any signed-in account asks for its own registration row to be marked profile-complete. " +
        "The route looks for the caller's profile document first and marks the row only when " +
        "one exists; it answers ok either way, and whether or not the row exists, so the " +
        "response tells the caller nothing about its own state it did not already know.",
    },
  },
  "/api/register/resend": {
    POST: {
      expect: everyone(200),
      fields: ["cooldownSeconds", "ok"],
      public: "A public, throttled re-send that answers one uniform body.",
      why:
        "Public re-send: throttled per IP and answered with one uniform body whatever the " +
        "address's state, so everybody gets the same 200.",
    },
  },
  "/api/scheduler/tick": {
    POST: {
      expect: everyone(404),
      why:
        "The bearer-secret endpoint answers 404 to everything without the secret, by design, " +
        "so a cookie is worth nothing here.",
    },
  },
  "/api/subscriptions": {
    POST: {
      expect: everyone(400),
      why:
        "The public subscribe form: throttled per IP, then the body is validated; an empty " +
        "body from anybody meets the same 400.",
    },
  },
  "/api/subscriptions/confirm": {
    GET: {
      expect: everyone(400),
      why:
        "The confirmation preview page: without a signed token everybody gets the same 400 " +
        "page.",
    },
    POST: {
      expect: everyone(400),
      why:
        "The confirmation commit: without a signed token everybody gets the same 400 page.",
    },
  },
  "/api/subscriptions/sync": {
    POST: {
      expect: everyone(200, { anonymous: 403 }),
      fields: ["ok"],
      why:
        "Any signed-in account syncs its own subscription rows to its own preferences; an " +
        "outsider has nothing to sync and is forbidden.",
    },
  },
  "/api/surveys": {
    POST: {
      expect: adminOnly(400),
      why:
        "Making a programme's before survey is an admin's alone: view-as is refused first, then the session and " +
        "the admin bar, then the body, so the admin meets the 400 that asks which programme, and nothing is read.",
    },
  },
  "/api/surveys/[surveyId]/answer": {
    POST: {
      expect: signedIn(400),
      why:
        "Answering a survey signed in, as the caller and nobody else: view-as first, then the session, then the " +
        "body, so every signed-in persona meets the same 400 on an empty one. There is no uid in the request; a " +
        "survey the caller was not sent is refused in one sentence once a body arrives.",
    },
  },
  "/api/surveys/[surveyId]/close": {
    POST: {
      expect: adminOnly(404),
      why: "Closing a survey early is an admin's alone; the admin is told the made-up survey is not there.",
    },
  },
  "/api/surveys/[surveyId]/open": {
    POST: {
      expect: adminOnly(404),
      why: "Opening a leaving survey, which emails nobody and fixes its words, is an admin's alone; the admin is told the made-up survey is not there.",
    },
  },
  "/api/surveys/[surveyId]/consent": {
    POST: {
      expect: signedIn(400),
      why:
        "Changing a follow-ups consent signed in, as the caller and nobody else: view-as first, then the session, " +
        "then the body, so every signed-in persona meets the same 400 on an empty one. There is no uid in the " +
        "request; a survey the caller was not sent is refused in one sentence once a body arrives.",
    },
  },
  "/api/surveys/[surveyId]/export": {
    POST: {
      expect: adminOnly(404),
      why:
        "The spreadsheet of a survey's answers with names is an admin's alone, recorded before it is handed over; " +
        "the admin is told the made-up survey is not there. A file, not JSON, so no fields.",
    },
  },
  "/api/surveys/[surveyId]/open-at-event": {
    POST: {
      expect: adminOnly(404),
      why:
        "Opening a survey after an event for its QR code, which emails nobody and fixes its words, is an " +
        "admin's alone: view-as first, then the session and the admin bar; the admin is told the made-up " +
        "survey is not there.",
    },
  },
  "/api/surveys/[surveyId]/people/[who]": {
    POST: {
      expect: adminOnly(404),
      why:
        "Opening one person's answers is an admin's alone: view-as first, then the session and the admin " +
        "bar, before the database; the admin is told the made-up survey is not there, and no opening is " +
        "recorded.",
    },
  },
  "/api/surveys/[surveyId]/people/[who]/blanks": {
    POST: {
      expect: adminOnly(400),
      why:
        "Sending one person the questions they left blank is an admin's alone: view-as first, then the session " +
        "and the admin bar, then the body, so the admin meets the 400 for a press with no number of questions, " +
        "and nothing is read or sent.",
    },
  },
  "/api/surveys/[surveyId]/blanks": {
    POST: {
      expect: signedIn(400),
      why:
        "Answering the questions one left blank, signed in, as the caller and nobody else: view-as first, then " +
        "the session, then the body, so every signed-in persona meets the same 400 on an empty one. There is no " +
        "uid in the request; a survey the caller has no row on is refused in one sentence once a body arrives.",
    },
  },
  "/api/surveys/blanks": {
    POST: {
      expect: everyone(400),
      why:
        "Answering the questions one left blank by the link of blanks, with no session: the secret in the body " +
        "is the credential, after an in-memory rate limit, so every caller meets the same 400 for a body with " +
        "no secret in it, signed in or not.",
    },
  },
  "/api/surveys/[surveyId]/questions": {
    POST: {
      expect: adminOnly(404),
      why: "Changing a survey's words and questions before it is sent is an admin's alone; the admin is told the made-up survey is not there.",
    },
  },
  "/api/surveys/[surveyId]/remind": {
    POST: {
      expect: adminOnly(400),
      why: "Reminding by hand is an admin's alone; the admin meets the 400 for a press with no number on it.",
    },
  },
  "/api/surveys/[surveyId]/send": {
    POST: {
      expect: adminOnly(400),
      why: "Sending a survey is an admin's alone; the admin meets the 400 for a press with no audience and no number.",
    },
  },
  "/api/surveys/[surveyId]/test": {
    POST: {
      expect: adminOnly(400),
      why: "\"Send a test to me\" is an admin's alone, to their own address; the admin meets the 400 for no email named.",
    },
  },
  "/api/surveys/answer": {
    POST: {
      expect: everyone(400),
      why:
        "Answering by a personal link, with no session: the secret in the body is the credential, after an " +
        "in-memory rate limit, so every caller meets the same 400 for a body with no secret in it, signed in or not.",
    },
  },
  "/api/surveys/public-numbers": {
    POST: {
      expect: adminOnly(400),
      why:
        "Publishing a programme's numbers and ticked quotes on its public page is an admin's alone: view-as " +
        "first, then canRunSurveys, then the body, so every other session is forbidden before anything is " +
        "read and an admin meets the 400 an empty body gets.",
    },
  },
  "/api/surveys/public-numbers/take-down": {
    POST: {
      expect: adminOnly(400),
      why:
        "Taking a programme's public numbers down is an admin's alone: view-as first, then canRunSurveys, then " +
        "the body, so every other session is forbidden before anything is read and an admin meets the 400 an " +
        "empty body gets.",
    },
  },
  "/api/surveys/consent": {
    POST: {
      expect: everyone(400),
      why:
        "Changing a follow-ups consent by a personal link, with no session: the secret in the body is the " +
        "credential, after an in-memory rate limit, so every caller meets the same 400 for a body with no secret " +
        "in it, signed in or not.",
    },
  },
  "/api/surveys/term/totals": {
    GET: {
      expect: adminOnly(200),
      why:
        "This term in numbers as a file of totals is an admin's alone: canRunSurveys refuses everybody else " +
        "before anything is read, and somebody signed out is told to sign in. The battery's world opens two " +
        "application forms whose decisions are sent, so there is a term and an admin is handed its file. A GET " +
        "that writes nothing, and a file, not JSON, so no fields.",
    },
  },
  "/api/tasks/[id]/delete": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The task's own roster decides.",
    },
  },
  "/api/tasks/[id]/delete-block": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/tasks/[id]/delete-subtask": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/tasks/[id]/notify": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one. A " +
        "comment id is required.",
    },
  },
  "/api/tasks/[id]/notify-member": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/tasks/[id]/send-for-review": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The task's own roster decides.",
    },
  },
  "/api/tasks/[id]/send-initial-notifications": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The task's own roster decides.",
    },
  },
  "/api/tasks/[id]/send-review-outcome": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one.",
    },
  },
  "/api/unsubscribe": {
    GET: {
      expect: everyone(400),
      why:
        "The unsubscribe preview page: without a signed token everybody gets the same 400 " +
        "page.",
    },
    POST: {
      expect: everyone(400),
      why:
        "The unsubscribe commit: without a signed token everybody gets the same 400 page.",
    },
  },
  "/api/verify-email/confirm": {
    POST: {
      expect: everyone(400),
      why:
        "The magic-link confirm: without a signed token everybody gets the same 400.",
    },
  },
  "/api/verify-email/reconcile": {
    POST: {
      expect: signedIn(200),
      fields: ["ok", "stamped"],
      why:
        "Any signed-in account may ask for its own verified token to be stamped; nothing to " +
        "stamp answers ok with stamped false.",
    },
  },
  "/api/verify-email/send": {
    POST: {
      expect: signedIn(400),
      why:
        "Session required before the address is validated, then the body; every signed-in " +
        "persona meets the same 400 on an empty one.",
    },
  },
  "/api/webhooks/resend-events": {
    POST: {
      expect: everyone(500),
      why:
        "With no RESEND_WEBHOOK_SECRET on the local server the webhook fails closed with a " +
        "500 for everybody: it looks for the secret before it reads the body, so the answer " +
        "is the same whoever sends the request. With the secret set, a body whose signature " +
        "does not verify is answered 401.",
    },
  },
  "/api/worksheets/[worksheetId]": {
    DELETE: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. Authorship, with the library-tier floor, is per " +
        "worksheet.",
    },
  },
  "/api/worksheets/circulations": {
    POST: {
      expect: adminOnly(404, { circulateWorksheet: 404 }),
      why:
        "Circulators (admin or circulateWorksheet) may send a worksheet; for them the " +
        "worksheet is missing, everyone else is forbidden before the read.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/aggregate": {
    GET: {
      expect: signedIn(400),
      why:
        "Session required, then the caller's own request is validated before the document is " +
        "read, so every signed-in persona meets the same 400 on an empty one. A " +
        "question id is required in the query.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/close": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The circulation's staff decides.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/destroy": {
    POST: {
      expect: adminOnly(400),
      why:
        "Admin only, decided before the body is read: every other session is forbidden and " +
        "the admin meets the validation. Destroying a circulation needs its typed " +
        "confirmation.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/destroy-manifest": {
    GET: {
      expect: adminOnly(404),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/export": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The circulation's staff decides.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/notify-copy-edited": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The circulation's staff decides.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/recipients": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The circulation's staff decides.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/responses/[uid]/return": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The circulation's staff decides.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/responses/[uid]/unfreeze": {
    POST: {
      expect: adminOnly(404),
      why:
        "Admin only, decided before the read: every other session is forbidden and the admin " +
        "is told the id is missing. Unfreezing a response is admin only.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/submit": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required. An account that is not approved is answered 404 before anything is " +
        "read, and for an approved one the circulation is missing, so every signed-in persona " +
        "meets the same 404. The recipient's own response decides.",
    },
  },
  "/api/worksheets/circulations/[circulationId]/upload": {
    POST: {
      expect: signedIn(404),
      why:
        "Session required, then the document is read and its own membership decides. The " +
        "battery's id addresses nothing, so every signed-in persona is told that the document " +
        "is missing. The recipient's own response decides.",
    },
  },
  "/api/worksheets/recipients": {
    GET: {
      expect: everyone(403, { admin: 200, circulateWorksheet: 200 }),
      fields: ["members"],
      why:
        "Circulators (admin or circulateWorksheet) may read the committee roster this route " +
        "hands out; everyone else is forbidden with one 403.",
    },
  },
};

/** Pages under src/app/(app): key -> { expect, why }. */
export const PAGES = {
  "/(app)/admin/(admin-only)": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/collaborators": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/deliverability": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/email-designs": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/email-designs/[templateId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/email-designs/course/[templateId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/members": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/members/[uid]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest. The uid segment " +
      "changes nothing about the gate: the page never calls notFound, so an admin gets it " +
      "whatever the uid, and an id that is on no account is answered on the page in a " +
      "sentence. Its reads are the roster's own, under the admin-only users rule.",
  },
  "/(app)/admin/(admin-only)/newsletter": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/projects": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/registrations": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/site-status": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/links": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/links/page-content": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/sources": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/sources/[slug]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest. The slug segment " +
      "changes nothing about the gate: a malformed one is a 404 the layout never reaches, " +
      "and the editor's own reads answer to the admin-only sourceSheets rule.",
  },
  "/(app)/admin/(admin-only)/subscriptions": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/surveys": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest. The page asks " +
      "canRunSurveys again itself before either tab reads anything.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The survey id changes " +
      "nothing about the gate: an id that opens no survey is answered on the page in a sentence, never " +
      "notFound, and a survey that is there sends the admin on to its Questions or Results tab.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]/answered": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The survey id changes " +
      "nothing about the gate: an id that opens no survey is answered on the page in a sentence, never " +
      "notFound.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]/answered/[who]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The page reads the " +
      "survey's name alone: an id that opens no survey is answered on the page in a sentence, never " +
      "notFound, and the person's answers come only from the opening route, which records each opening first.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]/questions": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The survey id changes " +
      "nothing about the gate: an id that opens no survey is answered on the page in a sentence, never " +
      "notFound.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]/results": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The survey id changes " +
      "nothing about the gate: an id that opens no survey is answered on the page in a sentence, never " +
      "notFound.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]/send": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The survey id changes " +
      "nothing about the gate: an id that opens no survey is answered on the page in a sentence, never " +
      "notFound.",
  },
  "/(app)/admin/(admin-only)/surveys/kairos": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The page lists each " +
      "programme that names a run, with its Kairos file and report, all an admin's alone.",
  },
  "/(app)/admin/(admin-only)/surveys/kairos/[roundId]/[programmeId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The ids change nothing " +
      "about the gate: an address that names no programme is answered on the page in a sentence, never notFound.",
  },
  "/(app)/admin/(admin-only)/surveys/public-numbers": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard. The page offers totals " +
      "from a programme's own surveys and the comments their writers ticked, never a name, and both its routes " +
      "ask again.",
  },
  "/(app)/admin/(admin-only)/surveys/new": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/(admin-only)/surveys/term": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, and the page asks " +
      "canRunSurveys again itself. It shows how many came to a term's events and each programme's before and " +
      "after, counts only and never a name; with no term it says so in a sentence.",
  },
  "/(app)/admin/(admin-only)/reports": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, and the page asks " +
      "canRunSurveys again itself. It leads to This term in numbers, Public numbers and Kairos by their names " +
      "and reads no record of its own.",
  },
  "/(app)/admin/(admin-only)/task-templates": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "The (admin-only) tree: requireAdminPage sends every non-admin to the dashboard, the " +
      "course and membership permission holders included, because the admin front door " +
      "admits them and this inner gate is what keeps them out of the rest.",
  },
  "/(app)/admin/admissions": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers; a draftCourse holder passes the admin front door " +
      "and is sent on to the dashboard here. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/[roundId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers; a draftCourse holder passes the admin front door " +
      "and is sent on to the dashboard here. A missing round renders the console's " +
      "not-found state for those admitted. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/[roundId]/appointments": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers; a draftCourse holder passes the admin front door " +
      "and is sent on to the dashboard here. A missing round renders the console's " +
      "not-found state for those admitted. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers, and sends everybody else to the dashboard. The " +
      "list is filtered per caller, so the approveCourse holder is shown an empty page that " +
      "says they are on no form. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the page's own: a form the caller has no role on, " +
      "and a form that does not exist, both render 'there is no application form here' in " +
      "place of the page, as ordinary HTML with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/form": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the page's own: the form's editor is an admin's, and " +
      "a missing form or one the caller has no role on renders 'there is no application form " +
      "here' in place of the page with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/intake": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console, as the pooled applicants page: requireAdmissionsPage admits round " +
      "authors (admin or approveCourse) and named reviewers; a draftCourse holder is sent on to the " +
      "dashboard. A missing form, or one the caller has no role on, renders not found for those " +
      "admitted; a lead or a reviewer on the form is shown a notice that planning the intake is an " +
      "admin's, before anything about an applicant is read. Nothing is sent to Claude on the way in.",
  },
  "/(app)/admin/admissions/forms/[roundId]/pool": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers; a draftCourse holder passes the admin front door " +
      "and is sent on to the dashboard here. A missing form, or one the caller has no role " +
      "on, renders not found for those admitted; a lead or a reviewer on the form is shown " +
      "a notice that the page is an admin's. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/applications": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers, and sends everyone else to the dashboard. For " +
      "those admitted, a form that is missing and a programme they have no role on both " +
      "render the page's own calm not-here state as ordinary HTML, with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/applications/freed-places": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers, and sends everyone else to the dashboard. For " +
      "those admitted, a form that is missing and a programme they have no role on render " +
      "the programme layout's calm not-here state with a 200; a lead or a reviewer on the " +
      "programme is shown that the page is an admin's. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/written": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the page's own: the review page for the programme's lead and " +
      "admins, so a reviewer on the form is told it is the lead's and an admin's before the run is read, " +
      "and a programme the caller has no role on, or one that does not exist, renders 'there is no " +
      "programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/applications/[uid]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers, and sends everyone else to the dashboard. For " +
      "those admitted, an application that is missing or not theirs to read renders the " +
      "page's own calm not-here state as ordinary HTML, with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the page's own door (openLeadDoor, decided from the form before the " +
      "run is read): a group's reflections, its facilitators' own among them, are the programme's lead's and " +
      "an admin's to read here, so a reviewer on the form is told the page is theirs, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own (loadProgrammeRun, decided from the form " +
      "before the run is read): what everybody holding a place has written, by name, is the programme's lead's and an " +
      "admin's, so a reviewer on the form is told the tab is theirs, and a programme the caller has no role on, or one " +
      "that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the page's own (loadProgrammeRun, decided from the form before the run is read): " +
      "one person's coursework is the programme's lead's and an admin's, so a reviewer on the form is told it is theirs, " +
      "a programme the caller has no role on renders 'there is no programme here', and somebody who holds no place on it " +
      "and facilitates none of its groups renders a calm not-here page, each with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the page's own door (openLeadDoor, decided from the form before the " +
      "run is read): a group's week, who ticked each source by name and its facilitators' own work, is the " +
      "programme's lead's and an admin's to read here, so a reviewer on the form is told the page is theirs, " +
      "and a programme the caller has no role on, or one that does not exist, renders 'there is no programme " +
      "here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: People in groups is the run's " +
      "allocation board, the programme's lead's and an admin's, so a reviewer on the form is told so before the run is " +
      "read, and a programme the caller has no role on, or one that does not exist, renders 'there is no programme " +
      "here' in place of the page with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/publish": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: Publish's page is the " +
      "programme's lead's and an admin's, so a reviewer is told so before the run is read, and a programme the " +
      "caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/sessions": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Sessions view is the " +
      "programme's lead's and an admin's, so a reviewer is told so before the run is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/circles": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: Circles is an admin's alone, so " +
      "the programme's lead is drawn a note saying so (200), a reviewer is told the tab is the lead's and an admin's, " +
      "and a programme the caller has no role on, or one that does not exist, renders 'there is no programme here' " +
      "with a 200.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/times": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Times view is the programme's " +
      "lead's and an admin's, so a reviewer on the form is told so once the form's settings are read, and a programme " +
      "the caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/publish": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: Publish's own page is the " +
      "programme's lead's and an admin's, so a reviewer is told so before the run is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Facilitators view is the " +
      "programme's lead's and an admin's, so a reviewer is told so before the run is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: everyone who holds a place on " +
      "the programme or gave it back, by name, with their replies, is the programme's lead's and an admin's to read, " +
      "so a reviewer is told so before anybody is read, and a programme the caller has no role on, or one that does " +
      "not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Overview of the run a " +
      "programme names is the programme's lead's and an admin's, so a reviewer is told so before the run is read, " +
      "and a programme the caller has no role on, or one that does not exist, renders 'there is no programme here' " +
      "with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/certificates": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the preview of a programme's " +
      "certificates is its lead's and an admin's, so a reviewer is told so before the run is read, and a programme " +
      "the caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: every register of the run is the " +
      "programme's lead's and an admin's to read, so a reviewer is told so before the run is read, and a programme the " +
      "caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/pitches": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: for those " +
      "admitted, a form that is missing and a programme the caller has no role on render 'there " +
      "is no programme here' in place of the page with a 200, and a reviewer of the programme is " +
      "told the list is the lead's and admins'. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: Messages is the " +
      "programme's lead's and an admin's, so a reviewer is told so before the run is read, and a programme " +
      "the caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Surveys tab is the programme's " +
      "lead's and an admin's, so a reviewer is told so before any survey is read, and a programme the caller has no " +
      "role on, or one that does not exist, renders 'there is no programme here' with a 200. The lead persona is " +
      "admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads).",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/before": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Surveys tab's Before view is the " +
      "programme's lead's and an admin's, so a reviewer is told so before any survey is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. The lead persona is " +
      "admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads).",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/check-ins": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Surveys tab's Check-ins view is the " +
      "programme's lead's and an admin's, so a reviewer is told so before any check-in is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. Each group's check-in " +
      "is drawn for an admin alone. The lead persona is admitted as an approveCourse holder is (appointing a lead sets the " +
      "flag the tree reads).",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/end": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Surveys tab's End view is the " +
      "programme's lead's and an admin's, so a reviewer is told so before any survey is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. The lead persona is " +
      "admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads).",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/follow-ups": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the Surveys tab's Follow-ups view is the " +
      "programme's lead's and an admin's, so a reviewer is told so before any survey is read, and a programme the caller " +
      "has no role on, or one that does not exist, renders 'there is no programme here' with a 200. The lead persona is " +
      "admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads).",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: a programme survey's results are the " +
      "programme's lead's and an admin's, so a reviewer is told so before any survey is read, a survey that is not " +
      "one of this programme's is answered in a sentence, and a programme the caller has no role on, or one " +
      "that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/reports": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: a programme's session reports are " +
      "the programme's lead's and an admin's, so a reviewer is told so before any report is read, and a programme the " +
      "caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/teams": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: for those " +
      "admitted, a form that is missing and a programme the caller has no role on render 'there " +
      "is no programme here' in place of the page with a 200; a reviewer of the programme is told " +
      "the tab is the lead's and admins', and a fellowship's address that teams are an incubator's. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/teams/[teamId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: for those admitted, a " +
      "form that is missing and a programme the caller has no role on render 'there is no programme here' " +
      "with a 200; a reviewer of the programme is told the tab is the lead's and admins', and a team that is " +
      "not on the run the programme names is said in one sentence. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/ratings": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the ratings given at the " +
      "programme's end are the programme's lead's and an admin's to read, so a reviewer is told so before the run is " +
      "read, and a programme the caller has no role on, or one that does not exist, renders 'there is no programme " +
      "here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: Weeks is the " +
      "programme's lead's and an admin's, so a reviewer is told so before the run is read, and a programme " +
      "the caller has no role on, or one that does not exist, renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/copy": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "Copy weeks from the course, a page of the Weeks tab, on the tab's terms: a reviewer is told the tab " +
      "is the lead's and an admin's, and a programme the caller has no role on, or one that does not exist, " +
      "renders 'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "One week's page on the Weeks tab, on the tab's terms; a week that is no taught week of the run's " +
      "plan goes back to the tab. A programme the caller has no role on, or one that does not exist, renders " +
      "'there is no programme here' with a 200 before the week is looked at. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/preview": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "Preview as a fellow, on the tab's terms: it reads the week and nobody's answers, and writes nothing. " +
      "A programme the caller has no role on, or one that does not exist, renders 'there is no programme " +
      "here' with a 200 before the week is looked at. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's: a programme the caller has no " +
      "role on, and one that does not exist, both render 'there is no programme here' in " +
      "place of the page with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/anonymous-feedback": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions tree's gate, then the programme layout's and the page's own: the answers to the " +
      "programme's anonymous form are its lead's and an admin's to read, so a reviewer is told so before any " +
      "answer is read, and a programme the caller has no role on, or one that does not exist, renders " +
      "'there is no programme here' with a 200. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/admissions/forms/[roundId]/send": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, approveCourse: 200, lead: 200 }),
    why:
      "The admissions console: requireAdmissionsPage admits round authors (admin or " +
      "approveCourse) and named reviewers; a draftCourse holder passes the admin front door " +
      "and is sent on to the dashboard here. A missing form, or one the caller has no role " +
      "on, renders not found for those admitted; a lead or a reviewer on the form is shown " +
      "a notice that the page is an admin's. " +
      "The lead persona is admitted as an approveCourse holder is (appointing a lead sets the flag the tree reads), " +
      "and with an address that names nothing is drawn the same not-here state.",
  },
  "/(app)/admin/courses": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/facilitator-guide": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200 }),
    why:
      "Loading a course's facilitator guide is an admin's: the course authoring tree admits course " +
      "drafters and approvers, and this page sends everybody but an admin to the dashboard, as the " +
      "admin-only pages do. A course that is not there renders the page's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/page": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/allocation": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/applications": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/retrospective": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/weeks/[weekId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftCourse: 200, approveCourse: 200 }),
    why:
      "The course authoring tree: requireCourseAuthorPage admits admins and draftCourse and " +
      "approveCourse holders and sends everyone else to the dashboard; a missing course or " +
      "run renders the tree's own not-found state.",
  },
  "/(app)/admin/membership": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, manageMembership: 200 }),
    why:
      "The membership console: requireMembershipPage admits admins and manageMembership " +
      "holders and sends everyone else to the dashboard.",
  },
  "/(app)/committee/tasks": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", suCommittee: 200, admin: 200 }),
    why:
      "The committee task board is SU-recognised committee and admins only, because it " +
      "shows every committee-visibility task and the member roster; a non-SU committee " +
      "member and everyone else is sent to the dashboard.",
  },
  "/(app)/credentials": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The authed shell: a stranger is sent to sign in by the proxy, a pending account to " +
      "the waiting page and a rejected one home by the layout, and every approved account " +
      "renders it. The credentials page is a placeholder today.",
  },
  "/(app)/dashboard": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The authed shell: a stranger is sent to sign in by the proxy, a pending account to " +
      "the waiting page and a rejected one home by the layout, and every approved account " +
      "renders it.",
  },
  "/(app)/events/manage": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200, draftEvent: 200, approveEvent: 200 }),
    why:
      "The events area is open to the whole committee and to draftEvent and approveEvent " +
      "holders; a plain member or another permission holder is sent to the dashboard by the " +
      "events layout. A missing event renders the area's own not-found state.",
  },
  "/(app)/events/manage/[id]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200, draftEvent: 200, approveEvent: 200 }),
    why:
      "The events area is open to the whole committee and to draftEvent and approveEvent " +
      "holders; a plain member or another permission holder is sent to the dashboard by the " +
      "events layout. A missing event renders the area's own not-found state.",
  },
  "/(app)/events/manage/[id]/attendees": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200, draftEvent: 200, approveEvent: 200 }),
    why:
      "An event's Sign-ups: who may open it is the event's to say (its author and collaborators, SU-recognised " +
      "committee, admins), so the page reads the event first, and with the battery's id that addresses nothing it " +
      "renders the area's own not-found state for everybody the events layout admits. The layout sends a plain " +
      "member or another permission holder to the dashboard. The second pass asks it about two events.",
  },
  "/(app)/events/manage/[id]/check-in": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200, draftEvent: 200, approveEvent: 200 }),
    why:
      "An event's Check-in tab: open to the events area (the whole committee and draftEvent " +
      "and approveEvent holders), with counts for everybody and names only for SU-recognised " +
      "committee and admins; a plain member or another permission holder is sent to the " +
      "dashboard by the events layout. A missing event renders the area's own not-found state.",
  },
  "/(app)/events/manage/[id]/door": {
    expect: everyone(["dashboard", "event"], { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: "event", suCommittee: 200, admin: 200, draftEvent: "event", approveEvent: "event" }),
    why:
      "The door list shows everybody who signed up, so it has the attendees page's gate: " +
      "SU-recognised committee and admins; any other visitor the events layout admits goes " +
      "back to the event, and a plain member or another permission holder to the dashboard " +
      "(both redirects are in the stream for the latter, so either is accepted).",
  },
  "/(app)/events/manage/[id]/survey": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200, draftEvent: 200, approveEvent: 200 }),
    why:
      "An event's Survey after tab: open to the events area (the whole committee and draftEvent " +
      "and approveEvent holders), who read that the survey went and when and nothing of its " +
      "results; admins read the results too. A plain member or another permission holder is " +
      "sent to the dashboard by the events layout. A missing event renders the area's own " +
      "not-found state.",
  },
  "/(app)/events/manage/[id]/preview": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200, draftEvent: 200, approveEvent: 200 }),
    why:
      "The events area is open to the whole committee and to draftEvent and approveEvent " +
      "holders; a plain member or another permission holder is sent to the dashboard by the " +
      "events layout. A missing event renders the area's own not-found state.",
  },
  "/(app)/events/manage/new": {
    expect: everyone(["dashboard", "eventsManage"], { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: "eventsManage", suCommittee: "eventsManage", admin: 200, draftEvent: 200, approveEvent: "eventsManage" }),
    why:
      "Creating an event needs draftEvent (or admin): the page sends any other visitor the " +
      "events layout admits back to the events list, while the layout sends a plain member " +
      "or another permission holder to the dashboard. Both redirects are in the stream for " +
      "the latter, so either is accepted.",
  },
  "/(app)/learn": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The authed shell: a stranger is sent to sign in by the proxy, a pending account to " +
      "the waiting page and a rejected one home by the layout, and every approved account " +
      "renders it. The learn hub lists the account's own runs, empty here but for the facilitator's " +
      "and the participant's places in the battery's world.",
  },
  "/(app)/learn/[runId]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/admissions": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/email": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/glossary": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page opens to exactly the people the run's week 1 opens to and sends anybody else " +
      "where the week page sends them.",
  },
  "/(app)/learn/[runId]/group/[groupId]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/group/[groupId]/edit": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/group/[groupId]/edit/[weekId]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/group/[groupId]/email": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/group/[groupId]/ratings": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is missing, and " +
      "the page's own gate (loadRatingsView: a live facilitator of the group, the programme's lead or an admin) " +
      "sends everybody else to the run's home.",
  },
  "/(app)/learn/[runId]/group/[groupId]/register": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page's own gate (the register's: a live facilitator of the group, or an admin) " +
      "sends everybody else to the run's home.",
  },
  "/(app)/learn/[runId]/group/[groupId]/report": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page's own gate (the report route's: a live facilitator of the group, each writing " +
      "their own, and not an admin) sends everybody else to the run's home.",
  },
  "/(app)/learn/[runId]/group/[groupId]/reflections": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page's own gate (the group page's: a live facilitator of the group, or an admin) " +
      "sends everybody else to the run's home.",
  },
  "/(app)/learn/[runId]/group/[groupId]/reflections/names": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page's own gate (the page to read lines out's: a live facilitator of the group, or an " +
      "admin) sends everybody else to the run's home before a reflection is read.",
  },
  "/(app)/learn/[runId]/group/[groupId]/review": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/group/[groupId]/sessions": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody who does not facilitate the live group, or is not an admin, to " +
      "the run's home.",
  },
  "/(app)/learn/[runId]/group/[groupId]/update": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody who does not facilitate the live group, or is not an admin, to " +
      "the run's home.",
  },
  "/(app)/learn/facilitate/[askId]": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The page an ask to facilitate opens, under /learn so a stranger is sent to sign in and back by " +
      "the proxy, a pending account to the waiting page and a rejected one home by the layout. Every " +
      "approved account renders it: for an ask that is not theirs, or none, it says the page is " +
      "somebody else's and shows nothing of any ask.",
  },
  "/(app)/learn/[runId]/leave": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody who cannot leave a seat of their own on it to the run's home.",
  },
  "/(app)/learn/[runId]/notes": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody with no learner seat of their own on it, taking part or left " +
      "by themselves, to the run's home.",
  },
  "/(app)/learn/[runId]/pitching": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the " +
      "run is missing, and the page sends anybody not taking part in its pitching week to the " +
      "run's home.",
  },
  "/(app)/learn/[runId]/team": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody who is not in a team they have been told about to the run's home.",
  },
  "/(app)/learn/[runId]/team/hand-in": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody who is not in a team they have been told about to the run's home.",
  },
  "/(app)/learn/[runId]/progress": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/[runId]/reading": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody with no learner seat of their own on it, taking part or left " +
      "by themselves, to the run's home.",
  },
  "/(app)/learn/[runId]/survey/[surveyId]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is missing, " +
      "and the page shows a survey only to somebody it was sent to, on this run, answering everybody else in a sentence.",
  },
  "/(app)/learn/[runId]/start-here": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page opens to exactly the people the run's week 1 opens to and sends anybody else " +
      "where the week page sends them.",
  },
  "/(app)/learn/[runId]/group/[groupId]/written": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing, and the page sends anybody who is not the group's live facilitator, the programme's " +
      "lead or an admin to the run's home.",
  },
  "/(app)/learn/[runId]/weeks/[n]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when " +
      "the run is missing, and the run's own roster decides the rest once it exists.",
  },
  "/(app)/learn/facilitator-guide/[courseId]": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A course's facilitator guide: every approved account is drawn the page, and the guide's own " +
      "gate decides what is on it. A course that is not there, or a caller the gate does not admit, " +
      "is given one calm sentence in place of the guide, never a redirect that says something exists.",
  },
  "/(app)/learn/facilitator-guide/[courseId]/[doc]": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "One page of a course's facilitator guide: every approved account is drawn the page, and the " +
      "guide's own gate decides what is on it, before the address is read. A course that is not " +
      "there, or a caller the gate does not admit, is given the same one calm sentence.",
  },
  "/(app)/learn/[runId]/weeks/[n]/feedback": {
    expect: everyone(["learn", "run"], { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "A run under /learn: the run layout sends every approved account back to /learn when the run is " +
      "missing. The page itself reads nothing and renders beside the layout: a week number it cannot " +
      "read (the battery's) sends to the run's home, any other to the week's own page at its Feedback, " +
      "which keeps its own gate. Both redirects can be in the stream, so either is accepted.",
  },
  "/(app)/learn/draw/[groupId]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The draw's page, a static segment under /learn so a programme's lead can open it: the " +
      "battery's group id addresses nothing, so every approved account is sent back to /learn, as " +
      "everybody but the group's live facilitators, the programme's lead and admins is once it exists.",
  },
  "/(app)/learn/pairs/[groupId]": {
    expect: everyone("learn", { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The pairs page, a static segment under /learn so a programme's lead can open it, as the draw's " +
      "page is: the battery's group id addresses nothing, so every approved account is sent back to " +
      "/learn, as everybody but the group's live facilitators, the programme's lead and admins is once it exists.",
  },
  "/(app)/newsletter": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftNewsletter: 200, approveNewsletter: 200 }),
    why:
      "The newsletter tools admit admins and draftNewsletter and approveNewsletter holders; " +
      "everyone else is sent to the dashboard by the newsletter layout.",
  },
  "/(app)/newsletter/[id]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftNewsletter: 200, approveNewsletter: 200 }),
    why:
      "The newsletter tools admit admins and draftNewsletter and approveNewsletter holders; " +
      "everyone else is sent to the dashboard by the newsletter layout. A missing draft " +
      "renders the tool's own not-found state for those admitted.",
  },
  "/(app)/newsletter/new": {
    expect: everyone(["dashboard", "newsletter"], { anonymous: "login", pending: "pendingApproval", rejected: "home", admin: 200, draftNewsletter: 200, approveNewsletter: "newsletter" }),
    why:
      "Drafting needs draftNewsletter (or admin): the page sends an approveNewsletter " +
      "holder, whom the layout admits, back to the newsletter list, while the layout sends " +
      "everyone else to the dashboard. Both redirects are in the stream for the latter, so " +
      "either is accepted.",
  },
  "/(app)/profile": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The authed shell: a stranger is sent to sign in by the proxy, a pending account to " +
      "the waiting page and a rejected one home by the layout, and every approved account " +
      "renders it.",
  },
  "/(app)/tasks": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The authed shell: a stranger is sent to sign in by the proxy, a pending account to " +
      "the waiting page and a rejected one home by the layout, and every approved account " +
      "renders it. My Work shows only the account's own tasks.",
  },
  "/(app)/worksheets/(author)": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200 }),
    why:
      "The worksheet library is the library tier (committee and admin); everyone else is " +
      "sent to the dashboard by the author layout. A missing document renders the library's " +
      "own not-found state.",
  },
  "/(app)/worksheets/(author)/[worksheetId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200 }),
    why:
      "The worksheet library is the library tier (committee and admin); everyone else is " +
      "sent to the dashboard by the author layout. A missing document renders the library's " +
      "own not-found state.",
  },
  "/(app)/worksheets/(author)/[worksheetId]/circulations/[circulationId]": {
    expect: everyone("dashboard", { anonymous: "login", pending: "pendingApproval", rejected: "home", committee: 200, suCommittee: 200, admin: 200 }),
    why:
      "The worksheet library is the library tier (committee and admin); everyone else is " +
      "sent to the dashboard by the author layout. A missing document renders the library's " +
      "own not-found state.",
  },
  "/(app)/worksheets/respond/[circulationId]": {
    expect: everyone(200, { anonymous: "login", pending: "pendingApproval", rejected: "home" }),
    why:
      "The authed shell: a stranger is sent to sign in by the proxy, a pending account to " +
      "the waiting page and a rejected one home by the layout, and every approved account " +
      "renders it. The respond page is for the recipient the circulation names; a missing " +
      "circulation renders its own not-found state for any approved account, and the " +
      "response itself is client-direct behind the rules.",
  },
};

// ===========================================================================
// THE SECOND PASS: every persona, with THEIRS and with ANOTHER
// ===========================================================================
//
// One block, keyed exactly as `ROUTES` and `PAGES` are, so the entries above
// stay as they were and a key added beside them is added here once. What a
// cell means, and how the two columns resolve, is in this file's header; how
// the world is made is in `scripts/e2e/lib/personaWorld.mjs`. In short: the
// lead leads THEIRS' programme (an SU-recognised committee member, flagged as
// appointed); the facilitator facilitates its run's first group and holds a
// place there; the participant holds a place in the run's second group; the
// run is three weeks in, its first three weeks published as plain weeks (not
// written as blocks), and a before survey went to both people holding a place.
// A segment the world does not fill keeps its made-up id in both sets.

/** One cell: the outcome and the reason for it. */
const c = (outcome, why) => [outcome, why];

const NO_SESSION = "No session: refused before anything is read.";
const SIGN_IN = "No session: the proxy sends a stranger to sign in, whatever the address names.";
const WAITING = "A waiting account is sent to the waiting page by the authed layout, whatever the address names.";
const TURNED_DOWN = "A refused account is sent home by the authed layout, whatever the address names.";

/**
 * The body is checked before anything is read, so an empty one is the same
 * 400 for everybody signed in, on either programme: the gate (`gate`, said
 * for the reader) is never reached. Where an empty body cannot reach a gate
 * the second pass proves nothing more than that, and says so.
 */
function bodyFirst(gate, extra = {}) {
  const why = `The body is checked before anything is read, so an empty one is the same 400 whoever asks and the gate is never reached. ${gate}`;
  return {
    another: { anonymous: c(401, NO_SESSION), "*": c(400, why), ...(extra.another ?? {}) },
    theirs: { lead: c(400, why), facilitator: c(400, why), participant: c(400, why), ...(extra.theirs ?? {}) },
  };
}

/** An admin's alone, decided on the session before anything is read; `admin` is what an admin meets next. */
function adminAlone(what, admin) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `${what} is an admin's alone, decided on the session before anything is read.`),
      admin,
    },
    theirs: {
      lead: c(403, `Leading the programme gives no say here: ${what} is an admin's alone.`),
      facilitator: c(403, `Facilitating one of the run's groups gives no say here: ${what} is an admin's alone.`),
      participant: c(403, `Holding a place gives no say here: ${what} is an admin's alone.`),
    },
  };
}

/** A course approver's (an admin or an approveCourse holder), decided on the session; `ok` is what they meet next. */
function courseApprovers(what, ok) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `${what} is a course approver's (an admin or an approveCourse holder), decided on the session before anything is read.`),
      admin: ok,
      approveCourse: ok,
    },
    theirs: {
      lead: c(403, `Leading a programme that names a run of the course does not make the lead its approver: ${what} is an approver's.`),
      facilitator: c(403, `Facilitating a group gives no say here: ${what} is a course approver's.`),
      participant: c(403, `Holding a place gives no say here: ${what} is a course approver's.`),
    },
  };
}

/**
 * The group's live facilitators and admins, decided from the group before
 * anything else of it is read; `next` is what either meets once admitted.
 */
function groupStaff(what, next) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `Facilitates no live group here, so is refused in one 403 before anything else is read: ${what} is the group's live facilitators' and an admin's.`),
      admin: next,
    },
    theirs: {
      lead: c(403, `Leading the programme does not make the lead one of this group's facilitators: ${what} is theirs and an admin's.`),
      facilitator: next,
      participant: c(403, `Holds a place in the run's other group and facilitates none: ${what} is this group's facilitators' and an admin's.`),
    },
  };
}

/**
 * An admin, a track lead of the run, or the lead of the programme that names
 * it (`doesTrackLeadWork`), decided once the run is read; `next` is what each
 * meets once admitted.
 */
function runStaff(what, next) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `Staffs nothing on this run: ${what} is for an admin, its track leads and the lead of the programme that names it.`),
      admin: next,
    },
    theirs: {
      lead: next,
      facilitator: c(403, `Facilitating one of the run's groups does not staff the run: ${what} is for an admin, its track leads and the programme's lead.`),
      participant: c(403, `Holding a place does not staff the run: ${what} is for an admin, its track leads and the programme's lead.`),
    },
  };
}

/**
 * Writing in one's own seat on a run (a box, a reflection, a written answer,
 * a pack or a ready): somebody taking part, told their place, or a live
 * facilitator of one of its groups; an admin is neither. Sent a whole `body`,
 * only to somebody refused, so the gate is reached on both programmes.
 */
function seatWrite(what, body) {
  const notSent = "a whole body is never sent to somebody the gate admits, so it is not sent.";
  return {
    realDrive: {
      body,
      why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
    },
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `Neither holds a place on this run nor facilitates one of its groups: ${what} is refused before anything is written.`),
      admin: c(403, `An admin neither holds a place on the run nor facilitates one of its groups, and ${what} is theirs alone: refused before anything is written.`),
    },
    theirs: {
      lead: c(403, `Leading the programme gives no place on the run: ${what} is refused before anything is written.`),
      facilitator: c(ACTS, `Holds a place on the run and facilitates a group, so admitted: ${notSent}`),
      participant: c(ACTS, `Holds a place on the run, so admitted: ${notSent}`),
    },
  };
}

/**
 * The notes about one person on a programme (privacy v15), through the
 * programme's own door: an admin on either programme, the programme's lead
 * on THEIRS, each meeting what `admin` and `lead` say; everybody else is
 * answered as a programme that is not there, before anything about the
 * person is read. The set's `uid` is its participant, so on THEIRS the
 * participant is asking about themselves, which nobody may.
 */
function programmeNotes(admin, lead) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(404, "No role on this programme: answered as a programme that is not there, before anything about the person is read."),
      admin,
    },
    theirs: {
      lead,
      facilitator: c(404, "Facilitating one of the run's groups is no role on the form: answered as a programme that is not there."),
      participant: c(403, "The participant asking about their own record: nobody is shown or keeps the notes about themselves, refused before the programme is read."),
    },
  };
}

// --- Pages ---------------------------------------------------------------

const PAGE_BASE = {
  anonymous: c("login", SIGN_IN),
  pending: c("pendingApproval", WAITING),
  rejected: c("home", TURNED_DOWN),
};

/**
 * A page under a programme on an application form. The admissions tree admits
 * an admin, an approveCourse holder and an appointed reviewer or lead (the
 * flag appointing sets), and sends everybody else to the dashboard; the
 * programme's head, or the page itself, then draws "there is no programme
 * here" for anybody with no role on THIS programme. `page` says what the
 * programme's lead and an admin are shown; `state` is what somebody admitted
 * with no role on it sees (one STATES name, or a list when the page draws a
 * calm state of its own under the head's).
 */
function programmePage(page, state = "noProgramme") {
  const noRole = (who) => c(state, `${who}, so the admissions tree admits them, but holds no role on this programme: ${state === "noProgramme" ? "the page is drawn as 'there is no programme here'" : "the page and its head are drawn as a calm 'not here'"}.`);
  return {
    another: {
      ...PAGE_BASE,
      "*": c("dashboard", "Not an admin, an approveCourse holder or anybody appointed on a form: the admissions tree sends them to the dashboard."),
      admin: c(200, `An admin, whatever the programme: ${page}`),
      approveCourse: noRole("Authors application forms"),
      lead: noRole("Appointed to lead a programme on another form"),
    },
    theirs: {
      lead: c(200, `The programme's own lead: ${page}`),
      facilitator: c("dashboard", "Facilitating one of the run's groups is not a role on the form: the admissions tree sends a plain member to the dashboard."),
      participant: c("dashboard", "Holding a place is not a role on the form: the admissions tree sends a plain member to the dashboard."),
    },
  };
}

/** Anybody the run layout refuses: no role on the run. Both its redirect and the page's own can be in the stream. */
const NOT_ON_THE_RUN = ["learn", "run"];
const NOT_ON_THE_RUN_WHY =
  "Holds no role on this run, so the run layout sends them to /learn; the page beneath renders beside it and may send them to the run's home too, so either is accepted.";
const LEAD_NOT_ON_THE_RUN_WHY =
  "The run layout admits learners, facilitators, admins, track leads and reviewers, and not a programme's lead (who works from the programme's own tabs), so it sends the lead to /learn; the page beneath may send them to the run's home too.";

/**
 * A page under one run in /learn. `admin`, `facilitator` and `participant`
 * are the cells of the three the run layout admits on THEIRS (an admin on
 * either); `refused` is what everybody it does not admit sees, the lead
 * included, with `why`.
 */
function learnPage({ admin, facilitator, participant, refused = NOT_ON_THE_RUN, why = NOT_ON_THE_RUN_WHY, leadWhy = LEAD_NOT_ON_THE_RUN_WHY }) {
  return {
    another: { ...PAGE_BASE, "*": c(refused, why), admin },
    theirs: { lead: c(refused, leadWhy), facilitator, participant },
  };
}

/** The run home, the admissions lane's page: everybody it refuses goes to /learn and nowhere else. */
const LEARN_ONLY_WHY =
  "Holds no role on this run, so the run layout sends them to /learn, and the page beneath sends them there too.";
const LEAD_LEARN_ONLY_WHY =
  "The run layout does not admit a programme's lead, who works from the programme's own tabs, and the page beneath sends them to /learn as well.";

export const REAL_ROUTES = {
  // ---- A programme on an application form: the programme's own console ----
  "/api/admissions/forms/[roundId]/programmes/[programmeId]": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, so the address says nothing."),
        admin: c(200, "An admin reads any programme's settings."),
      },
      theirs: {
        lead: c(200, "The programme's own lead reads its settings."),
        facilitator: c(404, "Holding a place and facilitating are no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
    PATCH: bodyFirst("Who may change the programme is decided from the form inside the write."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/applications": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: the list is answered as one that is not there, by design."),
        admin: c(200, "An admin reads any programme's applications."),
      },
      theirs: {
        lead: c(200, "The programme's own lead reads the applications that ranked it."),
        facilitator: c(404, "No role on the form: answered as a list that is not there."),
        participant: c(404, "No role on the form: answered as a list that is not there."),
      },
    },
    POST: bodyFirst("A bulk decision is decided from the form once a valid one arrives."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement": {
    POST: adminAlone(
      "Asking for an arrangement into groups",
      c(400, "An admin meets the body check: an empty body does not say whether to ask Claude, so nothing is read or sent."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/best-answers": {
    GET: {
      realDrive: { query: "?week={weekId}", why: "A week is required in the query: the set's week 1 reaches the admin's door." },
      ...adminAlone(
        "Claude's best answers to a week",
        c(404, "An admin is let through on any programme, and told week 1 has no coursework: the world's weeks are written before blocks."),
      ),
    },
    POST: adminAlone(
      "Asking Claude for a week's best answers",
      c(400, "An admin meets the body check: an empty body does not say which week, so nothing is read or sent."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/pangram": {
    GET: {
      realDrive: { query: "?week={weekId}", why: "A week is required in the query: the set's week 1 reaches the admin's door." },
      ...adminAlone(
        "Pangram on coursework",
        c(404, "An admin is let through on any programme, and told week 1 has no coursework: the world's weeks are written before blocks."),
      ),
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/pangram": {
    GET: adminAlone(
      "Pangram on coursework",
      c(200, "An admin reads the readings kept for the set's participant, who holds a place: none here. Nothing is sent."),
    ),
    POST: adminAlone(
      "Pangram on coursework",
      c(ACTS, "An admin's empty body asks for every week of the participant's counted answers, which would send them to Pangram where it is set up: not sent."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes": {
    GET: programmeNotes(
      c(200, "An admin reads the notes about the set's participant, who holds a place, as the admin area's page for the programme shows them: none here. Nothing is written."),
      c(200, "The programme's own lead reads the notes kept for leads about the participant, who holds a place on it: none here, and never how many others there are."),
    ),
    POST: programmeNotes(
      c(400, "An admin is let through on any programme and meets the body check: an empty note is refused before anything is written."),
      c(400, "The programme's own lead is let through to the participant and meets the body check: an empty note is refused before anything is written."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/[noteId]": {
    PATCH: programmeNotes(
      c(400, "An admin is let through on any programme and meets the body check: an empty change is refused before the note is read."),
      c(400, "The programme's own lead is let through to the participant and meets the body check: an empty change is refused before the note is read."),
    ),
    DELETE: programmeNotes(
      c(404, "An admin is let through on any programme and told the note the address names is not here: the world writes no note."),
      c(404, "The programme's own lead is let through to the participant and told the note the address names is not here: the world writes no note."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/circles": {
    GET: adminAlone("Reading Circles", c(200, "An admin reads the run's groups as they are. Nothing is written and Claude is not asked.")),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/assessments": {
    GET: adminAlone(
      "Reading Claude's and Pangram's marks",
      c(200, "An admin reads the marks already stored, on either programme. Nothing is sent to Claude or Pangram."),
    ),
    POST: adminAlone(
      "Asking Claude about a programme",
      c(400, "An admin meets the body check: an empty body asks for nothing, so nothing is read or sent."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles": {
    PUT: bodyFirst("Who may name whom is setProgrammeRoles's decision, from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/run": {
    GET: adminAlone("Placing people on a run", c(200, "An admin reads which run the programme names, on either programme.")),
    PUT: adminAlone("Naming the programme's run", c(400, "An admin meets the body check: an empty body names no run.")),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over": {
    POST: adminAlone(
      "Handing people over to the run",
      c(200, "An admin's press with everybody holding a place already on the run's list: nobody is handed over and nothing is written."),
    ),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places": {
    POST: bodyFirst("Offering a freed place is an admin's, decided from the form once a valid body arrives."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places/test": {
    POST: bodyFirst("As the press, then the role from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there."),
        admin: c(ACTS, "An admin is handed the attendance file, after its export-log row is written: it takes no body, so nothing stops it."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead is handed the attendance file after its export-log row is written: it takes no body."),
        facilitator: c(404, "No role on the form: answered as a programme that is not there."),
        participant: c(404, "No role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind": {
    POST: bodyFirst("Only the programme's lead and admins email a group's facilitators, decided from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind": {
    POST: {
      realDrive: { body: { emails: 1 }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its run is read."),
        admin: c(ACTS, "An admin reminds people to say when they are free on any programme, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead reminds its people to say when they are free, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing": {
    PUT: {
      realDrive: { body: { uid: "e2e-battery-person", finished: true }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its run is read."),
        admin: c(ACTS, "An admin decides who finished on any programme, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead decides who finished, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask": {
    POST: bodyFirst("The programme's lead or an admin ask, decided from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask/test": {
    POST: bodyFirst("As the ask, then the role from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/case/draft": {
    POST: bodyFirst("As making the case: an admin only, decided from the form after the body."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/remind": {
    POST: bodyFirst("As the ask, then the role from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/training": {
    PUT: {
      realDrive: { body: { training: null }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its run is read."),
        admin: c(ACTS, "An admin sets the facilitators' training on any programme, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead sets its facilitators' training, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing/rule": {
    PUT: {
      realDrive: { body: { atLeast: null }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its run is read."),
        admin: c(ACTS, "An admin sets the rule for who finished on any programme, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead sets its rule for who finished, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups": {
    POST: bodyFirst("Only the programme's lead and admins add a group, decided from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups-go-out": {
    PUT: {
      realDrive: { body: { on: null }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its run is read."),
        admin: c(ACTS, "An admin sets the day groups go out on any programme, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead sets the day its groups go out, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/room": {
    PUT: {
      realDrive: { body: { room: "Room E2E" }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its group is read."),
        admin: c(ACTS, "An admin sets any programme's group rooms, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead sets its groups' rooms, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus": {
    PUT: {
      realDrive: { body: { campus: "jubilee" }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its group is read."),
        admin: c(ACTS, "An admin sets any programme's group campuses, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead sets its groups' campuses, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/time": {
    PUT: {
      realDrive: { body: { weekday: 2, start: "18:00", from: { weekday: 1, start: "18:00" } }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there, before its group is read."),
        admin: c(ACTS, "An admin changes any programme's group times, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead changes its groups' times, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as a programme that is not there."),
        participant: c(404, "Holding a place is no role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams": {
    POST: bodyFirst("An incubator's lead or an admin make its teams, decided from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates": {
    POST: bodyFirst("The role comes from the form once a valid body arrives."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates/test": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there."),
        admin: c(409, "An admin is told the run's last session is not over yet, before anybody's certificate is read or any test is sent."),
      },
      theirs: {
        lead: c(409, "The programme's own lead is told the run's last session is not over yet, before any test is sent."),
        facilitator: c(404, "No role on the form: answered as a programme that is not there."),
        participant: c(404, "No role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell": {
    POST: bodyFirst("Then the role from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell/test": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No role on this programme: answered as a programme that is not there."),
        admin: c(409, "An admin is told teams are an incubator's, and this programme is a fellowship: nothing is sent."),
      },
      theirs: {
        lead: c(409, "The programme's own lead is told teams are an incubator's, and theirs is a fellowship: nothing is sent."),
        facilitator: c(404, "No role on the form: answered as a programme that is not there."),
        participant: c(404, "No role on the form: answered as a programme that is not there."),
      },
    },
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/hand-in": {
    PUT: bodyFirst("Then the programme's lead or an admin, from the form."),
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/test-email": {
    POST: bodyFirst("Then its lead or an admin, from the form."),
  },

  // ---- A course ----------------------------------------------------------
  "/api/courses/[courseId]/crest": {
    PUT: adminAlone("A course's crest", c(400, "An admin meets the body check: the battery sends no crest.")),
  },
  "/api/courses/[courseId]/destroy": {
    POST: adminAlone("Destroying a course", c(400, "An admin meets the body check: destroying needs the typed name.")),
  },
  "/api/courses/[courseId]/destroy-manifest": {
    GET: adminAlone("What destroying a course would delete", c(200, "An admin reads the course's destroy manifest, on either programme's course. A GET: it writes nothing.")),
  },
  "/api/courses/[courseId]/facilitator-guide": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither facilitates a live group on a run of this course nor leads a programme naming one: the guide's gate refuses before anything is read."),
        admin: c(200, "An admin reads any course's guide titles."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names a running run of the course: the guide's gate admits them."),
        facilitator: c(200, "Facilitates a live group on a run of the course: the guide's gate admits them."),
        participant: c(403, "Holding a place does not open the facilitator guide."),
      },
    },
  },
  "/api/courses/[courseId]/facilitator-guide/[slot]": {
    GET: guideWriter("Copying a guide document out"),
    POST: guideWriter("Reading a pasted guide document"),
    PUT: guideWriter("Saving a pasted guide document"),
  },
  "/api/courses/[courseId]/page": {
    PUT: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin nor an author of this course (its author or a collaborator holding a course permission): refused once the course is read."),
        admin: c(ACTS, "An admin saves the course's page from whatever arrives: an empty body is an empty page, so it would act."),
      },
      theirs: {
        lead: c(403, "Leading a programme gives no say over the course's page: it is its authors' and an admin's."),
        facilitator: c(403, "Facilitating gives no say over the course's page."),
        participant: c(403, "Holding a place gives no say over the course's page."),
      },
    },
  },
  "/api/courses/[courseId]/page/generate-themes": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Not an author of this course: refused once the course is read."),
        admin: c(400, "An admin meets the body check: it names neither a template nor a run."),
      },
      theirs: {
        lead: c(403, "Leading a programme gives no say over the course's page."),
        facilitator: c(403, "Facilitating gives no say over the course's page."),
        participant: c(403, "Holding a place gives no say over the course's page."),
      },
    },
  },
  "/api/courses/[courseId]/predictions": {
    POST: adminAlone("Reading a pasted predictions card", c(400, "An admin meets the body check on an empty one.")),
    PUT: adminAlone("Saving a course's predictions card", c(400, "An admin meets the body check on an empty one.")),
  },
  "/api/courses/[courseId]/publish": {
    POST: courseApprovers(
      "Publishing a course",
      c(ACTS, "An approver publishes the course again, with no showcase run: an empty body is a valid press, so it would act."),
    ),
  },
  "/api/courses/[courseId]/rubric": {
    POST: adminAlone("Reading a pasted rubric", c(400, "An admin meets the body check: no table.")),
    PUT: adminAlone("Saving a course's rubric", c(400, "An admin meets the body check: no table.")),
  },
  "/api/courses/[courseId]/routes": {
    POST: adminAlone("Reading a pasted list of routes", c(400, "An admin meets the body check on an empty one.")),
    PUT: adminAlone("Saving a course's routes", c(400, "An admin meets the body check on an empty one.")),
  },
  "/api/courses/[courseId]/templates": {
    POST: adminAlone("Saving a course's version", c(400, "An admin meets the body check: a version needs a label.")),
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither a course author (admin, draftCourse, approveCourse) nor a track lead of one of its runs."),
        admin: c(200, "An admin reads a course's saved versions."),
        draftCourse: c(200, "A course drafter reads any course's saved versions."),
        approveCourse: c(200, "A course approver reads any course's saved versions."),
      },
      theirs: {
        lead: c(403, "A programme's lead is not a track lead of the run: the saved versions are the course authors' and track leads'."),
        facilitator: c(403, "Facilitating gives no sight of the course's saved versions."),
        participant: c(403, "Holding a place gives no sight of the course's saved versions."),
      },
    },
  },

  // ---- A group -------------------------------------------------------------
  "/api/courses/facilitator-asks/[askId]/answer": {
    POST: {
      realDrive: { body: { answer: "no" }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "Not the person asked: an ask that is not the caller's own is answered as one that is not there, an admin's included."),
      },
      theirs: {
        lead: c(404, "The lead made the ask, to somebody else: only the person asked answers it, so it is answered as one that is not there."),
        facilitator: c(404, "The ask is to the participant, not to them: answered as one that is not there."),
        participant: c(ACTS, "The ask is to them and still open, so a whole answer would be recorded: it is not sent."),
      },
    },
  },
  "/api/courses/groups/[groupId]/attendance": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither a live facilitator of the group, the lead of the programme naming its run, nor an admin: one 403 before the register is read."),
        admin: c(200, "An admin reads any group's registers."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names the group's run: the register's read gate admits the lead."),
        facilitator: c(200, "A live facilitator of the group reads its registers."),
        participant: c(403, "Holds a place in another group of the run: the register is its facilitators', the lead's and an admin's."),
      },
    },
    POST: groupStaff("Marking the register", c(400, "Admitted, then the body is checked: an empty one says no week.")),
    PATCH: groupStaff("Changing a pushed register", c(400, "Admitted, then the body is checked: an empty one says no week.")),
  },
  "/api/courses/groups/[groupId]/attendance/push": {
    POST: groupStaff("Finishing a register", c(400, "Admitted, then the body is checked: an empty one says no week.")),
  },
  "/api/courses/groups/[groupId]/check-in": {
    GET: {
      realDrive: { query: "?session=w01", why: "The session is required in the query, which an empty one fails for everybody admitted: week 1 reaches the card." },
      ...groupStaff("The check-in's card", c(200, "Admitted, and week 1 is asked for: its card, which here is none, and the group's last closed check-in, none either.")),
    },
    POST: groupStaff("Opening a session's check-in", c(400, "Admitted, then the body is checked: an empty one names no session.")),
  },
  "/api/courses/groups/[groupId]/check-in/close": {
    POST: groupStaff("Closing a session's check-in", c(400, "Admitted, then the body is checked: an empty one names no session.")),
  },
  "/api/courses/groups/[groupId]/email": {
    POST: groupStaff("Emailing the group", c(400, "Admitted, then the body is checked: an empty one has no subject or message.")),
  },
  "/api/courses/groups/[groupId]/exercises": {
    GET: {
      realDrive: { query: "?week=1", why: "A week is required in the query, which an empty one fails for everybody: week 1 reaches the gate." },
      ...groupStaff("Reading the group's answers to a week's exercises", c(200, "Admitted, and week 1 is asked for: the group's answers, none here.")),
    },
  },
  "/api/courses/groups/[groupId]/facilitators": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Staffs nothing on the group's run: a group is staffed by admins, the run's track leads and the programme's lead."),
        admin: c(ACTS, "An admin's empty body is read as 'nobody facilitates': it would take the group's facilitator off it."),
      },
      theirs: {
        lead: c(ACTS, "The programme's own lead staffs the run's groups, and an empty body is read as 'nobody facilitates': it would take the facilitator off the group."),
        facilitator: c(403, "Facilitating a group does not staff the run: appointing facilitators is the run's staff's."),
        participant: c(403, "Holding a place does not staff the run."),
      },
    },
  },
  "/api/courses/groups/[groupId]/notes": {
    POST: {
      realDrive: { body: { body: "Written by the persona battery." }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Facilitates no live group here: a note on a group is its live facilitators' alone, so one 403 before anything is written."),
        admin: c(403, "An admin is none of this group's facilitators, and a note on a group is theirs alone: refused with the group's own sentence."),
      },
      theirs: {
        lead: c(403, "Leading the programme does not make the lead one of the group's facilitators: refused before anything is written."),
        facilitator: c(ACTS, "A live facilitator of the group, so admitted, and the body is a whole note: it would write it, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group and facilitates none: refused before anything is written."),
      },
    },
  },
  "/api/courses/groups/[groupId]/notice": {
    POST: groupStaff("A notice to the group", c(400, "Admitted, then the body is checked: an empty one has no message.")),
  },
  "/api/courses/groups/[groupId]/pace": {
    PATCH: groupStaff("The group's pace", c(400, "Admitted, then the body is checked: it sends neither a start nor a plan.")),
  },
  "/api/courses/groups/[groupId]/participant-notes": {
    POST: groupStaff("A note about one of the group's people", c(400, "Admitted, then the body is checked: an empty one says no week.")),
  },
  "/api/courses/groups/[groupId]/ratings": {
    POST: {
      realDrive: { body: { uid: "e2e-battery-rated", answers: {} }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin, a live facilitator of the group, nor the lead of the programme naming its run: refused before anybody is rated."),
        admin: c(ACTS, "An admin rates on any group, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent (it would be told the run's last session is not over yet)."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme naming the group's run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(ACTS, "A live facilitator of the group, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group, facilitates none and leads nothing: refused before anybody is rated."),
      },
    },
  },
  "/api/courses/groups/[groupId]/roster": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither facilitates the group nor holds a told place in it: the roster is refused once the group is read."),
        admin: c(200, "An admin reads any group's roster."),
      },
      theirs: {
        lead: c(403, "The roster is the group's own facilitators', its people's and an admin's: leading the programme does not open it."),
        facilitator: c(200, "Facilitates the group, and holds a place in it too: reads its roster."),
        participant: c(403, "Holds a place in the run's other group, not this one: another group's roster is not theirs."),
      },
    },
  },
  "/api/courses/groups/[groupId]/session": {
    PATCH: groupStaff("A session's mode", c(400, "Admitted, then the body is checked: an empty one names no week.")),
  },
  "/api/courses/groups/[groupId]/session/change": {
    POST: {
      realDrive: {
        body: { week: 1, dateKey: "2026-01-05", kind: "online", reason: "Written by the persona battery.", tell: false },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin, a live facilitator of the group, nor anybody staffing its run (its track leads, the programme's lead): one 403 before any session changes."),
        admin: c(ACTS, "An admin changes any group's sessions, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme that names the run, which staffs it, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(ACTS, "A live facilitator of the group, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group and staffs nothing: one 403 before any session changes."),
      },
    },
  },
  "/api/courses/groups/[groupId]/session-report": {
    PUT: {
      realDrive: {
        body: { sessionKey: "w01", answers: { how: 3 } },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Facilitates no live group here: a session report is the group's live facilitators' own, so one 403 before anything is read."),
        admin: c(403, "An admin is none of this group's facilitators, and each facilitator writes their own report: refused with the report's own sentence."),
      },
      theirs: {
        lead: c(403, "Leading the programme does not make the lead one of the group's facilitators: the lead reads reports and writes none, refused before anything is read."),
        facilitator: c(ACTS, "A live facilitator of the group, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group and facilitates none: refused before anything is read."),
      },
    },
  },
  "/api/courses/groups/[groupId]/draw": {
    PUT: {
      realDrive: {
        body: { weekId: "w01", entries: [{ uid: "e2e-battery-person", blockId: "e2e-battery-block", value: null }] },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither a live facilitator of the group, the lead of the programme naming its run, nor an admin: refused before the week is read."),
        admin: c(ACTS, "An admin opens any group's draw, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme naming the group's run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(ACTS, "A live facilitator of the group, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group, facilitates none and leads nothing: refused before the week is read."),
      },
    },
  },
  "/api/courses/groups/[groupId]/pairs": {
    PUT: {
      realDrive: {
        body: { weekId: "w01", blockId: "e2e-battery-block", entries: [{ uid: "e2e-battery-person", pair: 1, laptop: false }] },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither a live facilitator of the group, the lead of the programme naming its run, nor an admin: refused before the week is read."),
        admin: c(ACTS, "An admin opens any group's pairs, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme naming the group's run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(ACTS, "A live facilitator of the group, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group, facilitates none and leads nothing: refused before the week is read."),
      },
    },
  },
  "/api/courses/groups/[groupId]/shared-notes": {
    POST: {
      realDrive: { body: { weekNumber: 1, body: "Written by the persona battery." }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither holds a place in the group nor facilitates it: a shared note is its people's and its live facilitators', so one 403 before anything is written."),
        admin: c(403, "An admin neither holds a place in the group nor facilitates it, and shared notes are theirs alone: refused with the group's own sentence."),
      },
      theirs: {
        lead: c(403, "Leading the programme gives no place in the group: refused before anything is written."),
        facilitator: c(ACTS, "Holds a place in the group and facilitates it, so admitted, and the body is a whole note: it would write it, so it is not sent."),
        participant: c(403, "Holds a place in the run's other group, not this one: another group's shared notes are not theirs to write, refused before anything is written."),
      },
    },
  },
  "/api/courses/groups/[groupId]/shared-notes/[noteId]": {
    DELETE: {
      another: {
        anonymous: c(401, NO_SESSION),
        pending: c(403, "The roster floor is asked first: a waiting account is refused."),
        rejected: c(403, "The roster floor is asked first: a refused account is refused."),
        "*": c(403, "The note the address names is no note of the caller's (the battery names none): one 403 for anybody but an admin."),
        admin: c(404, "An admin is told the note is not there: the battery names none."),
      },
      theirs: {
        lead: c(403, "The note the address names is not the lead's: refused as anybody is."),
        facilitator: c(403, "The note the address names is not theirs: only a note's own writer deletes it."),
        participant: c(403, "The note the address names is not theirs: only a note's own writer deletes it."),
      },
    },
  },
  "/api/courses/groups/[groupId]/summary": {
    GET: groupStaff("What a facilitator's Home says about the group", c(200, "Admitted: the group's summary.")),
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]": {
    PATCH: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin, a lead of the run (its track lead or its programme's lead) nor a live facilitator of the group: refused before the body."),
        admin: c(400, "Admitted, then an empty body changes nothing and is refused."),
      },
      theirs: {
        lead: c(400, "Leads the programme that names the run, so admitted, then an empty body changes nothing and is refused."),
        facilitator: c(400, "A live facilitator of the group, so admitted, then an empty body changes nothing and is refused."),
        participant: c(403, "Holds a place in the run's other group and leads nothing: refused before the body."),
      },
    },
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]/blocks": {
    GET: groupWeek("Copying the group's week out", c(404, "Admitted, and week 1 is not written as blocks here, so there is nothing to copy.")),
    POST: groupWeek("Reading a pasted week for the group", c(400, "Admitted, then the body is checked: no Markdown.")),
    PUT: groupWeek("Saving a pasted week for the group", c(400, "Admitted, then the body is checked: no Markdown.")),
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]/fork": {
    POST: groupStaff(
      "Giving the group its own copy of a week",
      c(ACTS, "Admitted, and week 1 has canonical content: it takes no body, so it would make the group's copy."),
    ),
  },

  // ---- A run ----------------------------------------------------------------
  "/api/courses/runs/[runId]/allocate": {
    POST: {
      realDrive: { body: { placements: [{ uid: "e2e-battery-person", groupId: null }] }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      ...runStaff("Placing people in the run's groups", c(ACTS, "Admitted: a whole body is never sent to somebody the gate admits, so it is not sent.")),
    },
  },
  "/api/courses/runs/[runId]/allocation": {
    GET: runStaff("The allocation board", c(200, "Admitted: the board, the rows served to the caller.")),
  },
  "/api/courses/runs/[runId]/allocation/publish": {
    POST: {
      realDrive: { body: { emails: 0 }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      ...runStaff("Publish", c(ACTS, "Admitted: a whole body is never sent to somebody the gate admits, so it is not sent (it would take the run's press lock).")),
    },
  },
  "/api/courses/runs/[runId]/allocation/publish/test": {
    POST: runStaff(
      "A test of Publish's emails",
      c(ACTS, "Admitted, and it takes no body: it would send a test to the caller's own address."),
    ),
  },
  "/api/courses/runs/[runId]/allocation/publish/notes": {
    GET: runStaff("Notes for people placed outside their times", c(200, "Admitted: the section, which carries no week and no draft for a lead. It writes nothing.")),
    PUT: runStaff("Saving a note for somebody placed outside their times", c(400, "Admitted, then an empty body does not say who the note is for.")),
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Only an admin can ask Claude to draft a note: refused before anything is read."),
        admin: c(400, "An admin is admitted, then an empty body does not say whose note to draft."),
      },
      theirs: {
        lead: c(403, "Only an admin can ask Claude to draft a note, the programme's lead included."),
        facilitator: c(403, "Only an admin can ask Claude to draft a note."),
        participant: c(403, "Only an admin can ask Claude to draft a note."),
      },
    },
  },
  "/api/courses/runs/[runId]/allocation/publish/preview": {
    GET: runStaff("Publish's two emails, previewed", c(200, "Admitted, and every row on the run is served to them: the preview. It writes nothing.")),
  },
  "/api/courses/runs/[runId]/time-answer": {
    POST: {
      realDrive: {
        body: { groupId: "e2e-battery-no-such-group", kind: "yes" },
        why:
          "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the " +
          "refused (nobody with a told seat on the run) are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "No seat on this run: there is no group time for them to answer."),
        admin: c(404, "An admin holds no seat on this run, so there is no group time for them to answer."),
      },
      theirs: {
        lead: c(404, "The programme's lead holds no seat on its run: there is nothing to answer."),
        facilitator: c(ACTS, "Their own told seat reaches the answer's checks, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(ACTS, "Their own told seat may answer, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent (it would write their answer)."),
      },
    },
  },
  "/api/courses/runs/[runId]/applications": {
    GET: runStaff("The run's applications queue", c(200, "Admitted: the rows served to the caller.")),
  },
  "/api/courses/runs/[runId]/applications/[uid]/decide": {
    POST: bodyFirst("Then admins and the run's own admissions reviewers decide."),
  },
  "/api/courses/runs/[runId]/applications/[uid]/notes": {
    PATCH: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin nor one of the run's admissions reviewers: refused once the run is read."),
        admin: c(400, "An admin reaches the row, then an empty body has nothing to save."),
      },
      theirs: {
        lead: c(403, "A programme's lead may read the run's queue but not annotate it: the notes are the run's reviewers' and admins'."),
        facilitator: c(403, "Facilitating gives no say over the run's applications."),
        participant: c(403, "Holding a place gives no say over the run's applications, their own included."),
      },
    },
  },
  "/api/courses/runs/[runId]/apply": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        rejected: c(403, "The applicant lane refuses a refused account first."),
        "*": c(409, "The run takes its people from an application form, so nobody applies to it here: the same 409 whoever asks."),
      },
      theirs: {
        lead: c(409, "The run takes its people from the form: nobody applies to it here."),
        facilitator: c(409, "The run takes its people from the form: nobody applies to it here, a place holder included."),
        participant: c(409, "The run takes its people from the form: nobody applies to it here, a place holder included."),
      },
    },
    PATCH: {
      another: {
        anonymous: c(401, NO_SESSION),
        rejected: c(403, "The applicant lane refuses a refused account first."),
        "*": c(404, "The caller has no application on this run: the row read is always the caller's own."),
      },
      theirs: {
        lead: c(404, "No application of the lead's on the run."),
        facilitator: c(403, "Their own row on the run's list was handed over accepted, so it has been reviewed and is not theirs to edit."),
        participant: c(403, "Their own row on the run's list was handed over accepted, so it has been reviewed and is not theirs to edit."),
      },
    },
    DELETE: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "The caller has no application on this run: the row read is always the caller's own."),
      },
      theirs: {
        lead: c(404, "No application of the lead's on the run."),
        facilitator: c(409, "Their own row was accepted, so it cannot be withdrawn here: decisions are the team's."),
        participant: c(409, "Their own row was accepted, so it cannot be withdrawn here: decisions are the team's."),
      },
    },
  },
  "/api/courses/runs/[runId]/apply-template": {
    POST: courseApprovers("Applying a saved version to a run", c(400, "An approver meets the body check: no version chosen.")),
  },
  "/api/courses/runs/[runId]/archive": {
    PATCH: courseApprovers("Archiving a run", c(400, "An approver meets the body check: archived must be true or false.")),
  },
  "/api/courses/runs/[runId]/clone-weeks": {
    POST: bodyFirst("Then the run's staff, once a run to copy from is named."),
  },
  "/api/courses/runs/[runId]/comments": {
    GET: {
      realDrive: { query: "?week=1", why: "A week is required in the query, which an empty one fails for everybody: week 1 reaches the gate." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Holds no live place and facilitates nothing on the run: its comments are refused before a row is read."),
        admin: c(200, "An admin reads a run's comments on a week."),
      },
      theirs: {
        lead: c(403, "Leading the programme opens no place on the run: the comments are its people's, its facilitators' and an admin's."),
        facilitator: c(200, "Holds a told place on the run: reads its people's comments on a week."),
        participant: c(200, "Holds a told place on the run: reads its people's comments on a week."),
      },
    },
  },
  "/api/courses/runs/[runId]/destroy": {
    POST: adminAlone("Destroying a run", c(400, "An admin meets the body check: destroying needs the typed label.")),
  },
  "/api/courses/runs/[runId]/destroy-manifest": {
    GET: adminAlone("What destroying a run would delete", c(200, "An admin reads the run's destroy manifest. A GET: it writes nothing.")),
  },
  "/api/courses/runs/[runId]/email": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Staffs nothing on the run (an admin, its run facilitators, its track leads, the programme's lead): one 403."),
        admin: c(400, "Admitted, then an empty body has no subject or message."),
      },
      theirs: {
        lead: c(400, "Leads the programme that names the run, so admitted, then an empty body has no subject or message."),
        facilitator: c(403, "Facilitating a group does not staff the run: the run-wide email is its staff's."),
        participant: c(403, "Holding a place does not staff the run."),
      },
    },
  },
  "/api/courses/runs/[runId]/enrol": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        rejected: c(403, "The enroller gate refuses a refused account first."),
        "*": c(200, "The run is there: its open groups (none: it takes people by admissions) and the caller's own told place, if any."),
      },
      theirs: {
        lead: c(200, "The run is there: no place of the lead's to show."),
        facilitator: c(200, "The run is there: their own told place is shown to them."),
        participant: c(200, "The run is there: their own told place is shown to them."),
      },
    },
    POST: bodyFirst("Then the run, for its open window.", { another: { rejected: c(403, "The enroller gate refuses a refused account first.") } }),
    PATCH: bodyFirst("Then the run, for its open window.", { another: { rejected: c(403, "The enroller gate refuses a refused account first.") } }),
    DELETE: {
      another: {
        anonymous: c(401, NO_SESSION),
        rejected: c(403, "The enroller gate refuses a refused account first."),
        "*": c(409, "The caller holds no place on this run, so there is no way out of it to take."),
      },
      theirs: {
        lead: c(409, "The lead holds no place on the run, so there is no way out of it to take."),
        facilitator: c(409, "Facilitates a group of the run: they come off its facilitators before they can leave."),
        participant: c(400, "Holds a place, so the way out is open, and the typed course title is then missing."),
      },
    },
  },
  "/api/courses/runs/[runId]/enrol-mode": {
    PATCH: adminAlone("A run's enrolment mode", c(400, "An admin meets the body check: no mode.")),
  },
  "/api/courses/runs/[runId]/enrolments/[uid]/reinstate": {
    POST: runStaff(
      "Putting somebody back on the run",
      c(ACTS, "Admitted, and it takes no body: the place is already active, so the press is idempotent, but it would still put them on the run's cohort list."),
    ),
  },
  "/api/courses/runs/[runId]/enrolments/[uid]/remove": {
    POST: runStaff(
      "Taking somebody off the run",
      c(ACTS, "Admitted, and it takes no body: it would take the participant off the run."),
    ),
  },
  "/api/courses/runs/[runId]/exercises/[exerciseId]/submit": {
    POST: {
      realDrive: { body: { weekId: "w01" }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Holds no place on this run, told by Publish: an answer to an exercise is its people's own, refused before anything is written."),
        admin: c(403, "An admin holds no place on the run: an answer to an exercise is its people's own, refused before anything is written."),
      },
      theirs: {
        lead: c(403, "Leading the programme gives no place on the run: refused before anything is written."),
        facilitator: c(ACTS, "Holds a place on the run, told by Publish, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(ACTS, "Holds a place on the run, told by Publish, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
    },
  },
  "/api/courses/runs/[runId]/facilitators/asking": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "The programme that names the run is found, and the caller holds no role on it: answered as no programme here, so the address says nothing."),
        admin: c(200, "An admin reads the Facilitators view of any programme."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names the run: its Facilitators view."),
        facilitator: c(404, "Facilitating a group is no role on the form: answered as no programme here."),
        participant: c(404, "Holding a place is no role on the form: answered as no programme here."),
      },
    },
  },
  "/api/courses/runs/[runId]/facilitators": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Outside the roster's own tier (an admin or SU-recognised committee): refused on the session alone."),
        suCommittee: c(403, "Inside the roster's tier but staffs nothing on this run: refused once the run is read."),
        admin: c(200, "An admin reads the run's groups and the approved accounts by name."),
      },
      theirs: {
        lead: c(200, "SU-recognised committee, and leads the programme that names the run: the run's groups and the approved accounts by name."),
        facilitator: c(403, "A plain member is outside the roster's tier: refused on the session alone."),
        participant: c(403, "A plain member is outside the roster's tier: refused on the session alone."),
      },
    },
  },
  "/api/courses/runs/[runId]/guide/[doc]": {
    GET: adminAlone("Copying a programme's Start here or Glossary out", c(400, "An admin meets the page check: the battery names no page.")),
    POST: adminAlone("Reading a pasted Start here or Glossary", c(400, "An admin meets the page check: the battery names no page.")),
    PUT: adminAlone("Saving a pasted Start here or Glossary", c(400, "An admin meets the page check: the battery names no page.")),
  },
  "/api/courses/runs/[runId]/fill-in-boxes": {
    GET: {
      realDrive: {
        query: "?uid={uid}&week=1",
        why: "Whose boxes and which week are asked in the query, which an empty one fails for everybody: the participant's week 1 reaches the gate.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin, the programme's lead, nor a live facilitator of the participant's group: refused before a box is read."),
        admin: c(200, "An admin reads anybody's boxes."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names the run: reads anybody's boxes on it."),
        facilitator: c(403, "Facilitates the run's other group, not the participant's: another group's boxes are not theirs."),
        participant: c(403, "The writer reads their own on their week page, never through this gate."),
      },
    },
  },
  "/api/courses/runs/[runId]/fill-in-boxes/[boxId]": {
    PUT: seatWrite("writing in a box", { weekId: "w01", text: "Written by the persona battery." }),
  },
  "/api/courses/runs/[runId]/material-notes": {
    POST: {
      realDrive: { body: { itemId: "e2e-battery-item", weekNumber: 1, note: "Written by the persona battery." }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither staffs the run (an admin, its track leads, its run facilitators, the programme's lead) nor facilitates one of its groups: refused before any week is read."),
        admin: c(ACTS, "An admin staffs every run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme that names the run, which staffs it, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(ACTS, "Facilitates one of the run's groups, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(403, "Holding a place is not staffing the run or facilitating a group: a note on a material is refused before any week is read."),
      },
    },
  },
  "/api/courses/runs/[runId]/my-exercises": {
    GET: {
      realDrive: { query: "?week=1", why: "A week is required in the query, which an empty one fails for everybody: week 1 reaches the gate." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "No told place on the run, and week 1's door before groups go out is shut: refused."),
        admin: c(200, "An admin is answered their own (empty) answers."),
      },
      theirs: {
        lead: c(403, "The lead holds no place on the run, and groups have gone out: refused."),
        facilitator: c(200, "Holds a told place: their own answers to week 1."),
        participant: c(200, "Holds a told place: their own answers to week 1."),
      },
    },
  },
  "/api/courses/runs/[runId]/normalise-weeks": {
    POST: courseApprovers("Normalising a run's week ids", c(409, "An approver is told week ids move only while a run is a draft, and this one is running: nothing is written.")),
  },
  "/api/courses/runs/[runId]/overview": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "No told place and no group facilitated on the run, and week 1's door is shut: refused."),
        admin: c(200, "An admin is answered the run's overview."),
      },
      theirs: {
        lead: c(403, "A programme's lead holds no place on the run: the overview is its people's, its facilitators' and an admin's."),
        facilitator: c(200, "Holds a told place and facilitates a group: the run's overview."),
        participant: c(200, "Holds a told place: the run's overview."),
      },
    },
  },
  "/api/courses/runs/[runId]/pitching": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "No live seat in one of the run's groups: pitching week is for the people in the programme's groups."),
      },
      theirs: {
        lead: c(403, "The lead holds no seat in the run's groups."),
        facilitator: c(404, "Holds a seat in a group, so the seat check passes, and the run has no pitching week."),
        participant: c(404, "Holds a seat in a group, so the seat check passes, and the run has no pitching week."),
      },
    },
  },
  "/api/courses/runs/[runId]/pitching/picks": {
    POST: bodyFirst("Then the caller's own seat."),
  },
  "/api/courses/runs/[runId]/pitching/pitch": {
    POST: bodyFirst("Then the caller's own seat."),
  },
  "/api/courses/runs/[runId]/team/check-in": {
    POST: bodyFirst("Then whether the caller is in a team they have been told about."),
  },
  "/api/courses/runs/[runId]/team/hand-in": {
    POST: bodyFirst("Then whether the caller is in a team they have been told about."),
  },
  "/api/courses/runs/[runId]/team/links": {
    POST: bodyFirst("Then whether the caller is in a team they have been told about."),
  },
  "/api/courses/runs/[runId]/team/links/[linkId]": {
    DELETE: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "In no team on this run: refused before any link is read."),
      },
      theirs: {
        lead: c(403, "In no team on the run."),
        facilitator: c(403, "Holds a seat, but a fellowship has no teams: refused before any link is read."),
        participant: c(403, "Holds a seat, but a fellowship has no teams: refused before any link is read."),
      },
    },
  },
  "/api/courses/runs/[runId]/packs-and-cases/[blockId]": {
    PUT: seatWrite("choosing a pack or saying one is ready", { weekId: "w01", ready: true }),
  },
  "/api/courses/runs/[runId]/predictions": {
    PUT: bodyFirst("Then who has a card; the card written is the caller's own."),
    POST: bodyFirst("Then who has a card; the card sealed or opened is the caller's own."),
  },
  "/api/courses/runs/[runId]/predictions/people": {
    GET: adminAlone("Whose predictions cards exist", c(200, "An admin reads whose cards exist on the run, none here.")),
  },
  "/api/courses/runs/[runId]/predictions/people/[uid]": {
    POST: adminAlone(
      "Opening somebody's predictions card",
      c(ACTS, "An admin's opening is recorded before the card is read: it takes no body, so it would act."),
    ),
  },
  "/api/courses/runs/[runId]/reflections": {
    GET: {
      realDrive: {
        query: "?uid={uid}&week=1",
        why: "Whose reflections and which week are asked in the query, which an empty one fails for everybody: the participant's week 1 reaches the gate.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin nor the programme's lead: refused before a row is read."),
        admin: c(200, "An admin reads anybody's reflections."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names the run: reads its people's reflections."),
        facilitator: c(403, "Reflections on this page are the programme's lead's and an admin's: a group's facilitators read theirs on the group's own page."),
        participant: c(403, "Not through this gate, their own included: it is the lead's and an admin's."),
      },
    },
  },
  "/api/courses/runs/[runId]/reflections/[promptId]": {
    PUT: seatWrite("writing a reflection", { weekId: "w01", text: "Written by the persona battery." }),
  },
  "/api/courses/runs/[runId]/retrospective": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither a course author nor anybody staffing the run: refused."),
        admin: c(200, "An admin reads any run's retrospective."),
        draftCourse: c(200, "A course drafter reads any run's retrospective."),
        approveCourse: c(200, "A course approver reads any run's retrospective."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names the run, which staffs it: its retrospective."),
        facilitator: c(403, "Facilitating a group does not staff the run."),
        participant: c(403, "Holding a place does not staff the run."),
      },
    },
  },
  "/api/courses/runs/[runId]/roles": {
    GET: adminAlone("A run's roles", c(200, "An admin reads the run's roles and who may hold them.")),
    POST: adminAlone("Assigning a run's roles", c(400, "An admin's empty body supplies no roles and is refused before anything is written.")),
  },
  "/api/courses/runs/[runId]/status": {
    POST: courseApprovers("Moving a run's status", c(400, "An approver meets the body check: no status.")),
  },
  "/api/courses/runs/[runId]/updates": {
    GET: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Nobody the run's updates are to: not its lead, track leads or admins, a facilitator of a live group, or somebody told their place."),
        admin: c(200, "An admin reads a run's updates."),
      },
      theirs: {
        lead: c(200, "Leads the programme that names the run: its updates are to the lead."),
        facilitator: c(200, "Facilitates a live group and holds a told place: the updates to them."),
        participant: c(200, "Holds a told place: the updates to them."),
      },
    },
    POST: {
      realDrive: {
        body: { to: "everyone", title: "Written by the persona battery", message: "Written by the persona battery.", email: false },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      ...runStaff("An update to everybody on the run", c(ACTS, "Admitted: a whole body is never sent to somebody the gate admits, so it is not sent.")),
    },
  },
  "/api/courses/runs/[runId]/sync-tasks": {
    POST: {
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "No active told place of the caller's on the run: refused, an admin included, since the tasks mirrored are the caller's own."),
      },
      theirs: {
        lead: c(403, "The lead holds no place on the run."),
        facilitator: c(ACTS, "Holds an active told place: it takes no body, so it would mirror the run's weeks into their own tasks."),
        participant: c(ACTS, "Holds an active told place: it takes no body, so it would mirror the run's weeks into their own tasks."),
      },
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/blocks": {
    GET: leadOrAdmin("Copying a week out as Markdown", c(404, "Admitted, and week 1 is not written as blocks, so there is nothing to copy.")),
    POST: leadOrAdmin("Reading a pasted week", c(400, "Admitted, then the body is checked: no Markdown.")),
    PUT: leadOrAdmin("Saving a pasted week", c(400, "Admitted, then the body is checked: no Markdown.")),
  },
  "/api/courses/runs/[runId]/ticks/[itemId]": {
    PUT: seatWrite("ticking a week's item", { weekId: "w01", completed: false }),
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/submit": {
    POST: seatWrite("submitting their own week", { submit: true }),
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/reopen": {
    POST: bodyFirst("Then the one gate on whose work it is, asked before anything of theirs is read."),
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/ready": {
    PUT: {
      realDrive: {
        body: { ready: true },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Not the lead of the programme that names the run, so refused from the forms before anything of the run is read: mark week 1 ready is the lead's and an admin's."),
        admin: c(ACTS, "An admin is admitted, and the body is a whole one: it would mark week 1 ready, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme that names the run, so admitted, and the body is a whole one: it would mark week 1 ready, so it is not sent."),
        facilitator: c(403, "Facilitating a group is not leading the programme: refused before anything of the run is read."),
        participant: c(403, "Holding a place is not leading the programme: refused before anything of the run is read."),
      },
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/owner": {
    PUT: {
      realDrive: {
        body: { ownerUid: null },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Not the lead of the programme that names the run, so refused from the forms before anything of the run is read: give week 1 back to the lead is the lead's and an admin's."),
        admin: c(ACTS, "An admin is admitted, and the body is a whole one: it would give week 1 back to the lead, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme that names the run, so admitted, and the body is a whole one: it would give week 1 back to the lead, so it is not sent."),
        facilitator: c(403, "Facilitating a group is not leading the programme: refused before anything of the run is read."),
        participant: c(403, "Holding a place is not leading the programme: refused before anything of the run is read."),
      },
    },
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/mode": {
    PUT: {
      realDrive: {
        body: { online: false },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Not the lead of the programme that names the run, so refused from the forms before anything of the run is read: say week 1 meets in person is the lead's and an admin's."),
        admin: c(ACTS, "An admin is admitted, and the body is a whole one: it would say week 1 meets in person, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme that names the run, so admitted, and the body is a whole one: it would say week 1 meets in person, so it is not sent."),
        facilitator: c(403, "Facilitating a group is not leading the programme: refused before anything of the run is read."),
        participant: c(403, "Holding a place is not leading the programme: refused before anything of the run is read."),
      },
    },
  },
  "/api/courses/runs/[runId]/written-answers/[answerId]": {
    PUT: seatWrite("writing a written answer", { weekId: "w01", text: "Written by the persona battery." }),
  },
  "/api/courses/runs/[runId]/feedback": {
    POST: bodyFirst("Then the one gate on whose work it is, asked before anything of theirs is read."),
    PATCH: bodyFirst("Then the piece, and the one gate on whose work it is about, every refusal before the gate the same 404."),
    DELETE: bodyFirst("Then the piece, and the one gate on whose work it is about, every refusal before the gate the same 404."),
  },
  "/api/courses/runs/[runId]/feedback/send": {
    POST: adminAlone("Sending the feedback emails", c(400, "Admitted on the session, then the body is checked: an empty one names no feedback and no numbers, so nothing is read or sent.")),
  },
  "/api/courses/runs/[runId]/feedback/send/test": {
    POST: adminAlone(
      "A test of the feedback emails",
      c(409, "Admitted on the session; nobody's feedback on the run is waiting for its email, so there is no email to test and nothing is sent."),
    ),
  },
  "/api/courses/runs/[runId]/work-ratings": {
    PUT: {
      realDrive: {
        body: { uid: "e2e-battery-person", weekId: "w01", itemId: "e2e-battery-answer", rating: 8, comment: "Written by the persona battery." },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin nor the lead of the programme naming the run: refused before the person's place, or anything of theirs, is read."),
        admin: c(ACTS, "An admin rates on any run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme naming the run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(403, "Facilitating one of the run's groups gives no say in ratings for the team: refused before anything of the person's is read."),
        participant: c(403, "Holding a place gives no say in ratings for the team: refused before anything of the person's is read."),
      },
    },
    DELETE: {
      realDrive: {
        body: { uid: "e2e-battery-person", weekId: "w01" },
        why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it.",
      },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(403, "Neither an admin nor the lead of the programme naming the run: refused before the person's place, or anything of theirs, is read."),
        admin: c(ACTS, "An admin clears their own rating on any run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
      theirs: {
        lead: c(ACTS, "Leads the programme naming the run, so admitted: a whole body is never sent to somebody the gate admits, so it is not sent."),
        facilitator: c(403, "Facilitating one of the run's groups gives no say in ratings for the team: refused before anything of the person's is read."),
        participant: c(403, "Holding a place gives no say in ratings for the team: refused before anything of the person's is read."),
      },
    },
  },

  // ---- A programme's survey ---------------------------------------------------
  "/api/surveys/[surveyId]/answer": {
    POST: {
      realDrive: { body: { answers: {} }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "The survey was not sent to the caller, an admin included: answered as one that is not theirs, before anything is kept."),
      },
      theirs: {
        lead: c(404, "The survey went to the people holding a place, not to the programme's lead: answered as one that is not theirs."),
        facilitator: c(ACTS, "The survey was sent to them, so answering it is theirs: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(ACTS, "The survey was sent to them, so answering it is theirs: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
    },
  },
  "/api/surveys/[surveyId]/close": {
    POST: adminAlone("Closing a survey early", c(ACTS, "An admin's press closes the open survey: it takes no body, so it would act.")),
  },
  "/api/surveys/[surveyId]/open": {
    POST: adminAlone("Opening a leaving survey", c(409, "An admin is told this survey is not a leaving survey: nothing is written.")),
  },
  "/api/surveys/[surveyId]/consent": {
    POST: {
      realDrive: { body: { purpose: "followUps", given: false }, why: "An empty body is the same 400 for everybody before the gate; a whole one reaches it, and only the refused are sent it." },
      another: {
        anonymous: c(401, NO_SESSION),
        "*": c(404, "The survey was not sent to the caller, an admin included: answered as one that is not theirs, before anything changes."),
      },
      theirs: {
        lead: c(404, "The survey went to the people holding a place, not to the programme's lead: answered as one that is not theirs."),
        facilitator: c(ACTS, "The survey was sent to them, so its consent is theirs to change: a whole body is never sent to somebody the gate admits, so it is not sent."),
        participant: c(ACTS, "The survey was sent to them, so its consent is theirs to change: a whole body is never sent to somebody the gate admits, so it is not sent."),
      },
    },
  },
  "/api/surveys/[surveyId]/export": {
    POST: adminAlone(
      "The spreadsheet of a survey's answers",
      c(ACTS, "An admin is handed the file after its export-log row is written: it takes no body, so it would act."),
    ),
  },
  "/api/surveys/[surveyId]/open-at-event": {
    POST: adminAlone("Opening a survey at an event", c(409, "An admin is told a programme's survey is not an event's: nothing is written.")),
  },
  "/api/surveys/[surveyId]/questions": {
    POST: adminAlone("Changing a survey's words and questions", c(409, "An admin is told the survey has been sent, so its words are fixed: nothing is written.")),
  },
  "/api/surveys/[surveyId]/remind": {
    POST: adminAlone("Reminding by hand", c(400, "An admin meets the body check: no number of emails.")),
  },
  "/api/surveys/[surveyId]/send": {
    POST: adminAlone("Sending a survey", c(400, "An admin meets the body check: no audience and no number.")),
  },
  "/api/surveys/[surveyId]/test": {
    POST: adminAlone("A survey's test email", c(400, "An admin meets the body check: no email named.")),
  },
  "/api/courses/[courseId]/facilitator-guide/printables/pdf": {
    GET: {
      another: {
        anonymous: c(307, "No session: sent to sign in, and back to the printables page after, whatever the course."),
        "*": c(200, "Neither facilitates a live group on a run of the course nor leads a programme naming one: the guide's one calm sentence, as text, and no PDF."),
        admin: c(404, "An admin is admitted, and this course's printables are not loaded: the sentence that says so, and no PDF."),
      },
      theirs: {
        lead: c(404, "Leads the programme naming a running run of the course, so admitted, and its printables are not loaded: the sentence that says so."),
        facilitator: c(404, "Facilitates a live group on a run of the course, so admitted, and its printables are not loaded: the sentence that says so."),
        participant: c(200, "Holding a place does not open the facilitator guide: the calm sentence, as text, and no PDF."),
      },
    },
  },
  "/api/surveys/[surveyId]/people/[who]/blanks": {
    POST: adminAlone("Sending one person the questions they left blank", c(400, "An admin meets the body check: no number of questions.")),
  },
  "/api/surveys/[surveyId]/blanks": {
    POST: bodyFirst("Then the caller's own row on the survey, and the link of blanks an admin's press made on it."),
  },
  "/api/surveys/[surveyId]/people/[who]": {
    POST: adminAlone(
      "Opening one person's answers",
      c(ACTS, "An admin's opening is recorded before anything of the person is read: it takes no body, so it would act."),
    ),
  },

  // ---- An event's sign-ups: the event world ------------------------------------
  // THEIRS' event was written by `eventAuthor` (a member holding draftEvent)
  // and is helped by `eventCollaborator` (committee the SU does not
  // recognise); ANOTHER's by two accounts that are none of the personas. Each
  // has one request waiting for a decision, which `[rsvpId]` names.
  "/api/events/[id]/signups": {
    GET: {
      world: "event",
      another: {
        anonymous: c(401, NO_SESSION),
        pending: c(403, "Not an approved account, so nobody it could organise: refused before anything is read."),
        rejected: c(403, "Not an approved account, so nobody it could organise: refused before anything is read."),
        "*": c(403, "Organises nothing here and the SU does not recognise them: refused once the event is read, before any request is."),
        suCommittee: c(200, "SU-recognised committee see who has asked, with each address and every answer; deciding is the organisers' and approvers'."),
        admin: c(200, "An admin sees who has asked and decides, whatever the event."),
      },
      theirs: {
        eventAuthor: c(200, "Wrote the event and holds draftEvent: sees its requests, without addresses or dietary and accessibility answers, and decides them."),
        eventCollaborator: c(200, "Helps run the event: sees its requests, without addresses or dietary and accessibility answers, and decides them."),
      },
    },
  },
  "/api/events/[id]/rsvp/[rsvpId]/approve": {
    POST: signupDecision("Approving a request", "approving takes no body"),
  },
  "/api/events/[id]/rsvp/[rsvpId]/deny": {
    POST: signupDecision("Turning a request down", "an empty body is no note, and turning down needs none"),
  },
};

/**
 * Deciding a request for a place (`decidesSignups`): admins and approvers on
 * any event, the author holding draftEvent and the collaborators on their
 * own. Asked inside the transaction once the request and its event are read,
 * so everybody else meets one 403 before anything is written. `body` says why
 * an admitted caller's empty body would act.
 */
function signupDecision(what, body) {
  const acts = (who) => c(ACTS, `${who}, so admitted, and ${body}: it would act.`);
  return {
    world: "event",
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `${what} is for admins, approvers and the event's own author and collaborators: refused before anything is written.`),
      suCommittee: c(403, `SU-recognised committee see the requests and decide none they do not organise: ${what.toLowerCase()} is refused.`),
      admin: acts("An admin decides any request"),
      approveEvent: acts("An approver decides any request"),
    },
    theirs: {
      eventAuthor: acts("The event's author, holding draftEvent, decides its requests"),
      eventCollaborator: acts("A collaborator decides the event's requests"),
    },
  };
}

/** The facilitator guide's writer: an admin, or the lead of a programme naming a live run of the course. */
function guideWriter(what) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `${what} is for an admin and the lead of a programme naming a live run of the course: refused before anything is read.`),
      admin: c(400, "An admin meets the place check: the battery names no document of the guide."),
    },
    theirs: {
      lead: c(400, "Leads the programme that names a running run of the course, so admitted, then meets the place check: the battery names no document."),
      facilitator: c(403, `Facilitating reads the guide but does not load it: ${what} is an admin's and the programme's lead's.`),
      participant: c(403, `${what} is an admin's and the programme's lead's.`),
    },
  };
}

/** One group's week (Q39): an admin and the programme's lead any group, a group's live facilitators their own. */
function groupWeek(what, next) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `${what}: the group is somebody else's, so one 403 for anybody but an admin before anything else is read.`),
      admin: next,
    },
    theirs: {
      lead: next,
      facilitator: next,
      participant: c(403, `${what}: the participant facilitates no group and leads nothing, so one 403.`),
    },
  };
}

/** The lead of the programme that names the run, and admins, decided from the forms before anything of the run is read. */
function leadOrAdmin(what, next) {
  return {
    another: {
      anonymous: c(401, NO_SESSION),
      "*": c(403, `${what} is for the lead of the programme that names the run and admins, decided from the forms: refused before anything of the run is read.`),
      admin: next,
    },
    theirs: {
      lead: next,
      facilitator: c(403, `Facilitating a group is not leading the programme: ${what} is the lead's and an admin's.`),
      participant: c(403, `${what} is the programme's lead's and an admin's.`),
    },
  };
}

export const REAL_PAGES = {
  // ---- The programme's tabs and the pages beside them -------------------------
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/applications": programmePage(
    "the applications that ranked it.",
    ["noProgramme", "notReviewed"],
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/applications/freed-places": programmePage(
    "the freed places, with the lead told the offer is an admin's.",
    ["noProgramme", "notReviewed"],
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/written": programmePage("the review page for its written answers."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/applications/[uid]": {
    another: {
      ...PAGE_BASE,
      "*": c("dashboard", "Not an admin, an approveCourse holder or anybody appointed on a form: the admissions tree sends them to the dashboard."),
      admin: c(200, "An admin reads any application."),
      approveCourse: c("notReviewed", "Admitted by the admissions tree, but holds no role on a programme the applicant ranked: the page's own calm 'not here'."),
      lead: c("notReviewed", "Admitted as an appointed lead, but leads none of the programmes the applicant ranked: the page's own calm 'not here'."),
    },
    theirs: {
      lead: c(200, "Leads the programme the participant ranked: reads their application."),
      facilitator: c("dashboard", "A plain member: the admissions tree sends them to the dashboard."),
      participant: c("dashboard", "A plain member, and the application is their own: the admissions tree still sends them to the dashboard."),
    },
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections": programmePage("its groups' reflections, its facilitators' own among them."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week": programmePage("a group's week, who ticked what by name."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework": programmePage("the Coursework tab, everybody's work by week."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]": programmePage("one person's coursework page, or its calm not-here for an id that is nobody's."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups": programmePage("People in groups, the run's allocation board."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/publish": programmePage("Publish's own page."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/sessions": programmePage("the Sessions view."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/circles": programmePage("Circles for an admin; the lead is drawn a note that Circles is an admin's."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/times": programmePage("the Times view."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators": programmePage("the Facilitators view."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people": programmePage("everybody who holds a place, by name, with their replies."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview": programmePage("the Overview of the run it names."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/certificates": programmePage("the preview of its certificates."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance": programmePage("every register of the run."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/pitches": programmePage("the pitches page, which says a fellowship has none."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages": programmePage("Messages."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys": programmePage(
    "the Surveys tab's Overview: totals of the programme's surveys, its check-ins' whole weeks, its reports and who came, never a name.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/before": programmePage(
    "the Surveys tab's Before view: the before survey's row, never a name.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/check-ins": programmePage(
    "the Surveys tab's Check-ins view: each whole week of check-ins with its floors, never a name, and each group's check-in for an admin.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/end": programmePage(
    "the Surveys tab's End view: what changed and the totals and comments of the survey at the end, never a name.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/follow-ups": programmePage(
    "the Surveys tab's Follow-ups view: the follow-ups' rows, never a name.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]": programmePage(
    "the page of one survey: its results when it is one of the programme's surveys, a sentence when it is not.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/reports": programmePage(
    "the session reports of the run it names, with names: none written in the world, so the page says so.",
  ),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/teams": programmePage("the Teams tab, which says teams are an incubator's."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/teams/[teamId]": programmePage("the Teams tab's page, which says teams are an incubator's."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/ratings": programmePage("the ratings given at the programme's end."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks": programmePage("the Weeks tab."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/copy": programmePage("Copy weeks from the course."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]": programmePage("week 1's page, a taught week of the run's plan."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/preview": programmePage("week 1 as a fellow sees it, with nobody's answers."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup": programmePage("the programme's Settings."),
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/anonymous-feedback": programmePage("the answers to its anonymous form."),

  // ---- One run under /learn ---------------------------------------------------
  "/(app)/learn/[runId]": learnPage({
    admin: c(200, "An admin can learn on any run: its home."),
    facilitator: c(200, "Holds a told place and facilitates a group: the run's home."),
    participant: c(200, "Holds a told place: the run's home."),
    refused: "learn",
    why: LEARN_ONLY_WHY,
    leadWhy: LEAD_LEARN_ONLY_WHY,
  }),
  "/(app)/learn/[runId]/admissions": learnPage({
    admin: c(200, "An admin: the run's admissions lane."),
    facilitator: c("learn", "The run layout admits them as a learner, and the admissions lane is for admins, reviewers and track leads: sent to /learn."),
    participant: c("learn", "The admissions lane is for admins, reviewers and track leads: sent to /learn."),
    refused: "learn",
    why: LEARN_ONLY_WHY,
    leadWhy: LEAD_LEARN_ONLY_WHY,
  }),
  "/(app)/learn/[runId]/email": learnPage({
    admin: c(200, "An admin: the run-wide email."),
    facilitator: c("run", "Admitted to the run, but the run-wide email is its staff's (run facilitators, track leads, admins): sent to the run's home."),
    participant: c("run", "Admitted to the run as a learner: the run-wide email is its staff's, so sent to the run's home."),
  }),
  "/(app)/learn/[runId]/glossary": learnPage({
    admin: c(200, "An admin can learn on any run: the Glossary."),
    facilitator: c(200, "Can learn on the run: the Glossary."),
    participant: c(200, "Can learn on the run: the Glossary."),
    refused: "learn",
    why: LEARN_ONLY_WHY,
    leadWhy: LEAD_LEARN_ONLY_WHY,
  }),
  "/(app)/learn/[runId]/group/[groupId]": groupLearnPage("the group's page"),
  "/(app)/learn/[runId]/group/[groupId]/edit": groupLearnPage("the list of the group's weeks to change"),
  "/(app)/learn/[runId]/group/[groupId]/edit/[weekId]": groupLearnPage("changing week 1 for the group"),
  "/(app)/learn/[runId]/group/[groupId]/email": groupLearnPage("emailing the group"),
  "/(app)/learn/[runId]/group/[groupId]/ratings": groupLearnPage("rating the group's people at the end"),
  "/(app)/learn/[runId]/group/[groupId]/register": groupLearnPage("the group's register"),
  "/(app)/learn/[runId]/group/[groupId]/report": learnPage({
    admin: c("run", "An admin writes no report on a group they do not facilitate (each facilitator writes their own, and admins read them on the programme's page): sent to the run's home."),
    facilitator: c(200, "A live facilitator of the group: their own report on the group's latest session, week 3, which is open."),
    participant: c("run", "Admitted to the run, but facilitates no group and this group is not theirs: sent to the run's home instead of a report."),
  }),
  "/(app)/learn/[runId]/group/[groupId]/reflections": groupLearnPage("the group's reflections"),
  "/(app)/learn/[runId]/group/[groupId]/reflections/names": groupLearnPage("the group's reflections read with names"),
  "/(app)/learn/[runId]/group/[groupId]/review": groupLearnPage("the group's exercises to review (week 1 is a plain week, so the page draws)"),
  "/(app)/learn/[runId]/group/[groupId]/sessions": groupLearnPage("the group's sessions"),
  "/(app)/learn/[runId]/group/[groupId]/update": groupLearnPage("an update to the group"),
  "/(app)/learn/[runId]/leave": learnPage({
    admin: c("run", "An admin holds no place to leave: sent to the run's home."),
    facilitator: c("run", "Facilitates a group of the run: the way out is closed until they come off its facilitators, so sent to the run's home."),
    participant: c(200, "Holds an active place, and the way out is open: the page to leave."),
  }),
  "/(app)/learn/[runId]/notes": learnPage({
    admin: c("run", "An admin holds no learner place: sent to the run's home."),
    facilitator: c(200, "Holds a learner place: their own notes."),
    participant: c(200, "Holds a learner place: their own notes."),
  }),
  "/(app)/learn/[runId]/pitching": learnPage({
    admin: c("run", "An admin holds no seat in a group: sent to the run's home."),
    facilitator: c("run", "Holds a seat, but the run has no pitching week: sent to the run's home."),
    participant: c("run", "Holds a seat, but the run has no pitching week: sent to the run's home."),
  }),
  "/(app)/learn/[runId]/team": learnPage({
    admin: c("run", "An admin is in no team: sent to the run's home."),
    facilitator: c("run", "A fellowship has no teams: sent to the run's home."),
    participant: c("run", "A fellowship has no teams: sent to the run's home."),
  }),
  "/(app)/learn/[runId]/team/hand-in": learnPage({
    admin: c("run", "An admin is in no team: sent to the run's home."),
    facilitator: c("run", "A fellowship has no teams: sent to the run's home."),
    participant: c("run", "A fellowship has no teams: sent to the run's home."),
  }),
  "/(app)/learn/[runId]/progress": learnPage({
    admin: c(200, "An admin can learn on any run: its progress."),
    facilitator: c(200, "Can learn on the run: its progress."),
    participant: c(200, "Can learn on the run: its progress."),
    refused: "learn",
    why: LEARN_ONLY_WHY,
    leadWhy: LEAD_LEARN_ONLY_WHY,
  }),
  "/(app)/learn/[runId]/reading": learnPage({
    admin: c("run", "An admin holds no learner place: sent to the run's home."),
    facilitator: c(200, "Holds a learner place: their own reading list."),
    participant: c(200, "Holds a learner place: their own reading list."),
  }),
  "/(app)/learn/[runId]/survey/[surveyId]": learnPage({
    admin: c("surveyNotYours", "The run layout admits an admin, and the survey was not sent to them: the page says so in a sentence."),
    facilitator: c(200, "The survey on this run was sent to them: the answer screen."),
    participant: c(200, "The survey on this run was sent to them: the answer screen."),
    refused: "learn",
    why: "Holds no role on this run, so the run layout sends them to /learn; the page itself never redirects.",
    leadWhy: "The run layout does not admit a programme's lead, so sends them to /learn; the survey was not sent to the lead either.",
  }),
  "/(app)/learn/[runId]/start-here": learnPage({
    admin: c(200, "An admin can learn on any run: Start here."),
    facilitator: c(200, "Can learn on the run: Start here."),
    participant: c(200, "Can learn on the run: Start here."),
    refused: "learn",
    why: LEARN_ONLY_WHY,
    leadWhy: LEAD_LEARN_ONLY_WHY,
  }),
  "/(app)/learn/[runId]/group/[groupId]/written": groupLearnPage("the group's written answers"),
  "/(app)/learn/[runId]/weeks/[n]": learnPage({
    admin: c(200, "An admin can learn on any run: week 1."),
    facilitator: c(200, "Can learn on the run: week 1."),
    participant: c(200, "Can learn on the run: week 1."),
    refused: "learn",
    why: LEARN_ONLY_WHY,
    leadWhy: LEAD_LEARN_ONLY_WHY,
  }),
  "/(app)/learn/[runId]/weeks/[n]/feedback": learnPage({
    admin: c("week", "The old feedback page reads nothing: whoever the run layout admits is sent to the week's page, at its Feedback."),
    facilitator: c("week", "The old feedback page reads nothing: sent to the week's page, at its Feedback, which keeps its own gate."),
    participant: c("week", "The old feedback page reads nothing: sent to the week's page, at its Feedback, which keeps its own gate."),
    refused: ["learn", "week"],
    why:
      "Holds no role on this run, so the run layout sends them to /learn; the old feedback page beside it reads nothing " +
      "and sends everybody on to the week's page, so either is accepted, and the week's page keeps its own gate.",
    leadWhy:
      "The run layout does not admit a programme's lead, so it sends the lead to /learn; the old feedback page beside it " +
      "sends everybody on to the week's page, which refuses the lead in turn, so either is accepted.",
  }),

  // ---- Course-scoped, group-scoped and ask-scoped pages under /learn --------------
  "/(app)/learn/facilitate/[askId]": {
    another: {
      ...PAGE_BASE,
      "*": c("askNotYours", "Not the person asked: one calm sentence in place of the ask, and nothing of it, whoever else asks."),
      admin: c("askNotYours", "An admin is not the person asked either: the ask's page is its own person's, and an admin is given the same sentence."),
    },
    theirs: {
      lead: c("askNotYours", "The lead made the ask, to somebody else: its page is for the person asked, so the lead is given the sentence."),
      facilitator: c("askNotYours", "The ask is to the participant, not to them: the sentence in place of it."),
      participant: c(200, "The ask is to them and still open: its page, with its answer buttons."),
    },
  },
  "/(app)/learn/facilitator-guide/[courseId]": facilitatorGuidePage("the course's facilitator guide"),
  "/(app)/learn/facilitator-guide/[courseId]/[doc]": facilitatorGuidePage("one page of the guide (the battery names none, so the page says there is no such page)"),
  "/(app)/learn/draw/[groupId]": drawPage("the draw"),
  "/(app)/learn/pairs/[groupId]": drawPage("the pairs"),

  // ---- An event's own pages: the event world -------------------------------------
  "/(app)/events/manage/[id]/attendees": {
    world: "event",
    another: {
      ...PAGE_BASE,
      "*": c(["dashboard", "event"], "Not in the events area: the layout sends them to the dashboard, and the page beneath sends them back to the event, so either is accepted."),
      committee: c("event", "In the events area, but organises nothing here and the SU does not recognise them: sent back to the event."),
      draftEvent: c("event", "Holds draftEvent, but did not write this event: sent back to it."),
      approveEvent: c("event", "Approves events, and organises nothing here: sent back to the event, since deciding is the routes' and seeing the requests the organisers'."),
      suCommittee: c(200, "SU-recognised committee: the requests and everybody who signed up."),
      admin: c(200, "An admin: the requests, everybody who signed up, and the way to each person's page."),
    },
    theirs: {
      eventAuthor: c(200, "Wrote the event: its requests, each saying who is asking, with Approve and Turn down."),
      eventCollaborator: c(200, "Helps run the event: its requests, each saying who is asking, with Approve and Turn down, and never everybody who signed up."),
    },
  },
  "/(app)/events/manage/[id]/check-in": eventsAreaTab("the event's Check-in tab, its Sign-ups tab beside it"),
  "/(app)/events/manage/[id]/survey": eventsAreaTab("the event's Survey after tab, its Sign-ups tab beside it"),
};

/** A tab of an event's own page that the whole events area opens: what each draws differs, never whether it opens. */
function eventsAreaTab(what) {
  return {
    world: "event",
    another: {
      ...PAGE_BASE,
      "*": c("dashboard", "Not in the events area: the layout sends them to the dashboard."),
      committee: c(200, `In the events area: ${what}, drawn for somebody who organises nothing here.`),
      suCommittee: c(200, `In the events area: ${what}.`),
      admin: c(200, `An admin: ${what}.`),
      draftEvent: c(200, `In the events area: ${what}, drawn for somebody who organises nothing here.`),
      approveEvent: c(200, `In the events area: ${what}, drawn for somebody who organises nothing here.`),
    },
    theirs: {
      eventAuthor: c(200, `Wrote the event: ${what}.`),
      eventCollaborator: c(200, `Helps run the event: ${what}.`),
    },
  };
}

/**
 * A page for one group under a run: the group's live facilitators and admins.
 * The participant is admitted to the run by the layout and sent to its home by
 * the page, because the group is not theirs.
 */
function groupLearnPage(what) {
  return learnPage({
    admin: c(200, `An admin: ${what}.`),
    facilitator: c(200, `A live facilitator of the group: ${what}.`),
    participant: c("run", `Admitted to the run, but facilitates no group and this group is not theirs: sent to the run's home instead of ${what}.`),
  });
}

/** The facilitator guide's pages: drawn for everybody approved, with the guide's one calm refusal in place of the guide. */
function facilitatorGuidePage(what) {
  const refused = c("guideRefused", `Neither facilitates on a run of the course nor leads a programme naming one: one calm sentence in place of ${what}.`);
  return {
    another: { ...PAGE_BASE, "*": refused, admin: c(200, `An admin: ${what}.`) },
    theirs: {
      lead: c(200, `Leads the programme naming a running run of the course: ${what}.`),
      facilitator: c(200, `Facilitates a live group on a run of the course: ${what}.`),
      participant: c("guideRefused", `Holding a place does not open the facilitator guide: one calm sentence in place of ${what}.`),
    },
  };
}

/** The draw's and the pairs' pages: a static segment under /learn so a programme's lead can open them. */
function drawPage(what) {
  return {
    another: {
      ...PAGE_BASE,
      "*": c("learn", `Not the group's live facilitator, the lead of the programme naming its run, or an admin: sent to /learn instead of ${what}.`),
      admin: c(200, `An admin opens any group's page: ${what}.`),
    },
    theirs: {
      lead: c(200, `Leads the programme naming the group's run: ${what}.`),
      facilitator: c(200, `A live facilitator of the group: ${what}.`),
      participant: c("learn", `In the run's other group, and facilitates none: sent to /learn instead of ${what}.`),
    },
  };
}
