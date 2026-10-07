/**
 * The three decision-day emails, word for word.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * On decision day everybody who applied gets one of three emails: "You're in",
 * an invitation to something they did not pick, or a kind no. Three things
 * have to say the same words: the preview an admin reads before pressing Send,
 * the test they send themselves, and the email that goes out. All three are
 * drawn from one function, `composeDecisionEmail`, and that is what is
 * executed here, together with the three templates rendered for real.
 *
 * What is held:
 *
 *  1. THE DESIGN'S WORDS. Each default email is compared with the design, in
 *     full, for the three people the design drew.
 *  2. A PROGRAMME'S OWN WORDING replaces the subject and the body, and is
 *     rendered as text: nothing a lead types becomes markup. The greeting, the
 *     buttons and the sign-off stay.
 *  3. AN EMAIL CHANGES NOTHING BY BEING OPENED. Every button is a plain link
 *     to a page, with no answer in its address.
 *  4. NOBODY IS WAITLISTED OR REJECTED. No default email uses a word
 *     applicants never read, and none uses a dash for punctuation.
 *  5. THE SETTINGS PAGE AND THE SEND GIVE ONE ANSWER. A programme's settings
 *     page shows the subject each of its emails goes out under and tells a
 *     lead that an empty box keeps the standard wording for that part. The
 *     page's projection (`editor/views.ts`) and the composer are run against
 *     the same stored form and held to the same subject, for each email and
 *     each way a wording can be partly filled in, and the tree is walked for
 *     a second copy of a standard subject.
 *
 * Nothing is stubbed: the copy module and the settings projection are pure,
 * and the templates compile and render through the real
 * `@react-email/components`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const at = (file) => join("lib", "applications", file);

const copy = await loadTs(at(join("decisionDay", "emailCopy.ts")));
const editorViews = await loadTs(at(join("editor", "views.ts")));
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const normalise = await loadTs(at("normalise.ts"));
const words = await loadTs(at("words.ts"));
const AcceptedEmail = (await loadTs(join("emails", "ApplicationAcceptedEmail.tsx"))).default;
const InvitationEmail = (await loadTs(join("emails", "ApplicationInvitationEmail.tsx"))).default;
const NoOfferEmail = (await loadTs(join("emails", "ApplicationNoOfferEmail.tsx"))).default;

// ---------------------------------------------------------------------------
// The term the design drew
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";

const LINKS = {
  application: `https://staging.example.com/applications/${ROUND}`,
  events: "https://staging.example.com/events",
};

function programme(name, shortName, over = {}) {
  return {
    kind: "fellowship",
    name,
    shortName,
    starts: "w/c 26 Oct",
    places: 24,
    leadUid: "lead",
    reviewerUids: [],
    useScores: true,
    ...over,
  };
}

function formWith(overrides = {}, formFields = {}) {
  const programmes = {
    [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", overrides[AGI]),
    [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", overrides[TAIS]),
    [INC]: programme("Research incubator", "Research incubator", { kind: "incubator", ...overrides[INC] }),
  };
  return normalise.normaliseForm(ROUND, {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "deciding",
    programmeIds: [AGI, TAIS, INC],
    programmes,
    questionSetIds: [],
    ...formFields,
  });
}

const LEADS = { [AGI]: "Claudia", [TAIS]: "Zach", [INC]: "Zach" };

function compose(outcome, firstName, ranked, form = formWith(), extra = {}) {
  return copy.composeDecisionEmail({
    outcome,
    firstName,
    form,
    ranked,
    leadNames: LEADS,
    replyBy: "Sun 25 Oct",
    links: LINKS,
    ...extra,
  });
}

const labels = (email) => email.buttons.map((button) => button.label);

// ---------------------------------------------------------------------------
// 1. The design's words
// ---------------------------------------------------------------------------

describe("each email reads as the design wrote it", () => {
  test("You're in: Chloe, accepted onto AGI Strategy", () => {
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI]);
    assert.deepEqual(
      {
        kind: email.kind,
        subject: email.subject,
        greeting: email.greeting,
        paragraphs: email.paragraphs,
        buttons: labels(email),
        signOff: email.signOff,
      },
      {
        kind: "accepted",
        subject: "You’re in AGI Strategy",
        greeting: "Hi Chloe,",
        paragraphs: [
          "You’re in the AGI Strategy Fellowship. It starts w/c 26 Oct. You’ll be in a small group " +
            "with a facilitator, on campus, and we’ll email you your group and when it meets before you start.",
          "You don’t need to reply. If you’re coming, tap the button. It helps us plan groups. " +
            "If you can’t make it, tell us and we’ll give your place to someone else.",
        ],
        buttons: ["I’m coming", "I can’t make it"],
        signOff: { name: "Claudia", role: "AGI Strategy lead, NAISI" },
      },
    );
  });

  test("Invitation: Oliver, pooled from the incubator and invited to Technical AI Safety", () => {
    const email = compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC]);
    assert.deepEqual(
      {
        kind: email.kind,
        subject: email.subject,
        greeting: email.greeting,
        paragraphs: email.paragraphs,
        buttons: labels(email),
        signOff: email.signOff,
      },
      {
        kind: "invitation",
        subject: "An invitation to Technical AI Safety",
        greeting: "Hi Oliver,",
        paragraphs: [
          "Thanks for applying to the Research incubator. The pool was really strong and we don’t " +
            "have space for you this time, but we think you’d be a great fit for the Technical AI " +
            "Safety Fellowship instead.",
          "Accept your invitation by Sun 25 Oct to let us know you’re coming.",
        ],
        buttons: ["Accept your invitation", "No thanks"],
        signOff: { name: "Zach", role: "Technical AI Safety lead, NAISI" },
      },
    );
  });

  test("No offer this time: Hannah, who ranked AGI Strategy", () => {
    const email = compose({ kind: "no-offer" }, "Hannah", [AGI]);
    assert.deepEqual(
      {
        kind: email.kind,
        subject: email.subject,
        greeting: email.greeting,
        paragraphs: email.paragraphs,
        buttons: labels(email),
        signOff: email.signOff,
      },
      {
        kind: "no-offer",
        subject: "Your NAISI application",
        greeting: "Hi Hannah,",
        paragraphs: [
          "Thanks for applying. We can’t offer you a place this term.",
          "We’ll email you when applications next open. Our events are open to everyone, so come along to one.",
        ],
        buttons: ["See what’s on"],
        signOff: { name: "Claudia", role: "AGI Strategy lead, NAISI" },
      },
    );
  });

  test("the main action is the one filled button, and the kind no has an outline one", () => {
    const looks = (email) => email.buttons.map((button) => button.look);
    assert.deepEqual(looks(compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI])), ["primary", "quiet"]);
    assert.deepEqual(looks(compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC])), ["primary", "quiet"]);
    assert.deepEqual(looks(compose({ kind: "no-offer" }, "Hannah", [AGI])), ["outline"]);
  });
});

describe("the words follow the person and the programme", () => {
  test("somebody who ranked two programmes is thanked for both", () => {
    const email = compose({ kind: "invited", programmeId: TAIS }, "Rosa", [INC, AGI]);
    assert.match(
      email.paragraphs[0],
      /^Thanks for applying to the Research incubator and the AGI Strategy Fellowship\. /,
    );
  });

  test("a programme with no start written down says nothing about when", () => {
    const form = formWith({ [AGI]: { starts: "" } });
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI], form);
    assert.equal(
      email.paragraphs[0],
      "You’re in the AGI Strategy Fellowship. You’ll be in a small group with a facilitator, " +
        "on campus, and we’ll email you your group and when it meets before you start.",
    );
  });

  test("an invitation with no reply-by day still asks them to accept", () => {
    const email = compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC], formWith(), { replyBy: null });
    assert.equal(email.paragraphs[1], "Accept your invitation to let us know you’re coming.");
  });

  test("somebody with no name on file is still greeted", () => {
    assert.equal(compose({ kind: "no-offer" }, "  ", [AGI]).greeting, "Hi there,");
  });

  test("a programme with no lead signs as the society", () => {
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI], formWith(), {
      leadNames: { [AGI]: "" },
    });
    assert.deepEqual(email.signOff, { name: "NAISI", role: "" });
  });

  test("an outcome that names a programme the form no longer carries has no email", () => {
    assert.equal(compose({ kind: "accepted", programmeId: "gone" }, "Chloe", ["gone"]), null);
    assert.equal(compose({ kind: "invited", programmeId: "gone" }, "Chloe", [AGI]), null);
  });

  test("a list reads the way a person would say it", () => {
    assert.equal(copy.listInWords([]), "");
    assert.equal(copy.listInWords(["a"]), "a");
    assert.equal(copy.listInWords(["a", "b"]), "a and b");
    assert.equal(copy.listInWords(["a", "b", "c"]), "a, b and c");
  });
});

// ---------------------------------------------------------------------------
// 2. A programme's own wording
// ---------------------------------------------------------------------------

describe("a programme's own wording replaces the default subject and body", () => {
  const OWN = {
    subject: "You have a place on AGI Strategy",
    body: "First paragraph.\nSame paragraph, next line.\n\n\nSecond paragraph.",
  };

  test("the subject and the paragraphs are theirs; the greeting, buttons and sign-off stay", () => {
    const form = formWith({ [AGI]: { emailWording: { accepted: OWN } } });
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI], form);
    assert.equal(email.subject, "You have a place on AGI Strategy");
    assert.deepEqual(email.paragraphs, ["First paragraph.\nSame paragraph, next line.", "Second paragraph."]);
    assert.equal(email.greeting, "Hi Chloe,");
    assert.deepEqual(labels(email), ["I’m coming", "I can’t make it"]);
    assert.deepEqual(email.signOff, { name: "Claudia", role: "AGI Strategy lead, NAISI" });
  });

  test("each kind reads its own wording and nobody else's", () => {
    const form = formWith(
      {
        [AGI]: { emailWording: { accepted: OWN } },
        [TAIS]: { emailWording: { invitation: { subject: "Join Technical AI Safety", body: "Come along." } } },
      },
      { noOfferWording: { subject: "About your application", body: "Not this term." } },
    );
    // Technical AI Safety wrote no "You're in" wording, so its default stands.
    assert.equal(
      compose({ kind: "accepted", programmeId: TAIS }, "Sam", [TAIS], form).subject,
      "You’re in Technical AI Safety",
    );
    const invitation = compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC], form);
    assert.deepEqual([invitation.subject, invitation.paragraphs], ["Join Technical AI Safety", ["Come along."]]);
    const noOffer = compose({ kind: "no-offer" }, "Hannah", [AGI], form);
    assert.deepEqual([noOffer.subject, noOffer.paragraphs], ["About your application", ["Not this term."]]);
  });

  test("a wording with only a subject keeps the default body, and the other way round", () => {
    const subjectOnly = formWith({ [AGI]: { emailWording: { accepted: { subject: "Welcome", body: "" } } } });
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI], subjectOnly);
    assert.equal(email.subject, "Welcome");
    assert.match(email.paragraphs[0], /^You’re in the AGI Strategy Fellowship\./);

    const bodyOnly = formWith({ [AGI]: { emailWording: { accepted: { subject: "", body: "Hello." } } } });
    const other = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI], bodyOnly);
    assert.deepEqual([other.subject, other.paragraphs], ["You’re in AGI Strategy", ["Hello."]]);
  });

  test("a declined application that is emailed gets its 1st choice's own wording, or the kind no", () => {
    const plain = compose({ kind: "declined" }, "Zara", [AGI]);
    assert.equal(plain.kind, "no-offer");
    assert.deepEqual(plain.paragraphs, compose({ kind: "no-offer" }, "Zara", [AGI]).paragraphs);

    const form = formWith(
      { [AGI]: { emailWording: { declined: { subject: "Your application", body: "We could not take this one forward." } } } },
      { noOfferWording: { subject: "About your application", body: "Not this term." } },
    );
    const own = compose({ kind: "declined" }, "Zara", [AGI, TAIS], form);
    assert.deepEqual([own.subject, own.paragraphs], ["Your application", ["We could not take this one forward."]]);
    // Somebody whose 1st choice wrote nothing gets the form's "No offer this time".
    const fallback = compose({ kind: "declined" }, "Zara", [TAIS], form);
    assert.deepEqual([fallback.subject, fallback.paragraphs], ["About your application", ["Not this term."]]);
  });
});

// ---------------------------------------------------------------------------
// 3. The templates, rendered
// ---------------------------------------------------------------------------

describe("the templates render what was composed, as text", () => {
  test("You're in carries its words, both buttons and the sign-off", async () => {
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI]);
    const html = await render(AcceptedEmail({ email }));
    const text = await render(AcceptedEmail({ email }), { plainText: true });
    for (const piece of ["Hi Chloe,", ...email.paragraphs, "Claudia", "AGI Strategy lead, NAISI"]) {
      assert.ok(text.includes(piece), `the plain-text email is missing: ${piece}`);
    }
    assert.ok(html.includes("You’re in AGI Strategy"), "the subject heads the email");
    assert.equal(html.split(`href="${LINKS.application}"`).length - 1, 2, "both buttons open the application page");
    assert.ok(text.includes("I’m coming") && text.includes("I can’t make it"));
  });

  test("the invitation and the kind no render through their own templates", async () => {
    const invitation = compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC]);
    const invitationText = await render(InvitationEmail({ email: invitation }), { plainText: true });
    assert.ok(invitationText.includes("Accept your invitation by Sun 25 Oct to let us know you’re coming."));
    assert.ok(invitationText.includes("No thanks"));

    const noOffer = compose({ kind: "no-offer" }, "Hannah", [AGI]);
    const noOfferHtml = await render(NoOfferEmail({ email: noOffer }));
    assert.ok(noOfferHtml.includes(`href="${LINKS.events}"`), "See what's on opens the events page");
    assert.ok(noOfferHtml.includes("See what’s on"));
  });

  test("a lead's own wording is text, never markup", async () => {
    const form = formWith({
      [AGI]: {
        emailWording: {
          accepted: { subject: "Welcome", body: 'Read <b>this</b> & reply.<script>alert("x")</script>' },
        },
      },
    });
    const email = compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI], form);
    const html = await render(AcceptedEmail({ email }));
    assert.ok(!html.includes("<script>"), "typed markup must not reach the email as markup");
    assert.ok(!html.includes("<b>this</b>"));
    assert.ok(html.includes("&lt;b&gt;this&lt;/b&gt;"), "it is shown as the characters that were typed");
  });

  test("no template offers an unsubscribe link: this is the answer to an application", async () => {
    for (const [Template, email] of [
      [AcceptedEmail, compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI])],
      [InvitationEmail, compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC])],
      [NoOfferEmail, compose({ kind: "no-offer" }, "Hannah", [AGI])],
    ]) {
      const html = await render(Template({ email }));
      assert.ok(!/unsubscribe/i.test(html));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. What an email may and may not do or say
// ---------------------------------------------------------------------------

/** An en dash or an em dash, by code point so that neither is typed here. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("an email changes nothing by being opened", () => {
  const EVERY = [
    compose({ kind: "accepted", programmeId: AGI }, "Chloe", [AGI]),
    compose({ kind: "invited", programmeId: TAIS }, "Oliver", [INC]),
    compose({ kind: "no-offer" }, "Hannah", [AGI]),
    compose({ kind: "declined" }, "Zara", [AGI]),
  ];

  test("the reply buttons open the person's own application page and nothing else", () => {
    for (const email of EVERY) {
      for (const button of email.buttons) {
        const expected = button.label === "See what’s on" ? LINKS.events : LINKS.application;
        assert.equal(button.href, expected, `${email.kind}: ${button.label}`);
      }
    }
  });

  test("no button carries an answer, or anything else, in its address", () => {
    for (const email of EVERY) {
      for (const button of email.buttons) {
        const url = new URL(button.href);
        assert.equal(url.search, "", `${button.label} has a query string`);
        assert.equal(url.hash, "", `${button.label} has a fragment`);
      }
    }
  });

  test("every reply goes to the society's own address", () => {
    assert.equal(copy.DECISION_REPLY_TO, "ai-safety@uonsu.com");
  });

  test("a test send is marked in its subject", () => {
    assert.equal(copy.testSubject("You’re in AGI Strategy"), "[TEST] You’re in AGI Strategy");
  });

  test("no default email uses a word applicants never read, or a dash", () => {
    for (const email of EVERY) {
      const said = [email.subject, email.greeting, ...email.paragraphs, ...labels(email), email.signOff.role]
        .join("\n")
        .toLowerCase();
      for (const word of words.WORDS_APPLICANTS_NEVER_SEE) {
        assert.ok(!said.includes(word), `${email.kind} says "${word}"`);
      }
      assert.ok(!DASHES.test(said), `${email.kind} uses a dash for punctuation`);
      assert.ok(!said.includes("pooled"), `${email.kind} uses the committee's word for it`);
    }
  });
});

// ---------------------------------------------------------------------------
// The settings page and the send give one answer about every subject
// ---------------------------------------------------------------------------

/**
 * A programme's settings page lists its three emails with the subject each
 * goes out under, and tells a lead that an empty box keeps the standard
 * wording for that part. The emails themselves are composed here. Those are
 * two halves of one promise, built by two modules, so this block runs both
 * against the same stored form and holds them to the same string, for each
 * email and for each way a wording can be partly filled in.
 */
describe("the settings page shows the subject that is sent, and empty means standard part by part", () => {
  const KINDS = ["accepted", "invitation", "declined"];
  /** The outcome that makes the send compose each of a programme's emails. */
  const OUTCOME = {
    accepted: { kind: "accepted", programmeId: AGI },
    invitation: { kind: "invited", programmeId: AGI },
    declined: { kind: "declined" },
  };
  /** Somebody invited to AGI Strategy ranked something else; the other two ranked it. */
  const RANKED = { accepted: [AGI], invitation: [INC], declined: [AGI] };
  const STANDARD = {
    accepted: "You’re in AGI Strategy",
    invitation: "An invitation to AGI Strategy",
    declined: "Your NAISI application",
  };

  const sent = (kind, form) => compose(OUTCOME[kind], "Chloe", RANKED[kind], form);
  /** The row for one email as the settings page is handed it. */
  const row = (kind, form) =>
    editorViews
      .projectProgrammeForSetup(form, [], form.programmes[AGI], {
        now: new Date("2026-10-19T09:00:00Z"),
        viewerUid: "lead",
        roleOn: () => "lead",
        names: new Map(),
        canRunTerm: false,
        role: "lead",
        candidates: [],
        applications: 0,
      })
      .emails.find((email) => email.kind === kind);
  const worded = (kind, wording, formFields) => formWith({ [AGI]: { emailWording: { [kind]: wording } } }, formFields);

  for (const kind of KINDS) {
    test(`${kind}: with nothing stored, the standard subject is shown and is sent`, () => {
      const form = formWith();
      assert.equal(editorViews.defaultEmailSubject(kind, "AGI Strategy"), STANDARD[kind]);
      assert.equal(copy.standardSubject(kind, "AGI Strategy"), STANDARD[kind]);
      assert.equal(row(kind, form).subject, STANDARD[kind]);
      assert.equal(sent(kind, form).subject, STANDARD[kind]);
    });

    test(`${kind}: a wording with only a body keeps the standard subject, on the page and in the email`, () => {
      for (const subject of ["", "   ", "\n\t"]) {
        const form = worded(kind, { subject, body: "Our own words.\n\nAnd a second paragraph." });
        const email = sent(kind, form);
        assert.equal(email.subject, STANDARD[kind], JSON.stringify(subject));
        assert.equal(row(kind, form).subject, email.subject);
        assert.deepEqual(email.paragraphs, ["Our own words.", "And a second paragraph."]);
      }
    });

    test(`${kind}: a wording with only a subject keeps the standard body under it`, () => {
      const standardBody = sent(kind, formWith()).paragraphs;
      for (const body of ["", "   ", "\n\n \n"]) {
        const form = worded(kind, { subject: "Our own subject", body });
        const email = sent(kind, form);
        assert.equal(email.subject, "Our own subject");
        assert.equal(row(kind, form).subject, "Our own subject");
        assert.deepEqual(email.paragraphs, standardBody, JSON.stringify(body));
      }
    });

    test(`${kind}: with both written, both are theirs, and the page says the same subject`, () => {
      const form = worded(kind, { subject: "  Our own subject  ", body: "Our own words." });
      const email = sent(kind, form);
      assert.deepEqual([email.subject, email.paragraphs], ["Our own subject", ["Our own words."]]);
      assert.equal(row(kind, form).subject, "Our own subject");
    });

    test(`${kind}: a wording with both boxes empty is the standard email`, () => {
      const form = worded(kind, { subject: "", body: "" });
      const standard = sent(kind, formWith());
      const email = sent(kind, form);
      assert.deepEqual([email.subject, email.paragraphs], [standard.subject, standard.paragraphs]);
      assert.equal(row(kind, form).subject, standard.subject);
    });
  }

  test("the page's function is the send's function under another name, not a copy of it", () => {
    for (const kind of KINDS) {
      for (const shortName of ["AGI Strategy", "Technical AI Safety", ""]) {
        assert.equal(editorViews.defaultEmailSubject(kind, shortName), copy.standardSubject(kind, shortName));
      }
    }
    const source = readFileSync(join(SRC, "lib", "applications", "editor", "views.ts"), "utf8");
    assert.match(source, /export \{ standardSubject as defaultEmailSubject \} from "\.\.\/decisionDay\/emailCopy";/);
  });

  test("declined: the standard is the form's own “No offer this time”, part by part, on the page and in the email", () => {
    const FORM_NO = { noOfferWording: { subject: "About your application", body: "Not this term." } };
    // The programme wrote nothing: the declined email is the form's kind no.
    const none = formWith({}, FORM_NO);
    assert.deepEqual([sent("declined", none).subject, sent("declined", none).paragraphs], ["About your application", ["Not this term."]]);
    assert.equal(row("declined", none).subject, "About your application");
    // Only a body: the subject it would have had anyway is kept.
    const bodyOnly = worded("declined", { subject: "", body: "We could not take this one forward." }, FORM_NO);
    assert.deepEqual(
      [sent("declined", bodyOnly).subject, sent("declined", bodyOnly).paragraphs],
      ["About your application", ["We could not take this one forward."]],
    );
    assert.equal(row("declined", bodyOnly).subject, "About your application");
    // Only a subject: the body it would have had anyway is kept.
    const subjectOnly = worded("declined", { subject: "Your application", body: "" }, FORM_NO);
    assert.deepEqual(
      [sent("declined", subjectOnly).subject, sent("declined", subjectOnly).paragraphs],
      ["Your application", ["Not this term."]],
    );
    assert.equal(row("declined", subjectOnly).subject, "Your application");
    // The form's own wording can be partly filled in too.
    const formBodyOnly = formWith({}, { noOfferWording: { subject: "", body: "Not this term." } });
    assert.deepEqual(
      [sent("declined", formBodyOnly).subject, compose({ kind: "no-offer" }, "Hannah", [AGI], formBodyOnly).subject],
      ["Your NAISI application", "Your NAISI application"],
    );
    assert.equal(row("declined", formBodyOnly).subject, "Your NAISI application");
  });

  test("the form's “No offer this time” wording never reaches a programme's other two emails", () => {
    const form = formWith({}, { noOfferWording: { subject: "About your application", body: "Not this term." } });
    for (const kind of ["accepted", "invitation"]) {
      assert.equal(sent(kind, form).subject, STANDARD[kind]);
      assert.equal(row(kind, form).subject, STANDARD[kind]);
    }
  });

  test("for every programme on the form, every row's subject is the subject its email is sent under", () => {
    const form = formWith(
      {
        [AGI]: { emailWording: { accepted: { subject: "Welcome", body: "" }, declined: { subject: "", body: "No." } } },
        [TAIS]: { emailWording: { invitation: { subject: "Join us", body: "Do." } } },
      },
      { noOfferWording: { subject: "About your application", body: "" } },
    );
    for (const programmeId of [AGI, TAIS, INC]) {
      const rows = editorViews.projectProgrammeForSetup(form, [], form.programmes[programmeId], {
        now: new Date("2026-10-19T09:00:00Z"),
        viewerUid: "lead",
        roleOn: () => "lead",
        names: new Map(),
        canRunTerm: false,
        role: "lead",
        candidates: [],
        applications: 0,
      }).emails;
      const other = [AGI, TAIS, INC].find((id) => id !== programmeId);
      const emails = {
        accepted: compose({ kind: "accepted", programmeId }, "Chloe", [programmeId], form),
        invitation: compose({ kind: "invited", programmeId }, "Chloe", [other], form),
        declined: compose({ kind: "declined" }, "Chloe", [programmeId], form),
      };
      assert.deepEqual(
        rows.map((email) => [email.kind, email.subject]),
        KINDS.map((kind) => [kind, emails[kind].subject]),
        programmeId,
      );
    }
  });

  test("the three standard subjects are written in one file", () => {
    // A second copy is how the page and the email come to disagree, so the
    // tree is walked for one. A string that starts a standard subject and
    // goes straight into a name is a subject; a body that says "You're in
    // the ..." is not.
    const SHAPES = [/Your NAISI application/, /An invitation to \$\{/, /You’re in \$\{/];
    const HOME = join("lib", "applications", "decisionDay", "emailCopy.ts");
    /**
     * A sentence that starts the way a standard subject does and is NOT one,
     * with the reason. An entry gives the exact text and how many times its
     * file holds it. That text is set aside and the shapes are then asked of
     * what is left, so a real second copy of a subject added to the same file
     * still fails, and so does an entry whose sentence has moved or gone.
     */
    const NOT_A_SUBJECT = new Map([
      // Empty today. The one sentence that was here, the heading of the
      // applicant's own page once they have a place, now takes its words from
      // `standardSubject`, so the page holds no copy of a subject to set aside.
    ]);
    const offenders = [];
    const seen = new Set();
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) {
          const name = path.slice(SRC.length + 1);
          if (name === HOME) continue;
          let source = readFileSync(path, "utf8");
          const known = NOT_A_SUBJECT.get(name);
          if (known) {
            seen.add(name);
            assert.equal(
              source.split(known.text).length - 1,
              known.times,
              `${name} no longer holds its registered sentence ${known.times} times`,
            );
            source = source.split(known.text).join("");
          }
          if (SHAPES.some((shape) => shape.test(source))) offenders.push(name);
        }
      }
    };
    walk(SRC);
    assert.deepEqual(offenders, [], "a standard subject is written outside the one module that owns them");
    for (const [name, known] of NOT_A_SUBJECT) {
      assert.ok(seen.has(name), `${name} is registered as holding a sentence that is not a subject, and is gone`);
      assert.ok(known.why.length >= 40, `${name}: a reason is missing or too short to be one`);
      // The registered text has to be something the shapes would have caught,
      // or the entry sets aside nothing and says nothing.
      assert.ok(SHAPES.some((shape) => shape.test(known.text)), `${name}: its registered sentence is not shaped like a subject`);
    }
    // And the one module really does hold all three.
    const home = readFileSync(join(SRC, HOME), "utf8");
    for (const shape of SHAPES) assert.match(home, shape);
  });
});
