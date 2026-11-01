/**
 * The world the check-in suites run in: one event, its sign-ups, the people
 * who run it and the people who come, short links, and the real routes and
 * pages of the QR codes, the door code, the door list, self check-in, walk-ins
 * and the event page's tabs.
 *
 * ## The event
 *
 * VR GAMES NIGHT, published, Sun 1 Nov 2026 from 2pm to 5pm London time (GMT
 * that day), 30 places, run by Iris (committee, NOT recognised by the SU) with
 * Cal as a collaborator. The door's hours are an hour before the start to an
 * hour after the end: 1pm to 6pm.
 *
 * As every event starts: people cannot check themselves in (no `selfCheckIn`)
 * and the door has not been opened. A suite turns either on with
 * `withEvent(SELF_ON, DOOR_OPEN)`: the switch, and the door as the door route
 * leaves it, opened by Iris at 1:05pm (`OPENED_AT`). `withDropIn(...)` makes
 * it an event with no sign-up, whose sign-ups are all another event's.
 *
 * Sign-ups: Kofi (a member, confirmed), Chloe (a member, confirmed), Gwen (a
 * guest with no account, confirmed), Wren (a member on the waiting list), Pat
 * (a member, pending review), Cora (a member who cancelled), Dina (a member,
 * denied) and one synthetic test sign-up, which never reaches a door list.
 * Mo is a member who did not sign up.
 *
 * ## The people
 *
 * `zach` an admin; `sue` SU-recognised committee; `iris` committee not
 * recognised (the event's author); `cal` committee not recognised (a
 * collaborator); `kofi`, `chloe`, `wren`, `pat`, `cora`, `dina` and `mo`
 * members. `ines` is a pending account. Signed out is `null`. View-as is
 * `world.viewAs()`: the session is the member's and the marker is live.
 *
 * ## Real and stubbed
 *
 * Real: every handler and page a suite loads and the libraries behind them,
 * the QR library and the PNG writer. Stubbed: `server-only`, `next/server`
 * (a response that keeps its status, headers and body), the Admin SDK handle
 * (the in-memory store of `applicationsStore.mjs`), the session, the view-as
 * guard, Next's navigation and link, the hydration hook (reads "not yet", as a
 * page first arrives) and the stylesheets. Every address is `example.com`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { walkSource } from "./functionScan.mjs";
import { createLoader } from "./tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

export const EVENT_ID = "vr-games-night-ev01";
/** Sun 1 Nov 2026, 2pm to 5pm in London, which is GMT that day. */
export const START = new Date("2026-11-01T14:00:00Z");
export const END = new Date("2026-11-01T17:00:00Z");
/** 2:05pm on the night: the door list is open. */
export const DURING = new Date("2026-11-01T14:05:00Z");
/** Mon 26 Oct: a week before, the door list is not open yet. */
export const BEFORE = new Date("2026-10-26T12:00:00Z");
/** Tue 3 Nov: after the door list closed, before a week has passed. */
export const AFTER = new Date("2026-11-03T10:00:00Z");
/** Mon 9 Nov: more than a week after the event. */
export const WEEK_LATER = new Date("2026-11-09T10:00:00Z");
/** 1:05pm on the night: Iris, the event's author, opened the door. */
export const OPENED_AT = new Date("2026-11-01T13:05:00Z");

/** The door, opened by Iris at 1:05pm, as the door route leaves it. */
export const DOOR_OPEN = { doorOpenedAt: OPENED_AT, doorOpenedBy: "iris" };
/** An event that lets people check themselves in. */
export const SELF_ON = { selfCheckIn: true };

export const ORIGIN = "https://naisi.uk";

/** A session as `getCurrentUser` returns one. */
export function person(uid, role, displayName, extra = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName,
    role,
    suRecognised: false,
    permissions: {},
    policyVersion: null,
    ...extra,
  };
}

export const PEOPLE = {
  zach: person("zach", "admin", "Zach Levin", { suRecognised: true }),
  sue: person("sue", "committee", "Sue Park", { suRecognised: true }),
  iris: person("iris", "committee", "Iris Walker"),
  cal: person("cal", "committee", "Cal Reed"),
  kofi: person("kofi", "member", "Kofi Asante"),
  chloe: person("chloe", "member", "Chloe Nguyen"),
  wren: person("wren", "member", "Wren Hale"),
  pat: person("pat", "member", "Pat Ellis"),
  cora: person("cora", "member", "Cora Lind"),
  dina: person("dina", "member", "Dina Shah"),
  mo: person("mo", "member", "Mo Rahman"),
  ines: person("ines", "pending", "Ines Duarte"),
};

export function eventDoc(extra = {}) {
  return {
    title: "VR games night",
    blocks: [],
    startAt: START,
    endAt: END,
    location: "Room B52",
    locationHidden: false,
    locationPublicText: "",
    visibility: "public",
    capacity: 30,
    waitlistEnabled: true,
    noSignup: false,
    signupForm: [],
    status: "published",
    archived: false,
    authorUid: "iris",
    authorDisplayName: "Iris Walker",
    collaboratorUids: ["cal"],
    rsvpCountPending: 1,
    rsvpCountConfirmed: 3,
    rsvpCountWaitlisted: 1,
    createdAt: new Date("2026-10-10T10:00:00Z"),
    updatedAt: new Date("2026-10-10T10:00:00Z"),
    ...extra,
  };
}

export function rsvp(id, status, name, email, uid, extra = {}) {
  return {
    eventId: EVENT_ID,
    uid,
    name,
    email,
    answers: {},
    status,
    synthetic: false,
    decisionNote: null,
    decidedBy: null,
    decidedAt: null,
    pendingAnswers: null,
    signupSnapshot: null,
    createdAt: new Date("2026-10-12T10:00:00Z"),
    cancelledAt: null,
    ...extra,
  };
}

export const RSVP = {
  kofi: "rsvp-kofi",
  chloe: "rsvp-chloe",
  gwen: "rsvp-gwen",
  wren: "rsvp-wren",
  pat: "rsvp-pat",
  cora: "rsvp-cora",
  dina: "rsvp-dina",
  test: "rsvp-test",
};

/** The seed's event with each of `extras` on it, as the one document `reset` replaces. */
export function withEvent(...extras) {
  return { [`events/${EVENT_ID}`]: eventDoc(Object.assign({}, ...extras)) };
}

/**
 * The seed's event as one with no sign-up (`noSignup`), each of `extras` on
 * it, and every sign-up moved to another event: a drop-in made as one has
 * none, so nobody at it holds a place or was sent a confirmation.
 */
export function withDropIn(...extras) {
  const over = withEvent({ noSignup: true }, ...extras);
  const seed = checkInSeed();
  for (const id of Object.values(RSVP)) {
    over[`eventRsvps/${id}`] = { ...seed[`eventRsvps/${id}`], eventId: "another-event-ev02" };
  }
  return over;
}

/** Every document the suites start from. `over` adds or replaces whole documents. */
export function checkInSeed(over = {}) {
  const seed = {
    [`events/${EVENT_ID}`]: eventDoc(),
    [`eventRsvps/${RSVP.kofi}`]: rsvp(RSVP.kofi, "confirmed", "Kofi Asante", "kofi@example.com", "kofi"),
    [`eventRsvps/${RSVP.chloe}`]: rsvp(RSVP.chloe, "confirmed", "Chloe Nguyen", "chloe@example.com", "chloe"),
    [`eventRsvps/${RSVP.gwen}`]: rsvp(RSVP.gwen, "confirmed", "Gwen Price", "gwen@example.com", null),
    [`eventRsvps/${RSVP.wren}`]: rsvp(RSVP.wren, "waitlisted", "Wren Hale", "wren@example.com", "wren"),
    [`eventRsvps/${RSVP.pat}`]: rsvp(RSVP.pat, "pending", "Pat Ellis", "pat@example.com", "pat"),
    [`eventRsvps/${RSVP.cora}`]: rsvp(RSVP.cora, "cancelled", "Cora Lind", "cora@example.com", "cora"),
    [`eventRsvps/${RSVP.dina}`]: rsvp(RSVP.dina, "denied", "Dina Shah", "dina@example.com", "dina"),
    [`eventRsvps/${RSVP.test}`]: rsvp(RSVP.test, "confirmed", "Test Person", "test@example.com", null, {
      synthetic: true,
    }),
    "trackedLinks/poster": {
      slug: "poster",
      label: "General society poster",
      destination: "/links",
      type: "qr",
      campaign: "Freshers 2026",
      active: true,
      countOffsite: false,
      createdByUid: "zach",
      updatedByUid: "zach",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      updatedAt: new Date("2026-09-20T10:00:00Z"),
    },
    "trackedLinks/insta": {
      slug: "insta",
      label: "Instagram bio",
      destination: "https://www.instagram.com/example",
      type: "link",
      campaign: "",
      active: true,
      countOffsite: false,
      createdByUid: "zach",
      updatedByUid: "zach",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      updatedAt: new Date("2026-09-20T10:00:00Z"),
    },
  };
  for (const [uid, who] of Object.entries(PEOPLE)) {
    seed[`users/${uid}`] = {
      uid,
      email: who.email,
      displayName: who.displayName,
      role: who.role,
      suRecognised: who.suRecognised,
      profile: { preferredName: who.displayName.split(" ")[0] },
    };
  }
  return { ...seed, ...over };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
      found.add(specifier);
    }
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

const NEXT_SERVER_STUB = `
export class NextResponse {
  constructor(body, init = {}) {
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers ?? {});
    this.raw = body;
    this.body = null;
  }
  static json(body, init = {}) {
    const res = new NextResponse(null, init);
    res.body = body;
    return res;
  }
}
`;

export async function makeCheckInWorld(key = "__checkIn") {
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const world = {
    db: makeDb(checkInSeed(), { now: () => new Date() }),
    user: null,
    viewingAs: false,
    h: createElement,
  };
  globalThis[key] = world;
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;

  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["next/server", NEXT_SERVER_STUB],
      [
        "firebase-admin/firestore",
        FIELD_VALUE_STUB +
          " export class FieldPath { constructor(...segments) { this.segments = segments; }" +
          " static documentId() { return '__name__'; } }",
      ],
      [
        "@/lib/firebase/admin",
        `export const getAdminDb = () => ${handle}.db;\nexport const getAdminStorage = () => null;`,
      ],
      [
        "@/lib/firebase/session",
        `export const getCurrentUser = async () => (${handle}.user ? structuredClone(${handle}.user) : null);`,
      ],
      [
        "@/lib/firebase/impersonation",
        "export async function assertNotImpersonating() {\n" +
          `  if (!${handle}.viewingAs) return null;\n` +
          "  return { status: 403, headers: new Headers(), body: { error: 'Not while you are viewing as someone else.' } };\n" +
          "}\n" +
          `export async function getImpersonator() { return ${handle}.viewingAs ? { actorUid: 'zach' } : null; }\n` +
          "export function markerIsLive(marker, uid) { return !!marker && marker.actorUid !== uid; }",
      ],
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
      // The browser's own sign-out and navigation: never reached in a render.
      ["@/auth/signInWithGoogle", "export async function signOut() {}"],
      ["@/lib/navigation/hardNavigate", "export function hardNavigate() {}"],
      ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
    ]),
  });

  const loaded = new Map();
  /** A module under `src/`, loaded once. */
  async function load(path) {
    if (!loaded.has(path)) loaded.set(path, await loadTs(path));
    return loaded.get(path);
  }
  const routes = {
    qr: await load("app/api/links/[slug]/qr/route.ts"),
  };
  const pages = {
    sign: await load("app/signs/[slug]/page.tsx"),
  };

  /** Calls a handler as `who` (a key of PEOPLE, a session, or null for signed out). */
  async function call(handler, { as = null, params = {}, url = "https://internal.invalid/", body } = {}) {
    world.user = typeof as === "string" ? PEOPLE[as] : as;
    const req = {
      url,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => {
        if (body === undefined) throw new SyntaxError("no body");
        return structuredClone(body);
      },
    };
    return handler(req, { params: Promise.resolve(params) });
  }

  /**
   * Renders a server page as `who`. A redirect comes back as `{ redirect }`,
   * a page as `{ html, text }`.
   */
  async function render(page, { as = null, params = {}, searchParams = {} } = {}) {
    world.user = typeof as === "string" ? PEOPLE[as] : as;
    try {
      const element = await page.default({
        params: Promise.resolve(params),
        searchParams: Promise.resolve(searchParams),
      });
      const html = renderToStaticMarkup(element);
      return { html, text: textOf(html) };
    } catch (err) {
      if (err && err.message === "NEXT_REDIRECT") return { redirect: err.to };
      throw err;
    }
  }

  return {
    world,
    loadTs,
    load,
    routes,
    pages,
    call,
    render,
    /** Starts again from the seed, with `over` on top. */
    reset(over = {}) {
      world.db = makeDb(checkInSeed(over), { now: () => new Date() });
      world.viewingAs = false;
      world.user = null;
    },
    /** Every document, as one string: a call that changed nothing leaves it equal. */
    everything() {
      return JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
    },
  };
}
