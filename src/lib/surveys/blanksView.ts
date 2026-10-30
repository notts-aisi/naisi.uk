import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { answerPagesOf, profileOffersFor, type AnswerScreen, type AnswerSubmit } from "./answerView";
import { blankItemsOf } from "./blanks";
import { blanksFor, type BlanksTarget } from "./blanksStore";
import { readEventAudience, respondentKey } from "./events/audience";
import { eventBoxPoints, eventLine } from "./events/words";
import { confidentialFactsFor } from "./personFacts";
import { closedOn, isOpen } from "./repo";
import { BLANKS_WORDS, CONFIDENTIAL_HEADING, STATE_WORDS, answerRuleWords, closingWords, confidentialPoints, programmeLine } from "./words";

/**
 * WHAT A LINK OF BLANKS SHOWS (docs/surveys.md, "Sending the questions left
 * blank"), built on the server for one person: the survey's title, a line
 * saying these are the questions they left blank last time, the survey's own
 * confidential box, and ONLY the questions still blank (a lines question with
 * only its blank lines), each one required. Drawn by the survey's own form.
 *
 * NEVER AN EARLIER ANSWER: not the person's answers to this survey, and not
 * an answer of theirs to an earlier survey that a question would show above
 * itself. A menu offered from their profile is still offered: it is their
 * profile, not an answer.
 *
 * Or one calm message instead: the link has been used, the survey has closed,
 * or nothing is blank any more. Reading this page writes nothing: no record
 * that it was opened, ever.
 */
export async function blanksScreenFor(
  db: Firestore,
  target: BlanksTarget,
  input: {
    /** Where "Send my answers" goes: the link of blanks, or the person's own session. */
    submit: Extract<AnswerSubmit, { kind: "link" | "signed-in" }>;
    /** The whole name of whoever is signed in, for a survey after an event's box, or null. */
    signedInAs: string | null;
    now: Date;
  },
): Promise<AnswerScreen> {
  const { survey, person } = target;
  const link = person.blanks;
  if (!link) return { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  if (link.spentAt) return { state: "message", ...BLANKS_WORDS.spent(link.spentAt), consent: null };
  if (!isOpen(survey, input.now)) {
    const on = closedOn(survey);
    return on ? { state: "message", ...STATE_WORDS.closed(on), consent: null } : { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  }
  if (!survey.namesOffOn) return { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  const found = await blanksFor(db, target);
  if (!found || found.blanks.length === 0) return { state: "message", ...BLANKS_WORDS.nothingLeft, consent: null };

  const shown = { kind: survey.kind, items: blankItemsOf(survey.items, found.blanks) };
  let eyebrow: string[];
  let box: { points: string[]; note: string };
  let offered: Record<string, string> = {};
  if (target.kind === "event") {
    const read = await readEventAudience(db, target.survey.audience.eventId);
    const came = read?.people.find((member) => member.key === respondentKey(target.person.respondent))?.came ?? false;
    eyebrow = [eventLine(target.survey.event.title, target.survey.event.startAt)];
    box = eventBoxPoints({ namesOffOn: survey.namesOffOn, signedInAs: input.signedInAs, came });
  } else {
    const uid = target.person.respondent.uid;
    const [facts, offers] = await Promise.all([confidentialFactsFor(db, survey, uid), profileOffersFor(db, shown, uid)]);
    eyebrow = [programmeLine(survey.programmeKind, survey.programmeName)];
    box = confidentialPoints(facts);
    offered = offers;
  }
  return {
    state: "open",
    survey: {
      eyebrow,
      title: survey.title,
      intro: [],
      rule: answerRuleWords(false),
      lead: BLANKS_WORDS.lead,
      box: { heading: CONFIDENTIAL_HEADING, points: box.points, note: box.note },
      pages: answerPagesOf(shown, { offered, piped: {}, asked: [], hiddenLines: found.hidden }),
      closing: closingWords(survey.closesAt),
      submit: { ...input.submit, blanks: true },
      kairos: null,
    },
    consent: null,
  };
}
