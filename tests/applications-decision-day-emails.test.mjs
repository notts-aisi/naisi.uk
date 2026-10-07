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
 *
 * Nothing is stubbed: the copy module is pure, and the templates compile and
 * render through the real `@react-email/components`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const at = (file) => join("lib", "applications", file);

const copy = await loadTs(at(join("decisionDay", "emailCopy.ts")));
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
