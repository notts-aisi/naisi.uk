/**
 * What is typed into the event editor and not yet saved survives the event
 * changing underneath it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The failure
 *
 * The editor holds a live listener on its event and copies every field into
 * the form when the event changes. It was written to leave the form alone
 * while there were unsaved changes, and it read that from a flag. But a
 * listener is attached once, in an effect, and it kept the flag's value from
 * the render that attached it, which was always "nothing is unsaved". So every
 * change to the event overwrote the whole form.
 *
 * An event changes often, and mostly not because somebody edited it: a
 * sign-up arriving moves a counter on it, ticking a collaborator rewrites its
 * list of collaborators, archiving it sets a flag. Each of those threw away
 * whatever the organiser had typed and not saved, on every field, while the
 * page went on saying "Unsaved changes". Pressing Save then wrote the old
 * values back.
 *
 * Nothing caught it: TypeScript has no opinion on a stale closure, the lint
 * rule that would have was switched off on that one line, and a page that is
 * looked at alone, on a draft nobody is signing up to, behaves.
 *
 * ## The rule, and where it lives
 *
 * `src/features/events/editorSync.ts` decides one field at a time. A field
 * the person has changed and not saved is kept; every other field takes what
 * the server now says, so somebody else's change to a field this person has
 * not touched still arrives. "Changed" is worked out, by comparing what the
 * form holds with what the form was last given, and is never a flag.
 *
 * ## What this guard does
 *
 *  1. It EXECUTES the two functions that decide, on every kind of value the
 *     form holds.
 *  2. It holds the editor to using them: every field that Save writes is a
 *     field the listener decides with `takeIncoming`, in both directions, so
 *     a field added to one list and not the other fails here.
 *  3. It holds the listener to reading nothing but the event's id from the
 *     render that attached it, which is the class of mistake, not the one
 *     instance: the lint rule for it is on for this effect again.
 *
 * ## What it cannot see
 *
 * That the browser really keeps the typing. That needs a browser and a live
 * listener, and is checked by hand when this file changes: type a title, do
 * not save, let a sign-up arrive, and read the title.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR = "src/features/events/EventEditor.tsx";

const { loadTs } = createLoader();
const { sameValue, takeIncoming } = await loadTs("features/events/editorSync.ts");

/** The editor's source with comments removed, so a word in a comment proves nothing. */
const editor = readFileSync(join(REPO_ROOT, EDITOR), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

describe("the same value", () => {
  test("plain values are compared as they are", () => {
    assert.equal(sameValue("Quiz night", "Quiz night"), true);
    assert.equal(sameValue("Quiz night", "Quiz night "), false);
    assert.equal(sameValue(40, 40), true);
    assert.equal(sameValue(40, 41), false);
    assert.equal(sameValue(true, true), true);
    assert.equal(sameValue(true, false), false);
    assert.equal(sameValue(null, null), true);
  });

  test("an empty box is not a zero, a nothing or a false", () => {
    assert.equal(sameValue(null, 0), false);
    assert.equal(sameValue(null, ""), false);
    assert.equal(sameValue("", 0), false);
    assert.equal(sameValue(null, false), false);
    assert.equal(sameValue(null, undefined), false);
    assert.equal(sameValue(40, "40"), false);
  });

  test("a date is its instant, not the object that carries it", () => {
    const start = new Date("2026-11-26T19:00:00Z");
    assert.equal(sameValue(start, new Date(start.getTime())), true);
    assert.equal(sameValue(start, new Date("2026-11-26T19:30:00Z")), false);
    assert.equal(sameValue(start, null), false);
    assert.equal(sameValue(null, start), false);
    assert.equal(sameValue(start, start.getTime()), false);
  });

  test("a list is its items, in order", () => {
    assert.equal(sameValue(["halal", "vegan"], ["halal", "vegan"]), true);
    assert.equal(sameValue(["halal", "vegan"], ["vegan", "halal"]), false);
    assert.equal(sameValue(["halal"], ["halal", "vegan"]), false);
    assert.equal(sameValue([], []), true);
    assert.equal(sameValue([], null), false);
    assert.equal(sameValue([], {}), false);
  });

  test("a question is its own keys, whatever order they were written in", () => {
    const stored = { id: "q1", type: "shortText", label: "Team name", required: false };
    const typed = { required: false, label: "Team name", type: "shortText", id: "q1" };
    assert.equal(sameValue([stored], [typed]), true);
    assert.equal(sameValue([stored], [{ ...typed, label: "Team name?" }]), false);
    assert.equal(sameValue([stored], [{ ...typed, required: true }]), false);
  });

  test("a part that was never set is the same as a part that is not there", () => {
    // The event is stored without the keys nobody set, and the form builder
    // writes `helpText: undefined` when a box is cleared.
    const stored = { id: "q1", type: "longText", label: "Anything else?", required: false };
    assert.equal(sameValue(stored, { ...stored, helpText: undefined, maxLength: undefined }), true);
    assert.equal(sameValue(stored, { ...stored, helpText: "Two sentences is plenty" }), false);
    assert.equal(sameValue({ ...stored, helpText: undefined }, stored), true);
  });

  test("a description is compared all the way down", () => {
    const blocks = () => [
      { id: "b1", type: "richText", html: "<p>Teams of up to 4.</p>" },
      { id: "b2", type: "image", url: "https://example.com/a.png", alt: "A poster", crop: { x: 0, y: 10 } },
    ];
    assert.equal(sameValue(blocks(), blocks()), true);
    const moved = blocks();
    moved[1].crop.y = 11;
    assert.equal(sameValue(blocks(), moved), false);
  });
});

describe("one field, when the event changes underneath the form", () => {
  test("a field nobody has changed takes what the server now says", () => {
    assert.equal(takeIncoming("Portland C11", "Portland C11", "Trent B46"), "Trent B46");
    assert.equal(takeIncoming(40, 40, 60), 60);
    assert.equal(takeIncoming(null, null, 30), 30);
    assert.equal(takeIncoming(true, true, false), false);
  });

  test("a field somebody has changed and not saved is kept", () => {
    assert.equal(takeIncoming("Quiz night at eight", "Quiz night", "Quiz night"), "Quiz night at eight");
    assert.equal(takeIncoming(44, 40, 40), 44);
    assert.equal(takeIncoming(null, 40, 40), null, "a number of places that was cleared is a change too");
    assert.equal(takeIncoming(false, true, true), false);
  });

  test("and is kept even when somebody else has changed the same field", () => {
    // Two people, one field. The form shows this person's, and Save writes it.
    assert.equal(takeIncoming("Mine", "Before", "Theirs"), "Mine");
  });

  test("a field typed in and put back as it was is a field nobody has changed", () => {
    assert.equal(takeIncoming("Quiz night", "Quiz night", "Quiz night, renamed"), "Quiz night, renamed");
  });

  test("a date and a list are decided by what they hold, not by which object holds it", () => {
    const start = new Date("2026-11-26T19:00:00Z");
    const moved = new Date("2026-11-27T19:00:00Z");
    // The form keeps its own Date object; the server sends a fresh one each time.
    assert.equal(takeIncoming(new Date(start.getTime()), start, moved), moved);
    const mine = new Date("2026-11-26T20:00:00Z");
    assert.equal(takeIncoming(mine, start, moved), mine);

    const tags = ["halal", "vegan"];
    const fresh = ["halal", "vegan", "vegetarian"];
    assert.equal(takeIncoming(["halal", "vegan"], tags, fresh), fresh);
    const ticked = ["halal"];
    assert.equal(takeIncoming(ticked, tags, fresh), ticked);
  });

  test("the first thing the server says after a save lands on what was saved", () => {
    // After Save the form's own values are what it was last given, so the
    // stored event (trimmed, tidied) is taken and nothing reads as unsaved.
    const typed = "Quiz night ";
    assert.equal(takeIncoming(typed, typed, "Quiz night"), "Quiz night");
  });
});

describe("the editor uses the rule for every field it saves", () => {
  /** The names inside the first `{ ... }` after a marker, one per line or shorthand entry. */
  function keysOfObjectAfter(source, marker) {
    const start = source.indexOf(marker);
    assert.ok(start > -1, `${EDITOR} no longer contains \`${marker}\`: re-read this test against the editor`);
    const open = source.indexOf("{", start + marker.length - 1);
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    assert.ok(end > open, `could not read the object after \`${marker}\``);
    const body = source.slice(open + 1, end);
    return [...body.matchAll(/^\s*([A-Za-z]\w*)\s*(?::|,|$)/gm)].map((m) => m[1]);
  }

  const saved = keysOfObjectAfter(editor, "const fields = {");
  const typed = keysOfObjectAfter(editor, "type FormValues = {");
  const fromServer = keysOfObjectAfter(editor, "function formValuesOf(next: EventDoc): FormValues {\n  return {");
  const held = keysOfObjectAfter(editor, "const held: FormValues = {");
  const decided = [...editor.matchAll(/\bset[A-Z]\w*\(pick\("(\w+)"\)\)/g)].map((m) => m[1]);

  test("the lists were read, and are the size of a real form", () => {
    assert.ok(saved.length >= 20, `only ${saved.length} saved fields were read out of the editor`);
    assert.equal(new Set(saved).size, saved.length, "a field is saved twice");
    assert.equal(new Set(decided).size, decided.length, "a field is decided twice");
  });

  test("every field Save writes is decided by the rule, and nothing else is", () => {
    assert.deepEqual(
      [...decided].sort(),
      [...saved].sort(),
      "the fields the listener decides and the fields Save writes are not the same list. " +
        "A field that is saved and not decided is never refreshed; one that is decided and " +
        "not saved is typing that goes nowhere.",
    );
  });

  test("the form's shape, what the server is read into and what a save leaves behind agree with it", () => {
    for (const [name, keys] of [
      ["type FormValues", typed],
      ["formValuesOf", fromServer],
      ["the values held at save", held],
    ]) {
      assert.deepEqual([...keys].sort(), [...saved].sort(), `${name} does not list the fields Save writes`);
    }
  });

  test("each setter is given the decision for its own field", () => {
    for (const [, setter, key] of editor.matchAll(/\b(set[A-Z]\w*)\(pick\("(\w+)"\)\)/g)) {
      assert.equal(
        setter,
        `set${key[0].toUpperCase()}${key.slice(1)}`,
        `${setter} is handed the decision for "${key}"`,
      );
    }
  });

  test("the decision is the shared one, made on the value the form holds now", () => {
    assert.match(editor, /import \{ takeIncoming \} from "\.\/editorSync";/);
    assert.match(
      editor,
      /\(cur: FormValues\[K\]\): FormValues\[K\] =>\s*was === null \? now\[key\] : takeIncoming\(cur, was\[key\], now\[key\]\)/,
      "the listener no longer decides each field with takeIncoming on the setter's own current value",
    );
    // What the form was last given moves on with every change the server sends...
    assert.match(editor, /const was = synced\.current;\s*const now = formValuesOf\(next\);\s*synced\.current = now;/);
    // ...and with every save, after the write has landed and not before.
    const flush = editor.slice(editor.indexOf("async function flush()"), editor.indexOf("async function onSave()"));
    const written = Math.max(flush.lastIndexOf("await updateEvent("), flush.lastIndexOf("await fetch("));
    const remembered = flush.indexOf("synced.current = held;");
    assert.ok(written > -1 && remembered > -1, "flush no longer records what it saved");
    assert.ok(written < remembered, "what was saved is recorded before the write has landed");
  });
});

describe("the listener reads nothing from the render that attached it", () => {
  const start = editor.indexOf("const unsub = onSnapshot(");
  const end = editor.indexOf("return unsub;", start);
  const listener = editor.slice(start, end);
  const effectTail = editor.slice(end, editor.indexOf("\n", editor.indexOf("}, [", end)) + 1);

  test("the listener was found", () => {
    assert.ok(start > -1 && end > start, `${EDITOR} no longer attaches its listener the way this test reads it`);
    assert.match(listener, /doc\(db, "events", eventId\)/);
  });

  test("it does not read the unsaved flag, which it could only ever see as it first was", () => {
    assert.doesNotMatch(listener, /\bdirty\b/);
  });

  test("its effect depends on the event's id alone, with the lint rule left on", () => {
    assert.match(effectTail, /\}, \[eventId\]\);/);
    const raw = readFileSync(join(REPO_ROOT, EDITOR), "utf8");
    const rawStart = raw.indexOf("const unsub = onSnapshot(");
    const rawEffect = raw.slice(rawStart, raw.indexOf("}, [eventId]);", rawStart));
    assert.doesNotMatch(
      rawEffect,
      /eslint-disable[^\n]*exhaustive-deps/,
      "the rule that reports a stale value in this effect has been switched off again",
    );
  });
});
