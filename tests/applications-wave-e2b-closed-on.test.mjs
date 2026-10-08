/**
 * A CLOSED FORM NAMES THE DAY IT CLOSED ONLY ONCE THAT DAY HAS COME.
 *
 * An admin can close an application form before the time written on it. The
 * applicant's pages used to print that time all the same: on Wed 7 Oct they
 * said applications "closed on Sun 18 Oct, 23:59", eleven days ahead. The rule
 * is one small function, executed here, and the two screens that print the
 * sentence are held to asking it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const { closedOnLabel } = await loadTs(join("features", "applications", "apply", "closedOn.ts"));
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const source = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");

const LABEL = "Sun 18 Oct, 23:59";
const CLOSES = new Date("2026-10-18T23:59:00+01:00");

describe("the day a closed form says it closed on", () => {
  test("closed by hand before its time: no day is named", () => {
    assert.equal(closedOnLabel(CLOSES, LABEL, new Date("2026-10-07T04:30:00+01:00")), null);
    assert.equal(closedOnLabel(CLOSES, LABEL, new Date("2026-10-18T23:58:59+01:00")), null);
  });

  test("closed by the clock: the day on the form is the day it closed", () => {
    assert.equal(closedOnLabel(CLOSES, LABEL, new Date("2026-10-18T23:59:00+01:00")), LABEL);
    assert.equal(closedOnLabel(CLOSES, LABEL, new Date("2026-10-23T12:00:00+01:00")), LABEL);
  });

  test("a form with no closing time, or no label for it, names no day", () => {
    const later = new Date("2026-11-01T12:00:00Z");
    assert.equal(closedOnLabel(null, LABEL, later), null);
    assert.equal(closedOnLabel(CLOSES, null, later), null);
    assert.equal(closedOnLabel(null, null, later), null);
  });
});

describe("the two screens that print the sentence ask the rule", () => {
  test("the closed card on the form's own address", () => {
    const screen = source("features", "applications", "apply", "ApplyScreen.tsx");
    assert.match(screen, /applications closed on <span className=\{styles\.together\}>\{closedOn\}<\/span>/);
    assert.doesNotMatch(screen, /closed on <span className=\{styles\.together\}>\{form\.closesLabel\}/);
    assert.equal((screen.match(/closedOnLabel\(/g) ?? []).length, 2, "signed out and signed in each ask it");
  });

  test("the applicant's status page is handed a view with the day already taken out", () => {
    const render = source("features", "applications", "status", "renderApplicationStatus.tsx");
    assert.match(render, /view=\{await withHonestClosingDay\(db, loaded\.roundId, loaded\.view, now\)\}/);
    assert.match(render, /closedOnLabel\(form\?\.round\.closesAt \?\? null, view\.closesLabel, now\)/);
    assert.doesNotMatch(render, /view=\{loaded\.view\}/);
  });

  test("somebody who has applied is given a way from the closed card to their application", () => {
    const screen = source("features", "applications", "apply", "ApplyScreen.tsx");
    assert.match(screen, /href=\{`\/applications\/\$\{encodeURIComponent\(form\.id\)\}`\}/);
    assert.match(screen, /See your application/);
    assert.match(screen, /form\.decisionsLabel && !application\.result/, "the day everybody hears is not promised to somebody who has heard");
  });
});
