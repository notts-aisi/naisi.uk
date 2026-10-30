/**
 * The programme surveys' world: AGI Strategy on Thu 29 Oct 2026, week 1, the
 * morning the before survey goes out, for the suites about a programme's
 * surveys (docs/surveys.md). A suite moves the clock on for the survey at the
 * end and the follow-ups.
 *
 * Built on `tests/lib/leadWorld.mjs`: the term's form after decision day,
 * AGI Strategy naming its run with Claudia as its lead, the run's six weeks
 * from Thu 29 Oct and its three groups (A on Thursdays at 6pm with Sofia, B on
 * Tuesdays at 6pm with Rahul and Sofia, C on Wednesdays at 1pm with Tom). The
 * run's last session is Wed 9 Dec, so names come off two years on, on Sat 9
 * Dec 2028 (the boards drew a year, Thu 9 Dec 2027, before Zach chose two). On top of that, the people holding a place on AGI
 * Strategy (Amara, Bea, Dev and Tariq) stand four ways:
 *
 *  - AMARA is in Group B, told by Publish: her box names Rahul and Sofia.
 *  - BEA is in Group A, told: her box names Sofia, and her group meets
 *    tonight, so an answer of hers sent after 6pm is after her first session.
 *  - DEV is placed in Group A and Publish has not told him: his box names
 *    nobody's group.
 *  - TARIQ is on the run and in no group yet.
 *
 * Ines is invited to AGI Strategy and has not answered, so she holds no
 * place until she accepts. Nina gave her place back.
 *
 * THE CLOCK is a suite's to set with `mock.timers` (Date only); `NOW` is the
 * morning it starts. Every address is `example.com`.
 *
 * Real: every survey route, page and library, and the application system's
 * reads beneath them. Stubbed: what the hand-over world stubs (the session,
 * the Admin SDK handle, the view-as guard, the mail door, which records each
 * message), Next's navigation and link, the stylesheets, and the page's
 * hydration, which reads as "not yet" so a form is drawn as it first arrives.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./functionScan.mjs";
import { withEveryRequired } from "./surveyAnswers.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { A, AGI, B, C, ROUND, RUN, TAIS, formPath, leadSeed } from "./leadWorld.mjs";
import { COURSE } from "./handoverWorld.mjs";

export { A, AGI, B, C, ROUND, RUN, TAIS, formPath };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Thu 29 Oct 2026, 9am in London (GMT): week 1, the morning the survey goes out. */
export const NOW = new Date("2026-10-29T09:00:00Z");
/** When Publish told people their groups. */
export const TOLD = new Date("2026-10-28T18:00:00Z");
/** The day the survey closes. */
export const CLOSES_ON = "2026-11-04";

/** An enrolment on AGI Strategy's run, as allocation and Publish leave one. */
export function seat(uid, groupId, over = {}) {
  return {
    runId: RUN.agi,
    courseId: COURSE.agi,
    uid,
    groupId,
    status: "active",
    role: "learner",
    selfEnrolled: false,
    applicationId: null,
    joinedWeekNumber: 1,
    allocatedEmailAt: TOLD,
    attendance: {},
    createdAt: TOLD,
    updatedAt: TOLD,
    ...over,
  };
}

/** The world every survey suite starts from. `over` adds or replaces whole documents. */
export function surveySeed(over = {}) {
  const seed = leadSeed();
  seed[`courseEnrolments/${RUN.agi}__amara`] = seat("amara", B);
  seed[`courseEnrolments/${RUN.agi}__bea`] = seat("bea", A);
  seed[`courseEnrolments/${RUN.agi}__dev`] = seat("dev", A, { allocatedEmailAt: null });
  seed[`courseEnrolments/${RUN.agi}__tariq`] = seat("tariq", null);
  for (const uid of ["rahul", "sofia", "tom"]) {
    seed[`courseEnrolments/${RUN.agi}__${uid}`] = seat(uid, null, { role: "facilitator" });
  }
  return { ...seed, ...over };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

/** The words of some markup: tags gone, entities read, space folded. */
export function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The world, with `extraStubs` ([specifier, source] pairs) beside the ones
 * every survey suite has: a suite that renders a page with client-only
 * neighbours stubs those neighbours here.
 */
export async function makeSurveyWorld(key = "__surveys", extraStubs = []) {
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const made = makeWorld(key, [
    ...extraStubs,
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
        "export function usePathname() { return '/admin/surveys'; }\n" +
        "export function useSearchParams() { return new URLSearchParams(); }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, prefetch, scroll, ...rest }) =>\n" +
        `  ${handle}.h('a', { href, className, ...rest }, children);`,
    ],
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  const { world, loadTs, call } = made;
  // The link stub draws its anchor with this, read off the world's handle.
  world.h = createElement;

  const route = (...parts) => loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
  const routes = {
    create: await route(),
    questions: await route("[surveyId]", "questions"),
    test: await route("[surveyId]", "test"),
    send: await route("[surveyId]", "send"),
    remind: await route("[surveyId]", "remind"),
    close: await route("[surveyId]", "close"),
    exportCsv: await route("[surveyId]", "export"),
    answerSignedIn: await route("[surveyId]", "answer"),
    answerByLink: await route("answer"),
    consentSignedIn: await route("[surveyId]", "consent"),
    consentByLink: await route("consent"),
  };
  const pages = {
    link: (await loadTs(join("app", "survey", "[token]", "page.tsx"))).default,
    newSurvey: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "new", "page.tsx"))).default,
    signedIn: (await loadTs(join("app", "(app)", "learn", "[runId]", "survey", "[surveyId]", "page.tsx"))).default,
    list: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "page.tsx"))).default,
    send: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "send", "page.tsx"))).default,
    answered: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "answered", "page.tsx"))).default,
    results: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "results", "page.tsx"))).default,
    questions: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "questions", "page.tsx"))).default,
  };
  const lib = {
    items: await loadTs(join("lib", "surveys", "items.ts")),
    templates: await loadTs(join("lib", "surveys", "templates.ts")),
    words: await loadTs(join("lib", "surveys", "words.ts")),
    namesOff: await loadTs(join("lib", "surveys", "namesOff.ts")),
    records: await loadTs(join("lib", "firestore", "surveys.ts")),
    job: await loadTs(join("lib", "scheduler", "jobs", "surveyNamesOff.ts")),
  };

  function reset(seed = surveySeed()) {
    made.reset(seed, { now: () => new Date() });
  }

  const surveyIds = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("surveys/"))
      .map((path) => path.slice("surveys/".length));
  const survey = (id) => world.db.read(`surveys/${id}`);
  const people = (id) =>
    world.db
      .paths()
      .filter((path) => path.startsWith("surveyPeople/"))
      .map((path) => ({ path, ...world.db.read(path) }))
      .filter((row) => row.surveyId === id);
  const answers = (id) =>
    world.db
      .paths()
      .filter((path) => path.startsWith("surveyAnswers/"))
      .map((path) => ({ path, ...world.db.read(path) }))
      .filter((row) => row.surveyId === id);
  const tokenOf = (id, uid) => people(id).find((row) => row.respondent?.uid === uid)?.token ?? null;

  /** An admin makes one of AGI Strategy's surveys, its before survey unless `body.stage` says; answers its id. */
  async function make(who = "zach", body = {}) {
    return call(who, routes.create.POST, {}, {
      body: { roundId: ROUND, programmeId: AGI, stage: "before", closesOn: CLOSES_ON, ...body },
    });
  }

  /** The Send tab's first press, made the way the tab makes it: a test, then the number on the button. */
  async function sendFirst(id, who = "zach", { test = true, emails } = {}) {
    if (test) await call(who, routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    return call(who, routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: emails ?? 4 } });
  }

  /** The survey a personal or test link opens, or null. */
  const surveyOfToken = (token) => {
    const row = world.db
      .paths()
      .filter((path) => path.startsWith("surveyPeople/"))
      .map((path) => world.db.read(path))
      .find((each) => each.token === token);
    const id = row?.surveyId ?? surveyIds().find((each) => survey(each)?.testToken === token);
    return id ? survey(id) : null;
  };

  /**
   * A person's answers, by their own link, with every required question they
   * leave out answered plainly (`withEveryRequired`), as the form insists
   * since 30 Oct 2026. `answerByLinkAsIs` sends exactly what it is given.
   */
  /** `given`, with every required question of survey `id` it leaves out answered plainly (`withEveryRequired`). */
  const everyRequired = (id, given = {}) => withEveryRequired(lib.items, survey(id).items, given);
  const answerByLinkAsIs = (token, answers, who = null) => call(who, routes.answerByLink.POST, {}, { body: { token, answers } });
  const answerByLink = (token, answers, who = null) => {
    const opened = surveyOfToken(token);
    return answerByLinkAsIs(token, opened ? withEveryRequired(lib.items, opened.items, answers) : answers, who);
  };

  /** Every message the mail door was handed, read as the person it went to would read it. */
  const mailText = () => world.mail.map((message) => ({ to: message.to, subject: message.subject, kind: message.kind, surface: message.surface, text: textOf(renderToStaticMarkup(message.react)) }));

  /** A page's words, rendered as the server would render it for `who`; a redirect is answered by where it went. */
  async function page(render, props, who = null) {
    world.user = made.sessionOf(who);
    try {
      const element = await render(props);
      const html = renderToStaticMarkup(element);
      return { html, text: textOf(html), to: null };
    } catch (err) {
      if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
      throw err;
    }
  }

  /** The export route's raw answer: a file, or a refusal. */
  async function exportAs(who, id) {
    world.user = made.sessionOf(who);
    const response = await routes.exportCsv.POST(new Request("https://naisi.invalid/api", { method: "POST" }), {
      params: Promise.resolve({ surveyId: id }),
    });
    if (response instanceof Response) {
      return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers) };
    }
    return { status: response.status, body: response.body };
  }

  return {
    ...made,
    routes,
    pages,
    lib,
    reset,
    surveyIds,
    survey,
    people,
    answers,
    tokenOf,
    make,
    sendFirst,
    answerByLink,
    answerByLinkAsIs,
    everyRequired,
    mailText,
    page,
    exportAs,
    createElement,
  };
}
