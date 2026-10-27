/**
 * The end of AGI Strategy's run, and its certificates, for the suites about
 * them (`tests/course-hub-certificates-*.test.mjs`; boards en-cert,
 * en-cert-phone, en-finish's Certificates section and en-after-phone's card).
 *
 * ## What it is made of
 *
 * Who finished's world (`tests/lib/finishWorld.mjs`: AGI Strategy names its
 * run, Claudia leads it, Lloyd reviews it, Yusuf is the run's track lead, Tess
 * leads another programme; four groups; every register of six weeks
 * finished, the last session over at 3pm on Wed 9 Dec), with:
 *
 *  - THE RULE for who finished at 4 sessions, so the lead's list says Amara,
 *    Dev, Chloe, Hamza and Yasmin finished (an admin's list adds Una, placed
 *    by an admin and never told), and Bea, Tariq, Farah, Kofi and Freya did
 *    not; Sam left;
 *  - THE TERM on the run ("Autumn 2026") and the course's CREDIT line
 *    ("based on the BlueDot Impact curriculum"), which both kinds carry;
 *  - the groups' FACILITATORS: Sofia (Groups A and B), Rahul (B), Tom (C) and
 *    Grace (D).
 *
 * ## What is real and what is stubbed
 *
 * Real: the certificate routes and pages, the libraries under them, the
 * Overview, the run home, and both deletion cascades. Stubbed: `server-only`,
 * `next/server`, the Admin SDK's sentinels and handle, the session, the
 * view-as guard and marker, the mail door (which records what it was asked
 * to send and answers as the suite says), `next/link`, `next/navigation`,
 * the client SDK and every stylesheet (by the specifiers the tree imports
 * them by). Every address is `example.com`; the site's own is
 * `https://naisi.invalid`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { CAST } from "./applicationsSmallTerm.mjs";
import { courseView } from "./courseRunStore.mjs";
import { A, AGI, B, BEFORE, C, COURSE, D, END, PEOPLE, ROUND, RULE, RUN, decision, decisionPath, finishSeed, rulePath } from "./finishWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { A, AGI, B, BEFORE, C, COURSE, D, END, PEOPLE, ROUND, RULE, RUN, decision, decisionPath, rulePath };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** The site's own address in every suite. */
export const APP_URL = "https://naisi.invalid";

/** Who finished under the rule, as the lead's list says. */
export const FINISHED = ["amara", "chloe", "dev", "hamza", "yasmin"];
/** Who did not finish, and is never told. */
export const NOT_FINISHED = ["bea", "farah", "freya", "kofi", "tariq"];
/** Who facilitated a group: Sofia has two, and gets one certificate. */
export const FACILITATORS = ["grace", "rahul", "sofia", "tom"];

/** The course's credit line, as it prints after the dot on both kinds. */
export const CREDIT = "based on the BlueDot Impact curriculum";

/** A certificate's path, as the send builds it. */
export const certificatePath = (uid, kind = "finished", runId = RUN.agi) => `courseCertificates/${runId}__${uid}__${kind}`;

/** The world every certificate suite starts from. `over` adds or replaces whole documents. */
export function certificateSeed(over = {}) {
  const seed = finishSeed();
  seed[rulePath] = RULE(4);
  seed[`courseRuns/${RUN.agi}`] = { ...seed[`courseRuns/${RUN.agi}`], cohort: { term: "autumn", year: 2026, number: 1 } };
  seed[`courses/${COURSE.agi}`] = { ...seed[`courses/${COURSE.agi}`], credit: CREDIT };
  return { ...seed, ...over };
}

/** A stored certificate, as the send leaves one, for a suite that needs one without sending. */
export function certificateDoc(uid, over = {}) {
  const kind = over.kind ?? "finished";
  const name = over.name ?? PEOPLE[uid]?.[0] ?? "Somebody Else";
  return {
    kind,
    code: over.code ?? "K7Q2M9XH4PWR3TDB",
    uid,
    runId: RUN.agi,
    linkOn: false,
    issuedAt: new Date("2026-12-14T10:00:00Z"),
    snapshot: {
      name,
      did: kind === "finished" ? "finished the" : "facilitated a group on the",
      programme: "AGI Strategy Fellowship",
      term: "Autumn 2026",
      weeks: "6 weeks",
      credit: CREDIT,
      issuedOn: "Mon 14 Dec 2026",
    },
    email: { state: "sent", at: new Date("2026-12-14T10:00:00Z") },
    ...over,
  };
}

const FIRESTORE_STUB =
  FIELD_VALUE_STUB.replace(
    "export class Timestamp {}",
    "export class Timestamp {" +
      " static now() { return new Date(); }" +
      " static fromDate(date) { return date; }" +
      " static fromMillis(ms) { return new Date(ms); }" +
      " }",
  ) +
  " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }";

const NEXT_SERVER_STUB =
  "export class NextResponse {\n" +
  "  constructor(body, init) {\n" +
  "    this.body = body;\n" +
  "    this.status = (init && init.status) || 200;\n" +
  "    this.headers = (init && init.headers) || {};\n" +
  "  }\n" +
  "  static json(body, init) { return new NextResponse(body, init); }\n" +
  "  async json() { return this.body; }\n" +
  "}";

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walk(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

/**
 * A world, its loaders and the ways a suite asks it. `key` names the handle on
 * `globalThis` the stubs read.
 */
export async function makeCertificateWorld(key = "__certificates") {
  const world = {
    db: null,
    courseDb: null,
    user: null,
    viewAs: false,
    /** What the mail door was asked to send, in order. */
    sent: [],
    /** How the mail door answers: "sent", "held", "suppressed", or "fail" (it throws). A function of the address may decide. */
    mailFate: "sent",
    /** A promise the mail door waits on before it answers, so a suite can hold a send open; null for none. */
    mailGate: null,
    ui: { hydrated: false },
    h: createElement,
  };
  globalThis[key] = world;
  const handle = `globalThis[${JSON.stringify(key)}]`;

  const mailDoor =
    "export async function sendEmail(args) {\n" +
    `  const world = ${handle};\n` +
    "  world.sent.push(args);\n" +
    "  if (world.mailGate) await world.mailGate;\n" +
    "  const fate = typeof world.mailFate === 'function' ? world.mailFate(args.to) : world.mailFate;\n" +
    "  if (fate === 'fail') throw new Error('the mail door refused');\n" +
    "  const to = Array.isArray(args.to) ? args.to : [args.to];\n" +
    "  return { messageId: 'm' + world.sent.length, delivered: fate === 'sent' ? to : [], suppressed: fate === 'suppressed' ? to : [], held: fate === 'held' ? to : [] };\n" +
    "}";

  const serverStubs = [
    ["server-only", "export {};"],
    ["next/server", NEXT_SERVER_STUB],
    ["firebase-admin/firestore", FIRESTORE_STUB],
    ["@/lib/firebase/admin", `export function getAdminDb() { return ${handle}.courseDb; }`],
    ["@/lib/firebase/session", `export async function getCurrentUser() { return ${handle}.user; }`],
    ["./session", `export async function getCurrentUser() { return ${handle}.user; }`],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {\n" +
        `  return ${handle}.viewAs ? { status: 403, body: { error: 'view-as' } } : null;\n` +
        "}\n" +
        "export async function getImpersonator() {\n" +
        `  return ${handle}.viewAs ? { actorUid: 'zach', actorName: 'Zach Levin' } : null;\n` +
        "}\n" +
        "export function markerIsLive(marker, currentUid) {\n" +
        "  return marker !== null && marker.actorUid !== currentUid;\n" +
        "}",
    ],
    ["@/lib/email/send", mailDoor],
    ["./send", mailDoor],
  ];
  const uiStubs = [
    ...serverStubs,
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useSelectedLayoutSegment() { return 'overview'; }\n" +
        "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\n" +
        "export function usePathname() { return '/'; }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, scroll, prefetch, ...rest }) =>\n" +
        `  ${handle}.h('a', { href, className, 'aria-label': rest['aria-label'], 'aria-current': rest['aria-current'] }, children);`,
    ],
    ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.ui.hydrated === true; }`],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
        .join("\n"),
    ],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ];
  const { loadTs } = createLoader({ stubs: new Map(serverStubs) });
  const { loadTs: loadUi } = createLoader({ stubs: new Map(uiStubs) });

  function reset(seed = certificateSeed()) {
    world.db = makeDb(seed, { now: () => new Date() });
    world.courseDb = courseView(world.db);
    world.user = null;
    world.viewAs = false;
    world.sent = [];
    world.mailFate = "sent";
    world.mailGate = null;
    world.ui = { hydrated: false };
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
    return world.db;
  }

  /** The session a request arrives with: the account as it is stored right now. */
  function sessionOf(uid) {
    if (!uid) return null;
    const account = world.db.read(`users/${uid}`);
    if (!account) return null;
    return {
      uid,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      suRecognised: account.suRecognised === true,
      admissionsReviewer: account.admissionsReviewer === true,
      permissions: CAST.zach.permissions,
    };
  }

  /** One request to a real handler, as `who`. Answers `{ status, body, headers }`; a handler that throws is a 599. */
  async function call(who, handler, params, { body, viewAs = false } = {}) {
    world.user = sessionOf(who);
    world.viewAs = viewAs;
    const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    try {
      const response = await handler(new Request(`${APP_URL}/api`, init), { params: Promise.resolve(params) });
      if (response instanceof Response) {
        const bytes = Buffer.from(await response.arrayBuffer());
        const type = response.headers.get("content-type") ?? "";
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: type.includes("application/json") ? JSON.parse(bytes.toString("utf8")) : null,
          bytes,
        };
      }
      return { status: response.status, headers: response.headers, body: structuredClone(response.body) };
    } catch (err) {
      return { status: 599, body: { error: String(err?.stack ?? err) } };
    } finally {
      world.viewAs = false;
    }
  }

  /** The whole database as one string, to prove a request wrote nothing. */
  const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

  /** Every certificate stored, by path. */
  const certificates = () =>
    Object.fromEntries(
      world.db
        .paths()
        .filter((path) => path.startsWith("courseCertificates/"))
        .sort()
        .map((path) => [path, world.db.read(path)]),
    );

  /** Render an element (or a server page's element) to its HTML and words. */
  function draw(element) {
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html) };
  }

  return { world, loadTs, loadUi, reset, call, sessionOf, everything, certificates, draw };
}

/** `[status, error]`, for comparing a refusal in one line. */
export const short = (response) => [response.status, response.body?.error ?? null];

/** HTML as the words a person reads. */
export const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
