import { formatRoundDate } from "@/lib/admissions/window";
import type {
  AboutYou,
  AnswerValue,
  ApplicationContent,
  ApplicationQuestion,
  QuestionSetDoc,
  ReviewDoc,
  SentVersion,
} from "../model";
import type { ApplicationForm } from "../normalise";
import { rankedProgrammes, setApplies } from "../sections";
import { isAnswered, optionsFor } from "../validate";
import { hasGap, versionsOf, type WithVersions } from "../versions/kept";
import { availabilityViewFor } from "./availabilityView";
import { own } from "./own";
import { graduationLabel, listInWords, statusLabel } from "./people";
import type {
  AnswerBody,
  EarlierAnswer,
  EarlierAvailability,
  EarlierFact,
  EarlierRanking,
} from "./types";

/**
 * WHAT EACH PART OF AN APPLICATION SAID BEFORE.
 *
 * An application of record is replaced whole when its owner sends again, and
 * the one it replaces is kept (`../versions/kept.ts`). This module reads the
 * kept versions the way a reviewer needs them: not as whole earlier
 * applications to read through, but PART BY PART, so that under an answer
 * that changed sits what that answer said before, and a part that never
 * changed shows nothing extra.
 *
 * A part is one thing the review screen draws: one answer, one About you
 * fact, the ranking, whether they would facilitate, when they are free. For
 * each, the versions are walked oldest to newest and collapsed into runs in
 * which the part said the same thing. The last run is what the screen already
 * shows. The runs before it are what it said before, newest first, each with
 * the day the first version of that run was sent.
 *
 * Three things are decided here and nowhere else:
 *
 *  - A PART IS COMPARED AS IT IS SHOWN. Two versions that would draw the same
 *    thing for a part are not a change to that part, whatever else differs
 *    between them.
 *  - ONLY WHAT THE SCREEN SHOWS IS A PART. The SU membership answer is kept
 *    with every version and is not read here, because the form tells
 *    applicants it does not affect their application and reviewers are not
 *    shown it. An answer to a programme the person has since unticked is kept
 *    too and is not shown: the ranking's own history says the programme went.
 *  - WHEN A PART LAST CHANGED IS SAID ONLY WHEN IT IS KNOWN. Versions dropped
 *    at the cap sat between the first one kept and the next, so a value first
 *    seen right after that gap may have arrived in a version that is gone.
 *    Its day is still shown, and nothing is claimed about what came before or
 *    after it (`changedAt` is null).
 *
 * Pure, with no server import: `detail.ts` hands it the application.
 */

/** Every version still held, oldest first with the current one last, and whether any are missing. */
export type Timeline = {
  versions: readonly SentVersion[];
  /** True when versions are missing between the first one kept and the next. */
  gap: boolean;
};

export function timelineOf(application: WithVersions): Timeline {
  return { versions: versionsOf(application), gap: hasGap(application) };
}

/** "Sat 10 Oct", or null for a version whose time the document does not say. */
export function dayOf(date: Date | null | undefined): string | null {
  return date ? formatRoundDate(date) : null;
}

export type PartHistory<T> = {
  /** What the part said before, newest first, each with the day that version was sent. */
  earlier: { sentOn: string | null; value: T }[];
  /** The instant it last changed. Null when it never has, or when that is not known exactly. */
  changedAt: Date | null;
};

/**
 * One part's history. `read` takes a version and answers what the screen
 * would draw for the part, as plain data: two versions are the same for this
 * part exactly when that data is.
 */
export function partHistory<T>(
  timeline: Timeline,
  read: (content: ApplicationContent) => T,
): PartHistory<T> {
  const runs: { value: T; said: string; first: number }[] = [];
  timeline.versions.forEach((version, index) => {
    const value = read(version.content);
    const said = JSON.stringify(value) ?? "";
    if (runs.length === 0 || runs[runs.length - 1].said !== said) {
      runs.push({ value, said, first: index });
    }
  });
  if (runs.length <= 1) return { earlier: [], changedAt: null };
  const current = runs[runs.length - 1];
  // The cap drops from between the first version kept and the next, and from
  // nowhere else. A value first seen in that next version may be older than it.
  const exact = !(timeline.gap && current.first === 1);
  return {
    earlier: runs
      .slice(0, -1)
      .reverse()
      .map((run) => ({ sentOn: dayOf(timeline.versions[run.first]?.sentAt), value: run.value })),
    changedAt: exact ? (timeline.versions[current.first]?.sentAt ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// The parts
// ---------------------------------------------------------------------------

/** What one answer draws: its words, its ticks, or its point on a scale. */
export function answerBody(
  form: ApplicationForm,
  question: ApplicationQuestion,
  value: AnswerValue | undefined,
  ranking: Pick<ApplicationContent, "rankedProgrammeIds">,
): AnswerBody {
  const body: AnswerBody = { answered: isAnswered(value), text: null, items: null, scale: null };
  if (!body.answered) return body;
  if (typeof value === "string") body.text = value;
  else if (Array.isArray(value)) body.items = [...value];
  else if (typeof value === "number") {
    body.scale = { options: optionsFor(question, form, ranking), index: value };
  }
  return body;
}

/**
 * One answer's history. A version in which the question's set did not apply
 * (the programme was not ranked yet, or they had not said yes to
 * facilitating) reads as not asked, which is a different thing from asked
 * and left blank, and is said differently on the screen.
 */
export function answerHistory(
  timeline: Timeline,
  form: ApplicationForm,
  set: QuestionSetDoc,
  question: ApplicationQuestion,
): { earlier: EarlierAnswer[]; changedAt: Date | null } {
  const history = partHistory(timeline, (content) => {
    const asked = setApplies(set, form, content);
    const given = asked ? own(own(content.answers, set.id), question.id) : undefined;
    return { asked, ...answerBody(form, question, given, content) };
  });
  return {
    earlier: history.earlier.map(({ sentOn, value }) => ({ sentOn, ...value })),
    changedAt: history.changedAt,
  };
}

/**
 * The About you facts that changed, in the order the card lists them, each
 * with what it said before. A fact that never changed is not in the list.
 *
 * `subjectLabel` is what the degree answer is called on the card now. The
 * university address is an admin's to read, so its history is too.
 */
export function aboutFactsHistory(
  timeline: Timeline,
  subjectLabel: string,
  includeAddress: boolean,
): EarlierFact[] {
  const facts: { label: string; read: (about: AboutYou) => string }[] = [
    { label: "At UoN", read: (about) => statusLabel(about) },
    { label: subjectLabel, read: (about) => about.subject },
    { label: "Graduating", read: (about) => graduationLabel(about.expectedGraduation) ?? "" },
    { label: "Interests", read: (about) => about.interests },
  ];
  if (includeAddress) {
    facts.push({ label: "University email", read: (about) => about.universityEmail });
  }
  const out: EarlierFact[] = [];
  for (const fact of facts) {
    const { earlier } = partHistory(timeline, (content) => fact.read(content.aboutYou));
    if (earlier.length > 0) out.push({ label: fact.label, earlier });
  }
  return out;
}

/** What "Why are you interested in AI safety?" said before. */
export function motivationHistory(timeline: Timeline): PartHistory<string> {
  return partHistory(timeline, (content) => content.aboutYou.motivation);
}

/** What they ranked before, as the form knows the programmes now. */
export function rankingHistory(timeline: Timeline, form: ApplicationForm): EarlierRanking[] {
  const { earlier } = partHistory(timeline, (content) =>
    rankedProgrammes(form, content).map((programme, at) => ({
      shortName: programme.shortName,
      choice: at + 1,
    })),
  );
  return earlier.map(({ sentOn, value }) => ({ sentOn, ranked: value }));
}

/** Whether they wanted to facilitate before. Not asked reads as no, as the chip does. */
export function facilitatingHistory(timeline: Timeline): { sentOn: string | null; wanted: boolean }[] {
  const { earlier } = partHistory(timeline, (content) => content.wantsToFacilitate === true);
  return earlier.map(({ sentOn, value }) => ({ sentOn, wanted: value }));
}

/** When they were free before, as the same lines of words the card writes out. */
export function availabilityHistory(timeline: Timeline): EarlierAvailability[] {
  const { earlier } = partHistory(timeline, (content) => {
    const view = availabilityViewFor(content.availability);
    return { empty: view.empty, lines: view.lines, total: view.total };
  });
  return earlier.map(({ sentOn, value }) => ({ sentOn, ...value }));
}

// ---------------------------------------------------------------------------
// A score given before the answer changed
// ---------------------------------------------------------------------------

/**
 * The one line that says an answer changed after somebody scored it, or null.
 *
 * A score stays on the question, not on a version, so a score can be about
 * words that are no longer there. A review row records when it was last
 * saved, not when each score was given. So this is said only when it is
 * certain: the reviewer has a score on this answer and has saved nothing
 * since before the answer changed. Somebody who has saved anything since has
 * been back to a screen that showed them the change.
 *
 * `others` are the other reviewers THIS CALLER MAY BE SHOWN, by name. A
 * review being held back from a first review is not handed in, so the line
 * cannot say that somebody else has scored.
 */
export function changedSinceScoredLine(input: {
  /** `questionKey(setId, questionId)`. */
  key: string;
  changedAt: Date | null;
  mine: Pick<ReviewDoc, "scores" | "updatedAt"> | null;
  others: readonly { name: string; review: Pick<ReviewDoc, "scores" | "updatedAt"> }[];
}): string | null {
  const { key, changedAt } = input;
  if (!changedAt) return null;
  const scoredBefore = (review: Pick<ReviewDoc, "scores" | "updatedAt">) => {
    const saved = review.updatedAt;
    return (
      typeof own(review.scores, key) === "number" &&
      saved instanceof Date &&
      saved.getTime() < changedAt.getTime()
    );
  };
  const who: string[] = [];
  if (input.mine && scoredBefore(input.mine)) who.push("you");
  for (const other of input.others) {
    if (scoredBefore(other.review)) who.push(other.name);
  }
  if (who.length === 0) return null;
  return `This answer changed on ${formatRoundDate(changedAt)}, after ${listInWords(who)} scored it.`;
}
