/**
 * A certificate's page, `/c/<code>` (boards en-cert and en-cert-phone), and
 * the owner's switch (`PUT /api/courses/certificates/[code]`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The privacy policy (version 7, "Certificates") is the contract: a
 * certificate starts private, only its owner can open it until they turn its
 * link on, anyone holding the link can then open it, the link is not
 * guessable, the page is listed nowhere, and it shows no email address, no
 * photo and nobody else's name. The real page is rendered as every kind of
 * caller (its owner, a stranger signed in, somebody signed out, the
 * programme's lead, another programme's lead, an admin, a facilitator, a
 * member who did not finish, and an admin viewing as the owner), and the real
 * route is called as each.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL, END, RUN, certificateDoc, certificatePath, makeCertificateWorld, short } from "./lib/certificateWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

mock.timers.enable({ apis: ["Date"], now: END });
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const made = await makeCertificateWorld("__certificatePage");
const { world, reset, loadTs, loadUi, call, sessionOf, everything, draw } = made;
const { default: CertificatePage, metadata } = await loadUi(join("app", "(public)", "c", "[code]", "page.tsx"));
const switchRoute = await loadTs(join("app", "api", "courses", "certificates", "[code]", "route.ts"));

/** Amara's finished certificate, and the one Rahul has for facilitating. */
const AMARA = "K7Q2M9XH4PWR3TDB";
const RAHUL = "R3H8T5VW2KQ9MZ4C";
/** A code nothing has. */
const NOBODY = "ZZZZZZZZZZZZZZZZ";

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(certificatePath("amara"), certificateDoc("amara", { code: AMARA }));
  world.db.seed(
    certificatePath("rahul", "facilitated"),
    certificateDoc("rahul", { kind: "facilitated", name: "Rahul Mehta", code: RAHUL }),
  );
});

/** The page, as `who` would be sent it. */
async function page(who, code, { viewAs = false } = {}) {
  world.user = sessionOf(who);
  world.viewAs = viewAs;
  try {
    return draw(await CertificatePage({ params: Promise.resolve({ code }) }));
  } finally {
    world.viewAs = false;
  }
}

const linkOn = (uid, kind = "finished") => world.db.poke(certificatePath(uid, kind), { linkOn: true });

/** The words every drawing of Amara's certificate shows. */
const AMARA_WORDS = [
  "Certificate · Autumn 2026",
  "Amara Okafor",
  "finished the",
  "AGI Strategy Fellowship",
  "6 weeks · based on the BlueDot Impact curriculum",
  "Issued on Mon 14 Dec 2026 by NAISI, the AI safety student community at the University of Nottingham.",
];
const CHECK = `Check it at naisi.invalid/c/${AMARA}`;
const OWNER_ONLY = ["Only you see this", "Download PDF", "Add to LinkedIn", "Anyone with the link can see it", "Copy link"];

const CALM = "There’s nothing to show at this address";
const CALM_BODY =
  "A certificate shows here only while its owner has its link turned on. If somebody sent you this address, ask them to turn its link on.";

/** Everybody but the owner who might open the page, signed in. */
const OTHERS = [
  ["a stranger who also finished", "dev"],
  ["a member who did not finish", "bea"],
  ["the programme's lead", "claudia"],
  ["another programme's lead", "tess"],
  ["an admin", "zach"],
  ["a facilitator of the owner's group", "sofia"],
];

// ---------------------------------------------------------------------------
// The owner
// ---------------------------------------------------------------------------

describe("to its owner", () => {
  test("with the link off: the certificate with no check line, and every control the board draws", async () => {
    const { html, text } = await page("amara", AMARA);
    for (const words of AMARA_WORDS) assert.ok(text.includes(words), `missing "${words}"`);
    for (const words of OWNER_ONLY) assert.ok(text.includes(words), `missing "${words}"`);
    assert.ok(!text.includes("Check it at"), "the check line shows only while the link is on");
    assert.ok(text.includes(`naisi.invalid/c/${AMARA}`), "the address over the certificate");
    assert.match(html, /<h1[^>]*>Amara Okafor<\/h1>/);
    assert.match(html, /role="group" aria-label="Certificate for Amara Okafor"/);
    // The switch is a real control, off, and waits for the page's script.
    const sw = html.match(/<input[^>]*role="switch"[^>]*>/)?.[0] ?? "";
    assert.ok(sw, "no switch");
    assert.doesNotMatch(sw, /checked/);
    assert.match(sw, /disabled/);
    assert.match(html, new RegExp(`href="/api/courses/certificates/${AMARA}/pdf" download`));
  });

  test("with the link on: the check line, and the switch on", async () => {
    linkOn("amara");
    const { html, text } = await page("amara", AMARA);
    assert.ok(text.includes(CHECK));
    for (const words of OWNER_ONLY) assert.ok(text.includes(words), `missing "${words}"`);
    assert.match(html.match(/<input[^>]*role="switch"[^>]*>/)?.[0] ?? "", /checked/);
  });

  test("Add to LinkedIn carries the title, the date and the link, and nothing else", async () => {
    const { html } = await page("amara", AMARA);
    const href = html.match(/href="(https:\/\/www\.linkedin\.com\/profile\/add\?[^"]+)"/)?.[1].replaceAll("&amp;", "&");
    assert.ok(href, "no LinkedIn link");
    const url = new URL(href);
    assert.deepEqual([...url.searchParams.keys()], ["startTask", "name", "issueYear", "issueMonth", "certUrl"]);
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      startTask: "CERTIFICATION_NAME",
      name: "AGI Strategy Fellowship",
      issueYear: "2026",
      issueMonth: "12",
      certUrl: `${APP_URL}/c/${AMARA}`,
    });
    assert.ok(!href.includes("Amara") && !href.includes("amara"), "the link names the person");
  });

  test("an address typed in small letters opens the same certificate", async () => {
    const { text } = await page("amara", AMARA.toLowerCase());
    assert.ok(text.includes("Amara Okafor") && text.includes("Only you see this"));
  });

  test("a facilitator's certificate: what they did, the term and the credit in its meta line, and no eyebrow", async () => {
    linkOn("rahul", "facilitated");
    const { text } = await page("rahul", RAHUL);
    for (const words of [
      "Rahul Mehta",
      "facilitated a group on the",
      "AGI Strategy Fellowship",
      "Autumn 2026 · 6 weeks · based on the BlueDot Impact curriculum",
      `Check it at naisi.invalid/c/${RAHUL}`,
      "Only you see this",
    ]) {
      assert.ok(text.includes(words), `missing "${words}"`);
    }
    assert.ok(!text.includes("Certificate · Autumn 2026"), "a facilitator's has no eyebrow");
  });

  test("somebody who holds both certificates opens each at its own address, with its own words and its own switch", async () => {
    // A facilitator who held a place and finished is sent both (v7). Amara
    // here facilitated as well as finished.
    world.db.seed(
      certificatePath("amara", "facilitated"),
      certificateDoc("amara", { kind: "facilitated", code: "F4C1X1TAT0R5AB2C" }),
    );
    const facilitatedCode = world.db.read(certificatePath("amara", "facilitated")).code;
    linkOn("amara", "facilitated");
    const finished = await page("amara", AMARA);
    const facilitated = await page("amara", facilitatedCode);
    assert.ok(finished.text.includes("finished the") && !finished.text.includes("facilitated a group on the"));
    assert.ok(facilitated.text.includes("facilitated a group on the") && !facilitated.text.includes("finished the"));
    assert.ok(!finished.text.includes("Check it at"), "the finished one's link is still off");
    assert.ok(facilitated.text.includes(`Check it at naisi.invalid/c/${facilitatedCode}`));
    // A stranger sees the one whose link is on, and the calm page for the other.
    assert.ok((await page("dev", facilitatedCode)).text.includes("facilitated a group on the"));
    assert.ok((await page("dev", AMARA)).text.includes(CALM));
  });
});

// ---------------------------------------------------------------------------
// Everybody else
// ---------------------------------------------------------------------------

describe("to anybody else", () => {
  for (const [who, uid] of [...OTHERS, ["somebody signed out", null]]) {
    test(`${who}: the certificate with its check line while the link is on, and nothing of the owner's`, async () => {
      linkOn("amara");
      const { html, text } = await page(uid, AMARA);
      for (const words of [...AMARA_WORDS, CHECK]) assert.ok(text.includes(words), `missing "${words}"`);
      for (const words of OWNER_ONLY) assert.ok(!text.includes(words), `"${words}" is the owner's`);
      assert.doesNotMatch(html, /role="switch"|\/pdf|linkedin/i);
    });

    test(`${who}: the calm page while the link is off`, async () => {
      const { text } = await page(uid, AMARA);
      assert.ok(text.includes(CALM) && text.includes(CALM_BODY));
      assert.ok(!text.includes("Amara"), "the calm page named the owner");
    });
  }

  test("an admin viewing as the owner is not the owner: the calm page while off, the public page while on", async () => {
    const off = await page("amara", AMARA, { viewAs: true });
    assert.ok(off.text.includes(CALM));
    linkOn("amara");
    const on = await page("amara", AMARA, { viewAs: true });
    assert.ok(on.text.includes(CHECK));
    for (const words of OWNER_ONLY) assert.ok(!on.text.includes(words), `"${words}" was shown during view-as`);
  });

  test("a certificate whose owner's account is gone, or whose run is gone, still shows while its link is on", async () => {
    world.db.poke(certificatePath("amara"), { linkOn: true, uid: null });
    assert.ok((await page(null, AMARA)).text.includes("Amara Okafor"));
    assert.ok(!(await page("amara", AMARA)).text.includes("Only you see this"), "nobody owns it now");
    world.db.poke(certificatePath("rahul", "facilitated"), { linkOn: true, runId: null });
    assert.ok((await page("dev", RAHUL)).text.includes("Rahul Mehta"));
  });
});

// ---------------------------------------------------------------------------
// One answer
// ---------------------------------------------------------------------------

describe("a link that is off, an unknown code and a malformed one give one answer", () => {
  const MALFORMED = ["K7Q2M9", "K7Q2M9XH4PWR3TDI", "../../users/amara", "%2F", "K7Q2M9XH4PWR3TDB0"];

  test("signed in: the same page, word for word and tag for tag", async () => {
    const off = (await page("dev", AMARA)).html;
    assert.equal((await page("dev", NOBODY)).html, off);
    for (const code of MALFORMED) assert.equal((await page("dev", code)).html, off, code);
    // The owner of another certificate learns nothing either.
    assert.equal((await page("rahul", AMARA)).html, off);
    assert.ok(!off.includes("sign in"), "a signed-in visitor is not asked to sign in");
  });

  test("signed out: the same page, offering to sign in and come back to the address typed", async () => {
    const asTyped = (html) => html.replace(/next=[^"]*/, "next=…");
    const off = await page(null, AMARA);
    assert.ok(off.text.includes("If it’s yours, sign in to see it."));
    assert.match(off.html, new RegExp(`href="/login\\?next=${encodeURIComponent(`/c/${AMARA}`)}"`));
    assert.equal(asTyped((await page(null, NOBODY)).html), asTyped(off.html));
    for (const code of MALFORMED) assert.equal(asTyped((await page(null, code)).html), asTyped(off.html), code);
  });

  test("two certificates that somehow share a code are neither of them shown", async () => {
    world.db.seed(certificatePath("dev"), certificateDoc("dev", { code: AMARA, linkOn: true }));
    linkOn("amara");
    assert.ok((await page("amara", AMARA)).text.includes(CALM));
    assert.ok((await page(null, AMARA)).text.includes(CALM));
  });

  test("a stored certificate that cannot be drawn whole is not drawn", async () => {
    world.db.poke(certificatePath("amara"), { linkOn: true, snapshot: { ...certificateDoc("amara").snapshot, name: "" } });
    assert.ok((await page("amara", AMARA)).text.includes(CALM));
  });
});

// ---------------------------------------------------------------------------
// What the page never shows, and where it is never listed
// ---------------------------------------------------------------------------

describe("what the page never shows", () => {
  /** Every name on the site's accounts but the owner's. */
  function namesBut(uid) {
    const names = new Set();
    for (const path of world.db.paths().filter((p) => p.startsWith("users/"))) {
      if (path === `users/${uid}`) continue;
      const account = world.db.read(path);
      for (const name of [account.displayName, account.profile?.preferredName]) {
        if (typeof name === "string" && name.trim()) {
          names.add(name.trim());
          names.add(name.trim().split(/\s+/)[0]);
        }
      }
    }
    return [...names];
  }

  test("no other name, no email address and no photo, to its owner or to anybody", async () => {
    linkOn("amara");
    const drawn = [await page("amara", AMARA), await page(null, AMARA), await page("claudia", AMARA)];
    const others = namesBut("amara");
    assert.ok(others.includes("Claudia") && others.includes("Sofia") && others.includes("Zach"), "the cast is not what this test thinks");
    for (const { html, text } of drawn) {
      for (const name of others) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), `the page names ${name}`);
      assert.doesNotMatch(text, /@/, "an email address");
      assert.doesNotMatch(html, /<img\b/, "a photo");
    }
  });

  test("it is never indexed", () => {
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(metadata.title, "Certificate");
  });

  test("no public page, the header, the footer or the sitemap links to a certificate", () => {
    const places = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|mdx?)$/.test(entry)) places.push(full);
      }
    };
    walk(join(SRC, "app", "(public)"));
    walk(join(SRC, "layout"));
    walk(join(SRC, "content"));
    places.push(join(SRC, "app", "sitemap.ts"), join(SRC, "app", "robots.ts"));
    const own = join(SRC, "app", "(public)", "c", "[code]");
    const offenders = places
      .filter((file) => !file.startsWith(own))
      .filter((file) => /["'`]\/c\/|\/c\/\$\{/.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file));
    assert.deepEqual(offenders, []);
    assert.ok(places.length > 20, "the walk found too few files to mean anything");
  });

  test("the page never calls notFound() and has no not-found page beside it", () => {
    const source = readFileSync(join(SRC, "app", "(public)", "c", "[code]", "page.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(source, /\bnotFound\s*\(/);
    assert.throws(() => statSync(join(SRC, "app", "(public)", "c", "[code]", "not-found.tsx")));
  });
});

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

describe("the owner's switch", () => {
  const put = (who, code, body, opts = {}) => call(who, switchRoute.PUT, { code }, { body, ...opts });

  test("turns the link on and off for its owner, and says what is stored", async () => {
    assert.deepEqual((await put("amara", AMARA, { linkOn: true })).body, { ok: true, linkOn: true });
    assert.equal(world.db.read(certificatePath("amara")).linkOn, true);
    assert.ok(world.db.read(certificatePath("amara")).linkChangedAt instanceof Date);
    assert.deepEqual((await put("amara", AMARA.toLowerCase(), { linkOn: false })).body, { ok: true, linkOn: false });
    assert.equal(world.db.read(certificatePath("amara")).linkOn, false);
  });

  test("anybody else, an unknown code and a malformed one are all told the same, and nothing is written", async () => {
    const before = everything();
    const answer = [404, "There’s no certificate here."];
    for (const [, uid] of OTHERS) assert.deepEqual(short(await put(uid, AMARA, { linkOn: true })), answer, uid);
    assert.deepEqual(short(await put("rahul", AMARA, { linkOn: true })), answer);
    assert.deepEqual(short(await put("amara", NOBODY, { linkOn: true })), answer);
    for (const code of ["K7Q2M9", "../x", ""]) assert.deepEqual(short(await put("amara", code, { linkOn: true })), answer, code);
    assert.equal(everything(), before);
  });

  test("signed out is asked to sign in, and a view-as session is turned away before anything is read", async () => {
    const before = everything();
    assert.equal((await put(null, AMARA, { linkOn: true })).status, 401);
    assert.equal((await put("amara", AMARA, { linkOn: true }, { viewAs: true })).status, 403);
    assert.equal(everything(), before);
  });

  test("a body that does not say on or off is a 400 with a sentence, before anything is read", async () => {
    for (const body of [{}, { linkOn: "true" }, { linkOn: 1 }, [], "nope"]) {
      const answer = await put("amara", AMARA, body);
      assert.equal(answer.status, 400, JSON.stringify(body));
    }
    assert.deepEqual(short(await put("amara", AMARA, { linkOn: null })), [400, "Say whether the link is on: true or false."]);
    assert.equal(world.db.read(certificatePath("amara")).linkOn, false);
  });

  test("a certificate whose owner is gone is nobody's to switch", async () => {
    world.db.poke(certificatePath("amara"), { linkOn: true, uid: null });
    assert.deepEqual(short(await put("amara", AMARA, { linkOn: false })), [404, "There’s no certificate here."]);
    assert.equal(world.db.read(certificatePath("amara")).linkOn, true);
  });

  test("the route asks who is calling before it reads a certificate", () => {
    const source = readFileSync(join(SRC, "app", "api", "courses", "certificates", "[code]", "route.ts"), "utf8");
    const at = (needle) => source.indexOf(needle);
    assert.ok(at("assertNotImpersonating()") > 0 && at("assertNotImpersonating()") < at("getCurrentUser()"));
    assert.ok(at("getCurrentUser()") < at("parseLinkSwitch(raw)") && at("parseLinkSwitch(raw)") < at("setCertificateLink("));
  });
});

// The run id the seeded certificates name, for a reader who wonders.
assert.equal(certificateDoc("amara").runId, RUN.agi);
