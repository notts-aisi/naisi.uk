/**
 * A certificate's record (`courseCertificates`, `src/lib/courses/certificates/`):
 * its code, the words it keeps, the course's credit line it copies, and what
 * happens to it when its owner's account is deleted or its run is destroyed.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The privacy policy (version 7, "Certificates" and "Retention") is the
 * contract: the link is not guessable; the page shows the name, what they did,
 * the programme, the term, how many weeks and the issue day; a certificate
 * whose link is off goes with the account, and one whose link is on stays.
 * Both cascades are executed for real against the in-memory store.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL, CREDIT, END, RUN, certificateDoc, certificatePath, makeCertificateWorld } from "./lib/certificateWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeCertificateWorld("__certificateRecord");
const { world, reset, loadTs } = made;
const model = await loadTs(join("lib", "courses", "certificates", "model.ts"));
const code = await loadTs(join("lib", "courses", "certificates", "code.ts"));
const snapshot = await loadTs(join("lib", "courses", "certificates", "snapshot.ts"));
const dates = await loadTs(join("lib", "courses", "certificates", "dates.ts"));
const face = await loadTs(join("lib", "courses", "certificates", "face.ts"));
const courses = await loadTs(join("lib", "firestore", "courses.ts"));
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
});

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

describe("the code", () => {
  test("is sixteen characters of a 32-symbol alphabet with no I, L, O or U: 80 bits", () => {
    assert.equal(model.CODE_ALPHABET.length, 32);
    assert.equal(new Set(model.CODE_ALPHABET).size, 32);
    assert.doesNotMatch(model.CODE_ALPHABET, /[ILOU]/);
    assert.equal(model.CODE_LENGTH, 16);
    assert.ok(model.CODE_LENGTH * Math.log2(model.CODE_ALPHABET.length) >= 80, "a code must carry at least 80 bits");
  });

  test("a new code is always one, and two thousand of them never repeat", () => {
    const seen = new Set();
    for (let at = 0; at < 2000; at += 1) {
      const fresh = code.newCertificateCode();
      assert.equal(model.codeFrom(fresh), fresh, `${fresh} is not a code`);
      seen.add(fresh);
    }
    assert.equal(seen.size, 2000);
    // Every symbol turns up: the bytes map onto the alphabet with no gap.
    assert.equal(new Set([...seen].join("")).size, 32);
  });

  test("an address's code is read in capitals, and nothing else is forgiven", () => {
    assert.equal(model.codeFrom("k7q2m9xh4pwr3tdb"), "K7Q2M9XH4PWR3TDB");
    assert.equal(model.codeFrom(" K7Q2M9XH4PWR3TDB "), "K7Q2M9XH4PWR3TDB");
    for (const bad of ["K7Q2M9", "K7Q2M9XH4PWR3TD", "K7Q2M9XH4PWR3TDBB", "K7Q2M9XH4PWR3TDI", "K7Q2M9XH4PWR3TDL", "K7Q2M9XH4PWR3TDO", "K7Q2M9XH4PWR3TDU", "K7Q2M9XH4PWR3T-B", "K7Q2M9XH4PWR3T/B", "", null, 42, {}]) {
      assert.equal(model.codeFrom(bad), null, `${JSON.stringify(bad)} was taken for a code`);
    }
  });
});

// ---------------------------------------------------------------------------
// The stored certificate
// ---------------------------------------------------------------------------

describe("the stored certificate", () => {
  const id = `${RUN.agi}__amara__finished`;

  test("one a person may hold of a kind on a run, at an id built from all three", () => {
    assert.equal(model.certificateId(RUN.agi, "amara", "finished"), id);
    assert.equal(model.certificateId(RUN.agi, "rahul", "facilitated"), `${RUN.agi}__rahul__facilitated`);
  });

  test("is read whole, with every word it shows", () => {
    const read = model.normalizeCertificate(id, certificateDoc("amara"));
    assert.deepEqual(
      { ...read, issuedAt: read.issuedAt.toISOString(), email: read.email.state },
      {
        id,
        kind: "finished",
        code: "K7Q2M9XH4PWR3TDB",
        uid: "amara",
        runId: RUN.agi,
        linkOn: false,
        issuedAt: "2026-12-14T10:00:00.000Z",
        snapshot: {
          name: "Amara Okafor",
          did: "finished the",
          programme: "AGI Strategy Fellowship",
          term: "Autumn 2026",
          weeks: "6 weeks",
          credit: "based on the BlueDot Impact curriculum",
          issuedOn: "Mon 14 Dec 2026",
        },
        email: "sent",
      },
    );
  });

  test("is not read at all when it cannot be drawn whole, or is not what its id says", () => {
    const broken = [
      ["an unknown kind", certificateDoc("amara", { kind: "attended" })],
      ["a code in lower case", certificateDoc("amara", { code: "k7q2m9xh4pwr3tdb" })],
      ["a code too short", certificateDoc("amara", { code: "K7Q2M9" })],
      ["another person's id", certificateDoc("dev")],
      ["no name", certificateDoc("amara", { snapshot: { ...certificateDoc("amara").snapshot, name: " " } })],
      ["no term", certificateDoc("amara", { snapshot: { ...certificateDoc("amara").snapshot, term: "" } })],
      ["the wrong words for its kind", certificateDoc("amara", { snapshot: { ...certificateDoc("amara").snapshot, did: "facilitated a group on the" } })],
      ["a credit too long", certificateDoc("amara", { snapshot: { ...certificateDoc("amara").snapshot, credit: "x".repeat(81) } })],
      ["no snapshot", certificateDoc("amara", { snapshot: null })],
    ];
    for (const [what, data] of broken) assert.equal(model.normalizeCertificate(id, data), null, `${what} was read`);
    // A facilitator's carries the credit line too, as the boards draw it
    // since v20 (it was refused here while the board drew it without one),
    // or none when the course had none; a damaged one is refused on either
    // kind.
    const facilitatedId = `${RUN.agi}__rahul__facilitated`;
    const facilitated = certificateDoc("rahul", { kind: "facilitated", name: "Rahul Mehta" });
    assert.equal(model.normalizeCertificate(facilitatedId, facilitated).snapshot.credit, CREDIT);
    assert.equal(
      model.normalizeCertificate(facilitatedId, { ...facilitated, snapshot: { ...facilitated.snapshot, credit: null } }).snapshot.credit,
      null,
    );
    for (const credit of ["x".repeat(81), " ", 42]) {
      assert.equal(
        model.normalizeCertificate(facilitatedId, { ...facilitated, snapshot: { ...facilitated.snapshot, credit } }),
        null,
        `a facilitator's with the credit ${JSON.stringify(credit)} was read`,
      );
    }
  });

  test("once its owner or its run is gone, its id is history and it is still read", () => {
    assert.ok(model.normalizeCertificate(id, certificateDoc("amara", { uid: null, linkOn: true })));
    assert.ok(model.normalizeCertificate(id, certificateDoc("amara", { runId: null, linkOn: true })));
  });

  test("an email is owed again only when it failed, or a press claimed it and stopped", () => {
    const at = (minutesAgo) => new Date(END.getTime() - minutesAgo * 60_000);
    assert.equal(model.emailOwed({ state: "failed", at: at(1) }, END), true);
    for (const state of ["sent", "held", "suppressed"]) assert.equal(model.emailOwed({ state, at: at(1) }, END), false, state);
    assert.equal(model.emailOwed({ state: "sending", at: at(1) }, END), false, "a press still running");
    assert.equal(model.emailOwed({ state: "sending", at: at(10) }, END), true, "a press that stopped");
    assert.equal(model.emailOwed({ state: "sending", at: null }, END), true);
  });
});

// ---------------------------------------------------------------------------
// The words a certificate keeps
// ---------------------------------------------------------------------------

describe("the snapshot", () => {
  const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` }));
  const input = (over = {}) => ({
    kind: "finished",
    account: { displayName: "Amara Okafor", profile: { preferredName: "Amara" } },
    programme: { name: "AGI Strategy Fellowship" },
    run: { cohort: { term: "autumn", year: 2026, number: 1 }, weekPlan: SIX_WEEKS },
    formLabel: "Autumn 2026",
    credit: "based on the BlueDot Impact curriculum",
    now: new Date("2026-12-14T10:00:00Z"),
    ...over,
  });

  test("a finished certificate says the board's words, from records", () => {
    assert.deepEqual(snapshot.writeSnapshot(input()), {
      ok: true,
      snapshot: {
        name: "Amara Okafor",
        did: "finished the",
        programme: "AGI Strategy Fellowship",
        term: "Autumn 2026",
        weeks: "6 weeks",
        credit: "based on the BlueDot Impact curriculum",
        issuedOn: "Mon 14 Dec 2026",
      },
    });
  });

  test("a facilitator's says what they did and carries the course's credit line too", () => {
    const out = snapshot.writeSnapshot(input({ kind: "facilitated", account: { displayName: "Rahul Mehta" } }));
    assert.equal(out.snapshot.did, "facilitated a group on the");
    assert.equal(out.snapshot.credit, "based on the BlueDot Impact curriculum");
    assert.equal(out.snapshot.name, "Rahul Mehta");
    assert.equal(snapshot.writeSnapshot(input({ kind: "facilitated", account: { displayName: "Rahul Mehta" }, credit: "" })).snapshot.credit, null);
  });

  test("the term is the run's, else the form's name; with neither it is not written", () => {
    assert.equal(snapshot.writeSnapshot(input({ run: { cohort: null, weekPlan: SIX_WEEKS }, formLabel: "Spring 2027" })).snapshot.term, "Spring 2027");
    assert.deepEqual(snapshot.writeSnapshot(input({ run: { cohort: null, weekPlan: SIX_WEEKS }, formLabel: " " })), {
      ok: false,
      reason: "the course run has no term, and its form has no name",
    });
  });

  test("the weeks are the run's teaching weeks, breaks left out; a run with none is not written", () => {
    const withBreak = [...SIX_WEEKS.slice(0, 3), { kind: "break", label: "Reading week" }, ...SIX_WEEKS.slice(3)];
    assert.equal(snapshot.writeSnapshot(input({ run: { cohort: null, weekPlan: withBreak } })).snapshot.weeks, "6 weeks");
    assert.equal(snapshot.writeSnapshot(input({ run: { cohort: null, weekPlan: SIX_WEEKS.slice(0, 1) } })).snapshot.weeks, "1 week");
    assert.deepEqual(snapshot.writeSnapshot(input({ run: { cohort: null, weekPlan: [] } })), { ok: false, reason: "the course run has no weeks" });
  });

  test("the name is the account's whole name, never a placeholder", () => {
    assert.equal(snapshot.writeSnapshot(input({ account: { profile: { preferredName: "Amara" } } })).snapshot.name, "Amara");
    assert.deepEqual(snapshot.writeSnapshot(input({ account: { displayName: " ", profile: {} } })), { ok: false, reason: "their account has no name" });
    assert.deepEqual(snapshot.writeSnapshot(input({ programme: { name: "" } })), { ok: false, reason: "the programme has no name" });
  });

  test("the credit line is left out when the course has none", () => {
    assert.equal(snapshot.writeSnapshot(input({ credit: "" })).snapshot.credit, null);
    assert.equal(snapshot.writeSnapshot(input({ credit: "x".repeat(81) })).snapshot.credit, null);
  });

  test("the issue day is London's, with a three-letter month", () => {
    // Half past midnight on Mon 14 Dec in London is still Mon 14 Dec in UTC;
    // half past midnight on Mon 14 Sep in London is Sun 13 Sep in UTC.
    assert.equal(dates.issuedOnWords(new Date("2026-12-14T00:30:00Z")), "Mon 14 Dec 2026");
    assert.equal(dates.issuedOnWords(new Date("2026-09-13T23:30:00Z")), "Mon 14 Sep 2026");
    assert.equal(dates.issuedShortWords(new Date("2026-09-13T23:30:00Z")), "Mon 14 Sep");
    assert.deepEqual(dates.issuedYearMonth(new Date("2026-12-31T23:30:00Z")), { year: 2026, month: 12 });
    assert.deepEqual(dates.issuedYearMonth(new Date("2026-08-31T23:30:00Z")), { year: 2026, month: 9 });
  });
});

describe("the drawing's words", () => {
  const stored = model.normalizeCertificate(`${RUN.agi}__amara__finished`, certificateDoc("amara"));

  test("a finished certificate: the eyebrow, the meta line and, while the link is on, where to check it", () => {
    assert.deepEqual(face.faceOf("finished", stored.snapshot, { host: "naisi.uk", code: stored.code }), {
      kind: "finished",
      label: "Certificate for Amara Okafor",
      eyebrow: "Certificate · Autumn 2026",
      name: "Amara Okafor",
      did: "finished the",
      programme: "AGI Strategy Fellowship",
      meta: "6 weeks · based on the BlueDot Impact curriculum",
      issued: "Issued on Mon 14 Dec 2026 by NAISI, the AI safety student community at the University of Nottingham.",
      check: "Check it at naisi.uk/c/K7Q2M9XH4PWR3TDB",
    });
    assert.equal(face.faceOf("finished", stored.snapshot, null).check, null);
  });

  test("a facilitator's: no eyebrow, the term and then the credit line in the meta line", () => {
    const rahul = model.normalizeCertificate(`${RUN.agi}__rahul__facilitated`, certificateDoc("rahul", { kind: "facilitated", name: "Rahul Mehta" }));
    const drawn = face.faceOf("facilitated", rahul.snapshot, null);
    assert.equal(drawn.eyebrow, null);
    assert.equal(drawn.did, "facilitated a group on the");
    assert.equal(drawn.meta, "Autumn 2026 · 6 weeks · based on the BlueDot Impact curriculum");
    // With no credit line, neither kind draws its dot.
    assert.equal(face.faceOf("facilitated", { ...rahul.snapshot, credit: null }, null).meta, "Autumn 2026 · 6 weeks");
    assert.equal(face.faceOf("finished", { ...stored.snapshot, credit: null }, null).meta, "6 weeks");
  });

  test("the address is the site's own", () => {
    assert.equal(face.siteHost(APP_URL), "naisi.invalid");
    assert.equal(face.siteHost(undefined), "naisi.uk");
    assert.equal(face.certificateUrl(APP_URL, "K7Q2M9XH4PWR3TDB"), "https://naisi.invalid/c/K7Q2M9XH4PWR3TDB");
    assert.equal(face.certificateAddress("https://naisi.uk", "K7Q2M9XH4PWR3TDB"), "naisi.uk/c/K7Q2M9XH4PWR3TDB");
  });
});

// ---------------------------------------------------------------------------
// The course's credit line (C45)
// ---------------------------------------------------------------------------

describe("the course's credit line", () => {
  test("is a record on the course: trimmed, and none when absent or too long", () => {
    assert.equal(
      courses.normalizeCourse("c", { title: "T", credit: "  based on the BlueDot Impact curriculum " }).credit,
      "based on the BlueDot Impact curriculum",
    );
    assert.equal(courses.normalizeCourse("c", { title: "T" }).credit, "");
    assert.equal(courses.normalizeCourse("c", { title: "T", credit: "x".repeat(81) }).credit, "");
    assert.equal(courses.COURSE_FIELD_LIMITS.credit, model.CERTIFICATE_LIMITS.credit);
  });

  test("has its setting on the course's page, saved with the course's details", () => {
    const editor = readFileSync(join(SRC, "features", "courses", "CourseEditor.tsx"), "utf8");
    assert.match(editor, /label="Credit on certificates"/);
    assert.match(editor, /onChange=\{\(e\) => patch\(\{ credit: e\.target\.value \}\)\}\s*maxLength=\{COURSE_FIELD_LIMITS\.credit\}/);
    // Saved beside the course's other details (the day-before time joined
    // them between the weekly hours and the credit when the two met).
    assert.match(editor, /estimatedWeeklyHours: hours,\s*dayBeforeDueTime,\s*credit,/);
    // The hint shows the boards' words, after the dot, so it is typed as it prints.
    assert.match(editor, /as in “6 weeks · based on the BlueDot Impact curriculum”, so start it as it reads there\./);
    const mutations = readFileSync(join(SRC, "features", "courses", "courseMutations.ts"), "utf8");
    assert.match(mutations, /out\.credit = capped\(patch\.credit, COURSE_FIELD_LIMITS\.credit\);/);
  });
});

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/** The store, with `count()` on every query, answered by counting what the query returns. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

/** Four certificates on the run (two links on), one on another run, and markers. */
function seedCertificates() {
  world.db.seed(certificatePath("amara"), certificateDoc("amara", { code: "AAAAAAAAAAAAAAAA" }));
  world.db.seed(certificatePath("dev"), certificateDoc("dev", { code: "BBBBBBBBBBBBBBBB", linkOn: true }));
  world.db.seed(certificatePath("sofia", "facilitated"), certificateDoc("sofia", { kind: "facilitated", name: "Sofia Rossi", code: "CCCCCCCCCCCCCCCC" }));
  world.db.seed(certificatePath("rahul", "facilitated"), certificateDoc("rahul", { kind: "facilitated", name: "Rahul Mehta", code: "DDDDDDDDDDDDDDDD", linkOn: true }));
  world.db.seed(certificatePath("amara", "finished", "another-run"), certificateDoc("amara", { code: "EEEEEEEEEEEEEEEE", runId: "another-run" }));
  world.db.seed(`courseNudges/certificatestest__${RUN.agi}__amara`, { kind: "certificates-test", runId: RUN.agi, byUid: "amara", at: END });
  world.db.seed(`courseNudges/certificatespress__${RUN.agi}`, { kind: "certificates-press", runId: RUN.agi, byUid: "amara", token: "t", claimedAtMs: END.getTime() });
  // Another feature's marker that names Amara: not this sweep's.
  world.db.seed(`courseNudges/teamstest__${RUN.agi}__amara`, { kind: "teams-test", runId: RUN.agi, byUid: "amara", at: END });
}

describe("an account that is deleted", () => {
  test("its certificates whose link is off go, on every run, with its send markers", async () => {
    seedCertificates();
    assert.deepEqual(await accountDeletion.clearCourseCertificates(world.courseDb, "amara"), { deleted: 2, kept: 0 });
    assert.equal(world.db.read(certificatePath("amara")), undefined);
    assert.equal(world.db.read(certificatePath("amara", "finished", "another-run")), undefined);
    assert.equal(world.db.read(`courseNudges/certificatestest__${RUN.agi}__amara`), undefined);
    assert.equal(world.db.read(`courseNudges/certificatespress__${RUN.agi}`), undefined);
    assert.ok(world.db.read(`courseNudges/teamstest__${RUN.agi}__amara`), "another feature's marker was taken");
    for (const uid of ["dev", "sofia"]) assert.ok(world.db.read(certificatePath(uid, uid === "sofia" ? "facilitated" : "finished")), `${uid}'s was taken`);
  });

  test("one whose link is on stays, without its owner, showing what it was issued with", async () => {
    seedCertificates();
    const before = world.db.read(certificatePath("dev"));
    assert.deepEqual(await accountDeletion.clearCourseCertificates(world.courseDb, "dev"), { deleted: 0, kept: 1 });
    const after = world.db.read(certificatePath("dev"));
    assert.equal(after.uid, null);
    assert.ok(after.ownerGoneAt instanceof Date);
    assert.deepEqual([after.linkOn, after.code, after.snapshot], [true, before.code, before.snapshot]);
    assert.ok(model.normalizeCertificate(`${RUN.agi}__dev__finished`, after), "it can no longer be drawn");
  });

  test("the cascade runs the sweep in a step of its own, counts both, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseCertificatesDeleted: number;/m);
    assert.match(source, /^\s*courseCertificatesKept: number;/m);
    assert.match(
      source,
      /try \{\s*const certificates = await clearCourseCertificates\(db, uid\);\s*summary\.courseCertificatesDeleted = certificates\.deleted;\s*summary\.courseCertificatesKept = certificates\.kept;\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
  });
});

describe("a run that is destroyed", () => {
  test("its manifest counts the certificates that go and the ones that stay", async () => {
    seedCertificates();
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const counts = await courseDeletion.countRunDestroyTargets(
      counting(world.courseDb),
      courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)),
    );
    assert.deepEqual([counts.certificates, counts.certificatesKept], [2, 2]);
  });

  test("the destroy deletes those whose link is off and keeps those whose link is on, losing their run", async () => {
    seedCertificates();
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const before = world.db.read(certificatePath("rahul", "facilitated"));
    const result = await courseDeletion.destroyRunCascade(counting(world.courseDb), null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.deepEqual([result.deleted.certificates, result.deleted.certificatesKept], [2, 2]);
    assert.equal(world.db.read(certificatePath("amara")), undefined);
    assert.equal(world.db.read(certificatePath("sofia", "facilitated")), undefined);
    for (const [uid, kind] of [["dev", "finished"], ["rahul", "facilitated"]]) {
      const kept = world.db.read(certificatePath(uid, kind));
      assert.equal(kept.runId, null, `${uid}'s still names the run`);
      assert.ok(kept.runGoneAt instanceof Date);
      assert.equal(kept.linkOn, true);
      assert.ok(model.normalizeCertificate(`${RUN.agi}__${uid}__${kind}`, kept), `${uid}'s can no longer be drawn`);
    }
    assert.deepEqual(world.db.read(certificatePath("rahul", "facilitated")).snapshot, before.snapshot);
    assert.ok(world.db.read(certificatePath("amara", "finished", "another-run")), "another run's certificate was taken");
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`), undefined, "the run itself is still there");
  });

  test("the certificates drain with the run's leaves, before the enrolments, and the dialog names both fates", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.indexOf("finishing") < order.indexOf("certificates") && order.indexOf("certificates") < order.indexOf("enrolments"));
    assert.match(table, /drain: \(\) => drainCertificates\(db, runId, budget, totals\),/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /certificates: \{\s*label: "Certificates whose link is off",\s*fate: "destroyed",/);
    assert.match(dialog, /certificatesKept: \{\s*label: "Certificates whose link is on",\s*fate: "orphaned",/);
  });
});
