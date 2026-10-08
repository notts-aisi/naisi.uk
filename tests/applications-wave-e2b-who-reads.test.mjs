/**
 * THE SCREENS SAY WHO CAN SEE COMMENTS AND SCORES, AND THE CODE AGREES.
 *
 * Two screens tell a reviewer who else reads what they write: the line under
 * "Overall comment" on the review screen, and the "Comments and scores" fact
 * on a programme's Settings tab. Both used to name every SU-recognised
 * committee member. The gate has never let that many in: an application is
 * read by an admin, and by the lead and the reviewers of a programme the
 * applicant ranked or of the one they joined by accepting an invitation, and
 * by nobody else (`canReadApplication` in `src/lib/applications/access.ts`).
 *
 * A third screen makes the same promise to the applicant: the sentence above
 * the privacy link on the form's Check and send step, which names the lead
 * and the reviewers of each programme the person picks, and the admins.
 *
 * A sentence about who can read is a promise made to the person typing. This
 * holds the three sentences and the predicate together: change who the gate
 * lets in and the first test fails until the sentences are looked at again;
 * change a sentence and its own test fails until the gate is.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const flat = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");

const access = flat("lib", "applications", "access.ts");
const review = flat("features", "applications", "review", "ReviewScreen.tsx");
const setup = flat("features", "applications", "editor", "ProgrammeSetup.tsx");
const checkStep = flat("features", "applications", "apply", "CheckStep.tsx");

/** The gate, as the two sentences describe it. */
const THE_GATE =
  "export function canReadApplication( user: SessionUser, form: Form, ranked: readonly string[], " +
  "joined: string | null = null, ): boolean { " +
  'if (user.role === "admin") return true; ' +
  "if (joined !== null && roleOnProgramme(user, form, joined) !== null) return true; " +
  "return ranked.some((programmeId) => roleOnProgramme(user, form, programmeId) !== null); }";

describe("who can see comments and scores", () => {
  test("the gate is an admin, or a role on a programme the applicant ranked or joined by invitation, and a role is lead or reviewer", () => {
    assert.ok(
      access.includes(THE_GATE),
      "canReadApplication no longer reads as the screens describe it. Read it, then put right the sentence under " +
        "Overall comment on the review screen, the Comments and scores line on a programme's Settings tab, the " +
        "sentence above the privacy link on the form's Check and send step, and this test.",
    );
    assert.match(access, /export type ProgrammeRole = "admin" \| "lead" \| "reviewer";/);
  });

  test("the review screen names exactly those people, beside a comment that names the gate", () => {
    assert.match(
      review,
      /Only you, admins, and the lead and reviewers of each programme \{applicant\.firstName\}\{" "\} ranked, or joined by invitation, can see comments and scores\./,
    );
    const at = review.indexOf("Only you, admins, and the lead and reviewers");
    assert.match(review.slice(Math.max(0, at - 600), at), /WHO THIS NAMES IS WHO `canReadApplication` LETS IN/);
  });

  test("the Settings tab names exactly those people, beside a comment that names the gate", () => {
    assert.match(setup, /Admins, and the lead and reviewers of each programme an applicant ranked, or joined by invitation </);
    const at = setup.indexOf("Admins, and the lead and reviewers of each programme an applicant ranked");
    assert.match(setup.slice(Math.max(0, at - 600), at), /WHO THIS NAMES IS WHO `canReadApplication` LETS IN/);
  });

  test("the form tells the applicant exactly those people, for the programmes they pick, beside a comment that names the gate", () => {
    const SENTENCE =
      "Your application is read by the lead and the reviewers of each programme you pick, and by NAISI\u2019s admins.";
    assert.ok(checkStep.includes(SENTENCE), "the Check and send step no longer carries the sentence, word for word");
    const at = checkStep.indexOf(SENTENCE);
    assert.match(checkStep.slice(Math.max(0, at - 600), at), /WHO THIS NAMES IS WHO `canReadApplication` LETS IN/);
  });

  test("neither screen promises every SU-recognised committee member, who the gate does not let in", () => {
    assert.doesNotMatch(review, /SU-recognised committee can see/);
    assert.doesNotMatch(setup, /Admins and SU-recognised committee</);
  });
});
