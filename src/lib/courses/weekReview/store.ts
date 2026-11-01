import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import { fellowsOf, type DoorRefusal } from "@/lib/courses/coursework/door";
import type { SessionUser } from "@/lib/firebase/session";
import {
  COURSE_WEEK_REVIEWS_COLLECTION,
  REVIEW_PARTS,
  normalizeWeekReview,
  uidsOfPart,
  weekReviewId,
  type ReviewPart,
} from "@/lib/firestore/courseWeekReviews";
import { askForGrades, askForHands, askForThemes } from "./claude";
import { openWeekReview, type WeekReviewDoor } from "./door";
import { handFacts } from "./facts";
import { gatherWeekReview } from "./gather";
import { reviewInputs, type ReviewInputs } from "./input";
import { weekReviewView, type WeekReviewView } from "./view";
import { REVIEW_WORDS } from "./words";

/**
 * A WEEK'S REVIEW, KEPT AND READ (privacy v15), for an admin alone.
 *
 * `loadWeekReview` is the page's: the door, then everything the review is
 * made from, the messages that WOULD be sent (only counted, never sent: the
 * page says what a press sends before anybody presses), what Claude last
 * said, and what the site already knows. It writes nothing and sends nothing.
 *
 * `askWeekReview` is the press: the door again, Claude set up, the week
 * reviewable, and what would be sent exactly what the page showed (`seen`,
 * a hash of the three messages), so nothing goes that the admin was not told
 * of. Then the three requests side by side, each checked, and each kept as
 * its own part of `courseWeekReviews/{runId}__{weekId}`: a part that failed
 * says so and keeps no answer, and the others are kept. One press asks for
 * every part with something to send, or for one part again.
 *
 * KEPT UNTIL SOMEBODY ASKS AGAIN: each part is replaced whole by its next
 * answer. Deleted with the run (`courseDeletion.ts`, `weekReviews`); an
 * account's deletion takes the account out (`accountDeletion.ts`,
 * `clearWeekReviewEntries`). Never on anybody's profile.
 */

export type WeekReviewPage = {
  opened: WeekReviewDoor;
  /** Null until the week's first session has started. */
  view: WeekReviewView | null;
  /** Every reviewed person's name by account, for Pangram's panel. */
  names: Record<string, string>;
};

const programmePathOf = (roundId: string, programmeId: string) =>
  `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;

async function readStored(db: Firestore, runId: string, weekId: string) {
  const snap = await db.collection(COURSE_WEEK_REVIEWS_COLLECTION).doc(weekReviewId(runId, weekId)).get();
  if (!snap.exists) return { raw: null, stored: null };
  const raw = (snap.data() ?? {}) as Record<string, unknown>;
  const stored = normalizeWeekReview(snap.id, raw);
  return { raw, stored: stored && stored.runId === runId && stored.weekId === weekId ? stored : null };
}

export async function loadWeekReview(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; weekId: string },
  now: Date,
): Promise<{ ok: true; page: WeekReviewPage } | DoorRefusal> {
  const opened = await openWeekReview(db, user, input.roundId, input.programmeId, input.weekId, now);
  if (!opened.ok) return opened;
  const fellows = fellowsOf(opened.door);
  const names = Object.fromEntries(opened.door.holders.filter((holder) => fellows.has(holder.uid)).map((holder) => [holder.uid, holder.name]));
  if (!opened.reviewable) return { ok: true, page: { opened, view: null, names } };

  const [gathered, { stored }] = await Promise.all([gatherWeekReview(db, opened, now), readStored(db, opened.run.id, opened.weekId)]);
  const inputs = reviewInputs(gathered.sources);
  const facts = handFacts({
    weekNumber: opened.weekNumber,
    fellows: [...fellows],
    absentInARow: gathered.facts.absentInARow,
    weeks: gathered.facts.weeks,
    reports: gathered.facts.reports,
  });
  const view = weekReviewView({
    weekId: opened.weekId,
    weekNumber: opened.weekNumber,
    weekTitle: opened.weekTitle,
    groups: opened.groups.map((each) => ({
      id: each.group.id,
      name: each.group.name,
      met: each.met,
      facilitatorUids: each.group.facilitatorUids,
    })),
    firstAt: opened.firstAt,
    reviewable: opened.reviewable,
    claude: claudeConfigured(),
    inputs,
    stored,
    fellowNames: new Map(Object.entries(names)),
    groupOf: gathered.sources.groupOf,
    writtenKeys: gathered.sources.questions.filter((question) => question.kind === "written").map((question) => question.key),
    partTitles: new Map(gathered.sources.parts.map((part) => [part.id, part.title])),
    facts,
    askedFor: gathered.facts.askedFor,
    firstNameOf: gathered.firstNameOf,
    programmePath: programmePathOf(opened.roundId, opened.programmeId),
  });
  return { ok: true, page: { opened, view, names } };
}

/** Whether a part has anything to send. */
function hasSomething(inputs: ReviewInputs, part: ReviewPart): boolean {
  if (part === "grades") return inputs.grades.items.size > 0;
  if (part === "themes") return inputs.themes.answers.size + inputs.themes.checkIns.size + inputs.themes.reports.size > 0;
  return inputs.hands.answers.size + inputs.hands.reports.size > 0;
}

export type AskedParts = Partial<Record<ReviewPart, "ready" | "failed">>;

export async function askWeekReview(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; weekId: string; seen: string; part: ReviewPart | null },
  now: Date,
): Promise<{ ok: true; asked: AskedParts } | DoorRefusal> {
  const opened = await openWeekReview(db, user, input.roundId, input.programmeId, input.weekId, now);
  if (!opened.ok) return opened;
  if (!opened.reviewable) return { ok: false, status: 409, error: REVIEW_WORDS.notYet(opened.weekNumber) };
  if (!claudeConfigured()) return { ok: false, status: 409, error: REVIEW_WORDS.notSetUp };
  const gathered = await gatherWeekReview(db, opened, now);
  const inputs = reviewInputs(gathered.sources);
  // Nothing goes that the page did not say would go.
  if (inputs.seen !== input.seen) return { ok: false, status: 409, error: REVIEW_WORDS.moved };
  const parts = (input.part ? [input.part] : [...REVIEW_PARTS]).filter((part) => hasSomething(inputs, part));
  if (parts.length === 0) return { ok: false, status: 409, error: REVIEW_WORDS.nothingToSend };

  const asked = await Promise.all(
    parts.map(async (part) => {
      if (part === "grades") return { part, answer: await askForGrades(inputs.grades) };
      if (part === "themes") return { part, answer: await askForThemes(inputs.themes) };
      return { part, answer: await askForHands(inputs.hands) };
    }),
  );

  const kept: Record<string, Record<string, unknown>> = {};
  const out: AskedParts = {};
  for (const { part, answer } of asked) {
    const base = { at: now, askedByUid: user.uid };
    if (!answer.ok) {
      kept[part] = { ...base, state: "failed", reason: answer.reason };
      out[part] = "failed";
      continue;
    }
    out[part] = "ready";
    if (part === "grades") {
      kept.grades = { ...base, state: "ready", model: answer.model, fingerprint: inputs.grades.fingerprint, sent: inputs.grades.sent, items: answer.value };
    } else if (part === "themes") {
      kept.themes = {
        ...base,
        state: "ready",
        model: answer.model,
        fingerprint: inputs.themes.fingerprint,
        sent: inputs.themes.sent,
        groupLabels: inputs.themes.groupLabels,
        list: answer.value,
      };
    } else {
      kept.hands = {
        ...base,
        state: "ready",
        model: answer.model,
        fingerprint: inputs.hands.fingerprint,
        sent: inputs.hands.sent,
        labels: inputs.hands.labels,
        groupLabels: inputs.hands.groupLabels,
        list: answer.value,
      };
    }
  }

  // One record per week: the parts asked for replace theirs, the rest stay.
  const { raw } = await readStored(db, opened.run.id, opened.weekId);
  const whole: Record<string, unknown> = {
    runId: opened.run.id,
    weekId: opened.weekId,
    weekNumber: opened.weekNumber,
    grades: raw?.grades ?? null,
    themes: raw?.themes ?? null,
    hands: raw?.hands ?? null,
    ...kept,
  };
  whole.uids = [
    ...new Set(
      REVIEW_PARTS.flatMap((part) => {
        const stored = whole[part];
        return stored && typeof stored === "object" ? uidsOfPart(stored as Record<string, unknown>) : [];
      }),
    ),
  ].sort();
  whole.updatedAt = now;
  await db.collection(COURSE_WEEK_REVIEWS_COLLECTION).doc(weekReviewId(opened.run.id, opened.weekId)).set(whole);
  return { ok: true, asked: out };
}
