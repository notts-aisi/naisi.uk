/**
 * THE REVIEW SCREENS AFTER SOMEBODY HAS LEFT, AND AFTER SOMEBODY HAS BEEN TOLD.
 *
 * 1. Somebody who gave their place back, or said no to an invitation, has
 *    withdrawn. The list used to file their row by what the programme had
 *    decided, so a place that had come back still sat under Accepted. A
 *    withdrawn row is now listed under All only, reads Withdrawn, and cannot
 *    be ticked for a bulk decision. The list's own filter is executed here.
 *
 * 2. Once decision day has told a person their result, the decision is a
 *    record. The single application is sent with an optional `told` flag, and
 *    when it is true the screen draws the decision as it stands with nothing
 *    to press. Absent, the screen is as it was. The component cannot be drawn
 *    outside a browser, so its source is held to the four places the flag has
 *    to reach: what can be acted on, the decision card, the line under it and
 *    the admin's revoke card.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const listModel = await loadTs(join("features", "applications", "review", "listModel.ts"));
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const flat = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");

function row(uid, standing, over = {}) {
  return {
    uid,
    name: uid,
    detail: "",
    accountWaiting: false,
    withdrawn: false,
    choice: 1,
    firstChoiceName: null,
    score: null,
    scoreValue: null,
    wantsToFacilitate: false,
    comments: 0,
    standing,
    owesDecision: standing === "to-review",
    placedOn: null,
    appliedAt: "2026-10-07T03:00:00.000Z",
    searchText: uid,
    ...over,
  };
}

const ROWS = [
  row("amara", "accepted"),
  row("priya", "accepted", { withdrawn: true }),
  row("ben", "pooled"),
  row("oliver", "pooled", { withdrawn: true }),
  row("dev", "to-review"),
  row("wen", "to-review", { withdrawn: true }),
  row("zara", "declined"),
  row("kofi", "declined", { withdrawn: true }),
];
const under = (status) =>
  listModel
    .filterRows(ROWS, { ...listModel.DEFAULT_QUERY, status, sort: "name" })
    .map((found) => found.uid);

describe("a withdrawn application on a programme's list", () => {
  test("is listed under All", () => {
    assert.deepEqual(under("all"), ["amara", "ben", "dev", "kofi", "oliver", "priya", "wen", "zara"]);
  });

  test("is never under Accepted, Pooled, To review or Declined, whatever the programme had decided", () => {
    assert.deepEqual(under("accepted"), ["amara"]);
    assert.deepEqual(under("pooled"), ["ben"]);
    assert.deepEqual(under("to-review"), ["dev"]);
    assert.deepEqual(under("declined"), ["zara"]);
  });

  test("the list asks the row's own flag and nothing else", () => {
    const model = flat("features", "applications", "review", "listModel.ts");
    assert.match(model, /if \(row\.withdrawn\) return false;/);
    assert.equal((model.match(/withdrawn/g) ?? []).length >= 1, true);
    assert.doesNotMatch(model, /status === "withdrawn"/, "what withdrawn means is the server's to say");
  });

  test("the row reads Withdrawn in its status, keeps what was decided as a line, and has no tick box", () => {
    const board = flat("features", "applications", "review", "ApplicationsBoard.tsx");
    assert.match(board, /\{row\.withdrawn \? \( .*?<Chip dot>Withdrawn<\/Chip>/);
    assert.match(board, /Was \{PROGRAMME_STANDING_LABEL\[row\.standing\]\.toLowerCase\(\)\}/);
    assert.match(board, /\{row\.withdrawn \? null : \( <Checkbox label=\{`Select \$\{row\.name\}`\}/);
    assert.match(board, /const choosable = visible\.filter\(\(row\) => !row\.withdrawn\);/);
    assert.doesNotMatch(board, /styles\.flag\}>Withdrawn</, "said once, in the status, not twice");
  });
});

describe("the review screen once a person has been told", () => {
  const screen = flat("features", "applications", "review", "ReviewScreen.tsx");

  test("the flag is optional, on the screen's own type, and true only when sent as true", () => {
    assert.match(screen, /type Review = ReviewPayload & \{ told\?: boolean \};/);
    assert.match(screen, /initial: Review;/);
    assert.match(screen, /const told = review\.told === true;/);
  });

  test("nothing can be decided for somebody who has been told: not by button, key or bar", () => {
    assert.match(screen, /const canAct = viewer\.canDecide && !round\.decisionsSent && !told;/);
    // The keys and the bar at the foot of a phone both ask canAct.
    assert.match(screen, /if \(now\.canAct\) now\.decide\("accept"\);/);
    assert.match(screen, /if \(now\.canAct\) now\.decide\("pool"\);/);
    assert.match(screen, /\{canAct \? \( <div className=\{styles\.bar\} role="group" aria-label="Decision"/);
  });

  test("the decision card is a record, drawn before the card that has things to press", () => {
    const card = screen.slice(screen.indexOf("{told ? ("), screen.indexOf(") : viewer.canDecide ? ("));
    assert.ok(card.length > 0, "the told branch comes first");
    assert.match(card, /<StandingChip standing=\{decision\.standing\} \/>/);
    assert.match(card, /\{applicant\.firstName\} has been told their result\. It’s on their own application page now, so this decision can’t be changed\./);
    assert.doesNotMatch(card, /<input|<button|<fieldset|type="radio"|\{menu\}/, "nothing in it can be pressed");
  });

  test("on a phone, where the decision is otherwise a bar at the foot, the record stays on the page", () => {
    assert.match(screen, /className=\{`\$\{styles\.decision\} \$\{styles\.decisionTold\}`\}/);
    const css = flat("features", "applications", "review", "ReviewScreen.module.css");
    const phone = css.slice(css.indexOf("@media (max-width: 48rem)"));
    assert.match(phone, /\.decision \{ display: none; \}/, "the laptop's card is still hidden on a phone");
    assert.match(phone, /\.decision\.decisionTold \{ display: flex; \}/);
  });

  test("the admin's revoke card is not drawn, and the line about emailing is not said", () => {
    assert.match(screen, /\{decision\.standing === "accepted" && !told \? \(/);
    assert.match(screen, /\{told \? null : \( <p className=\{styles\.fine\}>/);
  });
});

