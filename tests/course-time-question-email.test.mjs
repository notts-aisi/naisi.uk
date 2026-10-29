/**
 * THE "YOUR GROUP" EMAIL'S OWN SECTION: the group's campus, and "Can you make
 * this time?" with its two buttons (`src/lib/courses/timeAnswer/emailSection.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. The section is the site's, not a template's, so an email whose wording
 *     was edited in Email designs still carries it: it takes the place of the
 *     template's own link to the programme page, and with no such link it
 *     goes at the end. It is never lost and never doubled.
 *  2. Both buttons open the programme page at the card, where answering
 *     needs the person's session. No link records an answer.
 *  3. Somebody not asked (a facilitator who sits in the group they
 *     facilitate) gets the campus line and keeps the template's button.
 *     Nothing to say leaves the email exactly as it was.
 *  4. An incubator's one weekly session is not "another group".
 *  5. The site's words: no dash, the society's own address.
 *
 * Publish's own use of it (every person's email, the preview and the test
 * alike) is executed by the Publish suites, which read whole emails.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const section = await loadTs(join("lib", "courses", "timeAnswer", "emailSection.ts"));

const URL = "https://naisi.invalid/learn/run-1";
const TEMPLATE = {
  subject: "Your AGI Strategy group: Tuesdays at 6pm",
  blocks: [
    {
      id: "b1",
      type: "richText",
      html:
        "<p>Hi Amara,</p><p>You’re in Group B.</p>" +
        `<p><a href="${URL}" style="display:inline-block">Open your programme</a></p>` +
        "<p>Claudia</p>",
    },
  ],
};
const ASKED = { campus: "jubilee", asks: true, incubator: false, programmeUrl: URL };
const textOf = (email) =>
  email.blocks
    .map((block) => block.html ?? "")
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const linksOf = (email) => email.blocks.flatMap((block) => [...(block.html ?? "").matchAll(/href="([^"]*)"/g)].map((m) => m[1]));

describe("where the section goes", () => {
  test("in place of the template's link to the programme page, once", () => {
    const sent = section.withTimeQuestion(TEMPLATE, ASKED);
    assert.equal(sent.subject, TEMPLATE.subject);
    assert.equal(sent.blocks.length, 1);
    assert.equal(
      textOf(sent),
      "Hi Amara, You’re in Group B. Your group meets on Jubilee campus. Can you make this time? Tell us on your " +
        "programme page. If you can’t, say why and which other times would work, and we’ll do our best to move you " +
        "to another group. You keep your place either way. You can also email ai-safety@uonsu.com . " +
        "I can make it I can’t make this time Claudia",
    );
    assert.ok(!textOf(sent).includes("Open your programme"), "three buttons to one page");
    assert.deepEqual(linksOf(sent), ["mailto:ai-safety@uonsu.com", `${URL}#your-group-time`, `${URL}#your-group-time`]);
  });

  test("at the end of a template with no link to the programme page", () => {
    const edited = { subject: "Hello", blocks: [{ id: "b1", type: "richText", html: "<p>Hi Amara, your group is ready.</p>" }] };
    const sent = section.withTimeQuestion(edited, ASKED);
    assert.equal(sent.blocks.length, 2);
    assert.equal(sent.blocks[0], edited.blocks[0]);
    assert.equal(sent.blocks[1].type, "richText");
    assert.match(textOf(sent), /your group is ready\. Your group meets on Jubilee campus\. Can you make this time\?/);
  });

  test("the email it was given is not changed", () => {
    const before = structuredClone(TEMPLATE);
    section.withTimeQuestion(TEMPLATE, ASKED);
    assert.deepEqual(TEMPLATE, before);
  });
});

describe("what it says, and to whom", () => {
  test("somebody not asked gets the campus line and keeps the template's own button", () => {
    const sent = section.withTimeQuestion(TEMPLATE, { ...ASKED, asks: false });
    assert.match(textOf(sent), /Your group meets on Jubilee campus\. Open your programme Claudia$/);
    assert.ok(!textOf(sent).includes("Can you make this time?"));
    assert.deepEqual(linksOf(sent), [URL]);
  });

  test("no campus yet: the question alone; nothing to say: the email exactly as it was", () => {
    const asked = section.withTimeQuestion(TEMPLATE, { ...ASKED, campus: null });
    assert.ok(!textOf(asked).includes("campus"));
    assert.match(textOf(asked), /Can you make this time\?/);
    const quiet = section.withTimeQuestion(TEMPLATE, { ...ASKED, campus: null, asks: false });
    assert.deepEqual(quiet, { subject: TEMPLATE.subject, blocks: TEMPLATE.blocks });
  });

  test("each campus in the email's words, the three Zach named and no other", () => {
    assert.equal(section.timeQuestionHtml({ ...ASKED, asks: false, campus: "university-park" }), "<p>Your group meets on University Park campus.</p>");
    assert.equal(section.timeQuestionHtml({ ...ASKED, asks: false, campus: "jubilee" }), "<p>Your group meets on Jubilee campus.</p>");
    assert.equal(section.timeQuestionHtml({ ...ASKED, asks: false, campus: "online" }), "<p>Your group meets online.</p>");
  });

  test("an incubator's one weekly session is not another group", () => {
    const html = section.timeQuestionHtml({ ...ASKED, incubator: true });
    assert.match(html, /and we’ll see what we can do\./);
    assert.ok(!html.includes("another group"));
  });

  test("no dash anywhere, and the programme page's address is written as an attribute", () => {
    for (const incubator of [false, true]) {
      const html = section.timeQuestionHtml({ ...ASKED, incubator });
      assert.ok(!/[–—]/.test(html), "a dash in the email's words");
    }
    const odd = section.timeQuestionHtml({ ...ASKED, programmeUrl: 'https://naisi.invalid/learn/a"b' });
    assert.ok(odd.includes('href="https://naisi.invalid/learn/a&quot;b#your-group-time"'));
  });
});
