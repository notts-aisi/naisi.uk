/**
 * THE FENCE BETWEEN THE OLDER ROUND CODE AND AN APPLICATION FORM.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * An application form is stored on an admission round, in the same collection
 * and under the same kind of id as the rounds that came before it. So every
 * route, page, job and lookup written for those rounds can be pointed at one.
 * None of that code knows a form's programmes, its question sets, the two
 * copies of an application or decision day, and the rule
 * (`src/lib/admissions/formFence.ts`) is one sentence: A ROUND THAT IS AN
 * APPLICATION FORM IS EDITED, APPLIED TO, REMINDED ABOUT AND DECIDED ONLY BY
 * THE APPLICATION FORM'S OWN CODE.
 *
 * A rule like that is only as good as the last route somebody added, so this
 * file does not test the fence where it happens to be. It walks the tree for
 * everywhere it has to be:
 *
 *  1. EVERY ROUTE, PAGE AND LAYOUT WITH A ROUND ID IN ITS ADDRESS is listed in
 *     `ROUND_SURFACES` as `older` (it refuses a form), `form` (it is the
 *     application form's own) or `both` (it serves both, with the reason),
 *     and what the entry says is then read out of the source: an `older`
 *     handler really calls the fence, after its "not found" answers and before
 *     its first write, send or older-shaped response. Both directions, so a
 *     new route cannot arrive unlisted and an entry cannot outlive its file.
 *  2. EVERYTHING ELSE THAT CAN ADDRESS A ROUND is found by what it names (the
 *     collection, its normaliser, the two helpers that build a reference to a
 *     round) and listed in `ROUND_READERS`: the scheduler jobs, the lookups
 *     behind the course pages and the status pages, the shared loaders, the
 *     cascades. A round id that arrives some other way than an address (in a
 *     query over open rounds, in a request body) is exactly what the first
 *     walk cannot see, so it is enumerated here instead of being skipped.
 *  3. A ROUND MADE FROM ANOTHER ROUND would carry its source's id in a request
 *     body. Nothing copies a round today, and `CLONE_MENTIONS` holds that:
 *     every file that names the field is listed, and the one writer writes
 *     null.
 *
 * Then it executes. Every older handler is called with a stored form and has
 * to answer with the refusal and write nothing; called with a round of the
 * older kind it has to carry on past the fence. The shared loaders, the two
 * lookups and the status list are run against an in-memory store the same way,
 * and the two notices are rendered to the HTML a page would return.
 * (The two scheduler jobs are executed beside their own suites, in
 * `tests/admissions-reminders.test.mjs` and
 * `tests/admissions-stage-release.test.mjs`.)
 *
 * Faked: the session, the Admin SDK handle, `next/server`, the Admin SDK
 * sentinels and every door that sends. Nothing here can reach a Firestore
 * project or put mail on the wire.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";
import { UNREADABLE_EXPORT, exportedHandlers, moduleScope } from "./lib/routeScan.mjs";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const APP = join(SRC, "app");

const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------

/**
 * One file, read three ways.
 *
 *  - `bare`: comments gone and string bodies emptied. Call sites and their
 *    order are read from this, so a sentence that mentions a function is not a
 *    call to it and a brace inside a message cannot end a handler early.
 *  - `kept`: comments gone, strings kept. Import specifiers and the
 *    collection's name are strings, so those are read from this.
 *  - `scope`: what the module imports, and the functions it defines.
 */
const readings = new Map();
function read(file) {
  const cached = readings.get(file);
  if (cached) return cached;
  const raw = readFileSync(file, "utf8");
  const bare = stripSource(raw);
  const kept = stripSource(raw, { keepStrings: true });
  assertReadable(raw, bare, rel(file), assert);
  const reading = { raw, bare, kept, scope: moduleScope(bare, kept) };
  readings.set(file, reading);
  return reading;
}

/**
 * The code of a file with its strings kept, for a scan over the whole of
 * `src`. Not checked for a collapse the way `read` is: a file that is nothing
 * but types or prose reads as empty, and that is the right reading of it.
 */
const keptCode = new Map();
function codeOf(file) {
  let kept = keptCode.get(file);
  if (kept === undefined) {
    kept = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    keptCode.set(file, kept);
  }
  return kept;
}

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

// ---------------------------------------------------------------------------
// The fence, as the source spells it
// ---------------------------------------------------------------------------

const FENCE_MODULE = "@/lib/admissions/formFence";
const NORMALISE_MODULE = "@/lib/applications/normalise";

/** The call an older route makes. See `refuseApplicationForm` in the module. */
const REFUSES = /\brefuseApplicationForm\s*\(/;

/** The question everything else asks of the stored document. */
const ASKS = /\bisApplicationForm\s*\(/;

/**
 * A refusal that is worked out and then RETURNED. A handler that called the
 * helper and dropped what it answered would read as fenced to a check that
 * only looked for the name.
 */
const RETURNS_THE_REFUSAL =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*refuseApplicationForm\s*\([^;]*\)\s*;\s*if\s*\(\s*\1\s*\)\s*return\s+\1\s*;/;

/**
 * Everything an older handler must not reach on a form: a write, a send, a
 * job run, the member record sweep, and a response in the older shape.
 */
const EFFECT = new RegExp(
  [
    String.raw`\.(?:update|set|create|delete|commit)\s*\(`,
    String.raw`\brunTransaction\s*\(`,
    String.raw`\bsendAdmissionEmail\s*\(`,
    String.raw`\bmirrorCourseDecisionToPush\s*\(`,
    String.raw`\brunAdmissionsReminders\s*\(`,
    String.raw`\brunAdmissionsStageRelease\s*\(`,
    String.raw`\bwriteRecordsForRound\s*\(`,
    String.raw`\bserialise[A-Za-z]*\s*\(`,
  ].join("|"),
);

/** `search` that reads as "never" rather than as -1 when there is no match. */
function at(text, pattern) {
  const index = typeof pattern === "string" ? text.indexOf(pattern) : text.search(pattern);
  return index === -1 ? Infinity : index;
}

// ---------------------------------------------------------------------------
// The loaders an older surface may reach a round through
// ---------------------------------------------------------------------------

/**
 * A surface does not have to call the fence itself when the ONLY way it
 * reaches a round is a shared loader that does. Each loader is listed with
 * the module it has to be imported from and what it answers for a form, and
 * section 4 reads each one's body to check it. Section 6 runs them.
 */
const SHARED_LOADERS = {
  loadRound: {
    from: "@/lib/admissions/applyContext",
    file: "src/lib/admissions/applyContext.ts",
    why:
      "the applicant's own routes all load the round here, and for a form it throws the " +
      "applicant's refusal after its two not-found answers",
  },
  loadAppointmentRound: {
    from: "@/lib/admissions/appointmentQueueData",
    file: "src/lib/admissions/appointmentQueueData.ts",
    why:
      "the appointment queue's only way to a round, and it answers null for a form whatever " +
      "kind the document carries",
  },
  loadStatusRowForRound: {
    from: "@/lib/admissions/statusHubData",
    file: "src/lib/admissions/statusHubData.ts",
    why:
      "the status page's only way to a round, and it says when the round is a form so the " +
      "page can stand aside",
  },
};

// ---------------------------------------------------------------------------
// 1. Every route, page and layout with a round id in its address
// ---------------------------------------------------------------------------

/** The older console's routes. Nothing under here is the form's own. */
const OLDER_TREE = "/api/admissions/rounds/";

/** The application form's own routes. Nothing under here is older. */
const FORM_TREE = "/api/admissions/forms/";

/** The application form's own staff pages, beside the older console's. */
const FORM_PAGES = "/(app)/admin/admissions/forms/";

/**
 * What a `form` surface may not reach a round through: the older plumbing.
 * A form's own code reads the round through `src/lib/applications/`, whose
 * loader answers null for a round that is not a form.
 */
const OLDER_PLUMBING = [
  "@/lib/admissions/roundRoutes",
  "@/lib/admissions/applyContext",
  "@/lib/admissions/statusHubData",
  "@/lib/admissions/appointmentQueueData",
];

/**
 * Every `route.ts`, `page.tsx` and `layout.tsx` under `src/app` whose path has
 * a `[roundId]` segment, keyed the way `tests/persona-route-gates.registry.mjs`
 * keys a route or a page (the path under `src/app`, route groups kept, with
 * `/route.ts` or `/page.tsx` removed). A layout keeps its file name, because a
 * layout and a page can share a folder.
 *
 *  - `older`: written for rounds of the older kind, and it refuses a form. A
 *    route says how PER HANDLER (`refuses`: it calls `refuseApplicationForm`
 *    itself; or the name of a shared loader above). `after` names something
 *    in the handler the refusal has to come after, where the route has a
 *    "not found" answer of its own that a stranger must get first. A page
 *    says the same once for the file, with the notice it returns.
 *  - `form`: the application form's own. It reaches a round only through the
 *    form's own code and never reads one with the older plumbing.
 *  - `both`: it serves a form and an older round alike, on purpose. `proof`
 *    is what the file still has to contain for the reason to be about it.
 *
 * A NEW ENTRY IS A DECISION. A route added under the older tree has to say
 * what it does when the round is a form before it can merge, which is the
 * whole point of the list.
 */
const ROUND_SURFACES = {
  "/(app)/admin/admissions/[roundId]": {
    kind: "older",
    page: {
      fence: "asks",
      notice: "ApplicationFormStaffNotice",
      why:
        "the older round editor. For a form it renders the staff notice and, for an admin, the " +
        "danger zone, and nothing else of the editor: every save the editor offers is refused " +
        "for a form, and destroying is the one thing the two kinds share",
    },
  },
  "/(app)/admin/admissions/[roundId]/appointments": {
    kind: "older",
    page: {
      fence: "loadAppointmentRound",
      why:
        "the appointment queue. It reaches a round only through loadAppointmentRound, which " +
        "answers null for a form, so the page answers as it does for a round that is not there " +
        "and the queue's join of every applicant's details is never read for one",
    },
  },
  "/(app)/admin/admissions/forms/[roundId]": {
    kind: "form",
    why:
      "one term's programmes, for anybody with a role on the form. It reaches the round only " +
      "through loadFormForStaff, which starts from the form's own loader and answers null for " +
      "a round that is not a form, and the page then says there is no application form here",
  },
  "/(app)/admin/admissions/forms/[roundId]/form": {
    kind: "form",
    why:
      "the application form's editor, an admin's. The round comes from loadFormForStaff and " +
      "the question sets from the form's own repository, so a round of the older kind renders " +
      "the same 'no application form here' as one that does not exist",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/layout.tsx": {
    kind: "form",
    why:
      "the header and tab strip over one programme's pages. It loads the programme through " +
      "loadProgrammeForStaff, which starts from the form's own loader, so a round of the " +
      "older kind has no programme here to draw",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/setup": {
    kind: "form",
    why:
      "one programme's settings, for its lead and for admins. It loads through loadSetup, " +
      "which starts from the form's own loader and finds nothing for a round that is not a form",
  },
  "/(public)/applications/[roundId]": {
    kind: "older",
    page: {
      fence: "loadStatusRowForRound",
      notice: "ApplicationFormNotice",
      why:
        "reads one application back in the older shape, stage by stage, which an application " +
        "made on a form does not have. For a form it returns the applicant notice after its " +
        "two not-found answers. The form's own status screens are to be served at this " +
        "address, and this entry becomes `both` when they are",
    },
  },
  "/(public)/apply/[roundId]": {
    kind: "both",
    proof: ["await renderApplicationForm({", "if (isApplicationForm(roundSnap.data())) return null;"],
    why:
      "one address for both kinds. A form that is there to be seen is shown by the form's own " +
      "screen, which the page asks for first and returns. Everything after that is the older " +
      "apply flow, which saves and submits through the older apply routes. Its loader still " +
      "stops at a form before it reads stages or anybody's application, so to the older half a " +
      "form is a round that is not there and the older flow is never drawn for one",
  },
  "/api/admissions/forms/[roundId]": {
    kind: "form",
    why:
      "reads and changes the form itself: its name, its dates, the order of its programmes, a " +
      "new programme. The GET loads through loadFormForStaff and the PATCH writes through " +
      "changeForm, whose transaction reads the round and stops unless it is a form",
  },
  "/api/admissions/forms/[roundId]/application": {
    kind: "form",
    why:
      "the applicant's own read and draft save on a form. It reaches the round only through " +
      "loadVisibleForm, which starts from the form's own loader and answers null for a round " +
      "that is not a form, exactly as it does for a form that is still a draft",
  },
  "/api/admissions/forms/[roundId]/application/send": {
    kind: "form",
    why:
      "sends the applicant's stored draft as their application. It loads the round through " +
      "loadVisibleForm, the same way, and writes through sendApplication, which is handed the " +
      "form that loader returned",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]": {
    kind: "form",
    why:
      "reads and changes one programme's settings. It loads through loadSetup and writes " +
      "through changeProgramme, and both stop at a round that is not a form before anything " +
      "is read as a programme",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles": {
    kind: "form",
    why:
      "names a programme's lead and reviewers through setProgrammeRoles, the one writer, " +
      "which asks whether the round is a form before its transaction and again inside it",
  },
  "/api/admissions/forms/[roundId]/sets": {
    kind: "form",
    why:
      "lists the form's question sets for the editor and adds one. It loads through loadEditor " +
      "and writes through createSet, whose transaction stops unless the round is a form",
  },
  "/api/admissions/forms/[roundId]/sets/[setId]": {
    kind: "form",
    why:
      "edits and deletes one question set through changeSet and deleteSet. Each reads the " +
      "round inside its transaction and stops unless it is a form, so a question set is never " +
      "written under a round of the older kind",
  },
  "/api/admissions/rounds/[roundId]": {
    kind: "older",
    handlers: {
      GET: {
        fence: "refuses",
        after: "canSeeRound(",
        why:
          "serves the round and its stages in the older shape to the older editor. Refused " +
          "after the answer for a round the caller may not see, so only somebody who can see " +
          "the round is told it is a form",
      },
      PATCH: {
        fence: "refuses",
        why:
          "edits a round's own fields, and on a form several of those are the form's to keep: " +
          "its dates, its availability grid, its reminder schedule",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/apply": {
    kind: "older",
    handlers: {
      GET: {
        fence: "loadRound",
        why: "reads the caller's own application back in the older shape, stage by stage",
      },
      POST: {
        fence: "loadRound",
        why:
          "starts an application in the older shape and moves the round's draft counter: on a " +
          "form that would be a second kind of row beside the form's own, counted on the form " +
          "and read by nobody",
      },
      PATCH: {
        fence: "loadRound",
        why: "saves answers keyed by stage onto the caller's application, and a form has no stages",
      },
      DELETE: {
        fence: "loadRound",
        why: "withdraws through the older counters. Withdrawing from a form is the form's own route",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/apply/stage/[stageId]": {
    kind: "older",
    handlers: {
      POST: {
        fence: "loadRound",
        why: "files and freezes the answers to one later stage, and a form has no stages",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/apply/submit": {
    kind: "older",
    handlers: {
      POST: {
        fence: "loadRound",
        why:
          "submits in the older shape: it freezes stages, moves two counters and emails the " +
          "older flow's receipt",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/decide": {
    kind: "older",
    handlers: {
      POST: {
        fence: "refuses",
        why:
          "decides one application on an appointment round: it moves the round's counters, " +
          "writes a run's facilitator list and emails the applicant. A form is decided programme " +
          "by programme in its own documents, and nobody on one hears before decision day",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/destroy": {
    kind: "both",
    proof: ["destroyRoundCascade("],
    why:
      "destroying is the one older action a form shares. The cascade takes a form's question " +
      "sets, its decision documents and the log lines about its decisions with the round, and " +
      "writes the member records first (src/lib/admissions/destroy.ts)",
  },
  "/api/admissions/rounds/[roundId]/destroy-manifest": {
    kind: "both",
    proof: ["countRoundDestroyTargets("],
    why:
      "the live counts behind the destroy dialog, which include a form's question sets and " +
      "decisions. It has to answer for a form or a form could not be destroyed",
  },
  "/api/admissions/rounds/[roundId]/reminders/send-now": {
    kind: "older",
    handlers: {
      POST: {
        fence: "refuses",
        why:
          "runs the deadline reminders for one round by hand, which sends everybody holding a " +
          "draft the older apply flow's reminder",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/roles": {
    kind: "older",
    handlers: {
      PUT: {
        fence: "refuses",
        why:
          "writes the round's reviewer list from the request. On a form that list is the union " +
          "of every programme's lead and reviewers, kept by the one writer in " +
          "src/lib/applications/roles.ts, and a list saved here would replace it",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/stages": {
    kind: "older",
    handlers: {
      GET: {
        fence: "refuses",
        after: "round.archived",
        why:
          "the applicant's read of a round's stages, and a form has none. Refused in the " +
          "applicant's words, after both not-found answers, so a form nobody has opened reads " +
          "as a round that is not there",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/stages/[stageId]": {
    kind: "older",
    handlers: {
      PUT: {
        fence: "refuses",
        why:
          "writes a stage document and the round's stage list. A form asks its questions " +
          "through question sets and has no stages",
      },
      DELETE: {
        fence: "refuses",
        why: "deletes a stage document and rewrites the round's stage list",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/stages/[stageId]/release": {
    kind: "older",
    handlers: {
      POST: {
        fence: "refuses",
        why:
          "stamps a stage as released and runs the stage release job, which emails and pushes " +
          "to everybody live on the round",
      },
    },
  },
  "/api/admissions/rounds/[roundId]/status": {
    kind: "older",
    handlers: {
      POST: {
        fence: "refuses",
        why:
          "moves a round along the older lifecycle by the older readiness check, which counts " +
          "stages a form does not have. A form is opened and closed by the form's own routes",
      },
    },
  },
};

const SURFACE_FILES = { "route.ts": "route", "page.tsx": "page", "layout.tsx": "layout" };

function roundSurfaces() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name in SURFACE_FILES) found.push(path);
    }
  };
  walk(APP);
  return found
    .filter((file) => relative(APP, file).split(/[\\/]/).includes("[roundId]"))
    .map((file) => ({ file, key: keyOf(file), type: SURFACE_FILES[file.split(/[\\/]/).pop()] }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function keyOf(file) {
  const path = `/${relative(APP, file).split("\\").join("/")}`;
  return path.replace(/\/(?:route\.ts|page\.tsx)$/, "");
}

/** Does this file import `name` from `from`? */
function importsFrom(scope, name, from) {
  return scope.imports.get(name) === from;
}

/** The contract module that defines the question, as a path in the repository. */
const NORMALISE_FILE = "src/lib/applications/normalise";

/**
 * Does the file at `path` import the contract's own `isApplicationForm`? By
 * the alias, or by a relative path that RESOLVES to the contract's module
 * from where the file sits: `./normalise` beside it, `../normalise` from a
 * folder under it. A relative path is resolved and not matched by its
 * spelling, so a `./normalise` in some other folder is not the contract's.
 */
function importsTheQuestion(path, scope) {
  const from = scope.imports.get("isApplicationForm");
  if (from === NORMALISE_MODULE) return true;
  if (typeof from !== "string" || !from.startsWith(".")) return false;
  return rel(join(dirname(path), from)) === NORMALISE_FILE;
}

/**
 * What is wrong with one `older` route handler, as sentences. Empty means the
 * handler is fenced the way its entry says. Pure, so section 5 can hand it
 * handlers written to be wrong.
 */
function handlerProblems(body, entry, scope) {
  const problems = [];
  const firstEffect = at(body, EFFECT);

  if (entry.fence === "refuses") {
    if (!importsFrom(scope, "refuseApplicationForm", FENCE_MODULE)) {
      problems.push(`does not import refuseApplicationForm from ${FENCE_MODULE}`);
    }
    const fenceAt = at(body, REFUSES);
    if (fenceAt === Infinity) {
      problems.push("never calls refuseApplicationForm");
      return problems;
    }
    if (!RETURNS_THE_REFUSAL.test(body)) {
      problems.push("calls refuseApplicationForm and does not return what it answers");
    }
    if (at(body, /\.exists\b/) > fenceAt) {
      problems.push("asks before it has loaded the round, so its own not-found answer comes second");
    }
    if (entry.after) {
      if (at(body, entry.after) > fenceAt) {
        problems.push(`refuses before \`${entry.after}\`, which its entry says has to come first`);
      }
    } else if (at(body, /\bnormalizeAdmissionRound\s*\(/) < fenceAt) {
      problems.push("reads the form as a round of the older kind before it refuses");
    }
    if (firstEffect < fenceAt) {
      problems.push("writes, sends or serves the older shape before it refuses");
    }
    return problems;
  }

  const loader = SHARED_LOADERS[entry.fence];
  if (!loader) {
    problems.push(`names a fence, \`${entry.fence}\`, that is neither \`refuses\` nor a shared loader`);
    return problems;
  }
  if (!importsFrom(scope, entry.fence, loader.from)) {
    problems.push(`does not import ${entry.fence} from ${loader.from}`);
  }
  const loadAt = at(body, new RegExp(String.raw`\b${entry.fence}\s*\(`));
  if (loadAt === Infinity) {
    problems.push(`never calls ${entry.fence}`);
    return problems;
  }
  if (firstEffect < loadAt) {
    problems.push(`writes, sends or serves the older shape before it calls ${entry.fence}`);
  }
  if (entry.fence === "loadRound" && !/instanceof\s+ApplyError\s*\)\s*return\s+[\w$]+\.toResponse\s*\(\s*\)/.test(body)) {
    // The loader refuses by throwing. A handler that did not turn that into a
    // response would answer a form with a 500 instead of the sentence.
    problems.push("does not turn the loader's refusal into a response");
  }
  return problems;
}

/** What is wrong with one `older` page, as sentences. */
function pageProblems(reading, entry) {
  const { bare, scope } = reading;
  const problems = [];
  if (entry.fence === "asks") {
    if (!importsFrom(scope, "isApplicationForm", NORMALISE_MODULE)) {
      problems.push(`does not import isApplicationForm from ${NORMALISE_MODULE}`);
    }
    if (!ASKS.test(bare)) problems.push("never asks isApplicationForm");
  } else {
    const loader = SHARED_LOADERS[entry.fence];
    if (!loader) {
      problems.push(`names a fence, \`${entry.fence}\`, that is neither \`asks\` nor a shared loader`);
      return problems;
    }
    if (!importsFrom(scope, entry.fence, loader.from)) {
      problems.push(`does not import ${entry.fence} from ${loader.from}`);
    }
    if (!new RegExp(String.raw`\b${entry.fence}\s*\(`).test(bare)) {
      problems.push(`never calls ${entry.fence}`);
    }
    // No other way to a round may sit beside the loader.
    if (/\bnormalizeAdmissionRound\s*\(/.test(bare)) {
      problems.push("also reads a round by itself, beside the loader");
    }
  }
  if (entry.notice) {
    if (!importsFrom(scope, entry.notice, `@/features/admissions/${entry.notice}`)) {
      problems.push(`does not import ${entry.notice}`);
    }
    if (!new RegExp(String.raw`return\s*\(?\s*<${entry.notice}\b`).test(bare)) {
      problems.push(`never returns <${entry.notice}>`);
    }
  }
  return problems;
}

/** What is wrong with one `form` surface, as sentences. */
function formProblems(reading) {
  const { bare, kept, scope } = reading;
  const problems = [];
  if (/\bnormalizeAdmissionRound\s*\(/.test(bare)) {
    problems.push("reads a round with the older normaliser");
  }
  if (/\bROUNDS_COLLECTION\b|["'`]admissionRounds["'`]/.test(kept)) {
    problems.push("names the rounds collection itself, instead of loading the form through the form's own code");
  }
  for (const [name, from] of scope.imports) {
    if (OLDER_PLUMBING.includes(from)) problems.push(`imports ${name} from ${from}, the older plumbing`);
  }
  if (REFUSES.test(bare)) problems.push("calls the fence, which refuses the very forms it is for");
  const ownCode = [...scope.imports.values()].some(
    (from) => from.startsWith("@/lib/applications/") || from.startsWith("@/features/applications/"),
  );
  if (!ownCode) problems.push("imports nothing from the application form's own code");
  return problems;
}

describe("every route, page and layout with a round id in its address", () => {
  const surfaces = roundSurfaces();

  test("the walk finds them", () => {
    assert.ok(
      surfaces.length >= 28,
      `only ${surfaces.length} files with a [roundId] segment were found: the trees have moved`,
    );
  });

  test("each one is listed, and every entry is a file that is still there", () => {
    const found = surfaces.map((surface) => surface.key);
    assert.deepEqual(
      found.filter((key) => !(key in ROUND_SURFACES)),
      [],
      "These take a round id and are not in ROUND_SURFACES. Decide what each does when the round " +
        "is an application form: `older` (it refuses one, see src/lib/admissions/formFence.ts), " +
        "`form` (it is the form's own) or `both`, with the reason.",
    );
    assert.deepEqual(
      Object.keys(ROUND_SURFACES).filter((key) => !found.includes(key)),
      [],
      "ROUND_SURFACES lists a route or a page that is gone. Delete the entry.",
    );
  });

  test("every entry says what it is and why", () => {
    for (const [key, entry] of Object.entries(ROUND_SURFACES)) {
      assert.ok(["older", "form", "both"].includes(entry.kind), `${key}: \`${entry.kind}\` is not a kind`);
      // An `older` route answers per handler and an `older` page once.
      // Everything else gives one reason for the file.
      const reasons =
        entry.kind !== "older"
          ? [entry.why]
          : entry.page
            ? [entry.page.why]
            : Object.values(entry.handlers ?? {}).map((handler) => handler.why);
      assert.ok(reasons.length > 0, `${key}: says nothing about how it is fenced`);
      for (const why of reasons) {
        assert.ok(typeof why === "string" && why.length >= 40, `${key}: a reason is missing or too short to be one`);
      }
    }
  });

  test("the older tree holds nothing of the form's, and the form's tree nothing older", () => {
    for (const { key } of surfaces) {
      const kind = ROUND_SURFACES[key]?.kind;
      if (key.startsWith(OLDER_TREE) || `${key}/`.startsWith(OLDER_TREE)) {
        assert.notEqual(kind, "form", `${key} is under the older console's routes and is listed as the form's own`);
      }
      if (key.startsWith(FORM_TREE) || `${key}/`.startsWith(FORM_TREE)) {
        assert.equal(kind, "form", `${key} is under the application form's own routes and is not listed as \`form\``);
      }
      if (key.startsWith(FORM_PAGES)) {
        assert.equal(kind, "form", `${key} is under the application form's own pages and is not listed as \`form\``);
      }
    }
  });

  for (const { file, key, type } of surfaces) {
    const entry = ROUND_SURFACES[key];
    if (!entry) continue;

    if (entry.kind === "older" && type === "route") {
      test(`${key} refuses an application form in every handler`, () => {
        const reading = read(file);
        assert.ok(
          !UNREADABLE_EXPORT.test(reading.bare),
          `${rel(file)} exports a handler in a form this guard cannot read. Use \`export async function\`.`,
        );
        const handlers = exportedHandlers(reading.bare);
        assert.deepEqual(
          handlers.map((handler) => handler.method).sort(),
          Object.keys(entry.handlers ?? {}).sort(),
          `${key}: the handlers in the file and the handlers in its entry are not the same list`,
        );
        for (const handler of handlers) {
          assert.ok(handler.span, `${key} ${handler.method}: the handler's body could not be read`);
          assert.deepEqual(
            handlerProblems(handler.span.text, entry.handlers[handler.method], reading.scope),
            [],
            `${key} ${handler.method} is listed as \`older\` and is not fenced the way its entry says`,
          );
        }
      });
    }

    if (entry.kind === "older" && type !== "route") {
      test(`${key} stands aside for an application form`, () => {
        assert.ok(entry.page, `${key}: a page listed as \`older\` says how under \`page\``);
        assert.deepEqual(
          pageProblems(read(file), entry.page),
          [],
          `${key} is listed as \`older\` and is not fenced the way its entry says`,
        );
      });
    }

    if (entry.kind === "form") {
      test(`${key} reaches a round only through the application form's own code`, () => {
        assert.deepEqual(formProblems(read(file)), [], `${key} is listed as \`form\``);
      });
    }

    if (entry.kind === "both") {
      test(`${key} serves a form and an older round alike`, () => {
        const reading = read(file);
        // A file that called the refusal would turn a form away, which is
        // `older`, whatever its entry said. A `both` PAGE may still ask the
        // question, to choose which of its two halves to draw.
        assert.ok(!REFUSES.test(reading.bare), `${key} is listed as \`both\` and refuses an application form`);
        assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, `${key}: a \`both\` entry names what the file still has to contain`);
        for (const literal of entry.proof) {
          assert.ok(reading.kept.includes(literal), `${key}: its reason is about \`${literal}\`, which the file no longer contains`);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Everything else that can address a round
// ---------------------------------------------------------------------------

/**
 * A file that can ADDRESS a round document: it names the collection, by its
 * string or by the constant that holds it, it calls the older normaliser, or
 * it calls one of the two helpers that build a reference to a round.
 */
const ADDRESSES_A_ROUND =
  /\bROUNDS_COLLECTION\b|["'`]admissionRounds["'`]|\bnormalizeAdmissionRound\s*\(|\bformRef\s*\(|\broundRef\s*\(/;

/**
 * Every file in `src` that can address a round and is NOT one of the routes,
 * pages and layouts walked above, with what it does about an application
 * form.
 *
 *  - `skips`: older code that walks rounds and leaves a form out.
 *  - `refuses`: a shared loader that answers a form with a refusal, or with
 *    nothing.
 *  - `form`: the application form's own code, which asks whether a round IS a
 *    form before it treats it as one.
 *    All three have to call `isApplicationForm`, `asks` times when the file
 *    reads rounds in more than one place.
 *  - `lists`: it lists what it is asked for, forms included, on purpose.
 *  - `both`: it handles both kinds, on purpose.
 *    Both carry `proof`: what the file still has to contain for the reason to
 *    be about it.
 *  - `names`: it defines or passes on the collection's name and reads no
 *    document, which the check holds it to.
 *
 * TWO PAGES LOOK AS IF THEY BELONG HERE AND DO NOT. `/learn/[runId]/admissions`
 * and `/courses/[courseId]/apply` are the per-run course applications, which
 * live in `courseApplications` and are keyed by a run. Neither addresses an
 * admission round, by its address or by anything it names, so neither walk
 * finds them and a form cannot be put in front of either.
 */
const ROUND_READERS = new Map([
  [
    "src/app/api/admissions/rounds/route.ts",
    {
      kind: "lists",
      proof: ["rounds.map(serialiseRound)", "clonedFromRoundId: null"],
      why:
        "the older console's list and its create. The GET lists every round the caller may see, " +
        "forms included, because this list is how the console finds a form at all, and it sends " +
        "each through serialiseRound, which carries what the older normaliser read and nothing " +
        "a form keeps for itself. The POST makes a round of the older kind from a name and " +
        "reads no other round",
    },
  ],
  [
    "src/features/courses/fetchLiveRound.ts",
    {
      kind: "skips",
      asks: 2,
      why:
        "the round a public course page speaks about as that course's own intake. Both fetchers " +
        "drop a form before it can be ranked, so a course page never offers one that way: how " +
        "a course page offers the form is the form's own to decide",
    },
  ],
  [
    "src/lib/admissions/applyContext.ts",
    {
      kind: "refuses",
      asks: 1,
      why: SHARED_LOADERS.loadRound.why,
    },
  ],
  [
    "src/lib/admissions/appointmentQueueData.ts",
    {
      kind: "refuses",
      asks: 1,
      why: SHARED_LOADERS.loadAppointmentRound.why,
    },
  ],
  [
    "src/lib/admissions/destroy.ts",
    {
      kind: "both",
      proof: ["QUESTION_SETS_SUBCOLLECTION", "DECISIONS_COLLECTION"],
      why:
        "the round destroy. It drains by the round's id whatever kind the round is, and it takes " +
        "a form's question sets and decision documents with the rest",
    },
  ],
  [
    "src/lib/admissions/memberRecordSync.ts",
    {
      kind: "both",
      proof: ["normaliseApplication(", "buildFormApplicationRecord("],
      why:
        "writes the record the committee keeps about each application. It decides per " +
        "application which kind it is, and reads the form only when one made on a form turns up",
    },
  ],
  [
    "src/lib/admissions/roundRoutes.ts",
    {
      kind: "names",
      why:
        "passes on the collection's name, decides who may see a round it is handed and builds " +
        "the older wire shapes. It reads no document, so there is nothing here to point at a form",
    },
  ],
  [
    "src/lib/admissions/statusHubData.ts",
    {
      kind: "lists",
      proof: ["isApplicationForm(snap.data())", "applicationForm: true"],
      why:
        "the list of one person's applications. An application made on a form stays in it, " +
        "because a list that said nothing had been applied for would read as the site having " +
        "lost it. It reads no stages for a form, and tells the page that reads one application " +
        "back when the round is a form",
    },
  ],
  [
    "src/lib/applications/applicant/store.ts",
    {
      kind: "form",
      asks: 0,
      proof: ["const form = await loadForm(db, roundId);", "form: ApplicationForm,", "loaded: LoadedForm,"],
      why:
        "what the applicant's two routes and the form's own screen load and write. It reads no " +
        "round itself. Its one way to what a round holds is the form's own loader, which asks " +
        "and answers null for a round that is not a form, and its two writers are handed the " +
        "form that loader returned and touch the round only to move its counters",
    },
  ],
  [
    "src/lib/applications/editor/load.ts",
    {
      kind: "form",
      asks: 1,
      proof: ['.where("formVersion", "==", FORM_VERSION)', "loadForm(db, roundId)"],
      why:
        "the editor's loaders. One form is loaded through the form's own loader, which answers " +
        "null for a round that is not a form. The list of forms asks the database for forms " +
        "only, and asks each stored document the question again before it reads it as one",
    },
  ],
  [
    "src/lib/applications/editor/write.ts",
    {
      kind: "form",
      asks: 1,
      proof: ["formVersion: FORM_VERSION", "await readForm(tx, db, roundId)"],
      why:
        "every write the editor makes. A new form is created as a form. Every other write is a " +
        "transaction that reads the round through one reader, which asks, and stops before it " +
        "writes anything when the round is not a form",
    },
  ],
  [
    "src/lib/applications/normalise.ts",
    {
      kind: "form",
      asks: 0,
      proof: ["export function isApplicationForm("],
      why:
        "defines the question itself, and reads a form by handing the round to the older " +
        "normaliser for the fields a form keeps from a round (the window, the grid, the counters)",
    },
  ],
  [
    "src/lib/applications/repo.ts",
    {
      kind: "form",
      asks: 1,
      why: "the form's own loader, which answers null for a round that is not a form",
    },
  ],
  [
    "src/lib/applications/roles.ts",
    {
      kind: "form",
      asks: 2,
      why:
        "the one writer of a programme's lead and reviewers. It asks before the transaction and " +
        "again inside it, so it never writes a programme onto a round of the older kind",
    },
  ],
  [
    "src/lib/firestore/accountDeletion.ts",
    {
      kind: "both",
      proof: ["clearAdmissionRoundRoles", 'new FieldPath("programmes"'],
      why:
        "takes a deleted account out of every round that names it: the reviewer list and the " +
        "final decider of any round, and the lead and reviewers of each programme on a form",
    },
  ],
  [
    "src/lib/firestore/admissionRounds.ts",
    {
      kind: "names",
      why:
        "defines the collection's name and the older normaliser. It reads no document, so there " +
        "is nothing here to point at a form",
    },
  ],
  [
    "src/lib/scheduler/jobs/admissionsReminders.ts",
    {
      kind: "skips",
      asks: 2,
      why:
        "walks every open round and sends whoever holds a draft the older apply flow's reminder. " +
        "A form is left out of the walk and out of a run named for one round, and counted, so " +
        "nothing older emails an applicant on a form",
    },
  ],
  [
    "src/lib/scheduler/jobs/admissionsStageRelease.ts",
    {
      kind: "skips",
      asks: 2,
      why:
        "walks every open round and tells everybody live on it about a newly released stage, by " +
        "email and by push. A form has no stages. It is left out of the walk and out of a run " +
        "named for one round, and counted",
    },
  ],
]);

const READER_KINDS = ["skips", "refuses", "form", "lists", "both", "names"];

function countOf(text, pattern) {
  return [...text.matchAll(new RegExp(pattern.source, "g"))].length;
}

describe("everything else that can address a round", () => {
  const walked = new Set(roundSurfaces().map((surface) => rel(surface.file)));
  const readers = sourceFiles(SRC)
    .filter((file) => ADDRESSES_A_ROUND.test(codeOf(file)))
    .map(rel)
    .filter((file) => !walked.has(file))
    .sort();

  test("each one is listed, and every entry is a file that still addresses a round", () => {
    assert.ok(readers.length >= 10, `only ${readers.length} such files were found: the scan has stopped reading`);
    assert.deepEqual(
      readers.filter((file) => !ROUND_READERS.has(file)),
      [],
      "These can address a round document and are not in ROUND_READERS. A job, a lookup or a " +
        "loader that reads rounds reads application forms too, so decide what each does about " +
        "one (see src/lib/admissions/formFence.ts) and list it with the reason.",
    );
    assert.deepEqual(
      [...ROUND_READERS.keys()].filter((file) => !readers.includes(file)),
      [],
      "ROUND_READERS lists a file that no longer addresses a round, or that is now one of the " +
        "routes and pages listed in ROUND_SURFACES. Delete the entry.",
    );
  });

  for (const [file, entry] of ROUND_READERS) {
    test(`${file} does what its entry says about an application form`, () => {
      assert.ok(READER_KINDS.includes(entry.kind), `\`${entry.kind}\` is not a kind`);
      assert.ok(typeof entry.why === "string" && entry.why.length >= 40, "a reason is missing or too short to be one");
      const path = join(REPO_ROOT, ...file.split("/"));
      assert.ok(existsSync(path), "the file is gone");
      const { bare, kept, scope } = read(path);

      if (entry.kind === "skips" || entry.kind === "refuses" || entry.kind === "form") {
        assert.ok(Number.isInteger(entry.asks), "says how many times it asks");
        // An entry that asks no times has to name what it does instead, or
        // it would be listed and held to nothing.
        assert.ok(
          entry.asks > 0 || (Array.isArray(entry.proof) && entry.proof.length > 0),
          "asks no times and names nothing the file has to contain",
        );
        // The definition is not a call, so it is not counted: the module
        // that defines the question asks it no times. So does a module that
        // reads no round of its own and is handed a form the form's own loader
        // already asked about. Either way the entry names what the file has to
        // contain instead, which the check above holds it to.
        const definitions = countOf(bare, /\bfunction\s+isApplicationForm\s*\(/);
        assert.equal(
          countOf(bare, ASKS) - definitions,
          entry.asks,
          "It does not ask isApplicationForm the number of times its entry says. A place that " +
            "reads rounds and stopped asking is a place that now treats a form as a round.",
        );
        if (entry.asks > 0 && definitions === 0) {
          assert.ok(
            importsTheQuestion(path, scope),
            "it asks a question of its own instead of the contract's isApplicationForm",
          );
        }
      }
      if (entry.kind === "lists" || entry.kind === "both") {
        assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, "names what the file still has to contain");
      }
      for (const literal of entry.proof ?? []) {
        assert.ok(kept.includes(literal), `its reason is about \`${literal}\`, which the file no longer contains`);
      }
      if (entry.kind === "names") {
        assert.ok(
          !/\.(?:collection|collectionGroup|doc|get|getAll)\s*\(/.test(bare),
          "It is listed as naming the collection without reading it, and it now reads something. " +
            "Decide what that read does about an application form.",
        );
      }
      // Nothing outside the routes refuses with the route helper: a job or a
      // lookup has no response to return it in.
      assert.ok(!REFUSES.test(bare), "calls the route helper outside a route");
    });
  }
});

// ---------------------------------------------------------------------------
// 3. A round made from another round
// ---------------------------------------------------------------------------

/**
 * A round carries `clonedFromRoundId`, and nothing sets it: there is no route
 * that copies one round into another. If one is written, the source round's
 * id will arrive in a request BODY, where neither walk above can see it, and
 * a form must be refused as the source of a round of the older kind (its
 * programmes and question sets have nowhere to go in one).
 *
 * So every file whose code names the field is listed, with what it does with
 * it. A copy route cannot be added without naming it, and when it is, this is
 * where its author reads the rule: load the source, and answer
 * `refuseApplicationForm(source.data())` before copying anything.
 */
const CLONE_MENTIONS = new Map([
  [
    "src/app/api/admissions/rounds/[roundId]/route.ts",
    {
      proof: '"clonedFromRoundId"',
      why: "refuses the field in an edit: it is among the fields a save here may not write",
    },
  ],
  [
    "src/app/api/admissions/rounds/route.ts",
    {
      proof: "clonedFromRoundId: null",
      why: "the one writer, and it writes null: a new round is made from a name, with no source",
    },
  ],
  [
    "src/lib/applications/editor/write.ts",
    {
      proof: "clonedFromRoundId: null",
      why: "makes a new application form from a name and writes null: a form has no source either, and the create reads no round",
    },
  ],
  [
    "src/lib/firestore/admissionRounds.ts",
    {
      proof: "clonedFromRoundId: str(data.clonedFromRoundId) || null",
      why: "the stored shape and the normaliser that reads the field back",
    },
  ],
]);

describe("a round made from another round", () => {
  test("every file that names the source of a copy is listed", () => {
    const mentions = sourceFiles(SRC)
      .filter((file) => /\bclonedFromRoundId\b/.test(codeOf(file)))
      .map(rel)
      .sort();
    assert.deepEqual(
      mentions.filter((file) => !CLONE_MENTIONS.has(file)),
      [],
      "These name clonedFromRoundId and are not in CLONE_MENTIONS. If one of them copies a round, " +
        "it has to refuse an application form as the source (refuseApplicationForm on the source " +
        "document, before anything is copied), and say so in its entry.",
    );
    assert.deepEqual(
      [...CLONE_MENTIONS.keys()].filter((file) => !mentions.includes(file)),
      [],
      "CLONE_MENTIONS lists a file that no longer names the field. Delete the entry.",
    );
    for (const [file, entry] of CLONE_MENTIONS) {
      assert.ok(entry.why.length >= 40, `${file}: a reason is missing or too short to be one`);
      assert.ok(
        read(join(REPO_ROOT, ...file.split("/"))).kept.includes(entry.proof),
        `${file}: its reason is about \`${entry.proof}\`, which the file no longer contains`,
      );
    }
  });

  test("the create reads no round, so it has no source that could be a form", () => {
    const reading = read(join(APP, "api", "admissions", "rounds", "route.ts"));
    const post = exportedHandlers(reading.bare).find((handler) => handler.method === "POST");
    assert.ok(post?.span, "the create handler could not be read");
    assert.ok(
      !/\.get\s*\(|\bgetAll\s*\(|\.where\s*\(/.test(post.span.text),
      "The create now reads a document. If that is the round it copies from, an application " +
        "form has to be refused as the source before anything is copied.",
    );
    assert.equal(
      countOf(reading.kept, /\bclonedFromRoundId\s*:/),
      1,
      "clonedFromRoundId is written in more than one place in the create",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. The shared loaders, read
// ---------------------------------------------------------------------------

describe("the loaders an older surface may reach a round through", () => {
  const bodyOf = (file, name) => {
    const reading = read(join(REPO_ROOT, ...file.split("/")));
    const span = reading.scope.locals.get(name);
    assert.ok(span, `${file} no longer defines ${name}`);
    return span.text;
  };

  test("every one of them is a file that is there, with its reason", () => {
    for (const [name, loader] of Object.entries(SHARED_LOADERS)) {
      assert.ok(existsSync(join(REPO_ROOT, ...loader.file.split("/"))), `${name}: ${loader.file} is gone`);
      assert.ok(loader.why.length >= 40, `${name}: a reason is missing or too short to be one`);
      assert.equal(loader.from, `@/${loader.file.replace(/^src\//, "").replace(/\.ts$/, "")}`);
    }
  });

  test("every one of them is used by something listed, or it is not shared", () => {
    const used = new Set();
    for (const entry of Object.values(ROUND_SURFACES)) {
      if (entry.page) used.add(entry.page.fence);
      for (const handler of Object.values(entry.handlers ?? {})) used.add(handler.fence);
    }
    assert.deepEqual(
      Object.keys(SHARED_LOADERS).filter((name) => !used.has(name)),
      [],
      "SHARED_LOADERS lists a loader no entry in ROUND_SURFACES goes through. Delete it.",
    );
  });

  test("loadRound refuses a form in the applicant's words, after its two not-found answers", () => {
    const body = bodyOf(SHARED_LOADERS.loadRound.file, "loadRound");
    const exists = at(body, /\.exists\b/);
    const hidden = at(body, "round.archived");
    const asks = at(body, ASKS);
    assert.ok(exists < hidden && hidden < asks && asks < Infinity, "the order is: is it there, is it public, is it a form");
    assert.match(
      body.slice(asks),
      /^isApplicationForm\s*\(\s*snap\.data\s*\(\s*\)\s*\)\s*\)\s*\{\s*throw new ApplyError\s*\(\s*MADE_ON_THE_APPLICATION_FORM\s*,\s*APPLICATION_FORM_REFUSAL_STATUS\s*\)/,
      "the refusal is not the fence's own sentence and status",
    );
    assert.ok(asks < at(body, /\breturn\s+round\b/), "the round is handed back before the question is asked");
  });

  test("loadAppointmentRound answers null for a form before it reads it as a round", () => {
    const body = bodyOf(SHARED_LOADERS.loadAppointmentRound.file, "loadAppointmentRound");
    assert.match(body, /if\s*\(\s*!snap\.exists\s*\|\|\s*isApplicationForm\s*\(\s*snap\.data\s*\(\s*\)\s*\)\s*\)\s*return null/);
    assert.ok(at(body, ASKS) < at(body, /\bnormalizeAdmissionRound\s*\(/));
  });

  test("the status loader reads no stages for a form, and says the round is one", () => {
    const bundle = bodyOf(SHARED_LOADERS.loadStatusRowForRound.file, "loadRoundBundle");
    assert.ok(
      at(bundle, ASKS) < at(bundle, "STAGES_SUBCOLLECTION"),
      "the stages are read before the question is asked",
    );
    assert.match(bundle, /if\s*\(\s*isApplicationForm\s*\(\s*snap\.data\s*\(\s*\)\s*\)\s*\)\s*return\s*\{\s*round\s*,\s*stages\s*:\s*\[\s*\]\s*,\s*applicationForm\s*:\s*true\s*\}/);
    const single = bodyOf(SHARED_LOADERS.loadStatusRowForRound.file, "loadStatusRowForRound");
    assert.equal(
      countOf(single, /\breturn\s*\{[^}]*\bapplicationForm\b/),
      2,
      "both answers for a round that exists have to say whether it is a form",
    );
  });

  test("the page that reads one application back acts on that answer before it draws anything older", () => {
    const { bare } = read(join(APP, "(public)", "applications", "[roundId]", "page.tsx"));
    const stands = at(bare, /if\s*\(\s*loaded\.applicationForm\s*\)\s*return\s*<ApplicationFormNotice\b/);
    assert.ok(stands < Infinity, "the page no longer returns the notice for a form");
    assert.ok(at(bare, "loaded.roundMissing") < stands, "a round that is not there has to be answered first");
    assert.ok(at(bare, "!loaded.roundPublic") < stands, "a round that is not public has to be answered first");
    assert.ok(stands < at(bare, "row.stages"), "the older read-back comes before the notice");
  });

  test("the apply page shows a form on the form's own screen, and its older half still stops at one", () => {
    const reading = read(join(APP, "(public)", "apply", "[roundId]", "page.tsx"));
    const body = reading.scope.locals.get("loadRound")?.text;
    assert.ok(body, "the page no longer has a loader of its own");

    // THE OLDER HALF. Its loader asks after the answer a draft or archived
    // round gets, and before it reads anything in the older shape. It answers
    // a form the way it answers a round that is not there.
    const asks = at(body, ASKS);
    assert.ok(at(body, "round.archived") < asks && asks < Infinity, "a draft or archived round has to be answered first");
    assert.match(
      body,
      /if\s*\(\s*isApplicationForm\s*\(\s*roundSnap\.data\s*\(\s*\)\s*\)\s*\)\s*return null\s*;/,
      "the older loader hands a form on instead of stopping at it",
    );
    assert.ok(asks < at(body, "STAGES_SUBCOLLECTION"), "the stages are read before the question is asked");
    assert.ok(asks < at(body, "admissionApplicationId("), "an application is read before the question is asked");

    // THE PAGE. While the form had no screen of its own the page returned the
    // applicant notice for one, after its not-found answer, and this test held
    // that order. The form is shown at this address now, so the order held is
    // the new one: the form's own screen is asked for first and what it
    // answers is returned, the older loader is called only after that, and the
    // older flow is drawn only past that loader's not-found answer. With the
    // loader's null for a form, the older flow can never be drawn for one.
    const { bare } = reading;
    assert.ok(importsFrom(reading.scope, "renderApplicationForm", "@/features/applications/apply/ApplyScreen"));
    const pageAt = at(bare, /export\s+default\s+async\s+function\s+ApplyPage\b/);
    assert.ok(pageAt < Infinity, "the page's own function could not be found");
    const page = bare.slice(pageAt);
    const formAt = at(
      page,
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+renderApplicationForm\s*\(\s*\{[^;]*\}\s*\)\s*;\s*if\s*\(\s*\1\s*\)\s*return\s+\1\s*;/,
    );
    assert.ok(formAt < Infinity, "the page does not return what the form's own screen answers");
    const olderAt = at(page, /\bloadRound\s*\(/);
    const notFoundAt = at(page, /if\s*\(\s*!loaded\s*\)\s*notFound\s*\(\s*\)/);
    assert.ok(formAt < olderAt, "the older loader is called before the form's own screen has been asked for");
    assert.ok(olderAt < notFoundAt && notFoundAt < Infinity, "the older loader's answer is not checked before anything is drawn");
    assert.ok(notFoundAt < at(page, "<ApplyFlow"), "the older flow is drawn before the not-found answer");
    assert.ok(at(page, "<ApplyFlow") < Infinity, "the older flow is gone, so this page is no longer both");
  });

  test("the older round page shows a form only to somebody who may see the round", () => {
    const reading = read(join(APP, "(app)", "admin", "admissions", "[roundId]", "page.tsx"));
    const body = reading.scope.locals.get("applicationFormHere")?.text;
    assert.ok(body, "the page no longer decides for itself what is at this address");
    assert.match(body, /if\s*\(\s*!snap\.exists\s*\|\|\s*!isApplicationForm\s*\(\s*snap\.data\s*\(\s*\)\s*\)\s*\)\s*return null/);
    assert.match(body, /if\s*\(\s*!canSeeRound\s*\(\s*user\s*,\s*round\s*\)\s*\)\s*return null/);
    assert.ok(importsFrom(reading.scope, "canSeeRound", "@/lib/admissions/roundRoutes"));
    const { bare } = reading;
    assert.ok(
      at(bare, /return\s*\(?\s*<ApplicationFormStaffNotice\b/) < at(bare, "<RoundEditor"),
      "the editor is drawn before the notice",
    );
    assert.ok(at(bare, "requireAdmissionsPage(") < at(bare, "applicationFormHere("), "the gate has to run before the round is read");
    // The link to the form's own pages is decided here, with the question
    // those pages ask of a caller, of the stored document, and only once the
    // caller is known to be somebody who may see the round.
    assert.ok(importsFrom(reading.scope, "canSeeForm", "@/lib/applications/access"));
    assert.match(body, /canOpen:\s*canSeeForm\s*\(\s*user\s*,\s*normaliseFormFields\s*\(\s*snap\.data\s*\(\s*\)\s*\)\s*\)/);
    assert.ok(
      at(body, /!canSeeRound\s*\(/) < at(body, /\bcanSeeForm\s*\(/),
      "the page works out who may open the form before it knows the caller may see the round",
    );
    assert.match(bare, /<ApplicationFormStaffNotice\b[^>]*\bcanOpen=\{form\.canOpen\}/);
  });

  test("the staff notice keeps the danger zone, for an admin, and nothing else of the editor", () => {
    const notice = read(join(SRC, "features", "admissions", "ApplicationFormStaffNotice.tsx"));
    assert.ok(!notice.raw.trimStart().startsWith('"use client"'), "the notice has to stay a server component");
    assert.match(notice.bare, /\{\s*isAdmin\s*&&\s*\(\s*<ApplicationFormDangerZone\b/);
    assert.ok(importsFrom(notice.scope, "EDITED_IN_THE_APPLICATION_FORM", FENCE_MODULE));
    for (const older of ["RoundEditor", "StagesSection", "patchRound", "setRoundStatus", "setRoundRoles"]) {
      assert.ok(!new RegExp(String.raw`\b${older}\b`).test(notice.bare), `the notice reaches for ${older}`);
    }
    // The one way on from the notice is the form's own pages, and it is drawn
    // only when the page says this caller is somebody they open for.
    assert.ok(importsFrom(notice.scope, "applicationFormPath", "@/lib/applications/editor/olderRounds"));
    assert.match(notice.bare, /\{\s*canOpen\s*&&\s*\(\s*<p\b[^>]*>\s*<Link href=\{applicationFormPath\(roundId\)\}>/);
    assert.equal(countOf(notice.bare, /<Link\b/), 2, "the notice has grown a link this test does not know about");
    const zone = read(join(SRC, "features", "admissions", "ApplicationFormDangerZone.tsx"));
    assert.match(zone.kept, /kind="admission-round"/);
    assert.ok(importsFrom(zone.scope, "DestroyPanel", "@/features/destroy/DestroyPanel"));
  });

  test("the applicant notice is ordinary HTML with nothing of the form in it", () => {
    const notice = read(join(SRC, "features", "admissions", "ApplicationFormNotice.tsx"));
    assert.ok(!notice.raw.trimStart().startsWith('"use client"'), "the notice has to stay a server component");
    assert.ok(importsFrom(notice.scope, "MADE_ON_THE_APPLICATION_FORM", FENCE_MODULE));
    assert.match(notice.bare, /export default function ApplicationFormNotice\s*\(\s*\)/, "the notice takes no props");
    assert.ok(!/\bnotFound\b|\bredirect\b|\bLink\b|href=/.test(notice.bare), "the notice sends nobody anywhere");
  });
});

// ---------------------------------------------------------------------------
// 5. The scanners, on handlers written to be wrong
// ---------------------------------------------------------------------------

describe("the checks catch what they are for", () => {
  const withFence = { imports: new Map([["refuseApplicationForm", FENCE_MODULE]]), locals: new Map() };
  const REFUSES_ENTRY = { fence: "refuses", why: "" };

  const GOOD = `
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "" }, { status: 404 });
    const fenced = refuseApplicationForm(snap.data());
    if (fenced) return fenced;
    const round = normalizeAdmissionRound(snap.id, snap.data() ?? {});
    await ref.update({ label: "" });
  `;

  test("a handler fenced the way the routes are passes", () => {
    assert.deepEqual(handlerProblems(GOOD, REFUSES_ENTRY, withFence), []);
  });

  test("a handler with the call taken out fails", () => {
    const without = GOOD.replace(/const fenced[^\n]*\n\s*if \(fenced\) return fenced;/, "");
    assert.notEqual(without, GOOD);
    assert.deepEqual(handlerProblems(without, REFUSES_ENTRY, withFence), ["never calls refuseApplicationForm"]);
  });

  test("a handler that works the refusal out and drops it fails", () => {
    const dropped = GOOD.replace("if (fenced) return fenced;", "");
    assert.match(handlerProblems(dropped, REFUSES_ENTRY, withFence).join(" "), /does not return what it answers/);
  });

  test("a handler that writes first fails", () => {
    const late = `
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "" }, { status: 404 });
      await ref.update({ label: "" });
      const fenced = refuseApplicationForm(snap.data());
      if (fenced) return fenced;
    `;
    assert.match(handlerProblems(late, REFUSES_ENTRY, withFence).join(" "), /before it refuses/);
  });

  test("a handler that reads the form as a round first fails, unless its entry names what comes first", () => {
    const normalisedFirst = `
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "" }, { status: 404 });
      const round = normalizeAdmissionRound(snap.id, snap.data() ?? {});
      if (!canSeeRound(user, round)) return NextResponse.json({ error: "" }, { status: 404 });
      const fenced = refuseApplicationForm(snap.data());
      if (fenced) return fenced;
    `;
    assert.match(handlerProblems(normalisedFirst, REFUSES_ENTRY, withFence).join(" "), /before it refuses/);
    assert.deepEqual(
      handlerProblems(normalisedFirst, { fence: "refuses", after: "canSeeRound(", why: "" }, withFence),
      [],
    );
  });

  test("a handler that refuses before the answer its entry puts first fails", () => {
    const early = `
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "" }, { status: 404 });
      const fenced = refuseApplicationForm(snap.data());
      if (fenced) return fenced;
      const round = normalizeAdmissionRound(snap.id, snap.data() ?? {});
      if (!canSeeRound(user, round)) return NextResponse.json({ error: "" }, { status: 404 });
    `;
    assert.match(
      handlerProblems(early, { fence: "refuses", after: "canSeeRound(", why: "" }, withFence).join(" "),
      /has to come first/,
    );
  });

  test("a handler that asks before it has loaded anything fails", () => {
    const blind = `
      const fenced = refuseApplicationForm(body);
      if (fenced) return fenced;
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "" }, { status: 404 });
    `;
    assert.match(handlerProblems(blind, REFUSES_ENTRY, withFence).join(" "), /before it has loaded the round/);
  });

  test("a helper of the same name from somewhere else does not count", () => {
    const elsewhere = { imports: new Map([["refuseApplicationForm", "./mine"]]), locals: new Map() };
    assert.match(handlerProblems(GOOD, REFUSES_ENTRY, elsewhere).join(" "), /does not import refuseApplicationForm/);
  });

  test("a route that goes through the shared loader has to turn its refusal into an answer", () => {
    const withLoader = { imports: new Map([["loadRound", SHARED_LOADERS.loadRound.from]]), locals: new Map() };
    const entry = { fence: "loadRound", why: "" };
    const good = `
      try {
        const round = await loadRound(db, roundId);
        await ref.update({});
      } catch (err) {
        if (err instanceof ApplyError) return err.toResponse();
      }
    `;
    assert.deepEqual(handlerProblems(good, entry, withLoader), []);
    assert.match(
      handlerProblems(good.replace("if (err instanceof ApplyError) return err.toResponse();", ""), entry, withLoader).join(" "),
      /does not turn the loader's refusal into a response/,
    );
    assert.match(
      handlerProblems("await ref.update({}); const round = await loadRound(db, roundId);", entry, withLoader).join(" "),
      /before it calls loadRound/,
    );
    assert.deepEqual(handlerProblems("await ref.update({});", entry, withLoader), ["never calls loadRound"]);
  });

  test("a route listed as the form's own may not read a round the older way", () => {
    const reading = (source) => {
      const bare = stripSource(source);
      const kept = stripSource(source, { keepStrings: true });
      return { bare, kept, scope: moduleScope(bare, kept) };
    };
    const own = `
      import { loadForm } from "@/lib/applications/repo";
      export async function GET() { const form = await loadForm(db, roundId); }
    `;
    assert.deepEqual(formProblems(reading(own)), []);
    const older = `
      import { loadForm } from "@/lib/applications/repo";
      import { ROUNDS_COLLECTION, canSeeRound } from "@/lib/admissions/roundRoutes";
      import { normalizeAdmissionRound } from "@/lib/firestore/admissionRounds";
      export async function GET() {
        const snap = await db.collection(ROUNDS_COLLECTION).doc(roundId).get();
        const round = normalizeAdmissionRound(snap.id, snap.data());
      }
    `;
    const problems = formProblems(reading(older)).join(" | ");
    assert.match(problems, /reads a round with the older normaliser/);
    assert.match(problems, /names the rounds collection itself/);
    assert.match(problems, /the older plumbing/);
    assert.match(
      formProblems(reading(`import { NextResponse } from "next/server";`)).join(" "),
      /imports nothing from the application form's own code/,
    );
  });

  test("the contract's question is told from one of the same name, wherever the file sits", () => {
    const asking = (from) => ({ imports: new Map([["isApplicationForm", from]]), locals: new Map() });
    const inRepo = (file) => join(REPO_ROOT, ...file.split("/"));
    // The contract's own module, reached by the alias, from beside it and
    // from a folder under it.
    assert.ok(importsTheQuestion(inRepo("src/lib/scheduler/jobs/x.ts"), asking(NORMALISE_MODULE)));
    assert.ok(importsTheQuestion(inRepo("src/lib/applications/repo.ts"), asking("./normalise")));
    assert.ok(importsTheQuestion(inRepo("src/lib/applications/editor/write.ts"), asking("../normalise")));
    // The same spelling from somewhere it does not lead to the contract.
    assert.ok(!importsTheQuestion(inRepo("src/lib/admissions/x.ts"), asking("./normalise")));
    assert.ok(!importsTheQuestion(inRepo("src/lib/applications/repo.ts"), asking("../normalise")));
    assert.ok(!importsTheQuestion(inRepo("src/lib/applications/editor/write.ts"), asking("./normalise")));
    assert.ok(!importsTheQuestion(inRepo("src/lib/applications/editor/write.ts"), asking("@/lib/mine/normalise")));
    assert.ok(!importsTheQuestion(inRepo("src/lib/applications/editor/write.ts"), { imports: new Map(), locals: new Map() }));
  });

  test("the scan for what addresses a round reads code and not prose", () => {
    const kept = (source) => stripSource(source, { keepStrings: true });
    for (const hit of [
      `db.collection(ROUNDS_COLLECTION)`,
      `db.collection("admissionRounds")`,
      `normalizeAdmissionRound(snap.id, snap.data())`,
      `formRef(db, id)`,
      `roundRef(db, id)`,
    ]) {
      assert.ok(ADDRESSES_A_ROUND.test(kept(hit)), `missed: ${hit}`);
    }
    for (const miss of [
      `// reads admissionRounds through ROUNDS_COLLECTION`,
      `/* normalizeAdmissionRound(x) */ const a = 1;`,
      `isNamedWithStanding(user, "admissionRounds.reviewerUids", uids)`,
      `import type { AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";`,
    ]) {
      assert.ok(!ADDRESSES_A_ROUND.test(kept(miss)), `read as addressing a round: ${miss}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Execution
// ---------------------------------------------------------------------------

/** The Admin SDK's sentinels, as values this store can apply. */
const FIRESTORE_STUB = `
export const FieldValue = {
  serverTimestamp: () => ({ __sentinel: "serverTimestamp" }),
  increment: (n) => ({ __sentinel: "increment", n }),
  arrayUnion: (...values) => ({ __sentinel: "arrayUnion", values }),
  arrayRemove: (...values) => ({ __sentinel: "arrayRemove", values }),
  delete: () => ({ __sentinel: "delete" }),
};
export class FieldPath {
  constructor(...segments) { this.segments = segments; }
  static documentId() { return new FieldPath("__name__"); }
}
export class Timestamp {
  constructor(date) { this.date = date; }
  static now() { return new Timestamp(new Date()); }
  static fromDate(date) { return new Timestamp(date); }
  toDate() { return this.date; }
  toMillis() { return this.date.getTime(); }
}
`;

/**
 * `NextResponse` as a class the routes can build AND test with `instanceof`,
 * which the applicant gate does. `body` and `status` are what an assertion
 * reads.
 */
const NEXT_SERVER_STUB = `
export class NextResponse {
  constructor(body, init) {
    this.body = body;
    this.status = init?.status ?? 200;
    this.headers = init?.headers ?? {};
  }
  static json(body, init) { return new NextResponse(body, init); }
}
`;

/**
 * The doors to the outside world, replaced. Every send records itself on
 * `globalThis.__fence.sends`, so "nobody was emailed" is something a test can
 * count rather than assume.
 */
const STUBS = new Map([
  ["server-only", "export {};"],
  ["next/server", NEXT_SERVER_STUB],
  ["firebase-admin/firestore", FIRESTORE_STUB],
  ["@/lib/firebase/admin", "export const getAdminDb = () => globalThis.__fence?.db ?? null;"],
  ["@/lib/firebase/session", "export const getCurrentUser = async () => globalThis.__fence?.user ?? null;"],
  [
    "@/lib/firebase/impersonation",
    "export const assertNotImpersonating = async () => null;\n" +
      "export const getImpersonator = async () => null;\n" +
      "export const markerIsLive = () => false;",
  ],
  ["@/lib/recaptcha/server", "export const verifyRecaptcha = async () => true;"],
  [
    "@/lib/email/admissionEmails",
    "export const admissionApplicationPath = (roundId, surface) =>\n" +
      "  `/${surface === 'apply' ? 'apply' : 'applications'}/${roundId}`;\n" +
      "export const admissionApplicationUrl = (roundId, surface) =>\n" +
      "  `https://example.invalid${admissionApplicationPath(roundId, surface)}`;\n" +
      "export const sendAdmissionEmail = async (opts) => {\n" +
      "  globalThis.__fence.sends.push(['email', opts.kind]);\n" +
      "  return 'sent';\n" +
      "};",
  ],
  [
    "@/lib/push/courseNotifications",
    "export const mirrorCourseDecisionToPush = async () => {\n" +
      "  globalThis.__fence.sends.push(['push']);\n" +
      "};",
  ],
  [
    "@/lib/firestore/suppression",
    "export const isSuppressed = async () => false;\n" +
      "export const filterSuppressed = async (db, addrs) => ({ allowed: addrs, suppressed: [] });",
  ],
  [
    "@/lib/email/courseFacilitatorEmails",
    "export const hasOptedOutOfCourseAnnouncements = () => false;\n" +
      "export const memberNameOf = () => '';",
  ],
  // The two routes that run a scheduler job by hand import the registry, and
  // the registry imports every job by value, so each job's doors are in this
  // suite's graph whether or not anything here runs it.
  [
    "@/lib/email/worksheetReminderEmails",
    "export const worksheetRespondPath = () => '';\n" +
      "export const worksheetDueSoonSubject = () => '';\n" +
      "export const formatWorksheetDue = () => '';\n" +
      "export const sendWorksheetDueSoonEmail = async () => 'sent';",
  ],
  ["@/lib/push/taskNotifications", "export const mirrorTaskEmailToPush = async () => {};"],
  [
    "@/lib/email/eventAnnouncement",
    "export const MAX_QUEUED_ANNOUNCEMENT_ROWS = 5000;\n" +
      "export const announcementRecipientKey = (r) => `u${r.uid}`;\n" +
      "export const resolveAnnouncementAudience = async () => ({\n" +
      "  recipients: [], skipped: 0, refusal: null,\n" +
      "});\n" +
      "export const sendAnnouncementToRecipient = async () => ({\n" +
      "  sent: 0, suppressed: 0, failed: 0,\n" +
      "});",
  ],
  ["@/lib/push/rowAudience", "export const rowPushOwners = async () => ({ uids: [], refusal: null });"],
  [
    "@/lib/push/send",
    "export const sendPushToUid = async () => ({\n" +
      "  sent: 0, pruned: 0, deferred: 0, failed: 0, retried: 0,\n" +
      "});",
  ],
]);

const { loadTs } = createLoader({ stubs: STUBS });

// --- an in-memory Firestore ------------------------------------------------

function applySentinels(current, data) {
  const next = { ...current };
  for (const [field, value] of Object.entries(data)) {
    // A dotted name addresses a field inside a map, as `update` does.
    const path = field.split(".");
    let target = next;
    for (const segment of path.slice(0, -1)) {
      target[segment] = { ...(target[segment] ?? {}) };
      target = target[segment];
    }
    const last = path[path.length - 1];
    const sentinel = value && typeof value === "object" ? value.__sentinel : undefined;
    if (sentinel === "serverTimestamp") target[last] = new Date("2026-10-07T09:00:00.000Z");
    else if (sentinel === "increment") target[last] = (target[last] ?? 0) + value.n;
    else if (sentinel === "arrayUnion") target[last] = [...new Set([...(target[last] ?? []), ...value.values])];
    else if (sentinel === "arrayRemove") target[last] = (target[last] ?? []).filter((item) => !value.values.includes(item));
    else if (sentinel === "delete") delete target[last];
    else target[last] = value;
  }
  return next;
}

/**
 * Documents by full path. `writes` records every write that was attempted, in
 * order, whether it was direct, in a batch or in a transaction, which is what
 * lets a test say "nothing was written" about a refusal.
 */
function makeDb(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));
  const writes = [];
  let minted = 0;

  const snapshot = (path) => {
    const data = docs.get(path);
    return {
      id: path.split("/").pop(),
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
      ref: docRef(path),
    };
  };

  const write = (op, path, data, options) => {
    writes.push([op, path]);
    if (op === "delete") docs.delete(path);
    else if (op === "create") {
      if (docs.has(path)) throw Object.assign(new Error(`already exists: ${path}`), { code: 6 });
      docs.set(path, applySentinels({}, data));
    } else if (op === "set") {
      docs.set(path, applySentinels(options?.merge ? (docs.get(path) ?? {}) : {}, data));
    } else {
      if (!docs.has(path)) throw Object.assign(new Error(`no document to update: ${path}`), { code: 5 });
      docs.set(path, applySentinels(docs.get(path), data));
    }
  };

  function docRef(path) {
    return {
      id: path.split("/").pop(),
      path,
      get: async () => snapshot(path),
      collection: (name) => collectionRef(`${path}/${name}`),
      set: async (data, options) => write("set", path, data, options),
      update: async (data) => write("update", path, data),
      create: async (data) => write("create", path, data),
      delete: async () => write("delete", path),
    };
  }

  const matches = (data, [field, op, value]) => {
    const stored = data[field];
    if (op === "==") return stored === value;
    if (op === "array-contains") return Array.isArray(stored) && stored.includes(value);
    if (op === "array-contains-any") return Array.isArray(stored) && stored.some((item) => value.includes(item));
    if (op === "in") return value.includes(stored);
    throw new Error(`this store does not serve the operator ${op}`);
  };

  function query(path, filters, limit) {
    const run = () => {
      const prefix = `${path}/`;
      return [...docs.keys()]
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .sort()
        .filter((key) => filters.every((filter) => matches(docs.get(key), filter)))
        .slice(0, limit ?? Infinity);
    };
    return {
      where: (field, op, value) => query(path, [...filters, [field, op, value]], limit),
      limit: (n) => query(path, filters, n),
      select: () => query(path, filters, limit),
      get: async () => {
        const found = run().map(snapshot);
        return { empty: found.length === 0, size: found.length, docs: found };
      },
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
    };
  }

  function collectionRef(path) {
    return {
      ...query(path, [], null),
      doc: (id) => docRef(`${path}/${id ?? `minted-${(minted += 1)}`}`),
    };
  }

  const buffered = () => {
    const pending = [];
    return {
      pending,
      set: (ref, data, options) => pending.push(["set", ref.path, data, options]),
      update: (ref, data) => pending.push(["update", ref.path, data]),
      create: (ref, data) => pending.push(["create", ref.path, data]),
      delete: (ref) => pending.push(["delete", ref.path]),
    };
  };

  return {
    collection: (name) => collectionRef(name),
    getAll: async (...refs) => refs.map((ref) => snapshot(ref.path)),
    batch() {
      const buffer = buffered();
      return { ...buffer, commit: async () => buffer.pending.forEach((op) => write(...op)) };
    },
    async runTransaction(body) {
      const buffer = buffered();
      const result = await body({ ...buffer, get: async (ref) => snapshot(ref.path) });
      buffer.pending.forEach((op) => write(...op));
      return result;
    },
    writes,
    read: (path) => (docs.has(path) ? { ...docs.get(path) } : null),
  };
}

// --- the cast, and what is stored -------------------------------------------

const ADMIN = { uid: "admin-1", role: "admin", email: "ada@nottingham.ac.uk", displayName: "Ada" };
const MEMBER = { uid: "member-1", role: "member", email: "member-1@example.com", displayName: "Sam" };

const FORM_ID = "autumn-2026__f0rm0001";
const OLDER_ID = "facilitators-2026__r0und001";

/** The fields every round carries, of either kind. Nothing here says which. */
function roundDoc(overrides = {}) {
  return {
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    blurb: "",
    academicYear: "2026/27",
    status: "open",
    opensAt: null,
    closesAt: null,
    decisionsByDate: null,
    stageIds: [],
    reviewerUids: [],
    finalDeciderUid: null,
    reminderOffsets: [],
    outcomeRunIds: [],
    applicationCounts: { draft: 0, submitted: 0 },
    archived: false,
    ...overrides,
  };
}

/** An application form: the same document, carrying the one field that says so. */
function formDoc(overrides = {}) {
  return roundDoc({
    formVersion: 2,
    programmeIds: ["agi-strategy"],
    programmes: {
      "agi-strategy": {
        kind: "fellowship",
        name: "AGI Strategy Fellowship",
        shortName: "AGI Strategy",
        leadUid: "lead-1",
        reviewerUids: ["reviewer-1"],
      },
    },
    questionSetIds: [],
    asksFacilitating: true,
    reviewerUids: ["lead-1", "reviewer-1"],
    ...overrides,
  });
}

const fence = await loadTs("lib/admissions/formFence.ts");

function stage({ user, seed }) {
  const db = makeDb(seed);
  globalThis.__fence = { db, user, sends: [] };
  return db;
}

let caller = 0;
/**
 * A request no rate limit has seen before, so no test can be refused for
 * another's. The apply routes throttle on the address AND on the account, so
 * `call` below gives each request an account of its own as well.
 */
function request(method, body, url = "https://example.invalid/") {
  caller += 1;
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${caller}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ROUTES = "app/api/admissions/rounds/[roundId]";

/**
 * Every `older` handler, with a request that gets it as far as loading the
 * round, and what it answers for a round of the older kind in the state
 * given. That second answer is each route's own next check: it is here to
 * show the handler carried on PAST the fence, so it must be something other
 * than the refusal.
 *
 * `reader` is whose sentence a form gets. `draftIsHidden` marks the routes an
 * applicant reaches, where a form nobody has opened has to read as a round
 * that is not there.
 */
const OLDER_HANDLERS = [
  {
    key: "/api/admissions/rounds/[roundId]",
    file: `${ROUTES}/route.ts`,
    method: "GET",
    user: ADMIN,
    older: { status: 200 },
  },
  {
    key: "/api/admissions/rounds/[roundId]",
    file: `${ROUTES}/route.ts`,
    method: "PATCH",
    user: ADMIN,
    body: { label: "A new name" },
    older: { status: 200, wrote: true },
  },
  {
    key: "/api/admissions/rounds/[roundId]/roles",
    file: `${ROUTES}/roles/route.ts`,
    method: "PUT",
    user: ADMIN,
    body: { reviewerUids: [], finalDeciderUid: null },
    older: { status: 200, wrote: true },
  },
  {
    key: "/api/admissions/rounds/[roundId]/status",
    file: `${ROUTES}/status/route.ts`,
    method: "POST",
    user: ADMIN,
    body: { status: "closed" },
    older: { status: 200, wrote: true },
  },
  {
    key: "/api/admissions/rounds/[roundId]/decide",
    file: `${ROUTES}/decide/route.ts`,
    method: "POST",
    user: ADMIN,
    body: { applicationId: `${OLDER_ID}__member-1`, decision: "decline" },
    // An enrolment round, which this route says it cannot decide yet.
    older: { status: 400 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/reminders/send-now",
    file: `${ROUTES}/reminders/send-now/route.ts`,
    method: "POST",
    user: ADMIN,
    // Open, with no closing date to count back from.
    older: { status: 409 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/stages",
    file: `${ROUTES}/stages/route.ts`,
    method: "GET",
    user: MEMBER,
    reader: "applicant",
    draftIsHidden: true,
    older: { status: 200 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/stages/[stageId]",
    file: `${ROUTES}/stages/[stageId]/route.ts`,
    method: "PUT",
    user: ADMIN,
    params: { stageId: "s0" },
    body: { label: "Application", questions: [] },
    // An edit to a stage the round does not have.
    older: { status: 404 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/stages/[stageId]",
    file: `${ROUTES}/stages/[stageId]/route.ts`,
    method: "DELETE",
    user: ADMIN,
    params: { stageId: "s0" },
    older: { status: 404 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/stages/[stageId]/release",
    file: `${ROUTES}/stages/[stageId]/release/route.ts`,
    method: "POST",
    user: ADMIN,
    params: { stageId: "s0" },
    older: { status: 404 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/apply",
    file: `${ROUTES}/apply/route.ts`,
    method: "GET",
    user: MEMBER,
    reader: "applicant",
    draftIsHidden: true,
    older: { status: 200 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/apply",
    file: `${ROUTES}/apply/route.ts`,
    method: "POST",
    user: MEMBER,
    body: {},
    reader: "applicant",
    draftIsHidden: true,
    older: { status: 200, wrote: true },
  },
  {
    key: "/api/admissions/rounds/[roundId]/apply",
    file: `${ROUTES}/apply/route.ts`,
    method: "PATCH",
    user: MEMBER,
    body: {},
    reader: "applicant",
    draftIsHidden: true,
    // No application of theirs to save onto.
    older: { status: 404 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/apply",
    file: `${ROUTES}/apply/route.ts`,
    method: "DELETE",
    user: MEMBER,
    body: { confirm: "WITHDRAW" },
    reader: "applicant",
    draftIsHidden: true,
    older: { status: 404 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/apply/submit",
    file: `${ROUTES}/apply/submit/route.ts`,
    method: "POST",
    user: MEMBER,
    body: {},
    reader: "applicant",
    draftIsHidden: true,
    // No stage has been released, so there is nothing to submit.
    older: { status: 400 },
  },
  {
    key: "/api/admissions/rounds/[roundId]/apply/stage/[stageId]",
    file: `${ROUTES}/apply/stage/[stageId]/route.ts`,
    method: "POST",
    user: MEMBER,
    params: { stageId: "s0" },
    body: { answers: {} },
    reader: "applicant",
    draftIsHidden: true,
    older: { status: 404 },
  },
];

async function call(entry, roundId) {
  const route = await loadTs(entry.file);
  const handler = route[entry.method];
  assert.equal(typeof handler, "function", `${entry.file} exports no ${entry.method}`);
  const incoming = request(entry.method, entry.body);
  // An applicant nobody has throttled yet. Staff keep the uid a round names.
  const staged = globalThis.__fence;
  if (staged.user?.uid === MEMBER.uid) staged.user = { ...MEMBER, uid: `member-${caller}` };
  const response = await handler(incoming, {
    params: Promise.resolve({ roundId, ...(entry.params ?? {}) }),
  });
  return { status: response.status, body: response.body };
}

const isRefusal = (response) =>
  response.status === fence.APPLICATION_FORM_REFUSAL_STATUS &&
  [fence.EDITED_IN_THE_APPLICATION_FORM, fence.MADE_ON_THE_APPLICATION_FORM].includes(response.body?.error);

describe("the refusal itself", () => {
  test("an application form is refused, in the words for whoever is reading", () => {
    const staff = fence.refuseApplicationForm(formDoc());
    assert.deepEqual([staff.status, staff.body], [409, { error: fence.EDITED_IN_THE_APPLICATION_FORM }]);
    const applicant = fence.refuseApplicationForm(formDoc(), "applicant");
    assert.deepEqual([applicant.status, applicant.body], [409, { error: fence.MADE_ON_THE_APPLICATION_FORM }]);
  });

  test("a round of the older kind is not, and neither is anything that is not a form", () => {
    for (const data of [roundDoc(), {}, null, undefined, "2", [], { formVersion: 1 }, { formVersion: "2" }, { formVersion: true }]) {
      assert.equal(fence.refuseApplicationForm(data), null, `refused: ${JSON.stringify(data)}`);
      assert.equal(fence.refuseApplicationForm(data, "applicant"), null);
    }
  });

  test("the two sentences are the ones the screens and the routes were given", () => {
    assert.equal(
      fence.EDITED_IN_THE_APPLICATION_FORM,
      "This round is an application form, so it is edited in the application form and not here. Open it from Admissions.",
    );
    assert.equal(
      fence.MADE_ON_THE_APPLICATION_FORM,
      "Applications for this term are made on the application form.",
    );
    assert.equal(fence.APPLICATION_FORM_REFUSAL_STATUS, 409);
  });

  test("neither sentence uses a word an applicant never reads, and neither carries a dash", async () => {
    const { WORDS_APPLICANTS_NEVER_SEE } = await loadTs("lib/applications/words.ts");
    for (const sentence of [fence.EDITED_IN_THE_APPLICATION_FORM, fence.MADE_ON_THE_APPLICATION_FORM]) {
      for (const word of WORDS_APPLICANTS_NEVER_SEE) {
        assert.ok(!sentence.toLowerCase().includes(word), `"${sentence}" says "${word}"`);
      }
      assert.ok(!/[\u2013\u2014]/.test(sentence), `"${sentence}" carries a dash`);
    }
  });
});

describe("every older handler, called with an application form", () => {
  test("the list below is every handler the tree lists as older", () => {
    const listed = [];
    for (const [key, entry] of Object.entries(ROUND_SURFACES)) {
      if (entry.kind !== "older" || !entry.handlers) continue;
      for (const method of Object.keys(entry.handlers)) listed.push(`${key} ${method}`);
    }
    assert.deepEqual(
      OLDER_HANDLERS.map((entry) => `${entry.key} ${entry.method}`).sort(),
      listed.sort(),
      "A handler is listed as `older` and is not executed here, or the other way round.",
    );
  });

  for (const entry of OLDER_HANDLERS) {
    const name = `${entry.key} ${entry.method}`;
    const sentence = () =>
      entry.reader === "applicant" ? fence.MADE_ON_THE_APPLICATION_FORM : fence.EDITED_IN_THE_APPLICATION_FORM;

    test(`${name} refuses an open form, writes nothing and sends nothing`, async () => {
      const seed = { [`admissionRounds/${FORM_ID}`]: formDoc() };
      const db = stage({ user: entry.user, seed });
      const response = await call(entry, FORM_ID);
      assert.deepEqual([response.status, response.body], [409, { error: sentence() }]);
      assert.deepEqual(db.writes, [], "a refused request wrote something");
      assert.deepEqual(globalThis.__fence.sends, [], "a refused request sent something");
      assert.deepEqual(db.read(`admissionRounds/${FORM_ID}`), seed[`admissionRounds/${FORM_ID}`]);
    });

    test(`${name} carries on past the fence for a round of the older kind`, async () => {
      const db = stage({ user: entry.user, seed: { [`admissionRounds/${OLDER_ID}`]: roundDoc() } });
      const response = await call(entry, OLDER_ID);
      assert.ok(!isRefusal(response), `an older round was refused as a form: ${JSON.stringify(response.body)}`);
      assert.equal(response.status, entry.older.status, JSON.stringify(response.body));
      assert.equal(db.writes.length > 0, entry.older.wrote === true, `writes: ${JSON.stringify(db.writes)}`);
    });

    test(`${name} still answers "not found" for a round that is not there`, async () => {
      stage({ user: entry.user, seed: {} });
      const response = await call(entry, "no-such-round");
      assert.equal(response.status, 404, JSON.stringify(response.body));
    });

    if (entry.draftIsHidden) {
      test(`${name} reads a form nobody has opened as a round that is not there`, async () => {
        for (const hidden of [{ status: "draft" }, { archived: true }]) {
          const db = stage({ user: entry.user, seed: { [`admissionRounds/${FORM_ID}`]: formDoc(hidden) } });
          const response = await call(entry, FORM_ID);
          assert.deepEqual(
            [response.status, response.body],
            [404, { error: "Round not found." }],
            `a form that is ${JSON.stringify(hidden)} was answered as something other than absent`,
          );
          assert.deepEqual(db.writes, []);
        }
      });
    }
  }

  test("somebody who may not see the round is told it is not there, form or not", async () => {
    const read = OLDER_HANDLERS.find((entry) => entry.key === "/api/admissions/rounds/[roundId]" && entry.method === "GET");
    for (const [id, doc] of [[FORM_ID, formDoc()], [OLDER_ID, roundDoc()]]) {
      stage({ user: MEMBER, seed: { [`admissionRounds/${id}`]: doc } });
      const response = await call(read, id);
      assert.deepEqual([response.status, response.body], [404, { error: "Round not found" }]);
    }
  });

  test("somebody the form names may see it, and is told where it is edited", async () => {
    const read = OLDER_HANDLERS.find((entry) => entry.key === "/api/admissions/rounds/[roundId]" && entry.method === "GET");
    const reviewer = { uid: "reviewer-1", role: "committee", suRecognised: true, email: "reviewer-1@example.com", displayName: "Rae" };
    stage({ user: reviewer, seed: { [`admissionRounds/${FORM_ID}`]: formDoc() } });
    const response = await call(read, FORM_ID);
    assert.deepEqual([response.status, response.body], [409, { error: fence.EDITED_IN_THE_APPLICATION_FORM }]);
  });
});

describe("the two routes that serve both kinds, called with an application form", () => {
  test("the destroy gets as far as checking the typed name, so a form can be destroyed here", async () => {
    const db = stage({ user: ADMIN, seed: { [`admissionRounds/${FORM_ID}`]: formDoc() } });
    const response = await call(
      { file: `${ROUTES}/destroy/route.ts`, method: "POST", body: { confirmName: "not the name" } },
      FORM_ID,
    );
    assert.ok(!isRefusal(response), "the destroy refused an application form");
    assert.deepEqual([response.status, response.body.error], [400, "That doesn't match the round's label. Type it exactly to confirm."]);
    assert.deepEqual(db.writes, []);
  });

  test("the manifest answers for a form", async () => {
    stage({ user: ADMIN, seed: { [`admissionRounds/${FORM_ID}`]: formDoc() } });
    const route = await loadTs(`${ROUTES}/destroy-manifest/route.ts`);
    const response = await route.GET(
      request("GET", undefined, "https://example.invalid/?probe=interrupted"),
      { params: Promise.resolve({ roundId: FORM_ID }) },
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.target.id, FORM_ID);
    assert.equal(response.body.target.label, "Autumn 2026");
    assert.equal(response.body.interrupted, null);
  });
});

/**
 * The two notices are what a PAGE returns for a form, and a page cannot be
 * run here. Its notice can: both are plain server components, so each is
 * rendered to the HTML the page would send. A loader of their own, because
 * what they import is a stylesheet and three components, none of which is a
 * door to anything: each is replaced by the smallest thing that renders.
 */
const h = "globalThis.__fence.h";
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const notices = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["next/server", NEXT_SERVER_STUB],
    ["./ApplicationFormNotice.module.css", CLASS_NAMES],
    ["./RoundEditor.module.css", CLASS_NAMES],
    ["next/link", `export default ({ href, children }) => ${h}("a", { href }, children);`],
    ["@/components/ui/Badge", `export default ({ children }) => ${h}("span", { "data-badge": "" }, children);`],
    [
      "./ApplicationFormDangerZone",
      `export default ({ roundId, label, subtitle }) =>\n` +
        `  ${h}("div", { "data-danger-zone": roundId, "data-label": label, "data-subtitle": subtitle });`,
    ],
  ]),
});

describe("what the older pages return for an application form", () => {
  const render = (component, props) => {
    globalThis.__fence = { h: createElement };
    return renderToStaticMarkup(createElement(component, props));
  };

  test("the applicant notice is one sentence, as a heading, with nowhere to go", async () => {
    const { default: ApplicationFormNotice } = await notices.loadTs("features/admissions/ApplicationFormNotice.tsx");
    const html = render(ApplicationFormNotice, {});
    assert.match(html, new RegExp(`<h1[^>]*>${fence.MADE_ON_THE_APPLICATION_FORM.replace(/\./g, "\\.")}</h1>`));
    assert.ok(!/<a\b|href=|<script|<form|<button/.test(html), html);
    // The one sentence and nothing about the form: the page hands it no props.
    assert.equal(html.replace(/<[^>]+>/g, ""), fence.MADE_ON_THE_APPLICATION_FORM);
  });

  test("the staff notice says where a form is edited and gives an admin the danger zone", async () => {
    const { default: ApplicationFormStaffNotice } = await notices.loadTs("features/admissions/ApplicationFormStaffNotice.tsx");
    const props = { roundId: FORM_ID, label: "Autumn 2026", academicYear: "2026/27" };

    const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    const OWN_PAGES = `/admin/admissions/forms/${FORM_ID}`;

    const admin = render(ApplicationFormStaffNotice, { ...props, isAdmin: true, canOpen: true });
    assert.match(admin, /<h1[^>]*>Autumn 2026<\/h1>/);
    assert.ok(admin.includes(`<p style="margin:0">${fence.EDITED_IN_THE_APPLICATION_FORM}</p>`), admin);
    assert.match(admin, /<a href="\/admin\/admissions">/);
    assert.ok(admin.includes(`<a href="${OWN_PAGES}">Open the application form</a>`), admin);
    assert.ok(
      admin.includes(`<div data-danger-zone="${FORM_ID}" data-label="Autumn 2026" data-subtitle="Application form · 2026/27"></div>`),
      admin,
    );

    const reviewer = render(ApplicationFormStaffNotice, { ...props, isAdmin: false, canOpen: true });
    assert.ok(reviewer.includes(fence.EDITED_IN_THE_APPLICATION_FORM));
    assert.ok(!reviewer.includes("data-danger-zone"), "somebody who is not an admin was drawn the danger zone");
    // Two links and no more: back to the list, and on to the form's own
    // pages. This was one link, back to the list, while the form's pages had
    // no address. They have one now, so the notice leads to it, for somebody
    // those pages open for.
    assert.deepEqual(hrefs(reviewer), ["/admin/admissions", OWN_PAGES]);

    // Somebody who may see the round and is named on no programme (a course
    // author on no form) is not offered the way on: the form's own pages
    // would tell them there is no form there. For them it is still one link,
    // and it goes back to the list.
    const author = render(ApplicationFormStaffNotice, { ...props, isAdmin: false, canOpen: false });
    assert.ok(author.includes(fence.EDITED_IN_THE_APPLICATION_FORM));
    assert.deepEqual(hrefs(author), ["/admin/admissions"]);
    assert.ok(!author.includes("Open the application form"), author);
  });

  test("a form with no year says so in fewer words, and its name is text, never markup", async () => {
    const { default: ApplicationFormStaffNotice } = await notices.loadTs("features/admissions/ApplicationFormStaffNotice.tsx");
    const html = render(ApplicationFormStaffNotice, {
      roundId: FORM_ID,
      label: "<b>Autumn</b>",
      academicYear: "",
      isAdmin: true,
    });
    assert.ok(html.includes('data-subtitle="Application form"'), html);
    assert.ok(html.includes("&lt;b&gt;Autumn&lt;/b&gt;") && !html.includes("<b>Autumn</b>"), html);
  });
});

describe("the shared loaders, run", () => {
  test("loadAppointmentRound answers null for a form, whatever kind its document carries", async () => {
    const { loadAppointmentRound } = await loadTs("lib/admissions/appointmentQueueData.ts");
    const db = makeDb({
      [`admissionRounds/${FORM_ID}`]: formDoc({ kind: "appointment" }),
      [`admissionRounds/${OLDER_ID}`]: roundDoc({ kind: "appointment" }),
    });
    assert.equal(await loadAppointmentRound(db, FORM_ID), null);
    assert.equal((await loadAppointmentRound(db, OLDER_ID))?.id, OLDER_ID);
    assert.equal(await loadAppointmentRound(db, "no-such-round"), null);
  });

  test("loadRound throws the applicant's refusal for a form, and hands back an older round", async () => {
    const { ApplyError, loadRound } = await loadTs("lib/admissions/applyContext.ts");
    const db = makeDb({
      [`admissionRounds/${FORM_ID}`]: formDoc(),
      [`admissionRounds/${OLDER_ID}`]: roundDoc(),
      "admissionRounds/draft-form": formDoc({ status: "draft" }),
    });
    await assert.rejects(loadRound(db, FORM_ID), (err) => {
      assert.ok(err instanceof ApplyError);
      assert.deepEqual([err.status, err.message], [409, fence.MADE_ON_THE_APPLICATION_FORM]);
      return true;
    });
    await assert.rejects(loadRound(db, "draft-form"), (err) => {
      assert.deepEqual([err.status, err.message], [404, "Round not found."]);
      return true;
    });
    assert.equal((await loadRound(db, OLDER_ID)).id, OLDER_ID);
  });
});

describe("the list of one person's applications", () => {
  const UID = "member-1";
  /** An application made on a form: two copies of the content, and no stage answers. */
  const onForm = (status) => ({
    roundId: FORM_ID,
    uid: UID,
    email: "member-1@example.com",
    displayName: "Sam",
    formVersion: 2,
    status,
    draft: { rankedProgrammeIds: ["agi-strategy"], answers: {} },
    sent: status === "draft" ? null : { rankedProgrammeIds: ["agi-strategy"], answers: {} },
    submittedAt: status === "draft" ? null : new Date("2026-10-10T10:00:00.000Z"),
    sentAt: status === "draft" ? null : new Date("2026-10-10T10:00:00.000Z"),
    result: null,
    updatedAt: new Date("2026-10-10T10:00:00.000Z"),
  });
  const onOlder = {
    roundId: OLDER_ID,
    uid: UID,
    email: "member-1@example.com",
    displayName: "Sam",
    status: "submitted",
    stageAnswers: {},
    stageSubmittedAt: {},
    updatedAt: new Date("2026-10-01T10:00:00.000Z"),
  };
  const NOW = new Date("2026-10-12T12:00:00.000Z");

  test("an application made on a form is listed, with the status it has", async () => {
    const hub = await loadTs("lib/admissions/statusHubData.ts");
    for (const status of ["draft", "submitted", "accepted", "invited", "no-offer", "declined", "withdrawn"]) {
      const db = makeDb({
        [`admissionRounds/${FORM_ID}`]: formDoc(),
        [`admissionRounds/${OLDER_ID}`]: roundDoc({ kind: "appointment", label: "Facilitators" }),
        [`admissionApplications/${FORM_ID}__${UID}`]: onForm(status),
        [`admissionApplications/${OLDER_ID}__${UID}`]: onOlder,
      });
      const rows = await hub.loadStatusRows(db, UID, NOW);
      assert.deepEqual(
        rows.map((row) => [row.round.id, row.application.status]),
        [[FORM_ID, status], [OLDER_ID, "submitted"]],
        `listing a form application that is ${status}`,
      );
      // What the row says is its status and its dates. Nothing a form keeps
      // for itself is on it, and nothing in the older shape was read for it.
      const row = rows[0];
      assert.deepEqual(row.stages, []);
      assert.equal(row.nextStage, null);
      assert.equal(row.sharedDecisionReason, "");
      // The row's link is the one address both kinds of round share. For a
      // form the page there answers with the applicant notice, and with the
      // form itself once the form is served at that address, so the list
      // never has to know which. It is never the older flow: the page's own
      // loader stops at a form (section 4).
      assert.equal(row.href, `/apply/${FORM_ID}`);
      assert.equal(row.hrefKind, status === "draft" ? "resume" : "view");
      const wire = JSON.stringify(row);
      for (const kept of ["rankedProgrammeIds", "agi-strategy", '"draft":', '"sent":', "programmes", "formVersion"]) {
        assert.ok(!wire.includes(kept), `the row carries ${kept}`);
      }
    }
  });

  test("no stages are read for a form, even when a document sits where one would be", async () => {
    const hub = await loadTs("lib/admissions/statusHubData.ts");
    const db = makeDb({
      [`admissionRounds/${FORM_ID}`]: formDoc({ stageIds: ["s0"] }),
      [`admissionRounds/${FORM_ID}/stages/s0`]: { roundId: FORM_ID, label: "Application", questions: [], order: 0 },
      [`admissionApplications/${FORM_ID}__${UID}`]: onForm("submitted"),
    });
    const [row] = await hub.loadStatusRows(db, UID, NOW);
    assert.deepEqual(row.stages, []);
    assert.equal(row.nextStage, null);
  });

  test("the single-round loader says when the round is a form, with or without an application", async () => {
    const hub = await loadTs("lib/admissions/statusHubData.ts");
    const db = makeDb({
      [`admissionRounds/${FORM_ID}`]: formDoc(),
      [`admissionRounds/${OLDER_ID}`]: roundDoc(),
      "admissionRounds/draft-form": formDoc({ status: "draft" }),
      [`admissionApplications/${FORM_ID}__${UID}`]: onForm("submitted"),
    });
    const applied = await hub.loadStatusRowForRound(db, UID, FORM_ID, NOW);
    assert.deepEqual(
      [applied.roundMissing, applied.applicationForm, applied.roundPublic, applied.row?.application.status],
      [false, true, true, "submitted"],
    );
    const stranger = await hub.loadStatusRowForRound(db, "somebody-else", FORM_ID, NOW);
    assert.deepEqual([stranger.applicationForm, stranger.row], [true, null]);
    const unopened = await hub.loadStatusRowForRound(db, "somebody-else", "draft-form", NOW);
    assert.deepEqual([unopened.applicationForm, unopened.roundPublic, unopened.row], [true, false, null]);
    const older = await hub.loadStatusRowForRound(db, UID, OLDER_ID, NOW);
    assert.deepEqual([older.roundMissing, older.applicationForm], [false, false]);
    assert.deepEqual(await hub.loadStatusRowForRound(db, UID, "no-such-round", NOW), { roundMissing: true });
  });
});

describe("the round a course page speaks about", () => {
  const NOW = new Date("2026-10-12T12:00:00.000Z");
  const names = { outcomeRunIds: ["run-1"], status: "open" };

  test("a form is never the answer for a course's runs, and an older round still is", async () => {
    const { fetchLiveRoundForRuns } = await loadTs("features/courses/fetchLiveRound.ts");
    stage({ user: null, seed: { [`admissionRounds/${FORM_ID}`]: formDoc(names) } });
    assert.equal(await fetchLiveRoundForRuns(["run-1"], NOW), null);

    stage({
      user: null,
      seed: {
        [`admissionRounds/${FORM_ID}`]: formDoc(names),
        [`admissionRounds/${OLDER_ID}`]: roundDoc(names),
      },
    });
    assert.equal((await fetchLiveRoundForRuns(["run-1"], NOW))?.id, OLDER_ID);
  });

  test("the catalogue leaves a form out as well", async () => {
    const { listLiveRoundsByCourse } = await loadTs("features/courses/fetchLiveRound.ts");
    const known = new Map([["run-1", { id: "run-1", courseId: "course-1" }]]);

    stage({ user: null, seed: { [`admissionRounds/${FORM_ID}`]: formDoc(names) } });
    assert.deepEqual([...(await listLiveRoundsByCourse(known, NOW)).rounds.keys()], []);

    stage({
      user: null,
      seed: {
        [`admissionRounds/${FORM_ID}`]: formDoc(names),
        [`admissionRounds/${OLDER_ID}`]: roundDoc(names),
      },
    });
    const { rounds } = await listLiveRoundsByCourse(known, NOW);
    assert.deepEqual([...rounds.entries()].map(([course, round]) => [course, round.id]), [["course-1", OLDER_ID]]);
  });
});
