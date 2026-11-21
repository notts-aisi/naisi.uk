/**
 * What the rich-text editor's link box saves (`linkHrefFrom`, used by
 * `applyLink` in `src/components/blocks/RichTextEditor.tsx`), and that a link
 * to one `{token}` survives being saved and read back as an email's wording.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The box starts with `https://` in it. An address that is exactly one token,
 * with or without that `https://` (or `http://`) in front, is saved as the
 * token alone, as the seed copy of an email links to one (`href="{groupUrl}"`):
 * the email fills it with a whole address when it is sent. Every other
 * address is saved as it always was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const box = await loadTs(join("components", "blocks", "linkHref.ts"));
const courseEmails = await loadTs(join("lib", "firestore", "courseEmails.ts"));
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

test("one token, alone or after the box's https:// or an http://, is saved as the token alone", () => {
  for (const typed of ["{guideUrl}", "https://{guideUrl}", "http://{guideUrl}", "HTTPS://{guideUrl}", "  https://{guideUrl}  "]) {
    assert.equal(box.linkHrefFrom(typed), "{guideUrl}", JSON.stringify(typed));
  }
  assert.equal(box.linkHrefFrom("https://{groupUrl}"), "{groupUrl}");
  assert.equal(box.linkHrefFrom("https://{programme_url2}"), "{programme_url2}");
});

test("every other address is saved exactly as before", () => {
  const cases = [
    ["example.org", "https://example.org"],
    ["naisi.uk/links", "https://naisi.uk/links"],
    ["https://example.org", "https://example.org"],
    ["http://example.org/a?b=c", "http://example.org/a?b=c"],
    ["mailto:ai-safety@uonsu.com", "mailto:ai-safety@uonsu.com"],
    ["  https://naisi.uk  ", "https://naisi.uk"],
    ["", ""],
    ["   ", ""],
    // Not exactly one token: as any other text.
    ["https://example.org/{groupUrl}", "https://example.org/{groupUrl}"],
    ["https://{groupUrl}/week-1", "https://{groupUrl}/week-1"],
    ["{groupUrl}{guideUrl}", "https://{groupUrl}{guideUrl}"],
    ["{1abc}", "https://{1abc}"],
    ["ftp://{groupUrl}", "ftp://{groupUrl}"],
    ["https://", "https://"],
  ];
  for (const [typed, saved] of cases) assert.equal(box.linkHrefFrom(typed), saved, JSON.stringify(typed));
});

test("the link box saves through it, and nowhere else decides an address", () => {
  const code = stripSource(readFileSync(join(SRC, "components", "blocks", "RichTextEditor.tsx"), "utf8"), { keepStrings: true });
  assert.match(code, /import \{ linkHrefFrom \} from "\.\/linkHref";/);
  assert.match(code, /function applyLink\(\) \{\s*const href = linkHrefFrom\(linkHref\);/);
  assert.doesNotMatch(code, /`https:\/\/\$\{/, "the box puts a scheme in front of an address itself again");
});

test("a link to one token is kept when an email's wording is saved and read back", () => {
  // Reading a saved template keeps every rich-text block whose html is a
  // string, as it is: nothing rewrites an address.
  const html = '<p><a target="_blank" rel="noopener noreferrer nofollow" href="{guideUrl}">{guideButton}</a></p>';
  const read = courseEmails.normalizeCourseTemplate("course-facilitating", {
    subject: "You’re facilitating {groupName}",
    blocks: [{ id: "b", type: "richText", html }],
  });
  assert.equal(read.blocks[0].html, html);
  assert.equal(courseEmails.isValidCourseTemplateDoc({ templateId: "course-facilitating", subject: "S", blocks: read.blocks }), true);
});
