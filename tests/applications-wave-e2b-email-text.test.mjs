/**
 * THE TEXT ALTERNATIVE OF A DECISION EMAIL KEEPS ITS ADDRESSES WHOLE.
 *
 * Every decision email goes out as HTML and as plain text. In the text, a
 * button is its words followed by its address. Two buttons side by side used
 * to come out as "I’m coming <address>I can’t make it <address>": the first
 * address ran straight into the next button's first word, so a reader on a
 * text-only client who tapped it opened an address with a letter stuck on
 * the end, which is a page that is not there.
 *
 * This renders the three templates through the real renderer and holds every
 * address in the text to be followed by white space or the end of the text.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const AcceptedEmail = (await loadTs(join("emails", "ApplicationAcceptedEmail.tsx"))).default;
const InvitationEmail = (await loadTs(join("emails", "ApplicationInvitationEmail.tsx"))).default;
const NoOfferEmail = (await loadTs(join("emails", "ApplicationNoOfferEmail.tsx"))).default;

const PAGE = "https://staging.example.com/applications/autumn-2026__k3f9a2b1";
const EVENTS = "https://staging.example.com/events";

function email(kind, buttons) {
  return {
    kind,
    subject: "Your NAISI application",
    greeting: "Hi Chloe,",
    paragraphs: ["One paragraph.", "And another."],
    buttons,
    signOff: { name: "Claudia", role: "AGI Strategy lead, NAISI" },
  };
}

const TWO = [
  { label: "I’m coming", href: PAGE, look: "primary" },
  { label: "I can’t make it", href: PAGE, look: "outline" },
];

/** Every place `address` appears in `text`, with the one character after it. */
function followers(text, address) {
  const found = [];
  let from = text.indexOf(address);
  while (from !== -1) {
    found.push(text.charAt(from + address.length));
    from = text.indexOf(address, from + address.length);
  }
  return found;
}

describe("a decision email's text alternative", () => {
  test("two buttons side by side keep their addresses apart from each other's words", async () => {
    const text = await render(AcceptedEmail({ email: email("accepted", TWO) }), { plainText: true });
    const after = followers(text, PAGE);
    assert.equal(after.length, 2, "both buttons carry their address in the text");
    for (const next of after) {
      assert.ok(next === "" || /\s/.test(next), `an address is followed by ${JSON.stringify(next)}, not by white space`);
    }
    assert.ok(text.includes("I’m coming") && text.includes("I can’t make it"), "both buttons keep their words");
  });

  test("the same holds for an invitation's two buttons", async () => {
    const buttons = [
      { label: "Accept your invitation", href: PAGE, look: "primary" },
      { label: "No thanks", href: PAGE, look: "quiet" },
    ];
    const text = await render(InvitationEmail({ email: email("invitation", buttons) }), { plainText: true });
    const after = followers(text, PAGE);
    assert.equal(after.length, 2);
    for (const next of after) assert.ok(next === "" || /\s/.test(next), `followed by ${JSON.stringify(next)}`);
  });

  test("one button alone is unchanged, and the HTML gains no words", async () => {
    const one = [{ label: "See what’s on", href: EVENTS, look: "primary" }];
    const text = await render(NoOfferEmail({ email: email("no-offer", one) }), { plainText: true });
    for (const next of followers(text, EVENTS)) assert.ok(next === "" || /\s/.test(next));
    const html = await render(AcceptedEmail({ email: email("accepted", TWO) }));
    assert.equal(html.split(`href="${PAGE}"`).length - 1, 2, "still two links, both to the application page");
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ");
    assert.equal(visible.split("I’m coming").length - 1, 1, "the first button's words appear once");
  });
});
