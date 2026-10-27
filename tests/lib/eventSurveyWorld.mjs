/**
 * The world the suites about surveys after events run in (docs/surveys.md,
 * "Surveys after events"): VR games night, its sign-ups and the people who
 * came, the survey's real routes and pages, and the check-in routes they meet.
 *
 * ## The event
 *
 * VR GAMES NIGHT, published, Sun 1 Nov 2026 from 2pm to 5pm London time (GMT
 * that day), run by Iris (committee, NOT recognised by the SU) with Cal as a
 * collaborator: `tests/lib/checkInWorld.mjs`'s event, sign-ups and people.
 *
 * Who signed up: Kofi and Chloe (members, confirmed), Gwen (a guest with no
 * account, confirmed), Wren (a member on the waiting list), Pat (pending),
 * Cora (cancelled), Dina (refused), and one test sign-up.
 *
 * Who came, as the door left it: Kofi (checked himself in with the QR code),
 * Gwen (ticked on the door list), Wren (let in from the waiting list), Mo (a
 * member who walked in signed in), Rosa (a walk-in with no account who left
 * an email for the survey) and Dan (a walk-in with no account who left none).
 * Chloe signed up and did not come. So:
 *
 *  - THE PEOPLE WHO CAME are Kofi, Gwen, Wren, Mo, Rosa and Dan; five can be
 *    emailed (Dan left no address): three who came by a sign-up and two
 *    walk-ins who left an email (Mo's account has one).
 *  - EVERYBODY WHO SIGNED UP is Kofi, Chloe and Gwen.
 *
 * ## The people
 *
 * `zach` and `lloyd` admins; `sue` SU-recognised committee; `iris` and `cal`
 * committee the SU does not recognise; the members above; `ines` pending.
 * Signed out is `null`. View-as is `{ viewAs: true }` on a call.
 *
 * ## Real and stubbed
 *
 * Real: every survey and check-in route, page and library a suite loads, the
 * notice lane and its caps. Stubbed (`tests/lib/handoverWorld.mjs`'s world):
 * `server-only`, `next/server`, the Admin SDK handle (the in-memory store),
 * the session, the view-as guard and the one mail door, which records each
 * message and sends none; and here Next's navigation and link, the
 * hydration hook (reads "not yet", as a page first arrives), the browser's
 * sign-out and the stylesheets. Every address is `example.com`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AFTER, DURING, END, EVENT_ID, RSVP, START, checkInSeed, textOf } from "./checkInWorld.mjs";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";

export { AFTER, DURING, END, EVENT_ID, RSVP, START, textOf };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Sun 1 Nov 2026, noon: the morning of the event, when an admin makes its survey. */
export const MORNING = new Date("2026-11-01T12:00:00Z");
/** 4:30pm on the night: the code goes up. */
export const LATE = new Date("2026-11-01T16:30:00Z");
/** Mon 2 Nov, 10am: the email goes. */
export const NEXT_DAY = new Date("2026-11-02T10:00:00Z");
/** The day the survey closes, a week on. */
export const CLOSES_ON = "2026-11-08";

/** A check-in record, as the door leaves one. */
export function checkIn(over) {
  return {
    eventId: EVENT_ID,
    kind: "signup",
    rsvpId: null,
    uid: null,
    name: null,
    email: null,
    emailGoesAt: null,
    how: "door",
    byUid: "sue",
    at: new Date("2026-11-01T14:10:00Z"),
    namesOffAt: new Date("2027-11-01T17:00:00Z"),
    namesOff: false,
    ...over,
  };
}

/** A week after the event: when a walk-in's email goes with no survey sooner. */
export const WEEK_ON = new Date("2026-11-08T17:00:00Z");

/** Every document the suites start from. `over` adds or replaces whole documents. */
export function eventSurveySeed(over = {}) {
  const seed = checkInSeed();
  seed["users/lloyd"] = {
    uid: "lloyd",
    email: "lloyd@example.com",
    displayName: "Lloyd Ames",
    role: "admin",
    suRecognised: true,
    profile: { preferredName: "Lloyd" },
  };
  seed["eventCheckIns/ci-kofi"] = checkIn({ rsvpId: RSVP.kofi, uid: "kofi", how: "qr", byUid: null, at: new Date("2026-11-01T14:05:00Z") });
  seed["eventCheckIns/ci-gwen"] = checkIn({ rsvpId: RSVP.gwen });
  seed["eventCheckIns/ci-wren"] = checkIn({ rsvpId: RSVP.wren, uid: "wren" });
  seed["eventCheckIns/ci-mo"] = checkIn({ kind: "walk-in", uid: "mo", name: "Mo Rahman", how: "qr", byUid: null });
  seed["eventCheckIns/ci-rosa"] = checkIn({ kind: "walk-in", name: "Rosa Martinez", email: "rosa@example.com", emailGoesAt: WEEK_ON });
  seed["eventCheckIns/ci-dan"] = checkIn({ kind: "walk-in", name: "Dan Fitzgerald" });
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

export async function makeEventSurveyWorld(key = "__eventSurveys") {
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const made = makeWorld(key, [
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
        "export function usePathname() { return '/'; }\n" +
        "export function useSearchParams() { return new URLSearchParams(); }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, prefetch, scroll, ...rest }) =>\n" +
        `  ${handle}.h('a', { href, className, ...rest }, children);`,
    ],
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    ["@/auth/signInWithGoogle", "export async function signOut() {}"],
    ["@/lib/navigation/hardNavigate", "export function hardNavigate() {}"],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  const { world, loadTs, call } = made;
  world.h = createElement;

  const loaded = new Map();
  /** A module under `src/`, loaded once. */
  async function load(path) {
    if (!loaded.has(path)) loaded.set(path, await loadTs(join(...path.split("/"))));
    return loaded.get(path);
  }
  const route = (path) => load(`app/api/${path}/route.ts`);

  function reset(seed = eventSurveySeed()) {
    made.reset(seed, { now: () => new Date() });
  }

  const docs = (prefix) =>
    world.db
      .paths()
      .filter((path) => path.startsWith(prefix))
      .map((path) => ({ path, ...world.db.read(path) }));
  const surveyIds = () => docs("surveys/").map((row) => row.path.slice("surveys/".length));
  const survey = (id) => world.db.read(`surveys/${id}`);
  const people = (id) => docs("surveyPeople/").filter((row) => row.surveyId === id);
  const answers = (id) => docs("surveyAnswers/").filter((row) => row.surveyId === id);
  /** A person's row: by uid for an account, by sign-up or check-in id for a guest. */
  const rowOf = (id, who) =>
    people(id).find((row) => row.respondent?.uid === who || row.respondent?.signupId === who) ?? null;

  /** An admin makes the event's survey. Answers the route's response. */
  async function make(who = "zach", body = {}) {
    return call(who, (await route("surveys")).POST, {}, {
      body: { template: "event", eventId: EVENT_ID, audience: "came", closesOn: CLOSES_ON, ...body },
    });
  }

  /** Every message the mail door was handed, read as the person it went to would read it. */
  const mailText = () =>
    world.mail.map((message) => ({
      to: message.to,
      subject: message.subject,
      kind: message.kind,
      surface: message.surface,
      text: textOf(renderToStaticMarkup(message.react)),
    }));

  /** The link in a message's button: the last https address in it. */
  const linkIn = (message) => {
    const found = renderToStaticMarkup(message.react).match(/href="(https:\/\/naisi\.invalid\/survey\/[A-Za-z0-9_-]{43})"/);
    return found ? found[1] : null;
  };

  /** A page's words, rendered as the server would render it for `who`; a redirect is answered by where it went. */
  async function page(path, props, who = null, { viewAs = false } = {}) {
    const loadedPage = await load(path);
    world.user = made.sessionOf(who);
    world.viewAs = viewAs;
    try {
      const element = await loadedPage.default(props);
      const html = renderToStaticMarkup(element);
      return { html, text: textOf(html), to: null };
    } catch (err) {
      if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
      throw err;
    } finally {
      world.viewAs = false;
    }
  }

  return {
    ...made,
    load,
    route,
    reset,
    surveyIds,
    survey,
    people,
    answers,
    rowOf,
    make,
    mailText,
    linkIn,
    page,
    createElement,
  };
}
